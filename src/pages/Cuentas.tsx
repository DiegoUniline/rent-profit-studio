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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Plus, Edit, Trash2, Search } from "lucide-react";
import { CuentaDialog } from "@/components/dialogs/CuentaDialog";

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

export default function Cuentas() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">("activos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | null>(null);
  const fetchData = async () => {
    setLoading(true);
    
    const [cuentasRes, empresasRes] = await Promise.all([
      supabase
        .from("cuentas_contables")
        .select("*, empresas(id, razon_social)")
        .order("codigo"),
      supabase.from("empresas").select("id, razon_social").eq("activa", true).order("razon_social"),
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

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter and organize cuentas hierarchically
  const { filteredCuentas, stats } = useMemo(() => {
    let filtered = cuentas;
    
    // Filter by empresa first
    if (filterEmpresa !== "all") {
      filtered = filtered.filter(c => c.empresa_id === filterEmpresa);
    }
    
    // Filter by estado
    filtered = filtered.filter(c => filterEstado === "activos" ? c.activa : !c.activa);
    
    // Filter by search if provided
    if (search) {
      filtered = filtered.filter(c => 
        c.codigo.toLowerCase().includes(search.toLowerCase()) ||
        c.nombre.toLowerCase().includes(search.toLowerCase())
      );
    }
    // Always show all accounts - no collapse/expand logic
    
    // Calculate stats
    const baseCuentas = cuentas.filter(c => 
      (filterEmpresa === "all" || c.empresa_id === filterEmpresa) &&
      (filterEstado === "activos" ? c.activa : !c.activa)
    );
    const stats = {
      total: baseCuentas.length,
      titulos: baseCuentas.filter(c => c.clasificacion === "titulo").length,
      saldos: baseCuentas.filter(c => c.clasificacion === "saldo").length,
    };
    
    return { filteredCuentas: filtered, stats };
  }, [cuentas, filterEmpresa, filterEstado, search]);


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
              <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todas las empresas" />
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
                    {canEdit && <TableHead className="w-[100px] text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredCuentas.map((cuenta) => {
                    const level = getCodeLevel(cuenta.codigo);
                    
                    return (
                      <TableRow 
                        key={cuenta.id} 
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
                        {canEdit && (
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
