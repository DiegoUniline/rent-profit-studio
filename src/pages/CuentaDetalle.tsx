import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, BookOpen, Calendar, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/accounting-utils";
import { parseLocalDate } from "@/lib/date-utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CuentaContable {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  empresas?: { id: string; razon_social: string };
}

interface Movimiento {
  id: string;
  asiento_id: string;
  cuenta_id: string;
  debe: number;
  haber: number;
  partida: string;
  asiento?: {
    id: string;
    numero_asiento: number;
    fecha: string;
    estado: string;
    tipo: string;
    observaciones: string | null;
    tercero_id: string | null;
    centro_negocio_id: string | null;
    terceros?: { id: string; razon_social: string } | null;
    centros_negocio?: { id: string; nombre: string; codigo: string } | null;
  };
}

export default function CuentaDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [cuenta, setCuenta] = useState<CuentaContable | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date filters
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("cuenta_detalle_fecha_desde");
    return saved ? parseLocalDate(saved) : undefined;
  });
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("cuenta_detalle_fecha_hasta");
    return saved ? parseLocalDate(saved) : undefined;
  });
  const [filterCentro, setFilterCentro] = useState<string>(() => 
    localStorage.getItem("cuenta_detalle_centro") || "all"
  );
  const [filterTercero, setFilterTercero] = useState<string>(() => 
    localStorage.getItem("cuenta_detalle_tercero") || "all"
  );

  // Persist filters
  useEffect(() => {
    if (fechaDesde) localStorage.setItem("cuenta_detalle_fecha_desde", format(fechaDesde, "yyyy-MM-dd"));
    else localStorage.removeItem("cuenta_detalle_fecha_desde");
  }, [fechaDesde]);

  useEffect(() => {
    if (fechaHasta) localStorage.setItem("cuenta_detalle_fecha_hasta", format(fechaHasta, "yyyy-MM-dd"));
    else localStorage.removeItem("cuenta_detalle_fecha_hasta");
  }, [fechaHasta]);

  useEffect(() => {
    if (filterCentro !== "all") localStorage.setItem("cuenta_detalle_centro", filterCentro);
    else localStorage.removeItem("cuenta_detalle_centro");
  }, [filterCentro]);

  useEffect(() => {
    if (filterTercero !== "all") localStorage.setItem("cuenta_detalle_tercero", filterTercero);
    else localStorage.removeItem("cuenta_detalle_tercero");
  }, [filterTercero]);

  // Fetch account and movements
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      setLoading(true);
      
      const { data: cuentaData, error: cuentaError } = await supabase
        .from("cuentas_contables")
        .select("*, empresas(id, razon_social)")
        .eq("id", id)
        .single();
      
      if (cuentaError) {
        toast({
          title: "Error",
          description: "No se pudo cargar la cuenta",
          variant: "destructive",
        });
        navigate("/cuentas");
        return;
      }
      
      setCuenta(cuentaData);
      
      // Fetch all movements with full asiento data including tercero and centro_negocio
      const PAGE_SIZE = 1000;
      let allMovimientos: any[] = [];
      let from = 0;
      let hasMore = true;
      let movError = null;
      while (hasMore) {
        const { data, error } = await supabase
          .from("asiento_movimientos")
          .select(`
            id,
            asiento_id,
            cuenta_id,
            debe,
            haber,
            partida,
            asientos_contables (
              id,
              numero_asiento,
              fecha,
              estado,
              tipo,
              observaciones,
              tercero_id,
              centro_negocio_id,
              terceros (id, razon_social),
              centros_negocio (id, nombre, codigo)
            )
          `)
          .eq("cuenta_id", id)
          .range(from, from + PAGE_SIZE - 1);
        if (error) { movError = error; break; }
        allMovimientos = allMovimientos.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      
      if (!movError) {
        const transformed = allMovimientos.map(m => ({
          ...m,
          asiento: m.asientos_contables as Movimiento["asiento"]
        }));
        setMovimientos(transformed);
      }
      
      setLoading(false);
    };
    
    fetchData();
  }, [id, navigate, toast]);

  // Extract unique centros and terceros from applied movements for filter options
  const { centroOptions, terceroOptions } = useMemo(() => {
    const centrosMap = new Map<string, string>();
    const tercerosMap = new Map<string, string>();
    
    movimientos.forEach(m => {
      if (m.asiento?.estado !== "aplicado") return;
      if (m.asiento?.centros_negocio) {
        const cn = m.asiento.centros_negocio;
        centrosMap.set(cn.id, `${cn.codigo} - ${cn.nombre}`);
      }
      if (m.asiento?.terceros) {
        const t = m.asiento.terceros;
        tercerosMap.set(t.id, t.razon_social);
      }
    });
    
    return {
      centroOptions: Array.from(centrosMap.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
      terceroOptions: Array.from(tercerosMap.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [movimientos]);

  // Validate persisted filter values
  useEffect(() => {
    if (filterCentro !== "all" && centroOptions.length > 0 && !centroOptions.find(o => o.value === filterCentro)) {
      setFilterCentro("all");
    }
  }, [centroOptions, filterCentro]);

  useEffect(() => {
    if (filterTercero !== "all" && terceroOptions.length > 0 && !terceroOptions.find(o => o.value === filterTercero)) {
      setFilterTercero("all");
    }
  }, [terceroOptions, filterTercero]);

  // Filter movements
  const filteredMovimientos = useMemo(() => {
    return movimientos.filter(m => {
      if (m.asiento?.estado !== "aplicado") return false;
      
      const fechaAsiento = m.asiento?.fecha;
      if (!fechaAsiento) return false;
      
      const fechaDesdeStr = fechaDesde ? format(fechaDesde, "yyyy-MM-dd") : null;
      const fechaHastaStr = fechaHasta ? format(fechaHasta, "yyyy-MM-dd") : null;
      
      if (fechaDesdeStr && fechaAsiento < fechaDesdeStr) return false;
      if (fechaHastaStr && fechaAsiento > fechaHastaStr) return false;
      
      if (filterCentro !== "all") {
        if (m.asiento?.centro_negocio_id !== filterCentro) return false;
      }
      
      if (filterTercero !== "all") {
        if (m.asiento?.tercero_id !== filterTercero) return false;
      }
      
      return true;
    }).sort((a, b) => {
      const dateA = a.asiento?.fecha || "";
      const dateB = b.asiento?.fecha || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.asiento?.numero_asiento || 0) - (a.asiento?.numero_asiento || 0);
    });
  }, [movimientos, fechaDesde, fechaHasta, filterCentro, filterTercero]);

  // Calculate totals
  const { saldo, totalDebe, totalHaber } = useMemo(() => {
    let totalDebe = 0;
    let totalHaber = 0;
    
    filteredMovimientos.forEach(m => {
      totalDebe += Number(m.debe) || 0;
      totalHaber += Number(m.haber) || 0;
    });
    
    const saldo = cuenta?.naturaleza === "deudora" 
      ? totalDebe - totalHaber 
      : totalHaber - totalDebe;
    
    return { saldo, totalDebe, totalHaber };
  }, [filteredMovimientos, cuenta?.naturaleza]);

  const clearFilters = () => {
    setFechaDesde(undefined);
    setFechaHasta(undefined);
    setFilterCentro("all");
    setFilterTercero("all");
  };

  const hasActiveFilters = fechaDesde || fechaHasta || filterCentro !== "all" || filterTercero !== "all";

  const tipoColors: Record<string, string> = {
    ingreso: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    egreso: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    diario: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!cuenta) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Cuenta no encontrada</p>
        <Button variant="outline" onClick={() => navigate("/cuentas")}>
          Volver al catálogo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cuentas")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              <code className="font-mono">{cuenta.codigo}</code>
            </h1>
            <Badge variant={cuenta.naturaleza === "deudora" ? "default" : "secondary"}>
              {cuenta.naturaleza === "deudora" ? "Deudora" : "Acreedora"}
            </Badge>
            <Badge variant={cuenta.clasificacion === "titulo" ? "outline" : "default"}>
              {cuenta.clasificacion === "titulo" ? "Título" : "Saldo"}
            </Badge>
          </div>
          <p className="text-lg text-muted-foreground">{cuenta.nombre}</p>
          <p className="text-sm text-muted-foreground">
            {cuenta.empresas?.razon_social}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <label className="text-sm font-medium text-muted-foreground">Desde</label>
              <DateInput
                value={fechaDesde}
                onChange={setFechaDesde}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="w-40">
              <label className="text-sm font-medium text-muted-foreground">Hasta</label>
              <DateInput
                value={fechaHasta}
                onChange={setFechaHasta}
                placeholder="dd/mm/aaaa"
              />
            </div>
            {centroOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Centro de Negocio</label>
                <FilterSelect
                  value={filterCentro}
                  onValueChange={setFilterCentro}
                  options={centroOptions}
                  placeholder="Todos los centros"
                  searchPlaceholder="Buscar centro..."
                  allOption={{ value: "all", label: "Todos los centros" }}
                  className="w-52"
                />
              </div>
            )}
            {terceroOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tercero</label>
                <FilterSelect
                  value={filterTercero}
                  onValueChange={setFilterTercero}
                  options={terceroOptions}
                  placeholder="Todos los terceros"
                  searchPlaceholder="Buscar tercero..."
                  allOption={{ value: "all", label: "Todos los terceros" }}
                  className="w-52"
                />
              </div>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredMovimientos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Debe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totalDebe)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Haber</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary-foreground">
              {formatCurrency(totalHaber)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${saldo < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Movimientos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMovimientos.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {movimientos.length === 0 
                  ? "Esta cuenta no tiene movimientos" 
                  : "No hay movimientos con los filtros seleccionados"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Fecha</TableHead>
                    <TableHead className="w-[80px]">Póliza</TableHead>
                    <TableHead className="w-[60px]">Tipo</TableHead>
                    <TableHead>Partida</TableHead>
                    <TableHead>Tercero</TableHead>
                    <TableHead>Centro Neg.</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead className="text-right w-[120px]">Debe</TableHead>
                    <TableHead className="text-right w-[120px]">Haber</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovimientos.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-mono text-sm">
                        {mov.asiento?.fecha 
                          ? format(parseLocalDate(mov.asiento.fecha), "dd/MM/yyyy", { locale: es })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          #{mov.asiento?.numero_asiento || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={tipoColors[mov.asiento?.tipo || "diario"]}>
                          {mov.asiento?.tipo === "ingreso" ? "I" : mov.asiento?.tipo === "egreso" ? "E" : "D"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={mov.partida}>
                        {mov.partida}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate" title={mov.asiento?.terceros?.razon_social || ""}>
                        {mov.asiento?.terceros?.razon_social || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={mov.asiento?.centros_negocio ? `${mov.asiento.centros_negocio.codigo} - ${mov.asiento.centros_negocio.nombre}` : ""}>
                        {mov.asiento?.centros_negocio 
                          ? `${mov.asiento.centros_negocio.codigo} - ${mov.asiento.centros_negocio.nombre}`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={mov.asiento?.observaciones || ""}>
                        {mov.asiento?.observaciones || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(mov.debe) > 0 ? formatCurrency(mov.debe) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(mov.haber) > 0 ? formatCurrency(mov.haber) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Ver póliza"
                        >
                          <Link to={`/asientos/${mov.asiento_id}`}>
                            <FileText className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
