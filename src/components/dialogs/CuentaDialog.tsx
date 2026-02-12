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
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "./EmpresaDialog";
import { formatCurrency } from "@/lib/accounting-utils";

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

// Format code with dashes as user types - live formatting
const formatCodeLive = (input: string): string => {
  // Remove everything except digits
  const digits = input.replace(/[^0-9]/g, "").slice(0, 12);
  
  // Add dashes as user types
  let formatted = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) formatted += "-";
    formatted += digits[i];
  }
  return formatted;
};

// Format code with padding for storage
const formatAccountCode = (code: string): string => {
  const clean = code.replace(/[^0-9]/g, "");
  const padded = clean.padEnd(12, "0").slice(0, 12);
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

// Suggest next code based on parent
const suggestNextCode = (parentCode: string, existingCodes: string[]): string => {
  const parentClean = parentCode.replace(/[^0-9]/g, "").padEnd(12, "0");
  const parentLevel = getCodeLevel(parentCode);
  
  const children = existingCodes
    .map(c => c.replace(/[^0-9]/g, "").padEnd(12, "0"))
    .filter(c => {
      if (parentLevel === 1) return c.startsWith(parentClean.slice(0, 3)) && c.slice(6) === "000000";
      if (parentLevel === 2) return c.startsWith(parentClean.slice(0, 6)) && c.slice(9) === "000";
      if (parentLevel === 3) return c.startsWith(parentClean.slice(0, 9));
      return false;
    });
  
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
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [saldoCuenta, setSaldoCuenta] = useState<number | null>(null);
  // Load empresas on open
  useEffect(() => {
    if (open) {
      loadEmpresas();
    }
  }, [open]);

  // Load parent accounts when empresa changes
  useEffect(() => {
    if (form.empresa_id) {
      loadCuentas(form.empresa_id);
    } else {
      setCuentasPadre([]);
      setAllCuentas([]);
    }
  }, [form.empresa_id]);

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

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

  const handleEmpresaCreated = () => {
    loadEmpresas();
    setEmpresaDialogOpen(false);
  };

  // Load account balance when editing
  const loadSaldoCuenta = async (cuentaId: string, naturaleza: "deudora" | "acreedora") => {
    // Paginate movements to bypass 1000-row limit
    const PAGE_SIZE = 1000;
    let allMovimientos: { debe: number; haber: number; asiento_id: string }[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from("asiento_movimientos")
        .select("debe, haber, asiento_id")
        .eq("cuenta_id", cuentaId)
        .range(from, from + PAGE_SIZE - 1);

      if (error) break;
      if (batch && batch.length > 0) {
        allMovimientos = allMovimientos.concat(batch);
        hasMore = batch.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    // Also paginate asientos aplicados
    let allAsientos: { id: string }[] = [];
    from = 0;
    hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from("asientos_contables")
        .select("id")
        .eq("estado", "aplicado")
        .range(from, from + PAGE_SIZE - 1);

      if (error) break;
      if (batch && batch.length > 0) {
        allAsientos = allAsientos.concat(batch);
        hasMore = batch.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    const asientosAplicados = new Set(allAsientos.map(a => a.id));
    let saldo = 0;

    allMovimientos.forEach(mov => {
      if (asientosAplicados.has(mov.asiento_id)) {
        const debe = Number(mov.debe) || 0;
        const haber = Number(mov.haber) || 0;
        if (naturaleza === 'deudora') {
          saldo += debe - haber;
        } else {
          saldo += haber - debe;
        }
      }
    });

    setSaldoCuenta(saldo);
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
        // Load balance for saldo-type accounts
        if (cuenta.clasificacion === "saldo") {
          loadSaldoCuenta(cuenta.id, cuenta.naturaleza);
        } else {
          setSaldoCuenta(null);
        }
      } else {
        setForm({
          ...emptyForm,
          empresa_id: defaultEmpresaId || "",
        });
        setSaldoCuenta(null);
      }
    }
  }, [cuenta, open, defaultEmpresaId]);

  // Auto-calculate level from code
  const calculatedLevel = useMemo(() => {
    if (!form.codigo) return 1;
    return getCodeLevel(form.codigo);
  }, [form.codigo]);

  // Handle code input with live formatting
  const handleCodeChange = (value: string) => {
    const formatted = formatCodeLive(value);
    setForm({ 
      ...form, 
      codigo: formatted,
      nivel: getCodeLevel(formatted),
    });
  };

  const handleCodeBlur = () => {
    if (form.codigo && form.codigo.replace(/[^0-9]/g, "").length > 0) {
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

  const empresaOptions = allEmpresas.map((e) => ({
    id: e.id,
    label: e.razon_social,
  }));

  const cuentaPadreOptions = cuentasPadre.map((c) => ({
    id: c.id,
    label: c.nombre,
    sublabel: c.codigo,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{cuenta ? "Editar Cuenta" : "Nueva Cuenta Contable"}</DialogTitle>
            <DialogDescription>
              Formato de código: XXX-XXX-XXX-XXX (ej: 100-000-000-000)
            </DialogDescription>
          </DialogHeader>

          {/* Show balance card when editing a saldo account */}
          {cuenta && cuenta.clasificacion === "saldo" && saldoCuenta !== null && (
            <Card className="bg-muted/50 border-primary/20">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Saldo actual de la cuenta:</span>
                  <span className={`text-lg font-bold font-mono ${saldoCuenta < 0 ? "text-destructive" : "text-primary"}`}>
                    {formatCurrency(saldoCuenta)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <SearchableSelect
                value={form.empresa_id}
                onValueChange={(v) => setForm({ ...form, empresa_id: v, cuenta_padre_id: "" })}
                options={empresaOptions}
                placeholder="Selecciona una empresa"
                searchPlaceholder="Buscar empresa..."
                emptyMessage="No se encontraron empresas"
                onCreateNew={() => setEmpresaDialogOpen(true)}
                createLabel="Nueva empresa"
              />
            </div>

            {/* Parent account selector - always show when empresa selected */}
            {form.empresa_id && (
              <div className="space-y-2">
                <Label>Cuenta Padre (para sugerir código automáticamente)</Label>
                <SearchableSelect
                  value={form.cuenta_padre_id || ""}
                  onValueChange={handleParentSelect}
                  options={[
                    { id: "", label: "Crear cuenta de nivel 1 (Rubro)" },
                    ...cuentaPadreOptions,
                  ]}
                  placeholder="Selecciona un grupo para crear subcuenta"
                  searchPlaceholder="Buscar cuenta padre..."
                  emptyMessage="No se encontraron cuentas"
                />
                {cuentasPadre.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay cuentas tipo "Título" aún. La primera cuenta será nivel 1.
                  </p>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Código * <span className="text-xs text-muted-foreground">(solo números, guiones automáticos)</span></Label>
                <Input 
                  value={form.codigo} 
                  onChange={(e) => handleCodeChange(e.target.value)} 
                  onBlur={handleCodeBlur}
                  placeholder="Escribe: 100..." 
                  className="font-mono text-lg tracking-wider"
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

      <EmpresaDialog
        open={empresaDialogOpen}
        onOpenChange={setEmpresaDialogOpen}
        empresa={null}
        onSuccess={handleEmpresaCreated}
      />
    </>
  );
}
