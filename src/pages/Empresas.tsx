import { useEffect, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Building, Plus, Edit, Trash2, Search, Eye } from "lucide-react";
import { z } from "zod";

interface Empresa {
  id: string;
  tipo_persona: "fisica" | "moral";
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  regimen_fiscal: string | null;
  uso_cfdi: string | null;
  calle: string | null;
  numero_exterior: string | null;
  numero_interior: string | null;
  colonia: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
  telefono_principal: string | null;
  email_fiscal: string | null;
  representante_legal: string | null;
  banco: string | null;
  numero_cuenta: string | null;
  clabe: string | null;
  activa: boolean;
  created_at: string;
}

const empresaSchema = z.object({
  tipo_persona: z.enum(["fisica", "moral"]),
  rfc: z.string().min(12, "RFC inválido").max(13, "RFC inválido"),
  razon_social: z.string().min(2, "Razón social muy corta").max(200),
  nombre_comercial: z.string().max(200).optional().nullable(),
  regimen_fiscal: z.string().max(100).optional().nullable(),
  uso_cfdi: z.string().max(50).optional().nullable(),
  calle: z.string().max(200).optional().nullable(),
  numero_exterior: z.string().max(20).optional().nullable(),
  numero_interior: z.string().max(20).optional().nullable(),
  colonia: z.string().max(100).optional().nullable(),
  codigo_postal: z.string().max(10).optional().nullable(),
  ciudad: z.string().max(100).optional().nullable(),
  estado: z.string().max(100).optional().nullable(),
  telefono_principal: z.string().max(20).optional().nullable(),
  email_fiscal: z.string().email("Email inválido").max(255).optional().nullable().or(z.literal("")),
  representante_legal: z.string().max(200).optional().nullable(),
  banco: z.string().max(100).optional().nullable(),
  numero_cuenta: z.string().max(30).optional().nullable(),
  clabe: z.string().max(20).optional().nullable(),
});

type EmpresaForm = z.infer<typeof empresaSchema>;

const emptyForm: EmpresaForm = {
  tipo_persona: "moral",
  rfc: "",
  razon_social: "",
  nombre_comercial: "",
  regimen_fiscal: "",
  uso_cfdi: "",
  calle: "",
  numero_exterior: "",
  numero_interior: "",
  colonia: "",
  codigo_postal: "",
  ciudad: "",
  estado: "",
  telefono_principal: "",
  email_fiscal: "",
  representante_legal: "",
  banco: "",
  numero_cuenta: "",
  clabe: "",
};

