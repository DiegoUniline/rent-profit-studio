import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/accounting-utils";
import { format } from "date-fns";
import { Wand2, CheckCircle2 } from "lucide-react";
import { ProgramacionPartidaDialog } from "./ProgramacionPartidaDialog";
import {
  TIPO_MOVIMIENTO_OPCIONES,
  TipoMovimiento,
  TipoMovimientoValor,
  claseTipoMovimiento,
} from "@/lib/tipo-movimiento";
import { cn } from "@/lib/utils";

interface Tercero {
  id: string;
  razon_social: string;
}

export interface PartidaSeguimiento {
  id: string;
  empresa_id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  cuenta_codigo?: string | null;
  cuenta_nombre?: string | null;
  responsable_tercero_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  avance_manual?: number | null;
  tipo_movimiento?: TipoMovimientoValor;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partida: PartidaSeguimiento | null;
  proyectoId: string;
  onSuccess: () => void;
}

export function ProyectoPartidaSeguimientoDialog({ open, onOpenChange, partida, proyectoId, onSuccess }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [responsableId, setResponsableId] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [avanceManual, setAvanceManual] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoValor>(null);
  const [programado, setProgramado] = useState(0);
  const [programacionDialogOpen, setProgramacionDialogOpen] = useState(false);

  const presupuestoMonto = useMemo(() => {
    if (!partida) return 0;
    return partida.cantidad * partida.precio_unitario;
  }, [partida]);

  useEffect(() => {
    if (open && partida) {
      loadTerceros(partida.empresa_id);
      setResponsableId(partida.responsable_tercero_id || "");
      setFechaInicio(partida.fecha_inicio ? new Date(partida.fecha_inicio + "T00:00:00") : undefined);
      setFechaFin(partida.fecha_fin ? new Date(partida.fecha_fin + "T00:00:00") : undefined);
      setAvanceManual(partida.avance_manual != null ? String(partida.avance_manual) : "");
      refrescarProgramado(partida.id);
    }
  }, [open, partida]);

  const loadTerceros = async (empresaId: string) => {
    const { data } = await supabase
      .from("terceros")
      .select("id, razon_social")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("razon_social");
    if (data) setTerceros(data);
  };

  // La programación financiera de esta partida vive en Proyecto → Programación
  // financiera (misma ventana en todos lados: aquí, en Presupuestos y en ese tab).
  const refrescarProgramado = async (presupuestoId: string) => {
    const { data: prog } = await supabase
      .from("proyecto_programacion_financiera")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .maybeSingle();
    if (!prog) {
      setProgramado(0);
      return;
    }
    const { data: pagos } = await supabase
      .from("proyecto_programacion_pagos")
      .select("monto")
      .eq("programacion_id", prog.id);
    setProgramado((pagos || []).reduce((s, p) => s + Number(p.monto), 0));
  };

  const doSave = async (avanceOverride?: string) => {
    if (!partida) return;

    if (fechaFin && fechaInicio && fechaFin < fechaInicio) {
      toast({ title: "La fecha fin no puede ser anterior a la fecha inicio", variant: "destructive" });
      return;
    }

    const avanceValor = avanceOverride ?? avanceManual;

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("presupuestos")
        .update({
          responsable_tercero_id: responsableId || null,
          fecha_inicio: fechaInicio ? format(fechaInicio, "yyyy-MM-dd") : null,
          fecha_fin: fechaFin ? format(fechaFin, "yyyy-MM-dd") : null,
          avance_manual: avanceValor.trim() === "" ? null : Math.min(100, Math.max(0, parseFloat(avanceValor) || 0)),
        })
        .eq("id", partida.id);
      if (updateError) throw updateError;

      toast({ title: "Seguimiento actualizado" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const marcarCompletada = () => {
    setAvanceManual("100");
    doSave("100");
  };

  if (!partida) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar seguimiento de partida</DialogTitle>
            <DialogDescription>
              {partida.cuenta_codigo ? `${partida.cuenta_codigo} · ` : ""}
              {partida.cuenta_nombre || ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <Label>Partida</Label>
              <Input value={partida.partida} disabled />
            </div>

            <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Presupuesto (fijo, no editable aquí)</span>
              <span className="font-bold text-primary">{formatCurrency(presupuestoMonto)}</span>
            </div>

            <div className="space-y-2">
              <Label>Responsable</Label>
              <SearchableSelect
                value={responsableId}
                onValueChange={setResponsableId}
                options={terceros.map((t) => ({ id: t.id, label: t.razon_social }))}
                placeholder="Seleccionar responsable"
                searchPlaceholder="Buscar en terceros..."
                emptyMessage="No hay terceros"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <DateInput value={fechaInicio} onChange={setFechaInicio} />
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <DateInput value={fechaFin} onChange={setFechaFin} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Avance del cronograma (%)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={avanceManual}
                  onChange={(e) => setAvanceManual(e.target.value)}
                  placeholder="Vacío = calcular automáticamente por lo ejercido"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  disabled={saving}
                  onClick={marcarCompletada}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completada
                </Button>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <h4 className="font-medium text-sm">Programación financiera</h4>
              <div className="rounded-lg bg-background p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ya programado</span>
                <span className="font-semibold">{formatCurrency(programado)}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setProgramacionDialogOpen(true)} className="w-full gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                {programado > 0 ? "Ver / editar programación financiera" : "Programar esta partida"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => doSave()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProgramacionPartidaDialog
        open={programacionDialogOpen}
        onOpenChange={setProgramacionDialogOpen}
        proyectoId={proyectoId}
        empresaId={partida.empresa_id}
        partida={{
          id: partida.id,
          partida: partida.partida,
          cuenta_codigo: partida.cuenta_codigo,
          cuenta_nombre: partida.cuenta_nombre,
          presupuesto: presupuestoMonto,
        }}
        onSuccess={() => refrescarProgramado(partida.id)}
      />
    </>
  );
}
