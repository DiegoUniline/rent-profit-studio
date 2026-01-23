import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Loader2 } from "lucide-react";
import { z } from "zod";

interface Profile {
  id: string;
  user_id: string;
  nombre_completo: string;
  nombre_usuario: string;
  telefono: string | null;
  avatar_url: string | null;
}

const profileSchema = z.object({
  nombre_completo: z.string().min(2, "Nombre muy corto").max(100),
  nombre_usuario: z.string().min(3, "Mínimo 3 caracteres").max(50).regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y guión bajo"),
  telefono: z.string().max(20).optional().nullable(),
});

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  contador: "Contador",
  usuario: "Usuario",
};

export default function Perfil() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre_completo: "",
    nombre_usuario: "",
    telefono: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo cargar el perfil",
          variant: "destructive",
        });
      } else if (data) {
        setProfile(data);
        setForm({
          nombre_completo: data.nombre_completo,
          nombre_usuario: data.nombre_usuario,
          telefono: data.telefono || "",
        });
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    const result = profileSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        nombre_completo: form.nombre_completo,
        nombre_usuario: form.nombre_usuario,
        telefono: form.telefono || null,
      })
      .eq("user_id", user?.id);

    if (error) {
      toast({
        title: "Error",
        description: error.message.includes("duplicate")
          ? "El nombre de usuario ya está en uso"
          : "No se pudo actualizar el perfil",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    toast({ title: "Perfil actualizado" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-muted-foreground">Administra tu información personal</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Información Personal
            </CardTitle>
            <CardDescription>Actualiza tus datos de perfil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre Completo</Label>
                <Input
                  id="nombre"
                  value={form.nombre_completo}
                  onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usuario">Nombre de Usuario</Label>
                <Input
                  id="usuario"
                  value={form.nombre_usuario}
                  onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="55 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled />
              <p className="text-xs text-muted-foreground">
                El email no se puede modificar
              </p>
            </div>
            <div className="pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tu Cuenta</CardTitle>
            <CardDescription>Información de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Rol en el sistema</p>
              <Badge className="mt-1" variant="default">
                {role ? roleLabels[role] : "Sin rol"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Usuario</p>
              <p className="mt-1">@{profile?.nombre_usuario}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="mt-1 text-sm">{user?.email}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
