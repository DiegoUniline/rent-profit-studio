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
import {
  distribuirSaldoEntrePeriodos,
  calcularFechasPorFrecuencia,
  FrecuenciaProgramacion,
  FrecuenciaConCadencia,
} from "@/lib/project-utils";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { format } from "date-fns";

export interface PartidaProgramable {
  id: string;
  partida: string;
  cuenta_codigo?: string | null;
  cuenta_nombre?: string | null;
  presupuesto: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyectoId: string;
  empresaId: string;
  partida: PartidaProgramable | null;
  onSuccess: () => void;
}

interface FilaPago {
  id?: string;
  fecha: Date | undefined;
  monto: string;
  concepto: string;
}

const FRECUENCIAS: { value: FrecuenciaProgramacion; label: string; concepto: string }[] = [
  { value: "semanal", label: "Semanal", concepto: "Semana" },
  { value: "quincenal", label: "Quincenal", concepto: "Quincena" },
  { value: "mensual", label: "Mensual", concepto: "Mensualidad" },
  { value: "trimestral", label: "Trimestral", concepto: "Pago trimestral" },
  { value: "semestral", label: "Semestral", concepto: "Pago semestral" },
  { value: "anual", label: "Anual", concepto: "Pago anual" },
  { value: "personalizada", label: "Personalizada", concepto: "Pago" },
];

