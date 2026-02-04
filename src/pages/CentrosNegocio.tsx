import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Briefcase, Plus, Edit, Power, Search } from "lucide-react";
import { CentroNegocioDialog } from "@/components/dialogs/CentroNegocioDialog";

interface Empresa {
  id: string;
  razon_social: string;
}

interface CentroNegocio {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  tipo_actividad: string | null;
  responsable: string | null;
  activo: boolean;
  created_at: string;
  empresas?: Empresa;
}

export default function CentrosNegocio() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [centros, setCentros] = useState<CentroNegocio[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => localStorage.getItem("centros_filter_search") || "");
  const [filterEmpresa, setFilterEmpresa] = useState<string>(() => localStorage.getItem("centros_filter_empresa") || "all");
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">(() => {
    const saved = localStorage.getItem("centros_filter_estado");
    return (saved === "baja" ? "baja" : "activos");
  });

  // Persist filters
  useEffect(() => {
    if (search) localStorage.setItem("centros_filter_search", search);
    else localStorage.removeItem("centros_filter_search");
  }, [search]);

  useEffect(() => {
    if (filterEmpresa !== "all") localStorage.setItem("centros_filter_empresa", filterEmpresa);
    else localStorage.removeItem("centros_filter_empresa");
  }, [filterEmpresa]);

  useEffect(() => {
    localStorage.setItem("centros_filter_estado", filterEstado);
  }, [filterEstado]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCentro, setEditingCentro] = useState<CentroNegocio | null>(null);

  const canEdit = role === "admin" || role === "contador";

  const fetchData = async () => {
    setLoading(true);
    
    const [centrosRes, empresasRes] = await Promise.all([
      supabase
        .from("centros_negocio")
        .select("*, empresas(id, razon_social)")
        .order("codigo"),
      supabase
        .from("empresas")
        .select("id, razon_social")
        .eq("activa", true)
        .order("razon_social"),
    ]);

    if (centrosRes.error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los centros de negocio",
        variant: "destructive",
      });
    } else {
      setCentros(centrosRes.data || []);
    }

    if (empresasRes.error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las empresas",
        variant: "destructive",
      });
    } else {
      setEmpresas(empresasRes.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleActivo = async (centro: CentroNegocio) => {
    const { error } = await supabase
      .from("centros_negocio")
      .update({ activo: !centro.activo })
      .eq("id", centro.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: centro.activo ? "Centro dado de baja" : "Centro reactivado",
      description: `${centro.nombre} ha sido ${centro.activo ? "desactivado" : "activado"}`,
    });
    fetchData();
  };

  const openNew = () => {
    setEditingCentro(null);
    setDialogOpen(true);
  };

  const openEdit = (centro: CentroNegocio) => {
    setEditingCentro(centro);
    setDialogOpen(true);
  };

  const filteredCentros = centros.filter((centro) => {
    const matchesSearch =
      centro.codigo.toLowerCase().includes(search.toLowerCase()) ||
      centro.nombre.toLowerCase().includes(search.toLowerCase());
    const matchesEmpresa =
      filterEmpresa === "all" || centro.empresa_id === filterEmpresa;
    const matchesEstado = filterEstado === "activos" ? centro.activo : !centro.activo;
    return matchesSearch && matchesEmpresa && matchesEstado;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Centro de Negocios</h1>
          <p className="text-muted-foreground">Gestión de unidades de negocio</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Centro
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Lista de Centros de Negocio
            </CardTitle>
            <Tabs value={filterEstado} onValueChange={(v) => setFilterEstado(v as "activos" | "baja")}>
              <TabsList>
                <TabsTrigger value="activos">Activos</TabsTrigger>
                <TabsTrigger value="baja">Baja</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por código o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <FilterSelect
              value={filterEmpresa}
              onValueChange={setFilterEmpresa}
              options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
              placeholder="Filtrar por empresa"
              searchPlaceholder="Buscar empresa..."
              allOption={{ value: "all", label: "Todas las empresas" }}
              className="w-full sm:w-[250px]"
            />
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filteredCentros.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">No hay centros de negocio</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo Actividad</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Estado</TableHead>
                  {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCentros.map((centro) => (
                  <TableRow key={centro.id} className={!centro.activo ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{centro.codigo}</TableCell>
                    <TableCell>{centro.nombre}</TableCell>
                    <TableCell>{centro.empresas?.razon_social || "-"}</TableCell>
                    <TableCell>{centro.tipo_actividad || "-"}</TableCell>
                    <TableCell>{centro.responsable || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={centro.activo ? "default" : "secondary"}>
                        {centro.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(centro)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActivo(centro)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CentroNegocioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        centro={editingCentro}
        empresas={empresas}
        onSuccess={fetchData}
      />
    </div>
  );
}
