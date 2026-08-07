import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Switch } from "@/components/ui/switch";

export interface ProyectoEditable {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyecto: ProyectoEditable | null;
  onSuccess: () => void;
}

export function ProyectoEditDialog({ open, onOpenChange, proyecto, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && proyecto) {
      setNombre(proyecto.nombre);
      setActivo(proyecto.activo);
    }
  }, [open, proyecto]);

  const handleSave = async () => {
    if (!proyecto) return;
    if (!nombre.trim()) {
      toast({ title: "El nombre es requerido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("proyectos")
        .update({ nombre: nombre.trim(), activo, updated_by: user?.id })
        .eq("id", proyecto.id);
      if (error) throw error;
      toast({ title: "Project actualizado" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="nombre-project">Nombre del Project</Label>
            <Input
              id="nombre-project"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Construcción Planta Norte"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="activo-project">Project activo</Label>
              <p className="text-xs text-muted-foreground">Desactívalo para ocultarlo del listado sin borrar su historial.</p>
            </div>
            <Switch id="activo-project" checked={activo} onCheckedChange={setActivo} />
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
