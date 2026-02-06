import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { BookOpen, Plus, Edit, Trash2, Search } from "lucide-react";
import { CuentaDialog } from "@/components/dialogs/CuentaDialog";
import { formatCurrency } from "@/lib/accounting-utils";

interface Empresa {
  id: string;
  razon_social: string;
}

interface CuentaContable {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  cuenta_padre_id: string | null;
  nivel: number;
  activa: boolean;
  empresas?: Empresa;
}

// Get level from code format XXX-XXX-XXX-XXX
const getCodeLevel = (code: string): number => {
  const clean = code.replace(/[^0-9]/g, "").padEnd(12, "0");
  if (clean.slice(3) === "000000000") return 1;
  if (clean.slice(6) === "000000") return 2;
  if (clean.slice(9) === "000") return 3;
  return 4;
};

const levelLabels: Record<number, string> = {
  1: "Rubro",
  2: "Grupo",
  3: "Subgrupo",
  4: "Cuenta",
  5: "Subcuenta",
};

const levelColors: Record<number, string> = {
  1: "bg-primary/10 text-primary font-bold",
  2: "bg-blue-50 dark:bg-blue-950/30 font-semibold",
  3: "bg-muted/50",
  4: "",
  5: "text-muted-foreground",
};

interface SaldoCuenta {
  cuenta_id: string;
  saldo: number;
}

