import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";

interface Empresa {
  id: string;
  tipo_persona: "fisica" | "moral";
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  regimen_fiscal?: string | null;
  uso_cfdi?: string | null;
  calle?: string | null;
  numero_exterior?: string | null;
  numero_interior?: string | null;
  colonia?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  telefono_principal?: string | null;
  email_fiscal?: string | null;
  representante_legal?: string | null;
  banco?: string | null;
  numero_cuenta?: string | null;
  clabe?: string | null;
}

interface EmpresaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: Empresa | null;
  onSuccess: () => void;
}

const empresaSchema = z.object({
  tipo_persona: z.enum(["fisica", "moral"]),
  rfc: z.string().min(12, "RFC inválido").max(13),
  razon_social: z.string().min(2, "Razón social requerida").max(200),
});

type EmpresaForm = {
  tipo_persona: "fisica" | "moral";
  rfc: string;
  razon_social: string;
  nombre_comercial: string;
  regimen_fiscal: string;
  uso_cfdi: string;
  calle: string;
  numero_exterior: string;
  numero_interior: string;
  colonia: string;
  codigo_postal: string;
  ciudad: string;
  estado: string;
  telefono_principal: string;
  email_fiscal: string;
  representante_legal: string;
  banco: string;
  numero_cuenta: string;
  clabe: string;
};

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

export function EmpresaDialog({ open, onOpenChange, empresa, onSuccess }: EmpresaDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<EmpresaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (empresa) {
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
    } else {
      setForm(emptyForm);
    }
  }, [empresa, open]);

  const handleSave = async () => {
    const result = empresaSchema.safeParse(form);
    if (!result.success) {
      toast({ title: "Error", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSaving(true);

    const data = {
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
    };

    if (empresa) {
      const { error } = await supabase.from("empresas").update(data).eq("id", empresa.id);
      if (error) {
        toast({ title: "Error", description: error.message.includes("duplicate") ? "RFC duplicado" : "No se pudo actualizar", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Empresa actualizada" });
    } else {
      const { error } = await supabase.from("empresas").insert({ ...data, created_by: user?.id });
      if (error) {
        toast({ title: "Error", description: error.message.includes("duplicate") ? "RFC duplicado" : "No se pudo crear", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Empresa creada" });
    }

    setSaving(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{empresa ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
          <DialogDescription>
            {empresa ? "Actualiza los datos" : "Ingresa los datos de la nueva empresa"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <h4 className="font-semibold text-foreground">Datos Fiscales</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Persona *</Label>
              <Select value={form.tipo_persona} onValueChange={(v) => setForm({ ...form, tipo_persona: v as "fisica" | "moral" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="moral">Persona Moral</SelectItem>
                  <SelectItem value="fisica">Persona Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RFC *</Label>
              <Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} maxLength={13} placeholder="XAXX010101000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Razón Social *</Label>
              <Input value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nombre Comercial</Label>
              <Input value={form.nombre_comercial} onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Régimen Fiscal</Label>
              <Input value={form.regimen_fiscal} onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Uso de CFDI</Label>
              <Input value={form.uso_cfdi} onChange={(e) => setForm({ ...form, uso_cfdi: e.target.value })} />
            </div>
          </div>

          <h4 className="mt-4 font-semibold text-foreground">Dirección Fiscal</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Calle</Label>
              <Input value={form.calle} onChange={(e) => setForm({ ...form, calle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>No. Exterior</Label>
              <Input value={form.numero_exterior} onChange={(e) => setForm({ ...form, numero_exterior: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>No. Interior</Label>
              <Input value={form.numero_interior} onChange={(e) => setForm({ ...form, numero_interior: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Colonia</Label>
              <Input value={form.colonia} onChange={(e) => setForm({ ...form, colonia: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>C.P.</Label>
              <Input value={form.codigo_postal} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} maxLength={5} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Input value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
            </div>
          </div>

          <h4 className="mt-4 font-semibold text-foreground">Contacto</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Teléfono Principal</Label>
              <Input value={form.telefono_principal} onChange={(e) => setForm({ ...form, telefono_principal: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email Fiscal</Label>
              <Input type="email" value={form.email_fiscal} onChange={(e) => setForm({ ...form, email_fiscal: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Representante Legal</Label>
            <Input value={form.representante_legal} onChange={(e) => setForm({ ...form, representante_legal: e.target.value })} />
          </div>

          <h4 className="mt-4 font-semibold text-foreground">Datos Bancarios</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>No. Cuenta</Label>
              <Input value={form.numero_cuenta} onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CLABE</Label>
              <Input value={form.clabe} onChange={(e) => setForm({ ...form, clabe: e.target.value })} maxLength={18} />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
