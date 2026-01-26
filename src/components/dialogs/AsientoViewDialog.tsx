import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateLong } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Empresa {
  id: string;
  razon_social: string;
}

interface Tercero {
  id: string;
  razon_social: string;
}

interface CentroNegocio {
  id: string;
  codigo: string;
  nombre: string;
}

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
}

type TipoAsiento = "ingreso" | "egreso" | "diario";
type EstadoAsiento = "borrador" | "aplicado" | "cancelado";

interface AsientoContable {
  id: string;
  empresa_id: string;
  fecha: string;
  tipo: TipoAsiento;
  tercero_id: string | null;
  centro_negocio_id: string | null;
  numero_asiento: number;
  observaciones: string | null;
  estado: EstadoAsiento;
  total_debe: number;
  total_haber: number;
  empresas?: Empresa;
  terceros?: Tercero;
  centros_negocio?: CentroNegocio;
}

interface Movimiento {
  id: string;
  cuenta_id: string;
  partida: string;
  debe: number;
  haber: number;
  orden: number;
  cuentas_contables?: CuentaContable;
}

interface AsientoViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asiento: AsientoContable | null;
}

const tipoLabels: Record<TipoAsiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  diario: "Diario",
};

const estadoLabels: Record<EstadoAsiento, string> = {
  borrador: "Borrador",
  aplicado: "Aplicado",
  cancelado: "Cancelado",
};

const estadoBadgeVariants: Record<EstadoAsiento, "default" | "secondary" | "destructive"> = {
  borrador: "secondary",
  aplicado: "default",
  cancelado: "destructive",
};

export function AsientoViewDialog({
  open,
  onOpenChange,
  asiento,
}: AsientoViewDialogProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && asiento) {
      loadMovimientos(asiento.id);
    }
  }, [open, asiento]);

  const loadMovimientos = async (asientoId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("asiento_movimientos")
      .select("*, cuentas_contables(id, codigo, nombre)")
      .eq("asiento_id", asientoId)
      .order("orden");
    
    if (data) {
      setMovimientos(data as Movimiento[]);
    }
    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return formatDateLong(dateStr);
  };

  if (!asiento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Asiento #{asiento.numero_asiento}
            <Badge variant={estadoBadgeVariants[asiento.estado]}>
              {estadoLabels[asiento.estado]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Empresa:</span>
              <p className="font-medium">{asiento.empresas?.razon_social}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha:</span>
              <p className="font-medium">{formatDate(asiento.fecha)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo:</span>
              <p className="font-medium">{tipoLabels[asiento.tipo]}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tercero:</span>
              <p className="font-medium">
                {asiento.terceros?.razon_social || "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Centro de Negocios:</span>
              <p className="font-medium">
                {asiento.centros_negocio
                  ? `${asiento.centros_negocio.codigo} - ${asiento.centros_negocio.nombre}`
                  : "-"}
              </p>
            </div>
            {asiento.observaciones && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Observaciones:</span>
                <p className="font-medium">{asiento.observaciones}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Movimientos */}
          <div className="space-y-4">
            <h3 className="font-semibold">Movimientos</h3>
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">
                Cargando...
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Partida</TableHead>
                      <TableHead className="text-right">Debe</TableHead>
                      <TableHead className="text-right">Haber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell>
                          <div>
                            <span className="font-mono text-sm">
                              {mov.cuentas_contables?.codigo}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {mov.cuentas_contables?.nombre}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{mov.partida}</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(mov.debe) > 0 ? formatCurrency(Number(mov.debe)) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(mov.haber) > 0 ? formatCurrency(Number(mov.haber)) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-[300px] space-y-2">
              <div className="flex justify-between px-4 py-2 bg-muted rounded">
                <span className="font-medium">Total Debe:</span>
                <span className="font-mono font-bold">
                  {formatCurrency(Number(asiento.total_debe))}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2 bg-muted rounded">
                <span className="font-medium">Total Haber:</span>
                <span className="font-mono font-bold">
                  {formatCurrency(Number(asiento.total_haber))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
