import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Programacion {
  id: string;
  empresa_id: string;
  tipo: "ingreso" | "egreso";
  centro_negocio_id: string | null;
  fecha_programada: string;
  tercero_id: string | null;
  monto: number;
  observaciones: string | null;
  estado: "pendiente" | "ejecutado" | "cancelado";
}

interface ProgramacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programacion?: Programacion | null;
  onSuccess: () => void;
  isCopy?: boolean;
}

export function ProgramacionDialog({
  open,
  onOpenChange,
  programacion,
  onSuccess,
  isCopy = false,
}: ProgramacionDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState<{ id: string; razon_social: string }[]>([]);
  const [centros, setCentros] = useState<{ id: string; codigo: string; nombre: string; empresa_id: string }[]>([]);
  const [terceros, setTerceros] = useState<{ id: string; razon_social: string; empresa_id: string }[]>([]);

  const [empresaId, setEmpresaId] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [centroNegocioId, setCentroNegocioId] = useState("");
  const [fechaProgramada, setFechaProgramada] = useState<Date>(new Date());
  const [terceroId, setTerceroId] = useState("");
  const [monto, setMonto] = useState("");
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    if (open) {
      fetchCatalogs();
      if (programacion) {
        setEmpresaId(programacion.empresa_id);
        setTipo(programacion.tipo);
        setCentroNegocioId(programacion.centro_negocio_id || "");
        setFechaProgramada(isCopy ? new Date() : new Date(programacion.fecha_programada + "T00:00:00"));
        setTerceroId(programacion.tercero_id || "");
        setMonto(programacion.monto.toString());
        setObservaciones(
          isCopy
            ? `Copia de: ${programacion.observaciones || ""}`
            : programacion.observaciones || ""
        );
      } else {
        resetForm();
      }
    }
  }, [open, programacion, isCopy]);

  const resetForm = () => {
    setEmpresaId("");
    setTipo("egreso");
    setCentroNegocioId("");
    setFechaProgramada(new Date());
    setTerceroId("");
    setMonto("");
    setObservaciones("");
  };

  const fetchCatalogs = async () => {
    const [empresasRes, centrosRes, tercerosRes] = await Promise.all([
      supabase.from("empresas").select("id, razon_social").eq("activa", true).order("razon_social"),
      supabase.from("centros_negocio").select("id, codigo, nombre, empresa_id").eq("activo", true).order("codigo"),
      supabase.from("terceros").select("id, razon_social, empresa_id").eq("activo", true).order("razon_social"),
    ]);
    if (empresasRes.data) setEmpresas(empresasRes.data);
    if (centrosRes.data) setCentros(centrosRes.data);
    if (tercerosRes.data) setTerceros(tercerosRes.data);
  };

  const filteredCentros = centros.filter((c) => c.empresa_id === empresaId);
  const filteredTerceros = terceros.filter((t) => t.empresa_id === empresaId);

  const handleSave = async () => {
    if (!empresaId || !monto || parseFloat(monto) <= 0) {
      toast({
        title: "Error",
        description: "Empresa y monto son requeridos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const data = {
        empresa_id: empresaId,
        tipo,
        centro_negocio_id: centroNegocioId || null,
        fecha_programada: format(fechaProgramada, "yyyy-MM-dd"),
        tercero_id: terceroId || null,
        monto: parseFloat(monto),
        observaciones: observaciones || null,
      };

      if (programacion && !isCopy) {
        const { error } = await supabase
          .from("programaciones")
          .update(data)
          .eq("id", programacion.id);
        if (error) throw error;
        toast({ title: "Programación actualizada" });
      } else {
        const { error } = await supabase.from("programaciones").insert(data);
        if (error) throw error;
        toast({ title: isCopy ? "Programación copiada" : "Programación creada" });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const dialogTitle = isCopy
    ? "Copiar Programación"
    : programacion
    ? "Editar Programación"
    : "Nueva Programación";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Empresa *</Label>
            <SearchableSelect
              options={empresas.map((e) => ({ id: e.id, label: e.razon_social }))}
              value={empresaId}
              onValueChange={(val) => {
                setEmpresaId(val);
                setCentroNegocioId("");
                setTerceroId("");
              }}
              placeholder="Seleccionar empresa..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(val: "ingreso" | "egreso") => setTipo(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Fecha Programada *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !fechaProgramada && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fechaProgramada ? format(fechaProgramada, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaProgramada}
                    onSelect={(date) => date && setFechaProgramada(date)}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Centro de Negocio</Label>
            <SearchableSelect
              options={filteredCentros.map((c) => ({
                id: c.id,
                label: `${c.codigo} - ${c.nombre}`,
              }))}
              value={centroNegocioId}
              onValueChange={setCentroNegocioId}
              placeholder="Seleccionar centro..."
              disabled={!empresaId}
            />
          </div>

          <div className="grid gap-2">
            <Label>Tercero</Label>
            <SearchableSelect
              options={filteredTerceros.map((t) => ({
                id: t.id,
                label: t.razon_social,
              }))}
              value={terceroId}
              onValueChange={setTerceroId}
              placeholder="Seleccionar tercero..."
              disabled={!empresaId}
            />
          </div>

          <div className="grid gap-2">
            <Label>Monto *</Label>
            <Input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="grid gap-2">
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
