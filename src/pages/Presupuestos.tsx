import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  FileText,
  Power,
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
  empresas?: Empresa;
  cuentas_contables?: CuentaContable;
  terceros?: Tercero;
  centros_negocio?: CentroNegocio;
  unidades_medida?: UnidadMedida;
}

export default function Presupuestos() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
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
      const [presupuestosRes, empresasRes] = await Promise.all([
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
          .order("created_at", { ascending: false }),
        supabase
          .from("empresas")
          .select("id, razon_social")
          .eq("activa", true)
          .order("razon_social"),
      ]);

      if (presupuestosRes.error) throw presupuestosRes.error;
      if (empresasRes.error) throw empresasRes.error;

      setPresupuestos(presupuestosRes.data || []);
      setEmpresas(empresasRes.data || []);
      
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

  // Filter presupuestos
  const filteredPresupuestos = useMemo(() => {
    return presupuestos.filter((p) => {
      const matchesSearch =
        p.partida.toLowerCase().includes(search.toLowerCase()) ||
        p.notas?.toLowerCase().includes(search.toLowerCase()) ||
        p.empresas?.razon_social.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = filterCompany === "all" || p.empresa_id === filterCompany;
      return matchesSearch && matchesCompany;
    });
  }, [presupuestos, search, filterCompany]);

  // Group by empresa
  const groupedByEmpresa = useMemo(() => {
    const groups: Record<string, { empresa: Empresa; presupuestos: Presupuesto[]; total: number }> = {};
    
    filteredPresupuestos.forEach((p) => {
      const empresaId = p.empresa_id;
      if (!groups[empresaId]) {
        groups[empresaId] = {
          empresa: p.empresas || { id: empresaId, razon_social: "Sin empresa" },
          presupuestos: [],
          total: 0,
        };
      }
      groups[empresaId].presupuestos.push(p);
      if (p.activo) {
        groups[empresaId].total += p.cantidad * p.precio_unitario;
      }
    });
    
    return Object.values(groups).sort((a, b) => 
      a.empresa.razon_social.localeCompare(b.empresa.razon_social)
    );
  }, [filteredPresupuestos]);

  // Calculate totals
  const totals = useMemo(() => {
    const activePresupuestos = filteredPresupuestos.filter(p => p.activo);
    const totalGlobal = activePresupuestos.reduce(
      (sum, p) => sum + p.cantidad * p.precio_unitario,
      0
    );
    const totalPartidas = activePresupuestos.length;
    const empresasCount = new Set(activePresupuestos.map(p => p.empresa_id)).size;
    
    return { totalGlobal, totalPartidas, empresasCount };
  }, [filteredPresupuestos]);

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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Presupuestado</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totals.totalGlobal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Suma de partidas activas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partidas Activas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.totalPartidas}</div>
            <p className="text-xs text-muted-foreground">
              De {filteredPresupuestos.length} totales
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
          groupedByEmpresa.map((group) => (
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
                      <div className="text-right">
                        <div className="text-xl font-bold text-primary">
                          {formatCurrency(group.total)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Total activo
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Partida</TableHead>
                            <TableHead>Cuenta</TableHead>
                            <TableHead>Tercero</TableHead>
                            <TableHead>Centro</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">P. Unit.</TableHead>
                            <TableHead className="text-right">Presupuesto</TableHead>
                            <TableHead>Estado</TableHead>
                            {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.presupuestos.map((p) => (
                            <TableRow key={p.id} className={!p.activo ? "opacity-50" : ""}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{p.partida}</div>
                                  {p.unidades_medida && (
                                    <div className="text-xs text-muted-foreground">
                                      {p.unidades_medida.codigo}
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
                                {p.cantidad.toLocaleString("es-MX")}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(p.precio_unitario)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {formatCurrency(p.cantidad * p.precio_unitario)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={p.activo ? "default" : "secondary"}>
                                  {p.activo ? "Activo" : "Inactivo"}
                                </Badge>
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
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))
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
