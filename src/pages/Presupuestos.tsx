import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSelect } from "@/components/ui/filter-select";
import { MultiFilterSelect } from "@/components/ui/multi-filter-select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Plus,
  Search,
  Edit,
  ChevronDown,
  ChevronRight,
  Calculator,
  Building,
  Power,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  GripVertical,
  Layers,
} from "lucide-react";
import { PresupuestoDialog } from "@/components/dialogs/PresupuestoDialog";
import { SortablePresupuestoRow } from "@/components/presupuestos/SortablePresupuestoRow";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface Empresa {
  id: string;
  razon_social: string;
}

interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
}

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
}

interface Tercero {
  id: string;
  razon_social: string;
  rfc: string;
}

interface CentroNegocio {
  id: string;
  codigo: string;
  nombre: string;
}

interface MovimientoConAsiento {
  id: string;
  presupuesto_id: string;
  debe: number;
  haber: number;
  cuenta_id: string;
  asientos_contables: {
    estado: string;
  };
  cuentas_contables: {
    codigo: string;
  } | null;
}

interface Presupuesto {
  id: string;
  empresa_id: string;
  cuenta_id: string | null;
  tercero_id: string | null;
  centro_negocio_id: string | null;
  unidad_medida_id: string | null;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  frecuencia: "semanal" | "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | null;
  orden: number;
  empresas?: Empresa;
  cuentas_contables?: CuentaContable;
  terceros?: Tercero;
  centros_negocio?: CentroNegocio;
  unidades_medida?: UnidadMedida;
  // Calculated fields
  ejercido?: number;
  porEjercer?: number;
  porcentaje?: number;
}

// Function to determine if account is "deudora" based on codigo
const esNaturalezaDeudora = (codigo: string): boolean => {
  if (!codigo) return true;
  return (
    codigo.startsWith("100") ||
    codigo.startsWith("500") ||
    codigo.startsWith("600") ||
    codigo.startsWith("1") && !codigo.startsWith("1") // Activo general
  );
};

// Calculate ejercido based on account nature
const calcularEjercido = (
  presupuestoId: string,
  cuentaCodigo: string | undefined,
  movimientos: MovimientoConAsiento[]
): number => {
  const movimientosMatch = movimientos.filter(
    (m) => m.presupuesto_id === presupuestoId && m.asientos_contables?.estado === "aplicado"
  );

  if (movimientosMatch.length === 0) return 0;

  const codigoCuenta = cuentaCodigo || movimientosMatch[0]?.cuentas_contables?.codigo || "";
  
  // For cuentas 100, 500, 600 (Activo, Costos, Gastos) -> sum debe
  // For cuentas 200, 300, 400 (Pasivo, Capital, Ingresos) -> sum haber
  const esDeudora = 
    codigoCuenta.startsWith("100") || 
    codigoCuenta.startsWith("500") || 
    codigoCuenta.startsWith("600") ||
    codigoCuenta.startsWith("1");

  if (esDeudora) {
    return movimientosMatch.reduce((sum, m) => sum + Number(m.debe), 0);
  } else {
    return movimientosMatch.reduce((sum, m) => sum + Number(m.haber), 0);
  }
};

