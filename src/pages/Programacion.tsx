import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Play, Copy, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, Building2, Landmark, X, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDateNumeric, parseLocalDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSelect } from "@/components/ui/filter-select";
import { DateInput } from "@/components/ui/date-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProgramacionDialog } from "@/components/dialogs/ProgramacionDialog";
import { ProyeccionProgramacion } from "@/components/reportes/ProyeccionProgramacion";

interface Programacion {
  id: string;
  empresa_id: string;
  tipo: "ingreso" | "egreso";
  centro_negocio_id: string | null;
  fecha_programada: string;
  tercero_id: string | null;
  monto: number;
  observaciones: string | null;
  estado: "pendiente" | "ejecutado" | "cancelado";
  asiento_id: string | null;
  presupuesto_id: string | null;
  empresas: { razon_social: string } | null;
  centros_negocio: { codigo: string; nombre: string } | null;
  terceros: { razon_social: string } | null;
  presupuestos: { partida: string } | null;
}

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  empresa_id: string;
}

interface AsientoMovimiento {
  cuenta_id: string;
  debe: number;
  haber: number;
}

interface CentroNegocio {
  id: string;
  codigo: string;
  nombre: string;
  empresa_id: string;
}

interface Tercero {
  id: string;
  razon_social: string;
  empresa_id: string;
}

