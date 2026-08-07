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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Check, Trash2 } from "lucide-react";
import type { TareaEstado } from "@/lib/tarea-utils";
import { ESTADO_LABELS, PALETA_COLORES } from "@/lib/tarea-utils";

export interface Tarea {
  id: string;
  proyecto_id: string;
  empresa_id: string;
  titulo: string;
  notas: string | null;
  responsable_tercero_id: string | null;
  fecha_vencimiento: string | null;
  estado: TareaEstado;
  color: string | null;
  orden: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyectoId: string;
  empresaId: string;
  tarea: Tarea | null;
  onSuccess: () => void;
  onDelete?: (id: string) => void;
}

export function TareaDialog({ open, onOpenChange, proyectoId, empresaId, tarea, onSuccess, onDelete }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [terceros, setTerceros] = useState<{ id: string; razon_social: string }[]>([]);
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState<Date | undefined>();
  const [estado, setEstado] = useState<TareaEstado>("pendiente");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      supabase
        .from("terceros")
        .select("id, razon_social")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("razon_social")
        .then(({ data }) => setTerceros(data || []));

      if (tarea) {
        setTitulo(tarea.titulo);
        setNotas(tarea.notas || "");
        setResponsableId(tarea.responsable_tercero_id || "");
        setFechaVencimiento(tarea.fecha_vencimiento ? new Date(tarea.fecha_vencimiento + "T00:00:00") : undefined);
        setEstado(tarea.estado);
        setColor(tarea.color);
      } else {
        setTitulo("");
        setNotas("");
        setResponsableId("");
        setFechaVencimiento(undefined);
        setEstado("pendiente");
        setColor(null);
      }
    }
  }, [open, tarea, empresaId]);

  const handleSave = async () => {
    if (!titulo.trim()) {
      toast({ title: "El título es requerido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(),
        notas: notas || null,
        responsable_tercero_id: responsableId || null,
        fecha_vencimiento: fechaVencimiento ? format(fechaVencimiento, "yyyy-MM-dd") : null,
        estado,
        color,
      };

      if (tarea) {
        const { error } = await supabase
          .from("proyecto_tareas")
          .update({ ...payload, updated_by: user?.id })
          .eq("id", tarea.id);
        if (error) throw error;
      } else {
        const { data: maxData } = await supabase
          .from("proyecto_tareas")
          .select("orden")
          .eq("proyecto_id", proyectoId)
          .eq("estado", estado)
          .order("orden", { ascending: false })
          .limit(1);
        const nuevoOrden = maxData && maxData.length > 0 ? (maxData[0].orden || 0) + 1 : 0;

        const { error } = await supabase.from("proyecto_tareas").insert({
          ...payload,
          proyecto_id: proyectoId,
          empresa_id: empresaId,
          orden: nuevoOrden,
          created_by: user?.id,
        });
        if (error) throw error;
      }

      toast({ title: tarea ? "Tarea actualizada" : "Tarea creada" });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tarea ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="titulo-tarea">Título *</Label>
            <Input
              id="titulo-tarea"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Pedir permiso de obra"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas-tarea">Notas</Label>
            <Textarea
              id="notas-tarea"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalle opcional..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Responsable</Label>
              <SearchableSelect
                value={responsableId}
                onValueChange={setResponsableId}
                options={terceros.map((t) => ({ id: t.id, label: t.razon_social }))}
                placeholder="Sin asignar"
                searchPlaceholder="Buscar en terceros..."
                emptyMessage="No hay terceros"
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de vencimiento</Label>
              <DateInput value={fechaVencimiento} onChange={setFechaVencimiento} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v: TareaEstado) => setEstado(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ESTADO_LABELS) as TareaEstado[]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {ESTADO_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 flex items-center justify-center text-[10px] text-muted-foreground",
                  color === null ? "border-foreground" : "border-transparent"
                )}
                title="Sin color"
              >
                —
              </button>
              {PALETA_COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 flex items-center justify-center",
                    color === c ? "border-foreground" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {tarea && onDelete ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive gap-1.5"
              onClick={() => {
                onDelete(tarea.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
