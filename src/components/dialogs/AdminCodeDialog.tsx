import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ShieldAlert, Loader2 } from "lucide-react";

interface AdminCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export function AdminCodeDialog({
  open,
  onOpenChange,
  onSuccess,
  title = "Autorización Requerida",
  description = "Esta acción requiere autorización del administrador. Ingrese el código de acceso del administrador.",
}: AdminCodeDialogProps) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    if (!code.trim()) {
      toast({
        title: "Error",
        description: "Ingrese el código de acceso",
        variant: "destructive",
      });
      return;
    }

    setVerifying(true);

    try {
      // Query profiles of admins with matching access code
      const { data: adminProfiles, error } = await supabase
        .from("profiles")
        .select("user_id, codigo_acceso")
        .not("codigo_acceso", "is", null);

      if (error) throw error;

      // Get admin user_ids
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminUserIds = new Set(adminRoles?.map((r) => r.user_id) || []);

      // Check if any admin profile has the matching code
      const validCode = adminProfiles?.some(
        (profile) =>
          adminUserIds.has(profile.user_id) && profile.codigo_acceso === code
      );

      if (validCode) {
        toast({ title: "Autorización exitosa" });
        setCode("");
        onOpenChange(false);
        onSuccess();
      } else {
        toast({
          title: "Código incorrecto",
          description: "El código de acceso no es válido",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setCode("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-2">
          <Label htmlFor="admin-code">Código de Acceso del Administrador</Label>
          <div className="relative">
            <Input
              id="admin-code"
              type={showCode ? "text" : "password"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ingrese el código..."
              className="pr-10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleVerify();
                }
              }}
            />
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleVerify} disabled={verifying}>
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verificar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
