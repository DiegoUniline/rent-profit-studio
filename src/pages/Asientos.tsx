import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatDateShort } from "@/lib/date-utils";
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
  Plus,
  Search,
  Edit,
  Eye,
  BookOpen,
  FileText,
  CheckCircle,
  XCircle,
  Trash2,
  Copy,
} from "lucide-react";
import { AsientoViewDialog } from "@/components/dialogs/AsientoViewDialog";
import { AdminCodeDialog } from "@/components/dialogs/AdminCodeDialog";

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
  created_at: string;
  empresas?: Empresa;
  terceros?: Tercero;
  centros_negocio?: CentroNegocio;
}

const tipoLabels: Record<TipoAsiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  diario: "Diario",
};

const tipoBadgeVariants: Record<TipoAsiento, "default" | "secondary" | "outline"> = {
  ingreso: "default",
  egreso: "secondary",
  diario: "outline",
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

export default function Asientos() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { toast } = useToast();
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingAsiento, setViewingAsiento] = useState<AsientoContable | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAsiento, setDeletingAsiento] = useState<AsientoContable | null>(null);
  const [adminCodeDialogOpen, setAdminCodeDialogOpen] = useState(false);
  const [pendingDeleteAsiento, setPendingDeleteAsiento] = useState<AsientoContable | null>(null);

  const canEdit = role === "admin" || role === "contador";
  // Now contadores can also see delete button, but they need admin code
  const canDelete = role === "admin" || role === "contador";
  const isAdmin = role === "admin";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [asientosRes, empresasRes] = await Promise.all([
        supabase
          .from("asientos_contables")
          .select(`
            *,
            empresas(id, razon_social),
            terceros(id, razon_social),
            centros_negocio(id, codigo, nombre)
          `)
          .order("fecha", { ascending: true })
          .order("numero_asiento", { ascending: true }),
        supabase
          .from("empresas")
          .select("id, razon_social")
          .eq("activa", true)
          .order("razon_social"),
      ]);

      if (asientosRes.error) throw asientosRes.error;
      if (empresasRes.error) throw empresasRes.error;

      setAsientos(asientosRes.data || []);
      setEmpresas(empresasRes.data || []);
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

  const handleChangeEstado = async (asiento: AsientoContable, nuevoEstado: EstadoAsiento) => {
    try {
      const { error } = await supabase
        .from("asientos_contables")
        .update({ estado: nuevoEstado })
        .eq("id", asiento.id);
      if (error) throw error;
      toast({ title: `Asiento ${estadoLabels[nuevoEstado].toLowerCase()}` });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingAsiento) return;
    try {
      const { error } = await supabase
        .from("asientos_contables")
        .delete()
        .eq("id", deletingAsiento.id);
      if (error) throw error;
      toast({ title: "Asiento eliminado" });
      setDeleteDialogOpen(false);
      setDeletingAsiento(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = (asiento: AsientoContable) => {
    navigate(`/asientos/nuevo?copy=true&from=${asiento.id}`);
  };

  const openNew = () => {
    navigate("/asientos/nuevo");
  };

  const openEdit = (asiento: AsientoContable) => {
    navigate(`/asientos/${asiento.id}`);
  };

  const openView = (asiento: AsientoContable) => {
    setViewingAsiento(asiento);
    setViewDialogOpen(true);
  };

  const openDelete = (asiento: AsientoContable) => {
    if (isAdmin) {
      // Admin can delete directly
      setDeletingAsiento(asiento);
      setDeleteDialogOpen(true);
    } else {
      // Non-admin needs admin code
      setPendingDeleteAsiento(asiento);
      setAdminCodeDialogOpen(true);
    }
  };

  const handleAdminCodeSuccess = () => {
    // Admin code verified, now show the delete confirmation dialog
    setDeletingAsiento(pendingDeleteAsiento);
    setPendingDeleteAsiento(null);
    setDeleteDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return formatDateShort(dateStr);
  };

  // Filter asientos
  const filteredAsientos = useMemo(() => {
    return asientos.filter((a) => {
      const matchesSearch =
        a.numero_asiento.toString().includes(search) ||
        a.observaciones?.toLowerCase().includes(search.toLowerCase()) ||
        a.empresas?.razon_social.toLowerCase().includes(search.toLowerCase()) ||
        a.terceros?.razon_social.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = filterCompany === "all" || a.empresa_id === filterCompany;
      const matchesTipo = filterTipo === "all" || a.tipo === filterTipo;
      const matchesEstado = filterEstado === "all" || a.estado === filterEstado;
      return matchesSearch && matchesCompany && matchesTipo && matchesEstado;
    });
  }, [asientos, search, filterCompany, filterTipo, filterEstado]);

  // Calculate totals
  const totals = useMemo(() => {
    const aplicados = filteredAsientos.filter((a) => a.estado === "aplicado");
    const totalDebe = aplicados.reduce((sum, a) => sum + Number(a.total_debe), 0);
    const totalHaber = aplicados.reduce((sum, a) => sum + Number(a.total_haber), 0);
    return { totalDebe, totalHaber, count: aplicados.length };
  }, [filteredAsientos]);

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
          <h1 className="text-3xl font-bold">Asientos Contables</h1>
          <p className="text-muted-foreground">
            Gestiona los asientos contables por empresa
          </p>
        </div>
        {canEdit && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Asiento
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debe (Aplicados)</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totals.totalDebe)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Haber (Aplicados)</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totals.totalHaber)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Asientos Aplicados</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count}</div>
            <p className="text-xs text-muted-foreground">
              De {filteredAsientos.length} mostrados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, observaciones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-full sm:w-[200px]">
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
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="egreso">Egreso</SelectItem>
                <SelectItem value="diario">Diario</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="aplicado">Aplicado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tercero</TableHead>
                <TableHead className="text-right">Debe</TableHead>
                <TableHead className="text-right">Haber</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAsientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No hay asientos registrados
                  </TableCell>
                </TableRow>
              ) : (
                filteredAsientos.map((asiento) => (
                  <TableRow key={asiento.id}>
                    <TableCell className="font-mono font-medium">
                      #{asiento.numero_asiento}
                    </TableCell>
                    <TableCell>{formatDate(asiento.fecha)}</TableCell>
                    <TableCell>{asiento.empresas?.razon_social}</TableCell>
                    <TableCell>
                      <Badge variant={tipoBadgeVariants[asiento.tipo]}>
                        {tipoLabels[asiento.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {asiento.terceros?.razon_social || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(asiento.total_debe))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(asiento.total_haber))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={estadoBadgeVariants[asiento.estado]}>
                        {estadoLabels[asiento.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openView(asiento)}
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(asiento)}
                            title="Copiar asiento"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit && asiento.estado === "borrador" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(asiento)}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleChangeEstado(asiento, "aplicado")}
                              title="Aplicar"
                              className="text-green-600"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canEdit && asiento.estado === "aplicado" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleChangeEstado(asiento, "cancelado")}
                            title="Cancelar"
                            className="text-destructive"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && asiento.estado === "borrador" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDelete(asiento)}
                            title="Eliminar"
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}

      <AsientoViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        asiento={viewingAsiento}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el asiento #{deletingAsiento?.numero_asiento} y todos sus movimientos.
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

      {/* Admin Code Dialog for non-admin delete */}
      <AdminCodeDialog
        open={adminCodeDialogOpen}
        onOpenChange={(open) => {
          setAdminCodeDialogOpen(open);
          if (!open) setPendingDeleteAsiento(null);
        }}
        onSuccess={handleAdminCodeSuccess}
        title="Autorización para Eliminar"
        description={`Para eliminar el asiento #${pendingDeleteAsiento?.numero_asiento}, ingrese el código de acceso del administrador.`}
      />
    </div>
  );
}
