import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { formatCurrency } from "@/lib/accounting-utils";
import { distribuirSaldoEntrePeriodos, calcularFechasPorFrecuencia, FrecuenciaProgramacion } from "@/lib/project-utils";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyectoId: string;
  empresaId: string;
  presupuestoTotal: number;
  onSuccess: () => void;
}

const FRECUENCIAS: { value: FrecuenciaProgramacion; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

export function ProgramacionAutomaticaDialog({ open, onOpenChange, proyectoId, empresaId, presupuestoTotal, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [tieneAnticipo, setTieneAnticipo] = useState(false);
  const [anticipoMonto, setAnticipoMonto] = useState("");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaProgramacion>("mensual");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [numeroPagos, setNumeroPagos] = useState("4");

  useEffect(() => {
    if (open) {
      loadExistente();
    }
  }, [open, proyectoId]);

  const loadExistente = async () => {
    const { data } = await supabase
      .from("proyecto_programacion_financiera")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .eq("modo", "automatica")
      .maybeSingle();
    if (data) {
      setTieneAnticipo(data.tiene_anticipo);
      setAnticipoMonto(data.tiene_anticipo ? String(data.anticipo_monto) : "");
      setFrecuencia((data.frecuencia as FrecuenciaProgramacion) || "mensual");
      setFechaInicio(data.fecha_inicio ? new Date(data.fecha_inicio + "T00:00:00") : undefined);
      setNumeroPagos(data.numero_pagos ? String(data.numero_pagos) : "4");
    } else {
      setTieneAnticipo(false);
      setAnticipoMonto("");
      setFrecuencia("mensual");
      setFechaInicio(undefined);
      setNumeroPagos("4");
    }
  };

  const anticipo = tieneAnticipo ? Math.max(0, parseFloat(anticipoMonto) || 0) : 0;
  const saldo = Math.max(0, presupuestoTotal - anticipo);
  const numPagos = Math.max(0, parseInt(numeroPagos, 10) || 0);

  const vistaPrevia = useMemo(() => {
    if (!fechaInicio || numPagos <= 0) return [];
    const fechas = calcularFechasPorFrecuencia(fechaInicio, frecuencia, numPagos);
    const montos = distribuirSaldoEntrePeriodos(saldo, numPagos);
    return fechas.map((fecha, i) => ({ fecha, monto: montos[i] }));
  }, [fechaInicio, frecuencia, numPagos, saldo]);

  const totalVistaPrevia = vistaPrevia.reduce((s, p) => s + p.monto, 0);
  const excedeAnticipo = anticipo > presupuestoTotal;

  const handleGuardar = async () => {
    if (!fechaInicio) {
      toast({ title: "Define la fecha inicial", variant: "destructive" });
      return;
    }
    if (numPagos <= 0) {
      toast({ title: "Define el número de pagos", variant: "destructive" });
      return;
    }
    if (excedeAnticipo) {
      toast({ title: "El anticipo no puede ser mayor al presupuesto", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: existente } = await supabase
        .from("proyecto_programacion_financiera")
        .select("id")
        .eq("proyecto_id", proyectoId)
        .maybeSingle();

      let programacionId: string;
      const payload = {
        proyecto_id: proyectoId,
        empresa_id: empresaId,
        modo: "automatica" as const,
        tiene_anticipo: tieneAnticipo,
        anticipo_monto: anticipo,
        frecuencia,
        fecha_inicio: format(fechaInicio, "yyyy-MM-dd"),
        numero_pagos: numPagos,
        updated_by: user?.id,
      };

      if (existente) {
        const { error } = await supabase
          .from("proyecto_programacion_financiera")
          .update(payload)
          .eq("id", existente.id);
        if (error) throw error;
        programacionId = existente.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("proyecto_programacion_financiera")
          .insert({ ...payload, created_by: user?.id })
          .select("id")
          .single();
        if (error) throw error;
        programacionId = inserted.id;
      }

      await supabase.from("proyecto_programacion_pagos").delete().eq("programacion_id", programacionId);

      const filas = vistaPrevia.map((p, i) => ({
        programacion_id: programacionId,
        proyecto_id: proyectoId,
        fecha: format(p.fecha, "yyyy-MM-dd"),
        monto: p.monto,
        orden: i,
      }));
      if (filas.length > 0) {
        const { error: insertError } = await supabase.from("proyecto_programacion_pagos").insert(filas);
        if (insertError) throw insertError;
      }

      if (user) {
        await supabase.from("proyecto_auditoria").insert({
          proyecto_id: proyectoId,
          user_id: user.id,
          accion: "programacion_financiera",
          entidad_id: programacionId,
          valor_nuevo: `automática · ${frecuencia} · ${numPagos} pagos · anticipo ${formatCurrency(anticipo)}`,
        });
      }

      toast({ title: "Programación financiera creada" });
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programación automática</DialogTitle>
          <DialogDescription>Distribuye el presupuesto total del proyecto en pagos periódicos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Presupuesto total</span>
            <span className="font-bold text-primary">{formatCurrency(presupuestoTotal)}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="tiene-anticipo" className="cursor-pointer">
              ¿Lleva anticipo?
            </Label>
            <Switch id="tiene-anticipo" checked={tieneAnticipo} onCheckedChange={setTieneAnticipo} />
          </div>

          {tieneAnticipo && (
            <div className="space-y-2">
              <Label>Monto del anticipo</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={anticipoMonto}
                onChange={(e) => setAnticipoMonto(e.target.value)}
                placeholder="0.00"
              />
              {excedeAnticipo && (
                <p className="text-xs font-medium text-destructive">El anticipo no puede superar el presupuesto.</p>
              )}
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Saldo a programar</span>
            <span className="font-semibold">{formatCurrency(saldo)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={frecuencia} onValueChange={(v: FrecuenciaProgramacion) => setFrecuencia(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRECUENCIAS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Número de pagos</Label>
              <Input
                type="number"
                min="1"
                value={numeroPagos}
                onChange={(e) => setNumeroPagos(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fecha inicial</Label>
            <DateInput value={fechaInicio} onChange={setFechaInicio} />
          </div>

          <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
            <h4 className="font-medium text-sm">Vista previa</h4>
            {vistaPrevia.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Define fecha inicial y número de pagos para ver la distribución.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {vistaPrevia.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{format(p.fecha, "dd MMM yyyy")}</span>
                    <span className="font-medium">{formatCurrency(p.monto)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatCurrency(totalVistaPrevia)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving || vistaPrevia.length === 0}>
            {saving ? "Guardando..." : "Crear programación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
