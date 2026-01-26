import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building, BookOpen, Users, Plus, Edit, Trash2, Eye, Filter } from "lucide-react";
import { EmpresaDialog } from "@/components/dialogs/EmpresaDialog";
import { CuentaDialog } from "@/components/dialogs/CuentaDialog";
import { UsuarioRoleDialog } from "@/components/dialogs/UsuarioRoleDialog";
import { EmpresaViewDialog } from "@/components/dialogs/EmpresaViewDialog";

interface Empresa {
  id: string;
  tipo_persona: "fisica" | "moral";
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  ciudad: string | null;
  estado: string | null;
  activa: boolean;
}

interface CuentaContable {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  nivel: number;
  empresas?: { razon_social: string };
}

interface UserWithRole {
  id: string;
  user_id: string;
  nombre_completo: string;
  nombre_usuario: string;
  telefono: string | null;
  created_at: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  contador: "Contador",
  usuario: "Usuario",
};

export default function Dashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  
  // Data states
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [usuarios, setUsuarios] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  
  // Dialog states
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [viewingEmpresa, setViewingEmpresa] = useState<Empresa | null>(null);
  
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | null>(null);
  
  const [usuarioDialogOpen, setUsuarioDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UserWithRole | null>(null);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch empresas
    const { data: empresasData } = await supabase
      .from("empresas")
      .select("id, tipo_persona, rfc, razon_social, nombre_comercial, ciudad, estado, activa")
      .order("razon_social");
    setEmpresas(empresasData || []);

    // Fetch cuentas
    const { data: cuentasData } = await supabase
      .from("cuentas_contables")
      .select("*, empresas(razon_social)")
      .order("codigo");
    setCuentas(cuentasData || []);

    // Fetch usuarios (solo admin)
    if (role === "admin") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: roles } = await supabase.from("user_roles").select("*");

      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return { ...profile, role: userRole?.role || "usuario" };
      });
      setUsuarios(usersWithRoles);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [role]);

  // Filtered cuentas
  const filteredCuentas = filterEmpresa === "all" 
    ? cuentas 
    : cuentas.filter(c => c.empresa_id === filterEmpresa);

  // Handlers
  const handleDeleteEmpresa = async (empresa: Empresa) => {
    if (!confirm(`¿Eliminar ${empresa.razon_social}?`)) return;
    const { error } = await supabase.from("empresas").delete().eq("id", empresa.id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Empresa eliminada" });
      fetchData();
    }
  };

  const handleDeleteCuenta = async (cuenta: CuentaContable) => {
    if (!confirm(`¿Eliminar ${cuenta.codigo} - ${cuenta.nombre}?`)) return;
    const { error } = await supabase.from("cuentas_contables").delete().eq("id", cuenta.id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Cuenta eliminada" });
      fetchData();
    }
  };

  const canEdit = role === "admin" || role === "contador";
  const canDelete = role === "admin";
  const isAdmin = role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">MaqRentable</h1>
          <p className="text-muted-foreground">Sistema Contable Financiero</p>
        </div>
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <FilterSelect
            value={filterEmpresa}
            onValueChange={setFilterEmpresa}
            options={empresas.map((e) => ({ value: e.id, label: e.razon_social }))}
            placeholder="Filtrar por empresa"
            searchPlaceholder="Buscar empresa..."
            allOption={{ value: "all", label: "Todas las empresas" }}
            className="w-64"
          />
        </div>
      </div>

      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="empresas" className="gap-2">
            <Building className="h-4 w-4" />
            Empresas
          </TabsTrigger>
          <TabsTrigger value="cuentas" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Cuentas
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="usuarios" className="gap-2">
              <Users className="h-4 w-4" />
              Usuarios
            </TabsTrigger>
          )}
        </TabsList>

        {/* EMPRESAS TAB */}
        <TabsContent value="empresas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                Empresas Registradas
              </CardTitle>
              {canEdit && (
                <Button onClick={() => { setEditingEmpresa(null); setEmpresaDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Empresa
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground">Cargando...</p>
                </div>
              ) : empresas.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2">
                  <p className="text-muted-foreground">No hay empresas registradas</p>
                  {canEdit && (
                    <Button variant="outline" onClick={() => setEmpresaDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Crear primera empresa
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Ciudad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {empresas.map((empresa) => (
                      <TableRow key={empresa.id}>
                        <TableCell className="font-medium">{empresa.razon_social}</TableCell>
                        <TableCell className="font-mono text-sm">{empresa.rfc}</TableCell>
                        <TableCell>
                          <Badge variant={empresa.tipo_persona === "moral" ? "default" : "secondary"}>
                            {empresa.tipo_persona === "moral" ? "Moral" : "Física"}
                          </Badge>
                        </TableCell>
                        <TableCell>{empresa.ciudad || "-"}</TableCell>
                        <TableCell>{empresa.estado || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setViewingEmpresa(empresa)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => { setEditingEmpresa(empresa); setEmpresaDialogOpen(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEmpresa(empresa)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CUENTAS TAB */}
        <TabsContent value="cuentas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Catálogo de Cuentas
                {filterEmpresa !== "all" && (
                  <Badge variant="outline" className="ml-2">
                    {empresas.find(e => e.id === filterEmpresa)?.razon_social}
                  </Badge>
                )}
              </CardTitle>
              {canEdit && (
                <Button onClick={() => { setEditingCuenta(null); setCuentaDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Cuenta
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground">Cargando...</p>
                </div>
              ) : filteredCuentas.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2">
                  <p className="text-muted-foreground">
                    {filterEmpresa !== "all" 
                      ? "No hay cuentas para esta empresa" 
                      : "No hay cuentas registradas"}
                  </p>
                  {canEdit && empresas.length > 0 && (
                    <Button variant="outline" onClick={() => setCuentaDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Crear primera cuenta
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Naturaleza</TableHead>
                      <TableHead>Clasificación</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow key={cuenta.id}>
                        <TableCell className="font-mono font-medium">{cuenta.codigo}</TableCell>
                        <TableCell>{cuenta.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cuenta.empresas?.razon_social || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.naturaleza === "deudora" ? "default" : "secondary"}>
                            {cuenta.naturaleza === "deudora" ? "Deudora" : "Acreedora"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cuenta.clasificacion === "titulo" ? "Título" : "Saldo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => { setEditingCuenta(cuenta); setCuentaDialogOpen(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCuenta(cuenta)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* USUARIOS TAB */}
        {isAdmin && (
          <TabsContent value="usuarios">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Usuarios del Sistema
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-32 items-center justify-center">
                    <p className="text-muted-foreground">Cargando...</p>
                  </div>
                ) : usuarios.length === 0 ? (
                  <div className="flex h-32 items-center justify-center">
                    <p className="text-muted-foreground">No hay usuarios registrados</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Fecha Registro</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((usuario) => (
                        <TableRow key={usuario.id}>
                          <TableCell className="font-medium">{usuario.nombre_completo}</TableCell>
                          <TableCell>@{usuario.nombre_usuario}</TableCell>
                          <TableCell>{usuario.telefono || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={usuario.role === "admin" ? "default" : usuario.role === "contador" ? "secondary" : "outline"}>
                              {roleLabels[usuario.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(usuario.created_at).toLocaleDateString("es-MX")}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingUsuario(usuario); setUsuarioDialogOpen(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <EmpresaDialog
        open={empresaDialogOpen}
        onOpenChange={setEmpresaDialogOpen}
        empresa={editingEmpresa}
        onSuccess={fetchData}
      />
      
      <EmpresaViewDialog
        open={!!viewingEmpresa}
        onOpenChange={() => setViewingEmpresa(null)}
        empresa={viewingEmpresa}
      />

      <CuentaDialog
        open={cuentaDialogOpen}
        onOpenChange={setCuentaDialogOpen}
        cuenta={editingCuenta}
        empresas={empresas}
        defaultEmpresaId={filterEmpresa !== "all" ? filterEmpresa : undefined}
        onSuccess={fetchData}
      />

      <UsuarioRoleDialog
        open={usuarioDialogOpen}
        onOpenChange={setUsuarioDialogOpen}
        usuario={editingUsuario}
        onSuccess={fetchData}
      />
    </div>
  );
}
