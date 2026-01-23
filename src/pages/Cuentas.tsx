import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { BookOpen, Plus, Edit, Trash2, Search } from "lucide-react";
import { z } from "zod";

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

const cuentaSchema = z.object({
  empresa_id: z.string().uuid("Selecciona una empresa"),
  codigo: z.string().min(1, "Código requerido").max(20),
  nombre: z.string().min(2, "Nombre muy corto").max(200),
  naturaleza: z.enum(["deudora", "acreedora"]),
  clasificacion: z.enum(["titulo", "saldo"]),
  cuenta_padre_id: z.string().uuid().nullable().optional(),
  nivel: z.number().min(1).max(10),
});

type CuentaForm = z.infer<typeof cuentaSchema>;

const emptyForm: CuentaForm = {
  empresa_id: "",
  codigo: "",
  nombre: "",
  naturaleza: "deudora",
  clasificacion: "saldo",
  cuenta_padre_id: null,
  nivel: 1,
};

export default function Cuentas() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | null>(null);
  const [form, setForm] = useState<CuentaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    const [cuentasRes, empresasRes] = await Promise.all([
      supabase
        .from("cuentas_contables")
        .select("*, empresas(id, razon_social)")
        .order("codigo"),
      supabase.from("empresas").select("id, razon_social").order("razon_social"),
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

  const filteredCuentas = cuentas.filter((c) => {
    const matchesSearch =
      c.codigo.toLowerCase().includes(search.toLowerCase()) ||
      c.nombre.toLowerCase().includes(search.toLowerCase());
    const matchesEmpresa = filterEmpresa === "all" || c.empresa_id === filterEmpresa;
    return matchesSearch && matchesEmpresa;
  });

  const openNew = () => {
    setEditingCuenta(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (cuenta: CuentaContable) => {
    setEditingCuenta(cuenta);
    setForm({
      empresa_id: cuenta.empresa_id,
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
      clasificacion: cuenta.clasificacion,
      cuenta_padre_id: cuenta.cuenta_padre_id,
      nivel: cuenta.nivel,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const result = cuentaSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    if (editingCuenta) {
      const { error } = await supabase
        .from("cuentas_contables")
        .update(form)
        .eq("id", editingCuenta.id);

      if (error) {
        toast({
          title: "Error",
          description: error.message.includes("duplicate")
            ? "Ya existe una cuenta con este código para esta empresa"
            : "No se pudo actualizar la cuenta",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      toast({ title: "Cuenta actualizada" });
    } else {
      const { error } = await supabase.from("cuentas_contables").insert({
        empresa_id: form.empresa_id,
        codigo: form.codigo,
        nombre: form.nombre,
        naturaleza: form.naturaleza,
        clasificacion: form.clasificacion,
        cuenta_padre_id: form.cuenta_padre_id || null,
        nivel: form.nivel,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message.includes("duplicate")
            ? "Ya existe una cuenta con este código para esta empresa"
            : "No se pudo crear la cuenta",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      toast({ title: "Cuenta creada" });
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (cuenta: CuentaContable) => {
    if (!confirm(`¿Eliminar la cuenta ${cuenta.codigo} - ${cuenta.nombre}?`)) return;

    const { error } = await supabase.from("cuentas_contables").delete().eq("id", cuenta.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la cuenta",
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Cuentas Contables
            </CardTitle>
            <div className="flex gap-2">
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : filteredCuentas.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-muted-foreground">No hay cuentas registradas</p>
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
                        <Button variant="ghost" size="sm" onClick={() => openEdit(cuenta)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(cuenta)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCuenta ? "Editar Cuenta" : "Nueva Cuenta"}</DialogTitle>
            <DialogDescription>
              {editingCuenta ? "Actualiza los datos de la cuenta" : "Ingresa los datos de la nueva cuenta"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Select
                value={form.empresa_id}
                onValueChange={(v) => setForm({ ...form, empresa_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="1100"
                />
              </div>
              <div className="space-y-2">
                <Label>Nivel</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.nivel}
                  onChange={(e) => setForm({ ...form, nivel: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Bancos"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Naturaleza *</Label>
                <Select
                  value={form.naturaleza}
                  onValueChange={(v) => setForm({ ...form, naturaleza: v as "deudora" | "acreedora" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deudora">Deudora</SelectItem>
                    <SelectItem value="acreedora">Acreedora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Clasificación *</Label>
                <Select
                  value={form.clasificacion}
                  onValueChange={(v) => setForm({ ...form, clasificacion: v as "titulo" | "saldo" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="titulo">Título</SelectItem>
                    <SelectItem value="saldo">Saldo</SelectItem>
                  </SelectContent>
                </Select>
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
    </div>
  );
}
