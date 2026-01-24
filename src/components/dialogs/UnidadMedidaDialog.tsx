import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";

interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
}

interface UnidadMedidaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidad: UnidadMedida | null;
  onSuccess: (newUnidad?: UnidadMedida) => void;
}

const unidadSchema = z.object({
  codigo: z.string().min(1, "El código es requerido").max(10, "Máximo 10 caracteres"),
  nombre: z.string().min(1, "El nombre es requerido"),
});

interface UnidadForm {
  codigo: string;
  nombre: string;
}

const emptyForm: UnidadForm = {
  codigo: "",
  nombre: "",
};

export function UnidadMedidaDialog({
  open,
  onOpenChange,
  unidad,
  onSuccess,
}: UnidadMedidaDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<UnidadForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (unidad) {
        setForm({
          codigo: unidad.codigo,
          nombre: unidad.nombre,
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, unidad]);

  const handleSave = async () => {
    const result = unidadSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const data = {
        codigo: form.codigo.toUpperCase(),
        nombre: form.nombre,
      };

      if (unidad) {
        const { error } = await supabase
          .from("unidades_medida")
          .update(data)
          .eq("id", unidad.id);
        if (error) throw error;
        toast({ title: "Unidad de medida actualizada" });
        onOpenChange(false);
        onSuccess();
      } else {
        const { data: newData, error } = await supabase
          .from("unidades_medida")
          .insert(data)
          .select()
          .single();
        if (error) {
          if (error.code === "23505") {
            toast({
              title: "Error",
              description: "Ya existe una unidad con ese código",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }
        toast({ title: "Unidad de medida creada" });
        onOpenChange(false);
        onSuccess(newData as UnidadMedida);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {unidad ? "Editar Unidad de Medida" : "Nueva Unidad de Medida"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código *</Label>
            <Input
              id="codigo"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="Ej: PZA, KG, M2"
              maxLength={10}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Pieza, Kilogramo"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
