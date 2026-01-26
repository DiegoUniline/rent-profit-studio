import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Play, Copy, Pencil, Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  empresas: { razon_social: string } | null;
  centros_negocio: { codigo: string; nombre: string } | null;
  terceros: { razon_social: string } | null;
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
  const [empresas, setEmpresas] = useState<{ id: string; razon_social: string }[]>([]);

  useEffect(() => {
    fetchData();
    fetchEmpresas();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("programaciones")
      .select(`
        *,
        empresas(razon_social),
        centros_negocio(codigo, nombre),
        terceros(razon_social)
      `)
      .order("fecha_programada", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProgramaciones(data || []);
    }
    setLoading(false);
  };

  const fetchEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setEmpresas(data);
  };

  const filteredProgramaciones = useMemo(() => {
    return programaciones.filter((p) => {
      if (filterEmpresa !== "all" && p.empresa_id !== filterEmpresa) return false;
      if (filterTipo !== "all" && p.tipo !== filterTipo) return false;
      if (filterEstado !== "all" && p.estado !== filterEstado) return false;
      return true;
    });
  }, [programaciones, filterEmpresa, filterTipo, filterEstado]);

  // KPIs
  const kpis = useMemo(() => {
    const pendientes = programaciones.filter((p) => p.estado === "pendiente");
    const ingresos = pendientes
      .filter((p) => p.tipo === "ingreso")
      .reduce((sum, p) => sum + Number(p.monto), 0);
    const egresos = pendientes
      .filter((p) => p.tipo === "egreso")
      .reduce((sum, p) => sum + Number(p.monto), 0);
    return { ingresos, egresos, balance: ingresos - egresos };
  }, [programaciones]);

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
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos Programados</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(kpis.ingresos)}
                </div>
                <p className="text-xs text-muted-foreground">Pendientes de ejecutar</p>
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
                <p className="text-xs text-muted-foreground">Pendientes de ejecutar</p>
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
                <p className="text-xs text-muted-foreground">Diferencia neta</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Empresa" />
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

            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ingreso">Ingresos</SelectItem>
                <SelectItem value="egreso">Egresos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="ejecutado">Ejecutado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Centro de Negocio</TableHead>
                    <TableHead>Tercero</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : filteredProgramaciones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No hay programaciones
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProgramaciones.map((prog) => (
                      <TableRow key={prog.id}>
                        <TableCell className="font-medium">
                          {format(new Date(prog.fecha_programada + "T00:00:00"), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>{prog.empresas?.razon_social}</TableCell>
                        <TableCell>{getTipoBadge(prog.tipo)}</TableCell>
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
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
