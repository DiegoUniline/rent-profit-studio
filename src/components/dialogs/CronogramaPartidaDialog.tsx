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
import { DateInput } from "@/components/ui/date-input";

export interface CronogramaPartida {
  id: string;
  partida: string;
  cuenta_codigo?: string | null;
  cuenta_nombre?: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  avance_manual: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyectoId: string;
  partida: CronogramaPartida | null;
  onSuccess: () => void;
}

/**
 * Edición reducida de cronograma (fecha inicio/fin + avance manual) para usuarios
 * con permiso editar_cronograma pero sin rol admin/contador. Escribe únicamente
 * vía el RPC actualizar_cronograma_partida (valida el permiso en el servidor);
 * nunca toca cantidad/precio_unitario ni la programación financiera.
 */
export function CronogramaPartidaDialog({ open, onOpenChange, proyectoId, partida, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [avance, setAvance] = useState("");

  useEffect(() => {
    if (open && partida) {
      setFechaInicio(partida.fecha_inicio ? new Date(partida.fecha_inicio + "T00:00:00") : undefined);
      setFechaFin(partida.fecha_fin ? new Date(partida.fecha_fin + "T00:00:00") : undefined);
      setAvance(partida.avance_manual != null ? String(partida.avance_manual) : "");
    }
  }, [open, partida]);

  const handleGuardar = async () => {
    if (!partida) return;
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      toast({ title: "La fecha fin no puede ser anterior a la fecha inicio", variant: "destructive" });
      return;
    }
    const avanceNum = avance.trim() === "" ? null : Math.min(100, Math.max(0, parseFloat(avance) || 0));

    setSaving(true);
    try {
      const { error } = await supabase.rpc("actualizar_cronograma_partida", {
        _presupuesto_id: partida.id,
        _fecha_inicio: fechaInicio ? fechaInicio.toISOString().slice(0, 10) : null,
        _fecha_fin: fechaFin ? fechaFin.toISOString().slice(0, 10) : null,
        _avance_manual: avanceNum,
      });
      if (error) throw error;

      if (user) {
        await supabase.from("proyecto_auditoria").insert({
          proyecto_id: proyectoId,
          user_id: user.id,
          accion: "cronograma.fecha",
          entidad_id: partida.id,
          valor_anterior: `${partida.fecha_inicio || "—"} a ${partida.fecha_fin || "—"} · ${partida.avance_manual ?? "auto"}%`,
          valor_nuevo: `${fechaInicio?.toISOString().slice(0, 10) || "—"} a ${fechaFin?.toISOString().slice(0, 10) || "—"} · ${avanceNum ?? "auto"}%`,
        });
      }

      toast({ title: "Cronograma actualizado" });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cronograma</DialogTitle>
          <DialogDescription>
            {partida.cuenta_codigo ? `${partida.cuenta_codigo} · ` : ""}
            {partida.cuenta_nombre || ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Partida</Label>
            <Input value={partida.partida} disabled />
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
            <Label>Avance (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={avance}
              onChange={(e) => setAvance(e.target.value)}
              placeholder="Vacío = calcular automáticamente por lo ejercido"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