export default function Programacion() {
  const { toast } = useToast();
  const [programaciones, setProgramaciones] = useState<Programacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgramacion, setEditingProgramacion] = useState<Programacion | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("pendiente");
  const [filterCentroNegocio, setFilterCentroNegocio] = useState<string>("all");
  const [filterTercero, setFilterTercero] = useState<string>("all");
  const [filterFechaDesde, setFilterFechaDesde] = useState<Date | undefined>(undefined);
  const [filterFechaHasta, setFilterFechaHasta] = useState<Date | undefined>(undefined);
  
  // Catalogs for filters
  const [empresas, setEmpresas] = useState<{ id: string; razon_social: string }[]>([]);
  const [centrosNegocio, setCentrosNegocio] = useState<CentroNegocio[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);

  // Saldos bancarios
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [movimientos, setMovimientos] = useState<AsientoMovimiento[]>([]);

  // Grouping preference with localStorage persistence
  type GroupingType = "tipo" | "centro" | "presupuesto" | "ninguno";
  const [grouping, setGrouping] = useState<GroupingType>(() => {
    const saved = localStorage.getItem("programacion_grouping");
    return (saved as GroupingType) || "tipo";
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["ingreso", "egreso"]));

  const handleGroupingChange = (value: string) => {
    if (value) {
      const newGrouping = value as GroupingType;
      setGrouping(newGrouping);
      localStorage.setItem("programacion_grouping", newGrouping);
      // Expand all groups when changing grouping
      if (newGrouping !== "ninguno") {
        const allGroupIds = new Set(groupedProgramaciones.map(g => g.id));
        setExpandedGroups(allGroupIds);
      }
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  useEffect(() => {
    fetchData();
    fetchCatalogs();
    fetchCuentasYMovimientos();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("programaciones")
      .select(`
        *,
        empresas(razon_social),
        centros_negocio(codigo, nombre),
        terceros(razon_social),
        presupuestos(partida)
      `)
      .order("fecha_programada", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProgramaciones(data || []);
    }
    setLoading(false);
  };

  const fetchCatalogs = async () => {
    const [empresasRes, centrosRes, tercerosRes] = await Promise.all([
      supabase.from("empresas").select("id, razon_social").eq("activa", true).order("razon_social"),
      supabase.from("centros_negocio").select("id, codigo, nombre, empresa_id").eq("activo", true).order("codigo"),
      supabase.from("terceros").select("id, razon_social, empresa_id").eq("activo", true).order("razon_social"),
    ]);
    if (empresasRes.data) setEmpresas(empresasRes.data);
    if (centrosRes.data) setCentrosNegocio(centrosRes.data);
    if (tercerosRes.data) setTerceros(tercerosRes.data);
  };

  const fetchCuentasYMovimientos = async () => {
    // Fetch cuentas contables para identificar bancos y cartera
    const { data: cuentasData } = await supabase
      .from("cuentas_contables")
      .select("id, codigo, nombre, naturaleza, empresa_id")
      .eq("activa", true);
    
    if (cuentasData) setCuentas(cuentasData);

    // Fetch movimientos de asientos aplicados
    const { data: movimientosData } = await supabase
      .from("asiento_movimientos")
      .select(`
        cuenta_id,
        debe,
        haber,
        asientos_contables!inner(estado)
      `)
      .eq("asientos_contables.estado", "aplicado");

    if (movimientosData) {
      setMovimientos(movimientosData.map(m => ({
        cuenta_id: m.cuenta_id,
        debe: Number(m.debe),
        haber: Number(m.haber),
      })));
    }
  };

  // Filter centros and terceros by selected empresa
  const filteredCentrosNegocio = useMemo(() => {
    if (filterEmpresa === "all") return centrosNegocio;
    return centrosNegocio.filter(c => c.empresa_id === filterEmpresa);
  }, [centrosNegocio, filterEmpresa]);

  const filteredTerceros = useMemo(() => {
    if (filterEmpresa === "all") return terceros;
    return terceros.filter(t => t.empresa_id === filterEmpresa);
  }, [terceros, filterEmpresa]);

  const filteredProgramaciones = useMemo(() => {
    const filtered = programaciones.filter((p) => {
      if (filterEmpresa !== "all" && p.empresa_id !== filterEmpresa) return false;
      if (filterTipo !== "all" && p.tipo !== filterTipo) return false;
      if (filterEstado !== "all" && p.estado !== filterEstado) return false;
      if (filterCentroNegocio !== "all" && p.centro_negocio_id !== filterCentroNegocio) return false;
      if (filterTercero !== "all" && p.tercero_id !== filterTercero) return false;
      if (filterFechaDesde) {
        const fechaProg = parseLocalDate(p.fecha_programada);
        if (fechaProg < filterFechaDesde) return false;
      }
      if (filterFechaHasta) {
        const fechaProg = parseLocalDate(p.fecha_programada);
        if (fechaProg > filterFechaHasta) return false;
      }
      return true;
    });

    // Sort: by Centro de Negocio (A-Z), then by fecha
    return filtered.sort((a, b) => {
      // By centro de negocio name (items without centro go last)
      const centroA = a.centros_negocio?.nombre || "";
      const centroB = b.centros_negocio?.nombre || "";
      if (centroA && !centroB) return -1;
      if (!centroA && centroB) return 1;
      const centroCompare = centroA.localeCompare(centroB, "es", { sensitivity: "base" });
      if (centroCompare !== 0) return centroCompare;

      // Then by date
      return a.fecha_programada.localeCompare(b.fecha_programada);
    });
  }, [programaciones, filterEmpresa, filterTipo, filterEstado, filterCentroNegocio, filterTercero, filterFechaDesde, filterFechaHasta]);

  const clearFilters = () => {
    setFilterEmpresa("all");
    setFilterTipo("all");
    setFilterCentroNegocio("all");
    setFilterTercero("all");
    setFilterFechaDesde(undefined);
    setFilterFechaHasta(undefined);
  };

  const hasActiveFilters = filterEmpresa !== "all" || filterTipo !== "all" || filterCentroNegocio !== "all" || filterTercero !== "all" || filterFechaDesde || filterFechaHasta;

  // Calcular saldos de banco y cartera
  const saldosBancarios = useMemo(() => {
    // Banco: filtrar por empresa si hay filtro activo
    const cuentasFiltradas = filterEmpresa === "all" 
      ? cuentas 
      : cuentas.filter(c => c.empresa_id === filterEmpresa);

    // Bancos: cuentas que empiecen con 100-001-001 y NO sean de cartera
    const cuentasBanco = cuentasFiltradas.filter(c =>
      c.codigo.startsWith("100-001-001") &&
      !c.codigo.startsWith("100-001-002") &&
      !c.nombre.toLowerCase().includes("cartera")
    );

    // Cartera: SIEMPRE de todas las empresas (saldo global)
    // Solo cuentas que empiecen con 100-001-002 O contengan "cartera" en el nombre
    const cuentasCartera = cuentas.filter(c =>
      c.codigo.startsWith("100-001-002") ||
      c.nombre.toLowerCase().includes("cartera")
    );

    const calcularSaldo = (cuentasIds: string[]) => {
      return movimientos
        .filter(m => cuentasIds.includes(m.cuenta_id))
        .reduce((sum, m) => sum + m.debe - m.haber, 0);
    };

    const saldoBanco = calcularSaldo(cuentasBanco.map(c => c.id));
    const saldoCartera = calcularSaldo(cuentasCartera.map(c => c.id));

    return { banco: saldoBanco, cartera: saldoCartera };
  }, [cuentas, movimientos, filterEmpresa]);

  // KPIs - ahora se calculan sobre filteredProgramaciones
  const kpis = useMemo(() => {
    const pendientes = filteredProgramaciones.filter((p) => p.estado === "pendiente");
    const ingresos = pendientes
      .filter((p) => p.tipo === "ingreso")
      .reduce((sum, p) => sum + Number(p.monto), 0);
    const egresos = pendientes
      .filter((p) => p.tipo === "egreso")
      .reduce((sum, p) => sum + Number(p.monto), 0);
    
    // Balance = Saldo Banco + Saldo Cartera + Ingresos - Egresos
    const balance = saldosBancarios.banco + saldosBancarios.cartera + ingresos - egresos;
    
    return { ingresos, egresos, balance };
  }, [filteredProgramaciones, saldosBancarios]);

  // Grouped programaciones based on selected grouping
  interface GroupedData {
    id: string;
    label: string;
    sublabel?: string;
    programaciones: Programacion[];
    totalMonto: number;
    tipo?: "ingreso" | "egreso";
  }

  const groupedProgramaciones = useMemo(() => {
    const groups: Record<string, GroupedData> = {};
    
    filteredProgramaciones.forEach((p) => {
      let groupKey: string;
      let groupLabel: string;
      let groupSublabel: string | undefined;
      let groupTipo: "ingreso" | "egreso" | undefined;

      switch (grouping) {
        case "centro":
          groupKey = p.centro_negocio_id || "sin-centro";
          groupLabel = p.centros_negocio?.nombre || "Sin centro de negocio";
          groupSublabel = p.centros_negocio?.codigo;
          break;
        case "presupuesto":
          groupKey = p.presupuesto_id || "sin-presupuesto";
          groupLabel = p.presupuestos?.partida || "Sin presupuesto vinculado";
          break;
        case "tipo":
        default:
          groupKey = p.tipo;
          groupLabel = p.tipo === "ingreso" ? "Ingresos" : "Egresos";
          groupTipo = p.tipo;
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          label: groupLabel,
          sublabel: groupSublabel,
          programaciones: [],
          totalMonto: 0,
          tipo: groupTipo,
        };
      }
      groups[groupKey].programaciones.push(p);
      groups[groupKey].totalMonto += Number(p.monto);
    });

    // Sort: for "tipo" grouping, show ingresos first; otherwise alphabetical A-Z
    const sorted = Object.values(groups).sort((a, b) => {
      if (grouping === "tipo") {
        return a.tipo === "ingreso" ? -1 : 1;
      }
      // Sort alphabetically A-Z, with "Sin..." items at the end
      const aIsEmpty = a.id === "sin-centro" || a.id === "sin-presupuesto";
      const bIsEmpty = b.id === "sin-centro" || b.id === "sin-presupuesto";
      if (aIsEmpty && !bIsEmpty) return 1;
      if (!aIsEmpty && bIsEmpty) return -1;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });

    return sorted;
  }, [filteredProgramaciones, grouping]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);

  const handleNew = () => {
    setEditingProgramacion(null);
    setIsCopyMode(false);
    setDialogOpen(true);
  };

  const handleEdit = (prog: Programacion) => {
    setEditingProgramacion(prog);
    setIsCopyMode(false);
    setDialogOpen(true);
  };

  const handleCopy = (prog: Programacion) => {
    setEditingProgramacion(prog);
    setIsCopyMode(true);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("programaciones").delete().eq("id", deletingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Programación eliminada" });
      fetchData();
    }
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  const handleExecute = async (prog: Programacion) => {
    // Navigate to Asientos page with pre-filled data
    // For now, mark as executed (full integration would open AsientoDialog)
    const { error } = await supabase
      .from("programaciones")
      .update({ estado: "ejecutado" })
      .eq("id", prog.id);
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Programación marcada como ejecutada" });
      fetchData();
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pendiente</Badge>;
      case "ejecutado":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Ejecutado</Badge>;
      case "cancelado":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    return tipo === "ingreso" ? (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        <TrendingUp className="h-3 w-3 mr-1" />
        Ingreso
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
        <TrendingDown className="h-3 w-3 mr-1" />
        Egreso
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Programación Financiera</h1>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Programación
        </Button>
      </div>

      <Tabs defaultValue="programaciones" className="space-y-4">
        <TabsList>
          <TabsTrigger value="programaciones">Programaciones</TabsTrigger>
          <TabsTrigger value="proyeccion">Proyección</TabsTrigger>
        </TabsList>

        <TabsContent value="programaciones" className="space-y-4">
          {/* KPI Cards - Saldos Bancarios */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Bancos</CardTitle>
                <Landmark className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${saldosBancarios.banco >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                  {formatCurrency(saldosBancarios.banco)}
                </div>
                <p className="text-xs text-muted-foreground">Disponible en cuentas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Cartera</CardTitle>
                <Building2 className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${saldosBancarios.cartera >= 0 ? "text-amber-600" : "text-rose-600"}`}>
                  {formatCurrency(saldosBancarios.cartera)}
                </div>
                <p className="text-xs text-muted-foreground">Por cobrar</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos Programados</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(kpis.ingresos)}
                </div>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Egresos Programados</CardTitle>
                <TrendingDown className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">
                  {formatCurrency(kpis.egresos)}
                </div>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Balance Proyectado</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${kpis.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(kpis.balance)}
                </div>
                <p className="text-xs text-muted-foreground">Banco + Cartera + Ingresos - Egresos</p>
              </CardContent>
            </Card>
          </div>

          {/* Estado Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button
                variant={filterEstado === "pendiente" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterEstado("pendiente")}
                className="h-8"
              >
                Pendientes
                <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-700">
                  {programaciones.filter(p => p.estado === "pendiente").length}
                </Badge>
              </Button>
              <Button
                variant={filterEstado === "ejecutado" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterEstado("ejecutado")}
                className="h-8"
              >
                Ejecutados
                <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                  {programaciones.filter(p => p.estado === "ejecutado").length}
                </Badge>
              </Button>
              <Button
                variant={filterEstado === "cancelado" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterEstado("cancelado")}
                className="h-8"
              >
                Cancelados
                <Badge variant="secondary" className="ml-2 bg-red-100 text-red-700">
                  {programaciones.filter(p => p.estado === "cancelado").length}
                </Badge>
              </Button>
              <Button
                variant={filterEstado === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterEstado("all")}
                className="h-8"
              >
                Todos
              </Button>
            </div>

            <div className="h-6 w-px bg-border mx-2" />

            {/* Filters */}
            <FilterSelect
              value={filterEmpresa}
              onValueChange={(val) => {
                setFilterEmpresa(val);
                setFilterCentroNegocio("all");
                setFilterTercero("all");
              }}
              options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
              placeholder="Empresa"
              searchPlaceholder="Buscar empresa..."
              allOption={{ value: "all", label: "Todas las empresas" }}
              className="w-[180px] h-8"
            />

            <FilterSelect
              value={filterCentroNegocio}
              onValueChange={setFilterCentroNegocio}
              options={filteredCentrosNegocio.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nombre}` }))}
              placeholder="Centro de Negocio"
              searchPlaceholder="Buscar centro..."
              allOption={{ value: "all", label: "Todos los centros" }}
              className="w-[200px] h-8"
            />

            <FilterSelect
              value={filterTercero}
              onValueChange={setFilterTercero}
              options={filteredTerceros.map((t) => ({ value: t.id, label: t.razon_social }))}
              placeholder="Tercero"
              searchPlaceholder="Buscar tercero..."
              allOption={{ value: "all", label: "Todos los terceros" }}
              className="w-[180px] h-8"
            />

            <FilterSelect
              value={filterTipo}
              onValueChange={setFilterTipo}
              options={[
                { value: "ingreso", label: "Ingresos" },
                { value: "egreso", label: "Egresos" },
              ]}
              placeholder="Tipo"
              searchPlaceholder="Buscar tipo..."
              allOption={{ value: "all", label: "Todos" }}
              className="w-[130px] h-8"
            />

            {/* Date Filters */}
            <DateInput
              value={filterFechaDesde}
              onChange={setFilterFechaDesde}
              placeholder="Desde"
              className="w-[160px]"
            />

            <DateInput
              value={filterFechaHasta}
              onChange={setFilterFechaHasta}
              placeholder="Hasta"
              className="w-[160px]"
            />

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {/* Grouping Toggle */}
          <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span>Agrupar por:</span>
            </div>
            <ToggleGroup type="single" value={grouping} onValueChange={handleGroupingChange}>
              <ToggleGroupItem value="ninguno" aria-label="Sin agrupar" className="text-xs px-3">
                Sin agrupar
              </ToggleGroupItem>
              <ToggleGroupItem value="tipo" aria-label="Agrupar por tipo" className="text-xs px-3">
                Tipo
              </ToggleGroupItem>
              <ToggleGroupItem value="centro" aria-label="Agrupar por centro" className="text-xs px-3">
                Centro
              </ToggleGroupItem>
              <ToggleGroupItem value="presupuesto" aria-label="Agrupar por presupuesto" className="text-xs px-3">
                Presupuesto
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Tables */}
          <div className="space-y-4">
            {loading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  Cargando...
                </CardContent>
              </Card>
            ) : filteredProgramaciones.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No hay programaciones
                </CardContent>
              </Card>
            ) : grouping === "ninguno" ? (
              /* Flat table without grouping */
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Presupuesto</TableHead>
                        <TableHead>Centro de Negocio</TableHead>
                        <TableHead>Tercero</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProgramaciones.map((prog) => (
                        <TableRow key={prog.id}>
                          <TableCell className="font-medium">
                            {formatDateNumeric(prog.fecha_programada)}
                          </TableCell>
                          <TableCell>{prog.empresas?.razon_social}</TableCell>
                          <TableCell>{getTipoBadge(prog.tipo)}</TableCell>
                          <TableCell>
                            {prog.presupuestos ? (
                              <Badge variant="secondary" className="max-w-[200px] truncate">
                                {prog.presupuestos.partida}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {prog.centros_negocio
                              ? `${prog.centros_negocio.codigo} - ${prog.centros_negocio.nombre}`
                              : "-"}
                          </TableCell>
                          <TableCell>{prog.terceros?.razon_social || "-"}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(prog.monto)}
                          </TableCell>
                          <TableCell>{getEstadoBadge(prog.estado)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {prog.estado === "pendiente" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleExecute(prog)}
                                    title="Ejecutar"
                                  >
                                    <Play className="h-4 w-4 text-emerald-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(prog)}
                                    title="Editar"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopy(prog)}
                                title="Copiar"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeletingId(prog.id);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              /* Grouped tables with collapsible sections */
              groupedProgramaciones.map((group) => (
                <Card key={group.id}>
                  <Collapsible
                    open={expandedGroups.has(group.id)}
                    onOpenChange={() => toggleGroup(group.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {expandedGroups.has(group.id) ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                {group.tipo && (
                                  group.tipo === "ingreso" ? (
                                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-rose-600" />
                                  )
                                )}
                                {group.label}
                              </CardTitle>
                              {group.sublabel && (
                                <p className="text-xs text-muted-foreground font-mono">
                                  {group.sublabel}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="secondary">
                              {group.programaciones.length} registro(s)
                            </Badge>
                            <div className={cn(
                              "text-lg font-bold font-mono",
                              group.tipo === "ingreso" ? "text-emerald-600" : 
                              group.tipo === "egreso" ? "text-rose-600" : "text-foreground"
                            )}>
                              {formatCurrency(group.totalMonto)}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Empresa</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Presupuesto</TableHead>
                              <TableHead>Centro de Negocio</TableHead>
                              <TableHead>Tercero</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.programaciones.map((prog) => (
                              <TableRow key={prog.id}>
                                <TableCell className="font-medium">
                                  {formatDateNumeric(prog.fecha_programada)}
                                </TableCell>
                                <TableCell>{prog.empresas?.razon_social}</TableCell>
                                <TableCell>{getTipoBadge(prog.tipo)}</TableCell>
                                <TableCell>
                                  {prog.presupuestos ? (
                                    <Badge variant="secondary" className="max-w-[200px] truncate">
                                      {prog.presupuestos.partida}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {prog.centros_negocio
                                    ? `${prog.centros_negocio.codigo} - ${prog.centros_negocio.nombre}`
                                    : "-"}
                                </TableCell>
                                <TableCell>{prog.terceros?.razon_social || "-"}</TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatCurrency(prog.monto)}
                                </TableCell>
                                <TableCell>{getEstadoBadge(prog.estado)}</TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    {prog.estado === "pendiente" && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleExecute(prog)}
                                          title="Ejecutar"
                                        >
                                          <Play className="h-4 w-4 text-emerald-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleEdit(prog)}
                                          title="Editar"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleCopy(prog)}
                                      title="Copiar"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setDeletingId(prog.id);
                                        setDeleteDialogOpen(true);
                                      }}
                                      title="Eliminar"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="proyeccion">
          <ProyeccionProgramacion programaciones={programaciones} />
        </TabsContent>
      </Tabs>

      <ProgramacionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        programacion={editingProgramacion}
        onSuccess={fetchData}
        isCopy={isCopyMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar programación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
