import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  razon_social: string;
}

interface CuentaContable {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  nivel: number;
}

interface CuentaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuenta: CuentaContable | null;
  empresas: Empresa[];
  defaultEmpresaId?: string;
  onSuccess: () => void;
}

const cuentaSchema = z.object({
  empresa_id: z.string().min(1, "Selecciona una empresa"),
  codigo: z.string().min(1, "Código requerido").max(20),
  nombre: z.string().min(2, "Nombre requerido").max(200),
  naturaleza: z.enum(["deudora", "acreedora"]),
  clasificacion: z.enum(["titulo", "saldo"]),
  nivel: z.number().min(1).max(10),
});

type CuentaForm = {
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  nivel: number;
};

const emptyForm: CuentaForm = {
  empresa_id: "",
  codigo: "",
  nombre: "",
  naturaleza: "deudora",
  clasificacion: "saldo",
  nivel: 1,
};

export function CuentaDialog({ open, onOpenChange, cuenta, empresas, defaultEmpresaId, onSuccess }: CuentaDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CuentaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cuenta) {
      setForm({
        empresa_id: cuenta.empresa_id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        naturaleza: cuenta.naturaleza,
        clasificacion: cuenta.clasificacion,
        nivel: cuenta.nivel,
      });
    } else {
      setForm({
        ...emptyForm,
        empresa_id: defaultEmpresaId || "",
      });
    }
  }, [cuenta, open, defaultEmpresaId]);

  const handleSave = async () => {
    const result = cuentaSchema.safeParse(form);
    if (!result.success) {
      toast({ title: "Error", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSaving(true);

    const data = {
      empresa_id: form.empresa_id,
      codigo: form.codigo,
      nombre: form.nombre,
      naturaleza: form.naturaleza,
      clasificacion: form.clasificacion,
      nivel: form.nivel,
    };

    if (cuenta) {
      const { error } = await supabase.from("cuentas_contables").update(data).eq("id", cuenta.id);
      if (error) {
        toast({ title: "Error", description: error.message.includes("duplicate") ? "Código duplicado" : "No se pudo actualizar", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Cuenta actualizada" });
    } else {
      const { error } = await supabase.from("cuentas_contables").insert(data);
      if (error) {
        toast({ title: "Error", description: error.message.includes("duplicate") ? "Código duplicado para esta empresa" : "No se pudo crear", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Cuenta creada" });
    }

    setSaving(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cuenta ? "Editar Cuenta" : "Nueva Cuenta"}</DialogTitle>
          <DialogDescription>
            {cuenta ? "Actualiza los datos de la cuenta" : "Ingresa los datos de la nueva cuenta"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Empresa *</Label>
            <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="1100" />
            </div>
            <div className="space-y-2">
              <Label>Nivel</Label>
              <Input type="number" min={1} max={10} value={form.nivel} onChange={(e) => setForm({ ...form, nivel: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Bancos" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Naturaleza *</Label>
              <Select value={form.naturaleza} onValueChange={(v) => setForm({ ...form, naturaleza: v as "deudora" | "acreedora" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deudora">Deudora</SelectItem>
                  <SelectItem value="acreedora">Acreedora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Clasificación *</Label>
              <Select value={form.clasificacion} onValueChange={(v) => setForm({ ...form, clasificacion: v as "titulo" | "saldo" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="titulo">Título</SelectItem>
                  <SelectItem value="saldo">Saldo</SelectItem>
                </SelectContent>
              </Select>
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
