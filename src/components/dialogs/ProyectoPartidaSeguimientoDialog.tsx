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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/accounting-utils";
import { format, addMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Wand2 } from "lucide-react";

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
}

interface PeriodoRow {
  periodo: string; // yyyy-MM-01
  monto: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partida: PartidaSeguimiento | null;
  onSuccess: () => void;
}

function mesesEntre(inicio: Date, fin: Date): string[] {
  const result: string[] = [];
  let cursor = startOfMonth(inicio);
  const limite = startOfMonth(fin);
  let guard = 0;
  while (cursor <= limite && guard < 600) {
    result.push(format(cursor, "yyyy-MM-01"));
    cursor = addMonths(cursor, 1);
    guard++;
  }
  return result;
}

export function ProyectoPartidaSeguimientoDialog({ open, onOpenChange, partida, onSuccess }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [responsableId, setResponsableId] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([]);
  const [avanceManual, setAvanceManual] = useState("");
  const [confirmRangoOpen, setConfirmRangoOpen] = useState(false);
  const [programacionProyectoActiva, setProgramacionProyectoActiva] = useState(false);

  useEffect(() => {
    if (!open || !partida?.id) {
      setProgramacionProyectoActiva(false);
      return;
    }
    let activo = true;
    supabase
      .from("proyecto_programacion_financiera")
      .select("id")
      .eq("presupuesto_id", partida.id)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setProgramacionProyectoActiva(!!data);
      });
    return () => {
      activo = false;
    };
  }, [open, partida?.id]);

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
      loadFlujos(partida.id);
    }
    if (!open) {
      setConfirmRangoOpen(false);
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

  const loadFlujos = async (presupuestoId: string) => {
    const { data } = await supabase
      .from("flujos_programados")
      .select("fecha, monto, tipo")
      .eq("presupuesto_id", presupuestoId)
      .order("fecha", { ascending: true });

    if (data && data.length > 0) {
      setTipo(data[0].tipo as "ingreso" | "egreso");
      const map = new Map<string, number>();
      data.forEach((f) => {
        const periodo = format(new Date(f.fecha + "T00:00:00"), "yyyy-MM-01");
        map.set(periodo, (map.get(periodo) || 0) + Number(f.monto));
      });
      setPeriodos([...map.entries()].map(([periodo, monto]) => ({ periodo, monto: String(monto) })));
    } else {
      setPeriodos([]);
    }
  };

  const totalProgramado = useMemo(
    () => periodos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0),
    [periodos]
  );

  const diferencia = presupuestoMonto - totalProgramado;
  const cuadra = Math.abs(diferencia) <= 0.01;

  const regenerarPeriodosVacios = (inicio: Date, fin: Date, preservar: PeriodoRow[]) => {
    const keys = mesesEntre(inicio, fin);
    const map = new Map(preservar.map((p) => [p.periodo, p.monto]));
    return keys.map((periodo) => ({ periodo, monto: map.get(periodo) || "" }));
  };

  const distribuirAutomaticamente = () => {
    if (!fechaInicio || !fechaFin) {
      toast({ title: "Define fecha inicio y fin primero", variant: "destructive" });
      return;
    }
    const keys = mesesEntre(fechaInicio, fechaFin);
    if (keys.length === 0) return;
    const base = Math.floor((presupuestoMonto / keys.length) * 100) / 100;
    const restante = Math.round((presupuestoMonto - base * keys.length) * 100) / 100;
    const nuevos = keys.map((periodo, i) => ({
      periodo,
      monto: String(i === keys.length - 1 ? base + restante : base),
    }));
    setPeriodos(nuevos);
  };

  const updatePeriodoMonto = (periodo: string, monto: string) => {
    setPeriodos((prev) => prev.map((p) => (p.periodo === periodo ? { ...p, monto } : p)));
  };

  const doSave = async (rangoConfirmado: boolean) => {
    if (!partida) return;

    if (!programacionProyectoActiva && !cuadra) {
      toast({
        title: "La programación no cuadra con el presupuesto",
        description:
          diferencia > 0
            ? `Faltan por distribuir ${formatCurrency(diferencia)}`
            : `Excede el presupuesto por ${formatCurrency(Math.abs(diferencia))}`,
        variant: "destructive",
      });
      return;
    }

    if (fechaFin && fechaInicio && fechaFin < fechaInicio) {
      toast({ title: "La fecha fin no puede ser anterior a la fecha inicio", variant: "destructive" });
      return;
    }

    // Detect range change vs. what's currently programmed, before persisting.
    if (!programacionProyectoActiva && !rangoConfirmado && fechaInicio && fechaFin && totalProgramado > 0) {
      const keysVigentes = new Set(mesesEntre(fechaInicio, fechaFin));
      const fueraDeRango = periodos.some((p) => (parseFloat(p.monto) || 0) > 0 && !keysVigentes.has(p.periodo));
      if (fueraDeRango) {
        setConfirmRangoOpen(true);
        return;
      }
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("presupuestos")
        .update({
          responsable_tercero_id: responsableId || null,
          fecha_inicio: fechaInicio ? format(fechaInicio, "yyyy-MM-dd") : null,
          fecha_fin: fechaFin ? format(fechaFin, "yyyy-MM-dd") : null,
          avance_manual: avanceManual.trim() === "" ? null : Math.min(100, Math.max(0, parseFloat(avanceManual) || 0)),
        })
        .eq("id", partida.id);
      if (updateError) throw updateError;

      // Si el proyecto ya tiene programación financiera propia, esta partida
      // no se programa aquí (evita duplicar el flujo).
      if (!programacionProyectoActiva) {
        await supabase.from("flujos_programados").delete().eq("presupuesto_id", partida.id);

        const filas = periodos
          .filter((p) => (parseFloat(p.monto) || 0) > 0)
          .map((p) => ({
            presupuesto_id: partida.id,
            empresa_id: partida.empresa_id,
            fecha: p.periodo,
            monto: parseFloat(p.monto),
            tipo,
            auto_generado: false,
          }));

        if (filas.length > 0) {
          const { error: insertError } = await supabase.from("flujos_programados").insert(filas);
          if (insertError) throw insertError;
        }
      }

      toast({ title: "Seguimiento actualizado" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalcular = () => {
    if (!fechaInicio || !fechaFin) return;
    const nuevos = regenerarPeriodosVacios(fechaInicio, fechaFin, []);
    const base = Math.floor((presupuestoMonto / nuevos.length) * 100) / 100;
    const restante = Math.round((presupuestoMonto - base * nuevos.length) * 100) / 100;
    const redistribuidos = nuevos.map((p, i) => ({
      periodo: p.periodo,
      monto: String(i === nuevos.length - 1 ? base + restante : base),
    }));
    setPeriodos(redistribuidos);
    setConfirmRangoOpen(false);
    setTimeout(() => doSave(true), 0);
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
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={avanceManual}
                onChange={(e) => setAvanceManual(e.target.value)}
                placeholder="Vacío = calcular automáticamente por lo ejercido"
              />
            </div>

            {programacionProyectoActiva ? (
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  📊 Esta partida se programa desde la <strong>Programación financiera</strong> del proyecto,
                  para evitar duplicar el flujo.
                </p>
              </div>
            ) : (
            <>
            <div className="space-y-2">
              <Label>Tipo de flujo</Label>
              <Select value={tipo} onValueChange={(v: "ingreso" | "egreso") => setTipo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Programación financiera</h4>
                <Button type="button" variant="outline" size="sm" onClick={distribuirAutomaticamente} className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" />
                  Distribuir automáticamente
                </Button>
              </div>

              {!fechaInicio || !fechaFin ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Define fecha inicio y fin para programar el presupuesto en el tiempo.
                </p>
              ) : periodos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin programación. Usa "Distribuir automáticamente" o agrega montos por periodo.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {periodos.map((p) => (
                    <div key={p.periodo} className="grid grid-cols-[1fr_160px] items-center gap-3">
                      <span className="text-sm capitalize">
                        {format(new Date(p.periodo + "T00:00:00"), "MMMM yyyy", { locale: es })}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={p.monto}
                        onChange={(e) => updatePeriodoMonto(p.periodo, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t text-sm">
                <span className="text-muted-foreground">Total programado</span>
                <span className="font-semibold">{formatCurrency(totalProgramado)}</span>
              </div>

              {!cuadra && (
                <p className="text-xs font-medium text-destructive text-right">
                  {diferencia > 0
                    ? `Faltan por distribuir ${formatCurrency(diferencia)}`
                    : `Excede presupuesto por ${formatCurrency(Math.abs(diferencia))}`}
                </p>
              )}
            </div>
            </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => doSave(false)} disabled={saving || (!programacionProyectoActiva && !cuadra)}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRangoOpen} onOpenChange={setConfirmRangoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recalcular distribución en el nuevo rango?</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiaste el rango de fechas y hay periodos programados fuera del nuevo rango. Si recalculas,
              se redistribuirá el presupuesto total ({formatCurrency(presupuestoMonto)}) en partes iguales
              entre los meses del nuevo rango. Si cancelas, vuelve a la programación y ajústala manualmente
              antes de guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecalcular}>Recalcular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
