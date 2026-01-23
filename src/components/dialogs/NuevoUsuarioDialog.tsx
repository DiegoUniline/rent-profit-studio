import { useState } from "react";
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

interface NuevoUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const usuarioSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  nombre_completo: z.string().min(2, "El nombre es requerido"),
  nombre_usuario: z.string().min(3, "El nombre de usuario debe tener al menos 3 caracteres"),
  role: z.enum(["admin", "contador", "usuario"]),
});

interface UsuarioForm {
  email: string;
  password: string;
  nombre_completo: string;
  nombre_usuario: string;
  role: "admin" | "contador" | "usuario";
}

const emptyForm: UsuarioForm = {
  email: "",
  password: "",
  nombre_completo: "",
  nombre_usuario: "",
  role: "usuario",
};

export function NuevoUsuarioDialog({
  open,
  onOpenChange,
  onSuccess,
}: NuevoUsuarioDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<UsuarioForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const result = usuarioSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          nombre_completo: form.nombre_completo,
          nombre_usuario: form.nombre_usuario,
        },
      },
    });

    if (authError) {
      setSaving(false);
      toast({
        title: "Error al crear usuario",
        description: authError.message,
        variant: "destructive",
      });
      return;
    }

    // Update role if not default "usuario"
    if (authData.user && form.role !== "usuario") {
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role: form.role })
        .eq("user_id", authData.user.id);

      if (roleError) {
        console.error("Error updating role:", roleError);
      }
    }

    setSaving(false);

    toast({
      title: "Usuario creado",
      description: `${form.nombre_completo} ha sido registrado exitosamente`,
    });

    setForm(emptyForm);
    onOpenChange(false);
    onSuccess();
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setForm(emptyForm);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Crea una nueva cuenta de usuario en el sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nombre Completo *</Label>
            <Input
              value={form.nombre_completo}
              onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
              placeholder="Nombre y apellidos"
            />
          </div>

          <div className="space-y-2">
            <Label>Nombre de Usuario *</Label>
            <Input
              value={form.nombre_usuario}
              onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value.toLowerCase().replace(/\s/g, "_") })}
              placeholder="nombre_usuario"
            />
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Contraseña *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="space-y-2">
            <Label>Rol *</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setForm({ ...form, role: value as UsuarioForm["role"] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="contador">Contador</SelectItem>
                <SelectItem value="usuario">Usuario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creando..." : "Crear Usuario"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