export default function Presupuestos() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoConAsiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterCentros, setFilterCentros] = useState<string[]>([]);
  const [filterCuentas, setFilterCuentas] = useState<string[]>([]);
  const [filterPartidas, setFilterPartidas] = useState<string[]>([]);
  
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">("activos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPresupuesto, setEditingPresupuesto] = useState<Presupuesto | null>(null);
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
  
  // Grouping preference with localStorage persistence
  type GroupingType = "partida" | "cuenta" | "centro" | "empresa";
  const [grouping, setGrouping] = useState<GroupingType>(() => {
    const saved = localStorage.getItem("presupuestos_grouping");
    return (saved as GroupingType) || "empresa";
  });

  const handleGroupingChange = (value: string) => {
    if (value) {
      const newGrouping = value as GroupingType;
      setGrouping(newGrouping);
      localStorage.setItem("presupuestos_grouping", newGrouping);
    }
  };

  const canEdit = true; // All authenticated users can edit

  // DnD state and sensors
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [presupuestosRes, empresasRes, movimientosRes] = await Promise.all([
        supabase
          .from("presupuestos")
          .select(`
            *,
            empresas(id, razon_social),
            cuentas_contables(id, codigo, nombre),
            terceros(id, razon_social, rfc),
            centros_negocio(id, codigo, nombre),
            unidades_medida(id, codigo, nombre)
          `)
          .order("orden", { ascending: true }),
        supabase
          .from("empresas")
          .select("id, razon_social")
          .eq("activa", true)
          .order("razon_social"),
        supabase
          .from("asiento_movimientos")
          .select(`
            id, 
            presupuesto_id, 
            debe, 
            haber,
            cuenta_id,
            asientos_contables!inner(estado),
            cuentas_contables(codigo)
          `)
          .not("presupuesto_id", "is", null),
      ]);

      if (presupuestosRes.error) throw presupuestosRes.error;
      if (empresasRes.error) throw empresasRes.error;
      if (movimientosRes.error) throw movimientosRes.error;

      setPresupuestos(presupuestosRes.data || []);
      setEmpresas(empresasRes.data || []);
      setMovimientos((movimientosRes.data || []) as unknown as MovimientoConAsiento[]);
      
      // Expand all empresas by default
      const empresaIds = new Set((presupuestosRes.data || []).map(p => p.empresa_id));
      setExpandedEmpresas(empresaIds);
    } catch (error: any) {
      toast({
        title: "Error al cargar datos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActivo = async (presupuesto: Presupuesto) => {
    try {
      const { error } = await supabase
        .from("presupuestos")
        .update({ activo: !presupuesto.activo })
        .eq("id", presupuesto.id);
      if (error) throw error;
      toast({
        title: presupuesto.activo ? "Presupuesto desactivado" : "Presupuesto activado",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openNew = () => {
    setEditingPresupuesto(null);
    setDialogOpen(true);
  };

  const openEdit = (presupuesto: Presupuesto) => {
    setEditingPresupuesto(presupuesto);
    setDialogOpen(true);
  };

  const toggleEmpresa = (empresaId: string) => {
    const newExpanded = new Set(expandedEmpresas);
    if (newExpanded.has(empresaId)) {
      newExpanded.delete(empresaId);
    } else {
      newExpanded.add(empresaId);
    }
    setExpandedEmpresas(newExpanded);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  // Enrich presupuestos with calculated fields
  const presupuestosConEjercido = useMemo(() => {
    return presupuestos.map((p) => {
      const presupuestado = p.cantidad * p.precio_unitario;
      const ejercido = calcularEjercido(p.id, p.cuentas_contables?.codigo, movimientos);
      const porEjercer = presupuestado - ejercido;
      const porcentaje = presupuestado > 0 ? (ejercido / presupuestado) * 100 : 0;
      
      return {
        ...p,
        ejercido,
        porEjercer,
        porcentaje,
      };
    });
  }, [presupuestos, movimientos]);

  // Generate unique options for filters
  const filterOptions = useMemo(() => {
    const centrosMap = new Map<string, { value: string; label: string; sublabel?: string }>();
    const cuentasMap = new Map<string, { value: string; label: string; sublabel?: string }>();
    const partidasSet = new Set<string>();
    

    presupuestosConEjercido.forEach((p) => {
      // Centros de negocio
      if (p.centros_negocio?.id) {
        centrosMap.set(p.centros_negocio.id, {
          value: p.centros_negocio.id,
          label: p.centros_negocio.nombre,
          sublabel: p.centros_negocio.codigo,
        });
      }
      // Cuentas
      if (p.cuentas_contables?.id) {
        cuentasMap.set(p.cuentas_contables.id, {
          value: p.cuentas_contables.id,
          label: p.cuentas_contables.nombre,
          sublabel: p.cuentas_contables.codigo,
        });
      }
      // Partidas (unique names)
      if (p.partida) {
        partidasSet.add(p.partida);
      }
    });

    return {
      centros: Array.from(centrosMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
      cuentas: Array.from(cuentasMap.values()).sort((a, b) => (a.sublabel || "").localeCompare(b.sublabel || "")),
      partidas: Array.from(partidasSet)
        .sort((a, b) => a.localeCompare(b))
        .map((p) => ({ value: p, label: p })),
    };
  }, [presupuestosConEjercido]);

  // Filter presupuestos
  const filteredPresupuestos = useMemo(() => {
    return presupuestosConEjercido.filter((p) => {
      const matchesSearch =
        p.partida.toLowerCase().includes(search.toLowerCase()) ||
        p.notas?.toLowerCase().includes(search.toLowerCase()) ||
        p.empresas?.razon_social.toLowerCase().includes(search.toLowerCase()) ||
        p.centros_negocio?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        p.centros_negocio?.codigo?.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = filterCompany === "all" || p.empresa_id === filterCompany;
      const matchesEstado = filterEstado === "activos" ? p.activo : !p.activo;
      
      // Multi-select filters
      const matchesCentro = filterCentros.length === 0 || (p.centro_negocio_id && filterCentros.includes(p.centro_negocio_id));
      const matchesCuenta = filterCuentas.length === 0 || (p.cuenta_id && filterCuentas.includes(p.cuenta_id));
      const matchesPartida = filterPartidas.length === 0 || filterPartidas.includes(p.partida);
      
      
      return matchesSearch && matchesCompany && matchesEstado && matchesCentro && matchesCuenta && matchesPartida;
    });
  }, [presupuestosConEjercido, search, filterCompany, filterEstado, filterCentros, filterCuentas, filterPartidas]);

  // Generic grouping structure
  interface GroupedData {
    id: string;
    label: string;
    sublabel?: string;
    presupuestos: Presupuesto[];
    totalPresupuestado: number;
    totalEjercido: number;
    totalPorEjercer: number;
  }

  // Dynamic grouping based on selected grouping type
  const groupedData = useMemo(() => {
    const groups: Record<string, GroupedData> = {};
    
    filteredPresupuestos.forEach((p) => {
      let groupKey: string;
      let groupLabel: string;
      let groupSublabel: string | undefined;

      switch (grouping) {
        case "partida":
          groupKey = p.partida;
          groupLabel = p.partida;
          break;
        case "cuenta":
          groupKey = p.cuenta_id || "sin-cuenta";
          groupLabel = p.cuentas_contables?.nombre || "Sin cuenta";
          groupSublabel = p.cuentas_contables?.codigo;
          break;
        case "centro":
          groupKey = p.centro_negocio_id || "sin-centro";
          groupLabel = p.centros_negocio?.nombre || "Sin centro de negocio";
          groupSublabel = p.centros_negocio?.codigo;
          break;
        case "empresa":
        default:
          groupKey = p.empresa_id;
          groupLabel = p.empresas?.razon_social || "Sin empresa";
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          label: groupLabel,
          sublabel: groupSublabel,
          presupuestos: [],
          totalPresupuestado: 0,
          totalEjercido: 0,
          totalPorEjercer: 0,
        };
      }
      groups[groupKey].presupuestos.push(p);
      if (p.activo) {
        const presupuestado = p.cantidad * p.precio_unitario;
        groups[groupKey].totalPresupuestado += presupuestado;
        groups[groupKey].totalEjercido += p.ejercido || 0;
        groups[groupKey].totalPorEjercer += p.porEjercer || 0;
      }
    });
    
    // Sort presupuestos within each group by orden
    Object.values(groups).forEach(group => {
      group.presupuestos.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    });
    
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredPresupuestos, grouping]);

  // Backward compatibility alias for drag & drop (uses empresa.id)
  const groupedByEmpresa = useMemo(() => {
    return groupedData.map(g => ({
      empresa: { id: g.id, razon_social: g.label },
      presupuestos: g.presupuestos,
      totalPresupuestado: g.totalPresupuestado,
      totalEjercido: g.totalEjercido,
      totalPorEjercer: g.totalPorEjercer,
    }));
  }, [groupedData]);

  // Handle drag end for reordering
  const handleDragEnd = useCallback(async (event: DragEndEvent, empresaId: string) => {
    setActiveId(null);
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    // Find the group for this empresa
    const group = groupedByEmpresa.find(g => g.empresa.id === empresaId);
    if (!group) return;
    
    const oldIndex = group.presupuestos.findIndex(p => p.id === active.id);
    const newIndex = group.presupuestos.findIndex(p => p.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // Reorder the items
    const reorderedItems = arrayMove(group.presupuestos, oldIndex, newIndex);
    
    // Update orden values
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      orden: index + 1,
    }));
    
    // Optimistic update
    setPresupuestos(prev => {
      const newPresupuestos = [...prev];
      updates.forEach(update => {
        const idx = newPresupuestos.findIndex(p => p.id === update.id);
        if (idx !== -1) {
          newPresupuestos[idx] = { ...newPresupuestos[idx], orden: update.orden };
        }
      });
      return newPresupuestos;
    });
    
    // Update database
    try {
      await Promise.all(
        updates.map(update =>
          supabase.from("presupuestos").update({ orden: update.orden }).eq("id", update.id)
        )
      );
      toast({ title: "Orden actualizado" });
    } catch (error: any) {
      toast({
        title: "Error al reordenar",
        description: error.message,
        variant: "destructive",
      });
      // Revert on error
      fetchData();
    }
  }, [groupedByEmpresa, toast]);

  // Get the active presupuesto for drag overlay
  const activePresupuesto = useMemo(() => {
    if (!activeId) return null;
    return filteredPresupuestos.find(p => p.id === activeId) || null;
  }, [activeId, filteredPresupuestos]);

  // Calculate totals
  const totals = useMemo(() => {
    const activePresupuestos = filteredPresupuestos.filter(p => p.activo);
    const totalPresupuestado = activePresupuestos.reduce(
      (sum, p) => sum + p.cantidad * p.precio_unitario,
      0
    );
    const totalEjercido = activePresupuestos.reduce(
      (sum, p) => sum + (p.ejercido || 0),
      0
    );
    const totalPorEjercer = totalPresupuestado - totalEjercido;
    const porcentajeGlobal = totalPresupuestado > 0 ? (totalEjercido / totalPresupuestado) * 100 : 0;
    const totalPartidas = activePresupuestos.length;
    const empresasCount = new Set(activePresupuestos.map(p => p.empresa_id)).size;
    
    return { totalPresupuestado, totalEjercido, totalPorEjercer, porcentajeGlobal, totalPartidas, empresasCount };
  }, [filteredPresupuestos]);

  // Get status color based on percentage
  const getStatusColor = (porcentaje: number) => {
    if (porcentaje > 100) return "destructive";
    if (porcentaje >= 80) return "warning";
    return "default";
  };

  const getProgressColor = (porcentaje: number) => {
    if (porcentaje > 100) return "bg-destructive";
    if (porcentaje >= 80) return "bg-yellow-500";
    return "bg-primary";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Presupuestos</h1>
          <p className="text-muted-foreground">
            Gestiona las partidas presupuestales por empresa
          </p>
        </div>
        {role === "admin" && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Presupuesto
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Presupuestado</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totals.totalPresupuestado)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.totalPartidas} partidas activas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ejercido</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totals.totalEjercido)}
            </div>
            <div className="flex items-center gap-2">
              <Progress 
                value={Math.min(totals.porcentajeGlobal, 100)} 
                className="h-2 flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {totals.porcentajeGlobal.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Por Ejercer</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.totalPorEjercer < 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(totals.totalPorEjercer)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.totalPorEjercer < 0 ? 'Sobregiro' : 'Disponible'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.empresasCount}</div>
            <p className="text-xs text-muted-foreground">
              Con partidas activas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Row 1: Search and Company */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por partida, notas o empresa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <FilterSelect
                value={filterCompany}
                onValueChange={setFilterCompany}
                options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
                placeholder="Filtrar por empresa"
                searchPlaceholder="Buscar empresa..."
                allOption={{ value: "all", label: "Todas las empresas" }}
                className="w-full sm:w-[250px]"
              />
              <Tabs value={filterEstado} onValueChange={(v) => setFilterEstado(v as "activos" | "baja")}>
                <TabsList>
                  <TabsTrigger value="activos">Activos</TabsTrigger>
                  <TabsTrigger value="baja">Baja</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            {/* Row 2: Multi-filters */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <MultiFilterSelect
                values={filterCentros}
                onValuesChange={setFilterCentros}
                options={filterOptions.centros}
                placeholder="Centro de Negocio"
                searchPlaceholder="Buscar centro..."
                className="w-full"
              />
              <MultiFilterSelect
                values={filterCuentas}
                onValuesChange={setFilterCuentas}
                options={filterOptions.cuentas}
                placeholder="Cuenta"
                searchPlaceholder="Buscar cuenta..."
                className="w-full"
              />
              <MultiFilterSelect
                values={filterPartidas}
                onValuesChange={setFilterPartidas}
                options={filterOptions.partidas}
                placeholder="Partida"
                searchPlaceholder="Buscar partida..."
                className="w-full"
              />
            </div>
            
            {/* Row 3: Grouping buttons */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span>Agrupar por:</span>
              </div>
              <ToggleGroup type="single" value={grouping} onValueChange={handleGroupingChange}>
                <ToggleGroupItem value="empresa" aria-label="Agrupar por empresa" className="text-xs px-3">
                  Empresa
                </ToggleGroupItem>
                <ToggleGroupItem value="partida" aria-label="Agrupar por partida" className="text-xs px-3">
                  Partida
                </ToggleGroupItem>
                <ToggleGroupItem value="cuenta" aria-label="Agrupar por cuenta" className="text-xs px-3">
                  Cuenta
                </ToggleGroupItem>
                <ToggleGroupItem value="centro" aria-label="Agrupar por centro" className="text-xs px-3">
                  Centro
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped List */}
      <div className="space-y-4">
        {groupedData.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No hay presupuestos registrados</p>
              {role === "admin" && (
                <Button onClick={openNew} variant="outline" className="mt-4">
                  Crear primer presupuesto
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          groupedData.map((group) => {
            const porcentajeGrupo = group.totalPresupuestado > 0 
              ? (group.totalEjercido / group.totalPresupuestado) * 100 
              : 0;
            
            return (
              <Card key={group.id}>
                <Collapsible
                  open={expandedEmpresas.has(group.id)}
                  onOpenChange={() => toggleEmpresa(group.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedEmpresas.has(group.id) ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          <div>
                            <CardTitle className="text-lg">
                              {group.label}
                            </CardTitle>
                            {group.sublabel && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {group.sublabel}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {group.presupuestos.length} partida(s)
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Presupuestado</div>
                            <div className="text-lg font-bold text-primary">
                              {formatCurrency(group.totalPresupuestado)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Ejercido</div>
                            <div className="text-lg font-bold text-green-600">
                              {formatCurrency(group.totalEjercido)}
                            </div>
                          </div>
                          <div className="text-right min-w-[100px]">
                            <div className="text-sm text-muted-foreground">Avance</div>
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={Math.min(porcentajeGrupo, 100)} 
                                className="h-2 w-16"
                              />
                              <span className={`text-sm font-medium ${porcentajeGrupo > 100 ? 'text-destructive' : ''}`}>
                                {porcentajeGrupo.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="rounded-md border overflow-x-auto">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleDragStart}
                          onDragEnd={(event) => handleDragEnd(event, group.id)}
                          onDragCancel={handleDragCancel}
                        >
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {canEdit && <TableHead className="w-[40px]"></TableHead>}
                                <TableHead>Partida</TableHead>
                                <TableHead>Cuenta</TableHead>
                                
                                <TableHead>Centro</TableHead>
                                <TableHead className="text-right">Presupuesto</TableHead>
                                <TableHead className="text-right">Ejercido</TableHead>
                                <TableHead className="text-right">Por Ejercer</TableHead>
                                <TableHead className="w-[120px]">Avance</TableHead>
                                <TableHead>Estado</TableHead>
                                {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <SortableContext
                                items={group.presupuestos.map(p => p.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {group.presupuestos.map((p) => (
                                  <SortablePresupuestoRow
                                    key={p.id}
                                    presupuesto={p}
                                    canEdit={canEdit}
                                    canDelete={role === "admin"}
                                    formatCurrency={formatCurrency}
                                    getProgressColor={getProgressColor}
                                    onEdit={openEdit}
                                    onToggleActivo={handleToggleActivo}
                                  />
                                ))}
                              </SortableContext>
                            </TableBody>
                          </Table>
                          <DragOverlay>
                            {activePresupuesto && (
                              <div className="bg-card border rounded-md shadow-lg p-3 flex items-center gap-4">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">{activePresupuesto.partida}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {activePresupuesto.cuentas_contables?.codigo || "Sin cuenta"} • {formatCurrency(activePresupuesto.cantidad * activePresupuesto.precio_unitario)}
                                  </div>
                                </div>
                              </div>
                            )}
                          </DragOverlay>
                        </DndContext>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog */}
      <PresupuestoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presupuesto={editingPresupuesto}
        empresas={empresas}
        onSuccess={fetchData}
      />
    </div>
  );
}
