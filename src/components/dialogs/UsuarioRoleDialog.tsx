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
import { Label } from "@/components/ui/label";

interface UserWithRole {
  id: string;
  user_id: string;
  nombre_completo: string;
  nombre_usuario: string;
  role: string;
}

interface UsuarioRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UserWithRole | null;
  onSuccess: () => void;
}

export function UsuarioRoleDialog({ open, onOpenChange, usuario, onSuccess }: UsuarioRoleDialogProps) {
  const { toast } = useToast();
  const [newRole, setNewRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (usuario) {
      setNewRole(usuario.role);
    }
  }, [usuario, open]);

  const handleSave = async () => {
    if (!usuario || !newRole) return;

    setSaving(true);

    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole as "admin" | "contador" | "usuario" })
      .eq("user_id", usuario.user_id);

    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar el rol", variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({ title: "Rol actualizado", description: `El rol de ${usuario.nombre_completo} ha sido actualizado` });
    setSaving(false);
    onOpenChange(false);
    onSuccess();
  };

  if (!usuario) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Rol de Usuario</DialogTitle>
          <DialogDescription>
            Cambia el rol de {usuario.nombre_completo}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="contador">Contador</SelectItem>
                <SelectItem value="usuario">Usuario</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
