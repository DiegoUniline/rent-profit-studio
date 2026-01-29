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
import { Eye, EyeOff, KeyRound, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UserWithRole {
  id: string;
  user_id: string;
  nombre_completo: string;
  nombre_usuario: string;
  telefono: string | null;
  role: string;
}

interface EditUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UserWithRole | null;
  onSuccess: () => void;
}

export function EditUsuarioDialog({ open, onOpenChange, usuario, onSuccess }: EditUsuarioDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("datos");
  
  // Profile data
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [telefono, setTelefono] = useState("");
  const [role, setRole] = useState("");
  
  // Password reset
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (usuario && open) {
      setNombreCompleto(usuario.nombre_completo);
      setNombreUsuario(usuario.nombre_usuario);
      setTelefono(usuario.telefono || "");
      setRole(usuario.role);
      setNewPassword("");
      setConfirmPassword("");
      setActiveTab("datos");
    }
  }, [usuario, open]);

  const callAdminFunction = async (action: string, data: Record<string, unknown>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error("No session");
    }

    const response = await supabase.functions.invoke("admin-user-management", {
      body: { action, userId: usuario?.user_id, data },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (response.data?.error) {
      throw new Error(response.data.error);
    }

    return response.data;
  };

  const handleSaveProfile = async () => {
    if (!usuario) return;

    if (!nombreCompleto.trim() || !nombreUsuario.trim()) {
      toast({
        title: "Error",
        description: "El nombre y nombre de usuario son requeridos",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Update profile
      await callAdminFunction("update_profile", {
        nombre_completo: nombreCompleto.trim(),
        nombre_usuario: nombreUsuario.trim().toLowerCase().replace(/\s/g, "_"),
        telefono: telefono.trim() || null,
      });

      // Update role if changed
      if (role !== usuario.role) {
        await callAdminFunction("update_role", { role });
      }

      toast({
        title: "Usuario actualizado",
        description: `Los datos de ${nombreCompleto} han sido actualizados`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo actualizar el usuario",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!usuario) return;

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      await callAdminFunction("reset_password", { newPassword });

      toast({
        title: "Contraseña restablecida",
        description: `La contraseña de ${usuario.nombre_completo} ha sido actualizada`,
      });

      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo restablecer la contraseña",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!usuario) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
          <DialogDescription>
            Modifica los datos de {usuario.nombre_completo}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="datos" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Datos
            </TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Contraseña
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datos" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nombre Completo *</Label>
              <Input
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                placeholder="Nombre y apellidos"
              />
            </div>

            <div className="space-y-2">
              <Label>Nombre de Usuario *</Label>
              <Input
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                placeholder="nombre_usuario"
              />
            </div>

            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="(opcional)"
              />
            </div>

            <div className="space-y-2">
              <Label>Rol *</Label>
              <Select value={role} onValueChange={setRole}>
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="password" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nueva Contraseña *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirmar Contraseña *</Label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleResetPassword} disabled={saving || !newPassword}>
                {saving ? "Restableciendo..." : "Restablecer Contraseña"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
