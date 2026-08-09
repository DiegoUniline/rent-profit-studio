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
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import { formatCurrency } from "@/lib/accounting-utils";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyectoId: string;
  empresaId: string;
  presupuestoTotal: number;
  onSuccess: () => void;
}

interface PagoRow {
  fecha: Date | undefined;
  monto: string;
}

export function ProgramacionManualDialog({ open, onOpenChange, proyectoId, empresaId, presupuestoTotal, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [tieneAnticipo, setTieneAnticipo] = useState(false);
  const [anticipoMonto, setAnticipoMonto] = useState("");
  const [pagos, setPagos] = useState<PagoRow[]>([]);

  useEffect(() => {
    if (open) loadExistente();
  }, [open, proyectoId]);

  const loadExistente = async () => {
    const { data: programacion } = await supabase
      .from("proyecto_programacion_financiera")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .eq("modo", "manual")
      .maybeSingle();

    if (programacion) {
      setTieneAnticipo(programacion.tiene_anticipo);
      setAnticipoMonto(programacion.tiene_anticipo ? String(programacion.anticipo_monto) : "");

      const { data: pagosData } = await supabase
        .from("proyecto_programacion_pagos")
        .select("fecha, monto")
        .eq("programacion_id", programacion.id)
        .order("fecha");
      setPagos(
        (pagosData || []).map((p) => ({ fecha: new Date(p.fecha + "T00:00:00"), monto: String(p.monto) }))
      );
    } else {
      setTieneAnticipo(false);
      setAnticipoMonto("");
      setPagos([]);
    }
  };

  const anticipo = tieneAnticipo ? Math.max(0, parseFloat(anticipoMonto) || 0) : 0;
  const saldoDisponible = Math.max(0, presupuestoTotal - anticipo);
  const totalProgramado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
  const pendiente = saldoDisponible - totalProgramado;
  const excede = pendiente < -0.01;
  const excedeAnticipo = anticipo > presupuestoTotal;

  const addPago = () => setPagos((prev) => [...prev, { fecha: undefined, monto: "" }]);
  const removePago = (index: number) => setPagos((prev) => prev.filter((_, i) => i !== index));
  const updatePago = (index: number, updates: Partial<PagoRow>) =>
    setPagos((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));

  const handleGuardar = async () => {
    if (excedeAnticipo) {
      toast({ title: "El anticipo no puede ser mayor al presupuesto", variant: "destructive" });
      return;
    }
    if (excede) {
      toast({
        title: "El importe supera el saldo pendiente del presupuesto",
        description: `Pendiente disponible: ${formatCurrency(saldoDisponible)}. Programado: ${formatCurrency(totalProgramado)}.`,
        variant: "destructive",
      });
      return;
    }
    const filasValidas = pagos.filter((p) => p.fecha && (parseFloat(p.monto) || 0) > 0);
    if (filasValidas.length === 0) {
      toast({ title: "Agrega al menos una fecha con importe", variant: "destructive" });
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
        modo: "manual" as const,
        tiene_anticipo: tieneAnticipo,
        anticipo_monto: anticipo,
        frecuencia: null,
        fecha_inicio: null,
        numero_pagos: null,
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

      const filas = filasValidas
        .sort((a, b) => a.fecha!.getTime() - b.fecha!.getTime())
        .map((p, i) => ({
          programacion_id: programacionId,
          proyecto_id: proyectoId,
          fecha: format(p.fecha!, "yyyy-MM-dd"),
          monto: parseFloat(p.monto),
          orden: i,
        }));
      const { error: insertError } = await supabase.from("proyecto_programacion_pagos").insert(filas);
      if (insertError) throw insertError;

      if (user) {
        await supabase.from("proyecto_auditoria").insert({
          proyecto_id: proyectoId,
          user_id: user.id,
          accion: "programacion_financiera",
          entidad_id: programacionId,
          valor_nuevo: `manual · ${filas.length} pagos · anticipo ${formatCurrency(anticipo)}`,
        });
      }

      toast({ title: "Programación financiera guardada" });
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programación manual</DialogTitle>
          <DialogDescription>Captura fecha e importe de cada parcialidad.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Presupuesto total</span>
            <span className="font-bold text-primary">{formatCurrency(presupuestoTotal)}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="tiene-anticipo-manual" className="cursor-pointer">
              ¿Lleva anticipo?
            </Label>
            <Switch id="tiene-anticipo-manual" checked={tieneAnticipo} onCheckedChange={setTieneAnticipo} />
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

          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <h4 className="font-medium text-sm">Parcialidades</h4>

            {pagos.length > 0 && (
              <div className="space-y-2">
                {pagos.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_160px_auto] gap-2 items-end">
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Fecha</Label>}
                      <DateInput value={row.fecha} onChange={(date) => updatePago(index, { fecha: date })} placeholder="dd/mm/aaaa" />
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Importe</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.monto}
                        onChange={(e) => updatePago(index, { monto: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removePago(index)}
                      title="Eliminar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addPago} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Agregar fecha
            </Button>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t text-sm">
              <span className="text-muted-foreground">Anticipo</span>
              <span className="text-right font-medium">{formatCurrency(anticipo)}</span>
              <span className="text-muted-foreground">Programado</span>
              <span className="text-right font-medium">{formatCurrency(totalProgramado)}</span>
              <span className="text-muted-foreground">Pendiente</span>
              <span className={`text-right font-semibold ${excede ? "text-destructive" : ""}`}>
                {formatCurrency(Math.max(0, pendiente))}
              </span>
            </div>

            {excede && (
              <p className="text-xs font-medium text-destructive text-right">
                El importe supera el saldo pendiente del presupuesto.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving}>
            {saving ? "Guardando..." : "Guardar programación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