export function ProgramacionPartidaDialog({ open, onOpenChange, proyectoId, empresaId, partida, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [tieneAnticipo, setTieneAnticipo] = useState(false);
  const [anticipoMonto, setAnticipoMonto] = useState("");
  const [anticipoFecha, setAnticipoFecha] = useState<Date | undefined>();
  const [frecuencia, setFrecuencia] = useState<FrecuenciaProgramacion>("mensual");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [numeroPagos, setNumeroPagos] = useState("4");
  const [filas, setFilas] = useState<FilaPago[]>([]);

  useEffect(() => {
    if (open && partida) loadExistente(partida.id);
  }, [open, partida]);

  const loadExistente = async (presupuestoId: string) => {
    const { data: programacion } = await supabase
      .from("proyecto_programacion_financiera")
      .select("*")
      .eq("presupuesto_id", presupuestoId)
      .maybeSingle();

    if (programacion) {
      setTieneAnticipo(programacion.tiene_anticipo);
      setAnticipoMonto(programacion.tiene_anticipo ? String(programacion.anticipo_monto) : "");
      setAnticipoFecha(programacion.anticipo_fecha ? new Date(programacion.anticipo_fecha + "T00:00:00") : undefined);
      setFrecuencia((programacion.frecuencia as FrecuenciaProgramacion) || "mensual");
      setFechaInicio(programacion.fecha_inicio ? new Date(programacion.fecha_inicio + "T00:00:00") : undefined);
      setNumeroPagos(programacion.numero_pagos ? String(programacion.numero_pagos) : "4");

      const { data: pagosData } = await supabase
        .from("proyecto_programacion_pagos")
        .select("id, fecha, monto, concepto, es_anticipo")
        .eq("programacion_id", programacion.id)
        .order("orden");
      setFilas(
        (pagosData || [])
          .filter((p) => !p.es_anticipo)
          .map((p) => ({ id: p.id, fecha: new Date(p.fecha + "T00:00:00"), monto: String(p.monto), concepto: p.concepto || "" }))
      );
    } else {
      setTieneAnticipo(false);
      setAnticipoMonto("");
      setAnticipoFecha(undefined);
      setFrecuencia("mensual");
      setFechaInicio(undefined);
      setNumeroPagos("4");
      setFilas([]);
    }
  };

  const presupuestoPartida = partida?.presupuesto || 0;
  const anticipo = tieneAnticipo ? Math.max(0, parseFloat(anticipoMonto) || 0) : 0;
  const saldo = Math.max(0, presupuestoPartida - anticipo);
  const excedeAnticipo = anticipo > presupuestoPartida;

  const totalFilas = filas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0);
  const totalConAnticipo = totalFilas + anticipo;
  const excedePresupuesto = totalConAnticipo > presupuestoPartida + 0.01;
  const pendiente = Math.max(0, presupuestoPartida - totalConAnticipo);

  const handleGenerar = () => {
    if (frecuencia === "personalizada") {
      if (filas.length === 0) addFila();
      return;
    }
    const numPagos = Math.max(0, parseInt(numeroPagos, 10) || 0);
    if (!fechaInicio || numPagos <= 0) {
      toast({ title: "Define fecha inicial y número de periodos", variant: "destructive" });
      return;
    }
    const cfg = FRECUENCIAS.find((f) => f.value === frecuencia)!;
    const fechas = calcularFechasPorFrecuencia(fechaInicio, frecuencia as FrecuenciaConCadencia, numPagos);
    const montos = distribuirSaldoEntrePeriodos(saldo, numPagos);
    setFilas(fechas.map((fecha, i) => ({ fecha, monto: String(montos[i]), concepto: `${cfg.concepto} ${i + 1}` })));
  };

  const addFila = () => setFilas((prev) => [...prev, { fecha: undefined, monto: "", concepto: `Pago ${prev.length + 1}` }]);
  const removeFila = (index: number) => setFilas((prev) => prev.filter((_, i) => i !== index));
  const updateFila = (index: number, updates: Partial<FilaPago>) =>
    setFilas((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));

  const handleGuardar = async () => {
    if (!partida) return;
    if (excedeAnticipo) {
      toast({ title: "El anticipo no puede ser mayor al presupuesto de la partida", variant: "destructive" });
      return;
    }
    if (excedePresupuesto) {
      toast({
        title: "El importe supera el presupuesto de la partida",
        description: `Presupuesto: ${formatCurrency(presupuestoPartida)}. Programado + anticipo: ${formatCurrency(totalConAnticipo)}.`,
        variant: "destructive",
      });
      return;
    }
    if (tieneAnticipo && anticipo > 0 && !anticipoFecha) {
      toast({ title: "Define la fecha del anticipo", variant: "destructive" });
      return;
    }
    const filasValidas = filas.filter((f) => f.fecha && (parseFloat(f.monto) || 0) > 0);
    if (filasValidas.length === 0 && anticipo <= 0) {
      toast({ title: "Genera o captura al menos un pago", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: existente } = await supabase
        .from("proyecto_programacion_financiera")
        .select("id")
        .eq("presupuesto_id", partida.id)
        .maybeSingle();

      let programacionId: string;
      const payload = {
        presupuesto_id: partida.id,
        proyecto_id: proyectoId,
        empresa_id: empresaId,
        modo: frecuencia === "personalizada" ? ("manual" as const) : ("automatica" as const),
        tiene_anticipo: tieneAnticipo,
        anticipo_monto: anticipo,
        anticipo_fecha: tieneAnticipo && anticipoFecha ? format(anticipoFecha, "yyyy-MM-dd") : null,
        frecuencia,
        fecha_inicio: fechaInicio ? format(fechaInicio, "yyyy-MM-dd") : null,
        numero_pagos: frecuencia === "personalizada" ? null : parseInt(numeroPagos, 10) || null,
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

      const filasAInsertar: any[] = [];
      if (tieneAnticipo && anticipo > 0 && anticipoFecha) {
        filasAInsertar.push({
          programacion_id: programacionId,
          proyecto_id: proyectoId,
          fecha: format(anticipoFecha, "yyyy-MM-dd"),
          monto: anticipo,
          concepto: "Anticipo",
          es_anticipo: true,
          orden: -1,
        });
      }
      filasValidas
        .sort((a, b) => a.fecha!.getTime() - b.fecha!.getTime())
        .forEach((f, i) => {
          filasAInsertar.push({
            programacion_id: programacionId,
            proyecto_id: proyectoId,
            fecha: format(f.fecha!, "yyyy-MM-dd"),
            monto: parseFloat(f.monto),
            concepto: f.concepto || null,
            es_anticipo: false,
            orden: i,
          });
        });

      if (filasAInsertar.length > 0) {
        const { error: insertError } = await supabase.from("proyecto_programacion_pagos").insert(filasAInsertar);
        if (insertError) throw insertError;
      }

      if (user) {
        await supabase.from("proyecto_auditoria").insert({
          proyecto_id: proyectoId,
          user_id: user.id,
          accion: "programacion_financiera",
          entidad_id: partida.id,
          valor_nuevo: `${partida.partida} · ${frecuencia} · ${filasAInsertar.length} movimientos · ${formatCurrency(totalConAnticipo)}`,
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

  if (!partida) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programar partida</DialogTitle>
          <DialogDescription>
            {partida.cuenta_codigo ? `${partida.cuenta_codigo} · ` : ""}
            {partida.partida}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Importe presupuestado de la partida</span>
            <span className="font-bold text-primary">{formatCurrency(presupuestoPartida)}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="tiene-anticipo" className="cursor-pointer">
              ¿Lleva anticipo?
            </Label>
            <Switch id="tiene-anticipo" checked={tieneAnticipo} onCheckedChange={setTieneAnticipo} />
          </div>

          {tieneAnticipo && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Importe del anticipo</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={anticipoMonto}
                  onChange={(e) => setAnticipoMonto(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha del anticipo</Label>
                <DateInput value={anticipoFecha} onChange={setAnticipoFecha} />
              </div>
              {excedeAnticipo && (
                <p className="text-xs font-medium text-destructive col-span-2">
                  El anticipo no puede superar el presupuesto de la partida.
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Saldo a programar</span>
            <span className="font-semibold">{formatCurrency(saldo)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frecuencia de programación</Label>
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
            {frecuencia !== "personalizada" && (
              <div className="space-y-2">
                <Label>Número de periodos</Label>
                <Input type="number" min="1" value={numeroPagos} onChange={(e) => setNumeroPagos(e.target.value)} />
              </div>
            )}
          </div>

          {frecuencia !== "personalizada" && (
            <div className="space-y-2">
              <Label>Fecha inicial</Label>
              <DateInput value={fechaInicio} onChange={setFechaInicio} />
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={handleGenerar} className="w-full gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            {frecuencia === "personalizada" ? "Agregar fecha" : "Generar programación"}
          </Button>

          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <h4 className="font-medium text-sm">Pagos</h4>

            {filas.length > 0 && (
              <div className="space-y-2">
                {filas.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2 items-end">
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Fecha</Label>}
                      <DateInput value={row.fecha} onChange={(date) => updateFila(index, { fecha: date })} placeholder="dd/mm/aaaa" />
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Importe</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.monto}
                        onChange={(e) => updateFila(index, { monto: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Concepto</Label>}
                      <Input value={row.concepto} onChange={(e) => updateFila(index, { concepto: e.target.value })} placeholder="Concepto" />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeFila(index)}
                      title="Eliminar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addFila} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Agregar fecha
            </Button>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t text-sm">
              <span className="text-muted-foreground">Anticipo</span>
              <span className="text-right font-medium">{formatCurrency(anticipo)}</span>
              <span className="text-muted-foreground">Programado</span>
              <span className="text-right font-medium">{formatCurrency(totalFilas)}</span>
              <span className="text-muted-foreground">Total (anticipo + programado)</span>
              <span className={`text-right font-semibold ${excedePresupuesto ? "text-destructive" : ""}`}>
                {formatCurrency(totalConAnticipo)}
              </span>
              <span className="text-muted-foreground">Pendiente</span>
              <span className="text-right font-medium">{formatCurrency(pendiente)}</span>
            </div>

            {excedePresupuesto && (
              <p className="text-xs font-medium text-destructive text-right">
                El importe supera el presupuesto de la partida.
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