export default function Empresas() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => localStorage.getItem("empresas_filter_search") || "");
  const [filterEstado, setFilterEstado] = useState<"activos" | "baja">(() => {
    const saved = localStorage.getItem("empresas_filter_estado");
    return (saved === "baja" ? "baja" : "activos");
  });

  // Persist filters
  useEffect(() => {
    if (search) localStorage.setItem("empresas_filter_search", search);
    else localStorage.removeItem("empresas_filter_search");
  }, [search]);

  useEffect(() => {
    localStorage.setItem("empresas_filter_estado", filterEstado);
  }, [filterEstado]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [viewingEmpresa, setViewingEmpresa] = useState<Empresa | null>(null);
  const [form, setForm] = useState<EmpresaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchEmpresas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .order("razon_social");

    if (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las empresas",
        variant: "destructive",
      });
    } else {
      setEmpresas(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const filteredEmpresas = empresas.filter((e) => {
    const matchesSearch =
      e.razon_social.toLowerCase().includes(search.toLowerCase()) ||
      e.rfc.toLowerCase().includes(search.toLowerCase());
    const matchesEstado = filterEstado === "activos" ? e.activa : !e.activa;
    return matchesSearch && matchesEstado;
  });

  const openNew = () => {
    setEditingEmpresa(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setForm({
      tipo_persona: empresa.tipo_persona,
      rfc: empresa.rfc,
      razon_social: empresa.razon_social,
      nombre_comercial: empresa.nombre_comercial || "",
      regimen_fiscal: empresa.regimen_fiscal || "",
      uso_cfdi: empresa.uso_cfdi || "",
      calle: empresa.calle || "",
      numero_exterior: empresa.numero_exterior || "",
      numero_interior: empresa.numero_interior || "",
      colonia: empresa.colonia || "",
      codigo_postal: empresa.codigo_postal || "",
      ciudad: empresa.ciudad || "",
      estado: empresa.estado || "",
      telefono_principal: empresa.telefono_principal || "",
      email_fiscal: empresa.email_fiscal || "",
      representante_legal: empresa.representante_legal || "",
      banco: empresa.banco || "",
      numero_cuenta: empresa.numero_cuenta || "",
      clabe: empresa.clabe || "",
    });
    setDialogOpen(true);
  };

  const openView = (empresa: Empresa) => {
    setViewingEmpresa(empresa);
    setViewDialogOpen(true);
  };

  const handleSave = async () => {
    const result = empresaSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const cleanedData = {
      ...form,
      email_fiscal: form.email_fiscal || null,
      created_by: user?.id,
    };

    if (editingEmpresa) {
      const { error } = await supabase
        .from("empresas")
        .update(cleanedData)
        .eq("id", editingEmpresa.id);

      if (error) {
        toast({
          title: "Error",
          description: error.message.includes("duplicate")
            ? "Ya existe una empresa con este RFC"
            : "No se pudo actualizar la empresa",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      toast({ title: "Empresa actualizada" });
    } else {
      const { error } = await supabase.from("empresas").insert({
        tipo_persona: form.tipo_persona,
        rfc: form.rfc,
        razon_social: form.razon_social,
        nombre_comercial: form.nombre_comercial || null,
        regimen_fiscal: form.regimen_fiscal || null,
        uso_cfdi: form.uso_cfdi || null,
        calle: form.calle || null,
        numero_exterior: form.numero_exterior || null,
        numero_interior: form.numero_interior || null,
        colonia: form.colonia || null,
        codigo_postal: form.codigo_postal || null,
        ciudad: form.ciudad || null,
        estado: form.estado || null,
        telefono_principal: form.telefono_principal || null,
        email_fiscal: form.email_fiscal || null,
        representante_legal: form.representante_legal || null,
        banco: form.banco || null,
        numero_cuenta: form.numero_cuenta || null,
        clabe: form.clabe || null,
        created_by: user?.id,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message.includes("duplicate")
            ? "Ya existe una empresa con este RFC"
            : "No se pudo crear la empresa",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      toast({ title: "Empresa creada" });
    }

    setSaving(false);
    setDialogOpen(false);
    fetchEmpresas();
  };

  const handleDelete = async (empresa: Empresa) => {
    if (!confirm(`¿Eliminar ${empresa.razon_social}?`)) return;

    const { error } = await supabase.from("empresas").delete().eq("id", empresa.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la empresa",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Empresa eliminada" });
    fetchEmpresas();
  };

  const canEdit = role === "admin" || role === "contador";
  const canDelete = role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground">Gestión de empresas y datos fiscales</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Empresa
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              Lista de Empresas
            </CardTitle>
            <div className="flex items-center gap-4">
              <Tabs value={filterEstado} onValueChange={(v) => setFilterEstado(v as "activos" | "baja")}>
                <TabsList>
                  <TabsTrigger value="activos">Activos</TabsTrigger>
                  <TabsTrigger value="baja">Baja</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por RFC o razón social..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filteredEmpresas.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">No hay empresas registradas</p>
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
                {filteredEmpresas.map((empresa) => (
                  <TableRow key={empresa.id}>
                    <TableCell className="font-medium">{empresa.razon_social}</TableCell>
                    <TableCell>{empresa.rfc}</TableCell>
                    <TableCell>
                      <Badge variant={empresa.tipo_persona === "moral" ? "default" : "secondary"}>
                        {empresa.tipo_persona === "moral" ? "Moral" : "Física"}
                      </Badge>
                    </TableCell>
                    <TableCell>{empresa.ciudad || "-"}</TableCell>
                    <TableCell>{empresa.estado || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openView(empresa)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(empresa)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(empresa)}>
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

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmpresa ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
            <DialogDescription>
              {editingEmpresa ? "Actualiza los datos de la empresa" : "Ingresa los datos de la nueva empresa"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <h4 className="font-semibold text-foreground">Datos Fiscales</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Persona *</Label>
                <Select
                  value={form.tipo_persona}
                  onValueChange={(v) => setForm({ ...form, tipo_persona: v as "fisica" | "moral" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moral">Persona Moral</SelectItem>
                    <SelectItem value="fisica">Persona Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>RFC *</Label>
                <Input
                  value={form.rfc}
                  onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                  maxLength={13}
                  placeholder="XAXX010101000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Razón Social *</Label>
                <Input
                  value={form.razon_social}
                  onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                  placeholder="Nombre legal de la empresa"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre Comercial</Label>
                <Input
                  value={form.nombre_comercial || ""}
                  onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                  placeholder="Nombre comercial"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Régimen Fiscal</Label>
                <Input
                  value={form.regimen_fiscal || ""}
                  onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}
                  placeholder="Ej: General de Ley"
                />
              </div>
              <div className="space-y-2">
                <Label>Uso de CFDI</Label>
                <Input
                  value={form.uso_cfdi || ""}
                  onChange={(e) => setForm({ ...form, uso_cfdi: e.target.value })}
                  placeholder="Ej: G03 - Gastos en general"
                />
              </div>
            </div>

            <h4 className="mt-4 font-semibold text-foreground">Dirección Fiscal</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Calle</Label>
                <Input
                  value={form.calle || ""}
                  onChange={(e) => setForm({ ...form, calle: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>No. Exterior</Label>
                <Input
                  value={form.numero_exterior || ""}
                  onChange={(e) => setForm({ ...form, numero_exterior: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>No. Interior</Label>
                <Input
                  value={form.numero_interior || ""}
                  onChange={(e) => setForm({ ...form, numero_interior: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Colonia</Label>
                <Input
                  value={form.colonia || ""}
                  onChange={(e) => setForm({ ...form, colonia: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>C.P.</Label>
                <Input
                  value={form.codigo_postal || ""}
                  onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
                  maxLength={5}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Input
                  value={form.ciudad || ""}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input
                  value={form.estado || ""}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                />
              </div>
            </div>

            <h4 className="mt-4 font-semibold text-foreground">Contacto</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono Principal</Label>
                <Input
                  value={form.telefono_principal || ""}
                  onChange={(e) => setForm({ ...form, telefono_principal: e.target.value })}
                  placeholder="55 1234 5678"
                />
              </div>
              <div className="space-y-2">
                <Label>Email Fiscal</Label>
                <Input
                  type="email"
                  value={form.email_fiscal || ""}
                  onChange={(e) => setForm({ ...form, email_fiscal: e.target.value })}
                  placeholder="contacto@empresa.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Representante Legal</Label>
              <Input
                value={form.representante_legal || ""}
                onChange={(e) => setForm({ ...form, representante_legal: e.target.value })}
              />
            </div>

            <h4 className="mt-4 font-semibold text-foreground">Datos Bancarios</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Banco</Label>
                <Input
                  value={form.banco || ""}
                  onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  placeholder="BBVA, Banamex, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>No. Cuenta</Label>
                <Input
                  value={form.numero_cuenta || ""}
                  onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CLABE</Label>
                <Input
                  value={form.clabe || ""}
                  onChange={(e) => setForm({ ...form, clabe: e.target.value })}
                  maxLength={18}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingEmpresa?.razon_social}</DialogTitle>
            <DialogDescription>Detalles de la empresa</DialogDescription>
          </DialogHeader>
          {viewingEmpresa && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">RFC</p>
                  <p>{viewingEmpresa.rfc}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Tipo</p>
                  <p>{viewingEmpresa.tipo_persona === "moral" ? "Persona Moral" : "Persona Física"}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Régimen Fiscal</p>
                  <p>{viewingEmpresa.regimen_fiscal || "-"}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Uso CFDI</p>
                  <p>{viewingEmpresa.uso_cfdi || "-"}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="mb-2 font-semibold">Dirección</h4>
                <p className="text-sm">
                  {[
                    viewingEmpresa.calle,
                    viewingEmpresa.numero_exterior && `#${viewingEmpresa.numero_exterior}`,
                    viewingEmpresa.numero_interior && `Int. ${viewingEmpresa.numero_interior}`,
                  ]
                    .filter(Boolean)
                    .join(" ") || "-"}
                </p>
                <p className="text-sm">
                  {[viewingEmpresa.colonia, viewingEmpresa.codigo_postal && `C.P. ${viewingEmpresa.codigo_postal}`]
                    .filter(Boolean)
                    .join(", ") || "-"}
                </p>
                <p className="text-sm">
                  {[viewingEmpresa.ciudad, viewingEmpresa.estado].filter(Boolean).join(", ") || "-"}
                </p>
              </div>
              <div className="border-t pt-4">
                <h4 className="mb-2 font-semibold">Contacto</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Teléfono</p>
                    <p>{viewingEmpresa.telefono_principal || "-"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Email</p>
                    <p>{viewingEmpresa.email_fiscal || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-medium text-muted-foreground">Representante Legal</p>
                    <p>{viewingEmpresa.representante_legal || "-"}</p>
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="mb-2 font-semibold">Datos Bancarios</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Banco</p>
                    <p>{viewingEmpresa.banco || "-"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Cuenta</p>
                    <p>{viewingEmpresa.numero_cuenta || "-"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">CLABE</p>
                    <p>{viewingEmpresa.clabe || "-"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
