import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "./EmpresaDialog";
import { Tercero } from "@/pages/Terceros";

interface Empresa {
  id: string;
  razon_social: string;
}

interface TerceroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tercero: Tercero | null;
  empresas: Empresa[];
  onSuccess: () => void;
}

const terceroSchema = z.object({
  empresa_id: z.string().min(1, "La empresa es requerida"),
  tipo: z.enum(["cliente", "proveedor", "ambos"], { required_error: "El tipo es requerido" }),
  rfc: z.string().min(12, "El RFC debe tener al menos 12 caracteres"),
  razon_social: z.string().min(1, "La razón social es requerida"),
});

interface TerceroForm {
  empresa_id: string;
  tipo: "cliente" | "proveedor" | "ambos" | "";
  rfc: string;
  razon_social: string;
  nombre_comercial: string;
  calle: string;
  numero_exterior: string;
  numero_interior: string;
  colonia: string;
  codigo_postal: string;
  ciudad: string;
  estado: string;
  telefono: string;
  email: string;
  contacto_nombre: string;
  banco: string;
  numero_cuenta: string;
  clabe: string;
}

const emptyForm: TerceroForm = {
  empresa_id: "",
  tipo: "",
  rfc: "",
  razon_social: "",
  nombre_comercial: "",
  calle: "",
  numero_exterior: "",
  numero_interior: "",
  colonia: "",
  codigo_postal: "",
  ciudad: "",
  estado: "",
  telefono: "",
  email: "",
  contacto_nombre: "",
  banco: "",
  numero_cuenta: "",
  clabe: "",
};

export function TerceroDialog({
  open,
  onOpenChange,
  tercero,
  empresas,
  onSuccess,
}: TerceroDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<TerceroForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      loadEmpresas();
      if (tercero) {
        setForm({
          empresa_id: tercero.empresa_id,
          tipo: tercero.tipo,
          rfc: tercero.rfc,
          razon_social: tercero.razon_social,
          nombre_comercial: tercero.nombre_comercial || "",
          calle: tercero.calle || "",
          numero_exterior: tercero.numero_exterior || "",
          numero_interior: tercero.numero_interior || "",
          colonia: tercero.colonia || "",
          codigo_postal: tercero.codigo_postal || "",
          ciudad: tercero.ciudad || "",
          estado: tercero.estado || "",
          telefono: tercero.telefono || "",
          email: tercero.email || "",
          contacto_nombre: tercero.contacto_nombre || "",
          banco: tercero.banco || "",
          numero_cuenta: tercero.numero_cuenta || "",
          clabe: tercero.clabe || "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, tercero]);

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

  const handleEmpresaCreated = () => {
    loadEmpresas();
    setEmpresaDialogOpen(false);
  };

  const handleSave = async () => {
    const result = terceroSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const data = {
      empresa_id: form.empresa_id,
      tipo: form.tipo as "cliente" | "proveedor" | "ambos",
      rfc: form.rfc.toUpperCase(),
      razon_social: form.razon_social,
      nombre_comercial: form.nombre_comercial || null,
      calle: form.calle || null,
      numero_exterior: form.numero_exterior || null,
      numero_interior: form.numero_interior || null,
      colonia: form.colonia || null,
      codigo_postal: form.codigo_postal || null,
      ciudad: form.ciudad || null,
      estado: form.estado || null,
      telefono: form.telefono || null,
      email: form.email || null,
      contacto_nombre: form.contacto_nombre || null,
      banco: form.banco || null,
      numero_cuenta: form.numero_cuenta || null,
      clabe: form.clabe || null,
    };

    let error;
    if (tercero) {
      ({ error } = await supabase
        .from("terceros")
        .update(data)
        .eq("id", tercero.id));
    } else {
      ({ error } = await supabase.from("terceros").insert(data));
    }

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Error",
          description: "Ya existe un tercero con ese RFC en esta empresa",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo guardar el tercero",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: tercero ? "Tercero actualizado" : "Tercero creado",
      description: `${form.razon_social} ha sido ${tercero ? "actualizado" : "creado"} exitosamente`,
    });

    onOpenChange(false);
    onSuccess();
  };

  const empresaOptions = allEmpresas.map((e) => ({
    id: e.id,
    label: e.razon_social,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {tercero ? "Editar Tercero" : "Nuevo Tercero"}
            </DialogTitle>
            <DialogDescription>
              {tercero
                ? "Modifica los datos del tercero"
                : "Ingresa los datos del nuevo cliente o proveedor"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              {/* Datos Generales */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Datos Generales</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Empresa *</Label>
                    <SearchableSelect
                      value={form.empresa_id}
                      onValueChange={(value) => setForm({ ...form, empresa_id: value })}
                      options={empresaOptions}
                      placeholder="Selecciona empresa"
                      searchPlaceholder="Buscar empresa..."
                      emptyMessage="No se encontraron empresas"
                      onCreateNew={() => setEmpresaDialogOpen(true)}
                      createLabel="Nueva empresa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select
                      value={form.tipo}
                      onValueChange={(value) => setForm({ ...form, tipo: value as TerceroForm["tipo"] })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cliente">Cliente</SelectItem>
                        <SelectItem value="proveedor">Proveedor</SelectItem>
                        <SelectItem value="ambos">Cliente/Proveedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>RFC *</Label>
                    <Input
                      value={form.rfc}
                      onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                      placeholder="RFC del tercero"
                      maxLength={13}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre Comercial</Label>
                    <Input
                      value={form.nombre_comercial}
                      onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Razón Social *</Label>
                    <Input
                      value={form.razon_social}
                      onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dirección */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Dirección</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Calle</Label>
                    <Input
                      value={form.calle}
                      onChange={(e) => setForm({ ...form, calle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>No. Exterior</Label>
                    <Input
                      value={form.numero_exterior}
                      onChange={(e) => setForm({ ...form, numero_exterior: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>No. Interior</Label>
                    <Input
                      value={form.numero_interior}
                      onChange={(e) => setForm({ ...form, numero_interior: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Colonia</Label>
                    <Input
                      value={form.colonia}
                      onChange={(e) => setForm({ ...form, colonia: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código Postal</Label>
                    <Input
                      value={form.codigo_postal}
                      onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
                      maxLength={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciudad</Label>
                    <Input
                      value={form.ciudad}
                      onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input
                      value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contacto */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Contacto</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Nombre de Contacto</Label>
                    <Input
                      value={form.contacto_nombre}
                      onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Datos Bancarios */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Datos Bancarios</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Banco</Label>
                    <Input
                      value={form.banco}
                      onChange={(e) => setForm({ ...form, banco: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Número de Cuenta</Label>
                    <Input
                      value={form.numero_cuenta}
                      onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>CLABE Interbancaria</Label>
                    <Input
                      value={form.clabe}
                      onChange={(e) => setForm({ ...form, clabe: e.target.value })}
                      maxLength={18}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EmpresaDialog
        open={empresaDialogOpen}
        onOpenChange={setEmpresaDialogOpen}
        empresa={null}
        onSuccess={handleEmpresaCreated}
      />
    </>
  );
}
