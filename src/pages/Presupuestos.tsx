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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { PresupuestoDialog } from "@/components/dialogs/PresupuestoDialog";

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
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">("activos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPresupuesto, setEditingPresupuesto] = useState<Presupuesto | null>(null);
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());

  const canEdit = role === "admin" || role === "contador";

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

  // Filter presupuestos
  const filteredPresupuestos = useMemo(() => {
    return presupuestosConEjercido.filter((p) => {
      const matchesSearch =
        p.partida.toLowerCase().includes(search.toLowerCase()) ||
        p.notas?.toLowerCase().includes(search.toLowerCase()) ||
        p.empresas?.razon_social.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = filterCompany === "all" || p.empresa_id === filterCompany;
      const matchesEstado = filterEstado === "activos" ? p.activo : !p.activo;
      return matchesSearch && matchesCompany && matchesEstado;
    });
  }, [presupuestosConEjercido, search, filterCompany, filterEstado]);

  // Group by empresa - sort by orden within each group
  const groupedByEmpresa = useMemo(() => {
    const groups: Record<string, { 
      empresa: Empresa; 
      presupuestos: Presupuesto[]; 
      totalPresupuestado: number;
      totalEjercido: number;
      totalPorEjercer: number;
    }> = {};
    
    filteredPresupuestos.forEach((p) => {
      const empresaId = p.empresa_id;
      if (!groups[empresaId]) {
        groups[empresaId] = {
          empresa: p.empresas || { id: empresaId, razon_social: "Sin empresa" },
          presupuestos: [],
          totalPresupuestado: 0,
          totalEjercido: 0,
          totalPorEjercer: 0,
        };
      }
      groups[empresaId].presupuestos.push(p);
      if (p.activo) {
        const presupuestado = p.cantidad * p.precio_unitario;
        groups[empresaId].totalPresupuestado += presupuestado;
        groups[empresaId].totalEjercido += p.ejercido || 0;
        groups[empresaId].totalPorEjercer += p.porEjercer || 0;
      }
    });
    
    // Sort presupuestos within each group by orden
    Object.values(groups).forEach(group => {
      group.presupuestos.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    });
    
    return Object.values(groups).sort((a, b) => 
      a.empresa.razon_social.localeCompare(b.empresa.razon_social)
    );
  }, [filteredPresupuestos]);

  // Function to move a presupuesto up or down within its company group
  const handleMovePresupuesto = useCallback(async (presupuestoId: string, direction: 'up' | 'down') => {
    // Find the empresa group and the presupuesto
    let targetGroup: typeof groupedByEmpresa[0] | null = null;
    let presupuestoIndex = -1;
    
    for (const group of groupedByEmpresa) {
      const idx = group.presupuestos.findIndex(p => p.id === presupuestoId);
      if (idx !== -1) {
        targetGroup = group;
        presupuestoIndex = idx;
        break;
      }
    }
    
    if (!targetGroup || presupuestoIndex === -1) return;
    
    const presupuestosList = targetGroup.presupuestos;
    const swapIndex = direction === 'up' ? presupuestoIndex - 1 : presupuestoIndex + 1;
    
    // Check bounds
    if (swapIndex < 0 || swapIndex >= presupuestosList.length) return;
    
    const currentItem = presupuestosList[presupuestoIndex];
    const swapItem = presupuestosList[swapIndex];
    
    // Swap orden values in database
    try {
      const currentOrden = currentItem.orden || presupuestoIndex;
      const swapOrden = swapItem.orden || swapIndex;
      
      await Promise.all([
        supabase.from("presupuestos").update({ orden: swapOrden }).eq("id", currentItem.id),
        supabase.from("presupuestos").update({ orden: currentOrden }).eq("id", swapItem.id),
      ]);
      
      // Optimistic update
      setPresupuestos(prev => prev.map(p => {
        if (p.id === currentItem.id) return { ...p, orden: swapOrden };
        if (p.id === swapItem.id) return { ...p, orden: currentOrden };
        return p;
      }));
      
      toast({ title: "Orden actualizado" });
    } catch (error: any) {
      toast({
        title: "Error al reordenar",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [groupedByEmpresa, toast]);

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
        {canEdit && (
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
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Filtrar por empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.razon_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={filterEstado} onValueChange={(v) => setFilterEstado(v as "activos" | "baja")}>
              <TabsList>
                <TabsTrigger value="activos">Activos</TabsTrigger>
                <TabsTrigger value="baja">Baja</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Grouped List */}
      <div className="space-y-4">
        {groupedByEmpresa.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No hay presupuestos registrados</p>
              {canEdit && (
                <Button onClick={openNew} variant="outline" className="mt-4">
                  Crear primer presupuesto
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          groupedByEmpresa.map((group) => {
            const porcentajeGrupo = group.totalPresupuestado > 0 
              ? (group.totalEjercido / group.totalPresupuestado) * 100 
              : 0;
            
            return (
              <Card key={group.empresa.id}>
                <Collapsible
                  open={expandedEmpresas.has(group.empresa.id)}
                  onOpenChange={() => toggleEmpresa(group.empresa.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedEmpresas.has(group.empresa.id) ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          <div>
                            <CardTitle className="text-lg">
                              {group.empresa.razon_social}
                            </CardTitle>
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
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {canEdit && <TableHead className="w-[60px]">Orden</TableHead>}
                              <TableHead>Partida</TableHead>
                              <TableHead>Cuenta</TableHead>
                              <TableHead>Tercero</TableHead>
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
                            {group.presupuestos.map((p, index) => {
                              const presupuestado = p.cantidad * p.precio_unitario;
                              const ejercido = p.ejercido || 0;
                              const porEjercer = p.porEjercer || 0;
                              const porcentaje = p.porcentaje || 0;
                              const isFirst = index === 0;
                              const isLast = index === group.presupuestos.length - 1;
                              
                              return (
                                <TableRow key={p.id} className={!p.activo ? "opacity-50" : ""}>
                                  {canEdit && (
                                    <TableCell>
                                      <div className="flex items-center gap-0.5">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => handleMovePresupuesto(p.id, 'up')}
                                          disabled={isFirst}
                                          title="Mover arriba"
                                        >
                                          <ArrowUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => handleMovePresupuesto(p.id, 'down')}
                                          disabled={isLast}
                                          title="Mover abajo"
                                        >
                                          <ArrowDown className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">{p.partida}</div>
                                      {p.unidades_medida && (
                                        <div className="text-xs text-muted-foreground">
                                          {p.cantidad.toLocaleString("es-MX")} {p.unidades_medida.codigo}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {p.cuentas_contables ? (
                                      <span className="text-sm">
                                        {p.cuentas_contables.codigo}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {p.terceros ? (
                                      <span className="text-sm">
                                        {p.terceros.razon_social}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {p.centros_negocio ? (
                                      <span className="text-sm">
                                        {p.centros_negocio.codigo}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatCurrency(presupuestado)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-600">
                                    {formatCurrency(ejercido)}
                                  </TableCell>
                                  <TableCell className={`text-right font-mono ${porEjercer < 0 ? 'text-destructive' : ''}`}>
                                    {formatCurrency(porEjercer)}
                                    {porEjercer < 0 && (
                                      <AlertTriangle className="h-3 w-3 inline ml-1 text-destructive" />
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                        <div 
                                          className={`h-full transition-all ${getProgressColor(porcentaje)}`}
                                          style={{ width: `${Math.min(porcentaje, 100)}%` }}
                                        />
                                      </div>
                                      <span className={`text-xs font-medium min-w-[40px] ${porcentaje > 100 ? 'text-destructive' : ''}`}>
                                        {porcentaje.toFixed(0)}%
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {porcentaje > 100 ? (
                                      <Badge variant="destructive">Sobregiro</Badge>
                                    ) : porcentaje >= 80 ? (
                                      <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                                        Alerta
                                      </Badge>
                                    ) : p.activo ? (
                                      <Badge variant="default">Activo</Badge>
                                    ) : (
                                      <Badge variant="secondary">Inactivo</Badge>
                                    )}
                                  </TableCell>
                                  {canEdit && (
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => openEdit(p)}
                                          title="Editar"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleToggleActivo(p)}
                                          title={p.activo ? "Desactivar" : "Activar"}
                                        >
                                          <Power className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
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
