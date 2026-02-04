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
import { Users2, Plus, Edit, Power, Eye, Search } from "lucide-react";
import { TerceroDialog } from "@/components/dialogs/TerceroDialog";
import { TerceroViewDialog } from "@/components/dialogs/TerceroViewDialog";

interface Empresa {
  id: string;
  razon_social: string;
}

export interface Tercero {
  id: string;
  empresa_id: string;
  tipo: "cliente" | "proveedor" | "ambos";
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  calle: string | null;
  numero_exterior: string | null;
  numero_interior: string | null;
  colonia: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  estado: string | null;
  telefono: string | null;
  email: string | null;
  contacto_nombre: string | null;
  banco: string | null;
  numero_cuenta: string | null;
  clabe: string | null;
  activo: boolean;
  created_at: string;
  empresas?: Empresa;
}

const tipoLabels: Record<string, string> = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  ambos: "Cliente/Proveedor",
};

const tipoBadgeVariants: Record<string, "default" | "secondary" | "outline"> = {
  cliente: "default",
  proveedor: "secondary",
  ambos: "outline",
};

export default function Terceros() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => localStorage.getItem("terceros_filter_search") || "");
  const [filterEmpresa, setFilterEmpresa] = useState<string>(() => localStorage.getItem("terceros_filter_empresa") || "all");
  const [filterTipo, setFilterTipo] = useState<string>(() => localStorage.getItem("terceros_filter_tipo") || "all");
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">(() => {
    const saved = localStorage.getItem("terceros_filter_estado");
    return (saved === "baja" ? "baja" : "activos");
  });

  // Persist filters
  useEffect(() => {
    if (search) localStorage.setItem("terceros_filter_search", search);
    else localStorage.removeItem("terceros_filter_search");
  }, [search]);

  useEffect(() => {
    if (filterEmpresa !== "all") localStorage.setItem("terceros_filter_empresa", filterEmpresa);
    else localStorage.removeItem("terceros_filter_empresa");
  }, [filterEmpresa]);

  useEffect(() => {
    if (filterTipo !== "all") localStorage.setItem("terceros_filter_tipo", filterTipo);
    else localStorage.removeItem("terceros_filter_tipo");
  }, [filterTipo]);

  useEffect(() => {
    localStorage.setItem("terceros_filter_estado", filterEstado);
  }, [filterEstado]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingTercero, setEditingTercero] = useState<Tercero | null>(null);
  const [viewingTercero, setViewingTercero] = useState<Tercero | null>(null);

  const canEdit = role === "admin" || role === "contador";

  const fetchData = async () => {
    setLoading(true);
    
    const [tercerosRes, empresasRes] = await Promise.all([
      supabase
        .from("terceros")
        .select("*, empresas(id, razon_social)")
        .order("razon_social"),
      supabase
        .from("empresas")
        .select("id, razon_social")
        .eq("activa", true)
        .order("razon_social"),
    ]);

    if (tercerosRes.error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los terceros",
        variant: "destructive",
      });
    } else {
      setTerceros(tercerosRes.data as Tercero[] || []);
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

  const handleToggleActivo = async (tercero: Tercero) => {
    const { error } = await supabase
      .from("terceros")
      .update({ activo: !tercero.activo })
      .eq("id", tercero.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: tercero.activo ? "Tercero dado de baja" : "Tercero reactivado",
      description: `${tercero.razon_social} ha sido ${tercero.activo ? "desactivado" : "activado"}`,
    });
    fetchData();
  };

  const openNew = () => {
    setEditingTercero(null);
    setDialogOpen(true);
  };

  const openEdit = (tercero: Tercero) => {
    setEditingTercero(tercero);
    setDialogOpen(true);
  };

  const openView = (tercero: Tercero) => {
    setViewingTercero(tercero);
    setViewDialogOpen(true);
  };

  const filteredTerceros = terceros.filter((tercero) => {
    const matchesSearch =
      tercero.rfc.toLowerCase().includes(search.toLowerCase()) ||
      tercero.razon_social.toLowerCase().includes(search.toLowerCase());
    const matchesEmpresa =
      filterEmpresa === "all" || tercero.empresa_id === filterEmpresa;
    const matchesTipo = filterTipo === "all" || tercero.tipo === filterTipo;
    const matchesEstado = filterEstado === "activos" ? tercero.activo : !tercero.activo;
    return matchesSearch && matchesEmpresa && matchesTipo && matchesEstado;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Terceros</h1>
          <p className="text-muted-foreground">Gestión de clientes y proveedores</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Tercero
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-primary" />
              Lista de Terceros
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
                placeholder="Buscar por RFC o razón social..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <FilterSelect
              value={filterEmpresa}
              onValueChange={setFilterEmpresa}
              options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
              placeholder="Empresa"
              searchPlaceholder="Buscar empresa..."
              allOption={{ value: "all", label: "Todas las empresas" }}
              className="w-full sm:w-[200px]"
            />
            <FilterSelect
              value={filterTipo}
              onValueChange={setFilterTipo}
              options={[
                { value: "cliente", label: "Cliente" },
                { value: "proveedor", label: "Proveedor" },
                { value: "ambos", label: "Cliente/Proveedor" },
              ]}
              placeholder="Tipo"
              searchPlaceholder="Buscar tipo..."
              allOption={{ value: "all", label: "Todos los tipos" }}
              className="w-full sm:w-[180px]"
            />
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filteredTerceros.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">No hay terceros registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Razón Social</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerceros.map((tercero) => (
                  <TableRow key={tercero.id} className={!tercero.activo ? "opacity-50" : ""}>
                    <TableCell>
                      <Badge variant={tipoBadgeVariants[tercero.tipo]}>
                        {tipoLabels[tercero.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{tercero.rfc}</TableCell>
                    <TableCell>{tercero.razon_social}</TableCell>
                    <TableCell>{tercero.empresas?.razon_social || "-"}</TableCell>
                    <TableCell>{tercero.telefono || "-"}</TableCell>
                    <TableCell>{tercero.email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={tercero.activo ? "default" : "secondary"}>
                        {tercero.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openView(tercero)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(tercero)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActivo(tercero)}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TerceroDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tercero={editingTercero}
        empresas={empresas}
        onSuccess={fetchData}
      />

      <TerceroViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        tercero={viewingTercero}
      />
    </div>
  );
}
