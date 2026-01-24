import { useState, useEffect, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
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
  cuenta_padre_id?: string | null;
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
  nivel: z.number().min(1).max(5),
});

type CuentaForm = {
  empresa_id: string;
  codigo: string;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  clasificacion: "titulo" | "saldo";
  nivel: number;
  cuenta_padre_id: string;
};

const emptyForm: CuentaForm = {
  empresa_id: "",
  codigo: "",
  nombre: "",
  naturaleza: "deudora",
  clasificacion: "saldo",
  nivel: 1,
  cuenta_padre_id: "",
};

// Format code with dashes based on level
const formatAccountCode = (code: string): string => {
  // Remove existing dashes and non-numeric chars
  const clean = code.replace(/[^0-9]/g, "");
  
  // Pad to 12 digits
  const padded = clean.padEnd(12, "0").slice(0, 12);
  
  // Format as XXX-XXX-XXX-XXX
  return `${padded.slice(0, 3)}-${padded.slice(3, 6)}-${padded.slice(6, 9)}-${padded.slice(9, 12)}`;
};

// Parse code to determine level
const getCodeLevel = (code: string): number => {
  const clean = code.replace(/[^0-9]/g, "").padEnd(12, "0");
  
  if (clean.slice(3) === "000000000") return 1; // XXX-000-000-000
  if (clean.slice(6) === "000000") return 2;    // XXX-XXX-000-000
  if (clean.slice(9) === "000") return 3;       // XXX-XXX-XXX-000
  return 4;                                      // XXX-XXX-XXX-XXX
};

// Get parent code from current code
const getParentCode = (code: string): string | null => {
  const clean = code.replace(/[^0-9]/g, "").padEnd(12, "0");
  const level = getCodeLevel(code);
  
  if (level === 1) return null;
  if (level === 2) return formatAccountCode(clean.slice(0, 3));
  if (level === 3) return formatAccountCode(clean.slice(0, 6));
  return formatAccountCode(clean.slice(0, 9));
};

// Suggest next code based on parent
const suggestNextCode = (parentCode: string, existingCodes: string[]): string => {
  const parentClean = parentCode.replace(/[^0-9]/g, "").padEnd(12, "0");
  const parentLevel = getCodeLevel(parentCode);
  
  // Find existing children
  const children = existingCodes
    .map(c => c.replace(/[^0-9]/g, "").padEnd(12, "0"))
    .filter(c => {
      if (parentLevel === 1) return c.startsWith(parentClean.slice(0, 3)) && c.slice(6) === "000000";
      if (parentLevel === 2) return c.startsWith(parentClean.slice(0, 6)) && c.slice(9) === "000";
      if (parentLevel === 3) return c.startsWith(parentClean.slice(0, 9));
      return false;
    });
  
  // Find max child number
  let maxNum = 0;
  children.forEach(c => {
    let num = 0;
    if (parentLevel === 1) num = parseInt(c.slice(3, 6)) || 0;
    if (parentLevel === 2) num = parseInt(c.slice(6, 9)) || 0;
    if (parentLevel === 3) num = parseInt(c.slice(9, 12)) || 0;
    if (num > maxNum) maxNum = num;
  });
  
  const nextNum = String(maxNum + 1).padStart(3, "0");
  
  if (parentLevel === 1) return formatAccountCode(parentClean.slice(0, 3) + nextNum);
  if (parentLevel === 2) return formatAccountCode(parentClean.slice(0, 6) + nextNum);
  return formatAccountCode(parentClean.slice(0, 9) + nextNum);
};