export default function Cuentas() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => localStorage.getItem("cuentas_filter_search") || "");
  const [filterEmpresa, setFilterEmpresa] = useState<string>(() => localStorage.getItem("cuentas_filter_empresa") || "all");
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">(() => {
    const saved = localStorage.getItem("cuentas_filter_estado");
    return (saved === "baja" ? "baja" : "activos");
  });

  // Persist filters
  useEffect(() => {
    if (search) localStorage.setItem("cuentas_filter_search", search);
    else localStorage.removeItem("cuentas_filter_search");
  }, [search]);

  useEffect(() => {
    if (filterEmpresa !== "all") localStorage.setItem("cuentas_filter_empresa", filterEmpresa);
    else localStorage.removeItem("cuentas_filter_empresa");
  }, [filterEmpresa]);

  useEffect(() => {
    localStorage.setItem("cuentas_filter_estado", filterEstado);
  }, [filterEstado]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | null>(null);

  const fetchData = async () => {
    setLoading(true);
    
    const [cuentasRes, empresasRes, movimientosRes, asientosRes] = await Promise.all([
      supabase
        .from("cuentas_contables")
        .select("*, empresas(id, razon_social)")
        .order("codigo"),
      supabase.from("empresas").select("id, razon_social").eq("activa", true).order("razon_social"),
      supabase.from("asiento_movimientos").select("cuenta_id, debe, haber, asiento_id"),
      supabase.from("asientos_contables").select("id, estado").eq("estado", "aplicado"),
    ]);

    if (cuentasRes.error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las cuentas",
        variant: "destructive",
      });
    } else {
      setCuentas(cuentasRes.data || []);
    }

    if (!empresasRes.error) {
      setEmpresas(empresasRes.data || []);
    }

    // Calculate balances from applied movements
    if (!movimientosRes.error && !asientosRes.error && cuentasRes.data) {
      const asientosAplicados = new Set(asientosRes.data?.map(a => a.id) || []);
      const cuentasMap = new Map(cuentasRes.data.map(c => [c.id, c]));
      const saldosMap = new Map<string, number>();

      (movimientosRes.data || []).forEach(mov => {
        if (asientosAplicados.has(mov.asiento_id)) {
          const cuenta = cuentasMap.get(mov.cuenta_id);
          if (cuenta) {
            const currentSaldo = saldosMap.get(mov.cuenta_id) || 0;
            const debe = Number(mov.debe) || 0;
            const haber = Number(mov.haber) || 0;
            
            // Calculate based on account nature
            if (cuenta.naturaleza === 'deudora') {
              saldosMap.set(mov.cuenta_id, currentSaldo + debe - haber);
            } else {
              saldosMap.set(mov.cuenta_id, currentSaldo + haber - debe);
            }
          }
        }
      });

      setSaldos(saldosMap);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Extended type for consolidated accounts
  type CuentaConsolidada = CuentaContable & { saldoConsolidado?: number };

  // Filter and organize cuentas hierarchically
  const { filteredCuentas, stats, isConsolidated } = useMemo(() => {
    let filtered = cuentas;
    
    // Filter by estado first
    filtered = filtered.filter(c => filterEstado === "activos" ? c.activa : !c.activa);
    
    // Calculate stats from base filtered data
    const baseCuentas = cuentas.filter(c => 
      (filterEmpresa === "all" || c.empresa_id === filterEmpresa) &&
      (filterEstado === "activos" ? c.activa : !c.activa)
    );
    const stats = {
      total: filterEmpresa === "all" 
        ? new Set(baseCuentas.map(c => c.codigo)).size 
        : baseCuentas.length,
      titulos: filterEmpresa === "all"
        ? new Set(baseCuentas.filter(c => c.clasificacion === "titulo").map(c => c.codigo)).size
        : baseCuentas.filter(c => c.clasificacion === "titulo").length,
      saldos: filterEmpresa === "all"
        ? new Set(baseCuentas.filter(c => c.clasificacion === "saldo").map(c => c.codigo)).size
        : baseCuentas.filter(c => c.clasificacion === "saldo").length,
    };
    
    // Si es una empresa específica, filtrar normalmente
    if (filterEmpresa !== "all") {
      filtered = filtered.filter(c => c.empresa_id === filterEmpresa);
      
      // Aplicar búsqueda
      if (search) {
        filtered = filtered.filter(c => 
          c.codigo.toLowerCase().includes(search.toLowerCase()) ||
          c.nombre.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      return { filteredCuentas: filtered as CuentaConsolidada[], stats, isConsolidated: false };
    }
    
    // CONSOLIDACIÓN: Agrupar por código cuando es "Todas"
    const cuentasAgrupadas = new Map<string, CuentaConsolidada>();
    
    filtered.forEach(cuenta => {
      const existing = cuentasAgrupadas.get(cuenta.codigo);
      const saldoCuenta = saldos.get(cuenta.id) || 0;
      
      if (existing) {
        // Sumar el saldo al existente
        existing.saldoConsolidado = (existing.saldoConsolidado || 0) + saldoCuenta;
      } else {
        // Primera vez que vemos este código
        cuentasAgrupadas.set(cuenta.codigo, {
          ...cuenta,
          saldoConsolidado: saldoCuenta
        });
      }
    });
    
    // Convertir a array y ordenar
    let consolidadas = Array.from(cuentasAgrupadas.values())
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    
    // Aplicar búsqueda
    if (search) {
      consolidadas = consolidadas.filter(c => 
        c.codigo.toLowerCase().includes(search.toLowerCase()) ||
        c.nombre.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return { 
      filteredCuentas: consolidadas, 
      stats,
      isConsolidated: true 
    };
  }, [cuentas, filterEmpresa, filterEstado, search, saldos]);


  const openNew = () => {
    setEditingCuenta(null);
    setDialogOpen(true);
  };

  const openEdit = (cuenta: CuentaContable) => {
    setEditingCuenta(cuenta);
    setDialogOpen(true);
  };

  const handleDelete = async (cuenta: CuentaContable) => {
    if (!confirm(`¿Eliminar la cuenta ${cuenta.codigo} - ${cuenta.nombre}?`)) return;

    const { error } = await supabase.from("cuentas_contables").delete().eq("id", cuenta.id);

    if (error) {
      toast({
        title: "Error",
        description: error.message.includes("violates foreign key") 
          ? "No se puede eliminar: la cuenta tiene movimientos asociados"
          : "No se pudo eliminar la cuenta",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Cuenta eliminada" });
    fetchData();
  };


  const canEdit = role === "admin" || role === "contador";
  const canDelete = role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Catálogo de Cuentas</h1>
          <p className="text-muted-foreground">Gestión del catálogo de cuentas contables</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Cuenta
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cuentas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cuentas Título</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.titulos}</div>
            <p className="text-xs text-muted-foreground">Cuentas agrupadoras</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cuentas de Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.saldos}</div>
            <p className="text-xs text-muted-foreground">Cuentas de movimiento</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Cuentas Contables
              {isConsolidated && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Vista consolidada
                </Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <FilterSelect
                value={filterEmpresa}
                onValueChange={setFilterEmpresa}
                options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
                placeholder="Todas las empresas"
                searchPlaceholder="Buscar empresa..."
                allOption={{ value: "all", label: "Todas las empresas" }}
                className="w-48"
              />
              <Tabs value={filterEstado} onValueChange={(v) => setFilterEstado(v as "activos" | "baja")}>
                <TabsList>
                  <TabsTrigger value="activos">Activos</TabsTrigger>
                  <TabsTrigger value="baja">Baja</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filteredCuentas.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <p className="text-muted-foreground">No hay cuentas registradas</p>
              {canEdit && (
                <Button variant="outline" onClick={openNew}>
                  Crear primera cuenta
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-[100px]">Naturaleza</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="w-[130px] text-right">Saldo</TableHead>
                    {canEdit && !isConsolidated && <TableHead className="w-[100px] text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredCuentas.map((cuenta) => {
                    const level = getCodeLevel(cuenta.codigo);
                    const saldo = isConsolidated 
                      ? (cuenta.saldoConsolidado || 0) 
                      : (saldos.get(cuenta.id) || 0);
                    const showSaldo = cuenta.clasificacion === "saldo";
                    
                    return (
                      <TableRow 
                        key={isConsolidated ? cuenta.codigo : cuenta.id} 
                        className={levelColors[level] || ""}
                      >
                        <TableCell>
                          <code className="text-sm font-mono">
                            {cuenta.codigo}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span 
                            className="inline-block"
                            style={{ paddingLeft: `${(level - 1) * 24}px` }}
                          >
                            {cuenta.nombre}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.naturaleza === "deudora" ? "default" : "secondary"}>
                            {cuenta.naturaleza === "deudora" ? "D" : "A"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.clasificacion === "titulo" ? "outline" : "default"}>
                            {cuenta.clasificacion === "titulo" ? "Título" : "Saldo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {showSaldo ? (
                            <span className={saldo < 0 ? "text-destructive" : ""}>
                              {formatCurrency(saldo)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {canEdit && !isConsolidated && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(cuenta)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {canDelete && (
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(cuenta)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CuentaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cuenta={editingCuenta}
        empresas={empresas}
        defaultEmpresaId={filterEmpresa !== "all" ? filterEmpresa : undefined}
        onSuccess={fetchData}
      />
    </div>
  );
}
