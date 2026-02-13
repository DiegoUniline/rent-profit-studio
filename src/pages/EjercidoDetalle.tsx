import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatDateNumeric } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";

interface EjercidoMovimiento {
  id: string;
  debe: number;
  haber: number;
  partida: string;
  asientos_contables: {
    id: string;
    numero_asiento: number;
    fecha: string;
    tipo: string;
    estado: string;
    observaciones: string | null;
    terceros: { razon_social: string } | null;
    centros_negocio: { codigo: string; nombre: string } | null;
  } | null;
  cuentas_contables: {
    codigo: string;
    nombre: string;
  } | null;
}

export default function EjercidoDetalle() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [movimientos, setMovimientos] = useState<EjercidoMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [partidaName, setPartidaName] = useState("");

  const cuentaCodigo = searchParams.get("cuenta") || undefined;

  useEffect(() => {
    if (id) {
      fetchPresupuestoInfo();
      fetchMovimientos();
    }
  }, [id]);

  const fetchPresupuestoInfo = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("presupuestos")
      .select("partida")
      .eq("id", id)
      .single();
    if (data) setPartidaName(data.partida);
  };

  const fetchMovimientos = async () => {
    if (!id) return;
    setLoading(true);

    const PAGE_SIZE = 1000;
    let all: EjercidoMovimiento[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch } = await supabase
        .from("asiento_movimientos")
        .select(`
          id, debe, haber, partida,
          asientos_contables (
            id, numero_asiento, fecha, tipo, estado, observaciones,
            terceros (razon_social),
            centros_negocio (codigo, nombre)
          ),
          cuentas_contables (codigo, nombre)
        `)
        .eq("presupuesto_id", id)
        .range(from, from + PAGE_SIZE - 1);

      if (batch && batch.length > 0) {
        all = all.concat(batch as unknown as EjercidoMovimiento[]);
        hasMore = batch.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    setMovimientos(all);
    setLoading(false);
  };

  const movimientosAplicados = useMemo(() => {
    return movimientos
      .filter((m) => m.asientos_contables?.estado === "aplicado")
      .sort((a, b) => {
        const dateA = a.asientos_contables?.fecha || "";
        const dateB = b.asientos_contables?.fecha || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.asientos_contables?.numero_asiento || 0) - (b.asientos_contables?.numero_asiento || 0);
      });
  }, [movimientos]);

  const getEjercidoAmount = (m: EjercidoMovimiento): number => {
    const codigo = cuentaCodigo || m.cuentas_contables?.codigo || "";
    const esActivo = codigo.startsWith("1");
    const esPasivoCapital = codigo.startsWith("2") || codigo.startsWith("3");
    const esCostoGasto = codigo.startsWith("5") || codigo.startsWith("6");

    if (esActivo) return Number(m.haber);
    if (esPasivoCapital) return Number(m.debe);
    if (esCostoGasto) return Number(m.debe);
    return Number(m.haber);
  };

  const totalEjercido = movimientosAplicados.reduce(
    (sum, m) => sum + getEjercidoAmount(m),
    0
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/presupuestos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Detalle del Ejercido</h1>
          <p className="text-sm text-muted-foreground">{partidaName}</p>
        </div>
        <div className="ml-auto text-right">
          <span className="text-xs text-muted-foreground">Total Ejercido</span>
          <div className="text-lg font-bold text-primary font-mono">
            {formatCurrency(totalEjercido)}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : movimientosAplicados.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          No hay movimientos aplicados para este presupuesto
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Asiento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Partida</TableHead>
                <TableHead>Tercero</TableHead>
                <TableHead>Centro Neg.</TableHead>
                <TableHead className="text-right">Debe</TableHead>
                <TableHead className="text-right">Haber</TableHead>
                <TableHead className="text-right">Ejercido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientosAplicados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {m.asientos_contables?.fecha
                      ? formatDateNumeric(m.asientos_contables.fecha)
                      : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {m.asientos_contables?.numero_asiento || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {m.asientos_contables?.tipo || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={m.partida}>
                    {m.partida}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {m.asientos_contables?.terceros?.razon_social || "-"}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate">
                    {m.asientos_contables?.centros_negocio?.nombre || "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(m.debe) > 0 ? formatCurrency(Number(m.debe)) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(m.haber) > 0 ? formatCurrency(Number(m.haber)) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-primary">
                    {formatCurrency(getEjercidoAmount(m))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={8} className="text-right">
                  Total Ejercido:
                </TableCell>
                <TableCell className="text-right font-mono text-primary">
                  {formatCurrency(totalEjercido)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