export function CuentaDialog({ open, onOpenChange, cuenta, empresas, defaultEmpresaId, onSuccess }: CuentaDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CuentaForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cuentasPadre, setCuentasPadre] = useState<CuentaContable[]>([]);
  const [allCuentas, setAllCuentas] = useState<CuentaContable[]>([]);

  // Load parent accounts when empresa changes
  useEffect(() => {
    if (form.empresa_id) {
      loadCuentas(form.empresa_id);
    } else {
      setCuentasPadre([]);
      setAllCuentas([]);
    }
  }, [form.empresa_id]);

  const loadCuentas = async (empresaId: string) => {
    const { data } = await supabase
      .from("cuentas_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("clasificacion", "titulo")
      .order("codigo");
    
    if (data) {
      setCuentasPadre(data as CuentaContable[]);
    }

    // Also load all accounts for code suggestion
    const { data: allData } = await supabase
      .from("cuentas_contables")
      .select("codigo")
      .eq("empresa_id", empresaId);
    
    if (allData) {
      setAllCuentas(allData as CuentaContable[]);
    }
  };

  useEffect(() => {
    if (open) {
      if (cuenta) {
        setForm({
          empresa_id: cuenta.empresa_id,
          codigo: cuenta.codigo,
          nombre: cuenta.nombre,
          naturaleza: cuenta.naturaleza,
          clasificacion: cuenta.clasificacion,
          nivel: cuenta.nivel,
          cuenta_padre_id: cuenta.cuenta_padre_id || "",
        });
      } else {
        setForm({
          ...emptyForm,
          empresa_id: defaultEmpresaId || "",
        });
      }
    }
  }, [cuenta, open, defaultEmpresaId]);

  // Auto-calculate level from code
  const calculatedLevel = useMemo(() => {
    if (!form.codigo) return 1;
    return getCodeLevel(form.codigo);
  }, [form.codigo]);

  // Handle code input with auto-formatting
  const handleCodeChange = (value: string) => {
    // Allow typing, format on blur
    setForm({ 
      ...form, 
      codigo: value,
      nivel: getCodeLevel(value),
    });
  };

  const handleCodeBlur = () => {
    if (form.codigo) {
      const formatted = formatAccountCode(form.codigo);
      setForm({ 
        ...form, 
        codigo: formatted,
        nivel: getCodeLevel(formatted),
      });
    }
  };

  // When parent is selected, suggest next code
  const handleParentSelect = (parentId: string) => {
    const parent = cuentasPadre.find(c => c.id === parentId);
    if (parent) {
      const suggested = suggestNextCode(parent.codigo, allCuentas.map(c => c.codigo));
      setForm({
        ...form,
        cuenta_padre_id: parentId,
        codigo: suggested,
        nivel: getCodeLevel(suggested),
        naturaleza: parent.naturaleza, // Inherit from parent
      });
    } else {
      setForm({ ...form, cuenta_padre_id: "" });
    }
  };

  const handleSave = async () => {
    const formattedCode = formatAccountCode(form.codigo);
    const level = getCodeLevel(formattedCode);

    const result = cuentaSchema.safeParse({
      ...form,
      codigo: formattedCode,
      nivel: level,
    });

    if (!result.success) {
      toast({ title: "Error", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSaving(true);

    const data = {
      empresa_id: form.empresa_id,
      codigo: formattedCode,
      nombre: form.nombre,
      naturaleza: form.naturaleza,
      clasificacion: form.clasificacion,
      nivel: level,
      cuenta_padre_id: form.cuenta_padre_id || null,
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

  const levelLabels: Record<number, string> = {
    1: "Rubro",
    2: "Grupo",
    3: "Subgrupo",
    4: "Cuenta",
    5: "Subcuenta",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cuenta ? "Editar Cuenta" : "Nueva Cuenta Contable"}</DialogTitle>
          <DialogDescription>
            Formato de código: XXX-XXX-XXX-XXX (ej: 100-000-000-000)
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Empresa *</Label>
            <Select 
              value={form.empresa_id} 
              onValueChange={(v) => setForm({ ...form, empresa_id: v, cuenta_padre_id: "" })}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Parent account selector */}
          {form.empresa_id && cuentasPadre.length > 0 && (
            <div className="space-y-2">
              <Label>Cuenta Padre (opcional)</Label>
              <Select 
                value={form.cuenta_padre_id} 
                onValueChange={handleParentSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta padre para sugerir código" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin cuenta padre</SelectItem>
                  {cuentasPadre.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono text-xs">{c.codigo}</span> - {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Código *</Label>
              <Input 
                value={form.codigo} 
                onChange={(e) => handleCodeChange(e.target.value)} 
                onBlur={handleCodeBlur}
                placeholder="100-000-000-000" 
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Nivel</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                <Badge variant="outline">{calculatedLevel} - {levelLabels[calculatedLevel]}</Badge>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input 
              value={form.nombre} 
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} 
              placeholder="Ej: Activo Circulante, Bancos, etc." 
            />
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
                  <SelectItem value="titulo">Título (agrupadora)</SelectItem>
                  <SelectItem value="saldo">Saldo (de movimiento)</SelectItem>
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
