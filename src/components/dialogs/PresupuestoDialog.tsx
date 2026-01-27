import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { format } from "date-fns";
import { z } from "zod";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "./EmpresaDialog";
import { CuentaDialog } from "./CuentaDialog";
import { TerceroDialog } from "./TerceroDialog";
import { CentroNegocioDialog } from "./CentroNegocioDialog";
import { UnidadMedidaDialog } from "./UnidadMedidaDialog";

interface Empresa {
  id: string;
  razon_social: string;
}

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
  empresa_id: string;
}

interface Tercero {
  id: string;
  razon_social: string;
  rfc: string;
  empresa_id: string;
}

interface CentroNegocio {
  id: string;
  codigo: string;
  nombre: string;
  empresa_id: string;
}

interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
}

interface Presupuesto {
  id: string;
  empresa_id: string;
  cuenta_id: string | null;
  tercero_id: string | null;
  centro_negocio_id: string | null;
  unidad_medida_id: string | null;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  notas: string | null;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  frecuencia: "semanal" | "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | null;
}

interface PresupuestoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuesto: Presupuesto | null;
  empresas: Empresa[];
  onSuccess: () => void;
}

const presupuestoSchema = z.object({
  empresa_id: z.string().min(1, "La empresa es requerida"),
  partida: z.string().min(1, "La partida es requerida"),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
  precio_unitario: z.number().min(0, "El precio no puede ser negativo"),
});

interface PresupuestoForm {
  empresa_id: string;
  cuenta_id: string;
  tercero_id: string;
  centro_negocio_id: string;
  unidad_medida_id: string;
  partida: string;
  cantidad: string;
  precio_unitario: string;
  notas: string;
  fecha_inicio: Date | undefined;
  fecha_fin: Date | undefined;
  frecuencia: "semanal" | "mensual" | "bimestral" | "trimestral" | "semestral" | "anual";
}

const emptyForm: PresupuestoForm = {
  empresa_id: "",
  cuenta_id: "",
  tercero_id: "",
  centro_negocio_id: "",
  unidad_medida_id: "",
  partida: "",
  cantidad: "1",
  precio_unitario: "0",
  notas: "",
  fecha_inicio: undefined,
  fecha_fin: undefined,
  frecuencia: "mensual",
};

export function PresupuestoDialog({
  open,
  onOpenChange,
  presupuesto,
  empresas,
  onSuccess,
}: PresupuestoDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<PresupuestoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  
  // Related data states
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [centros, setCentros] = useState<CentroNegocio[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);

  // Dialog states for inline creation
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [terceroDialogOpen, setTerceroDialogOpen] = useState(false);
  const [centroDialogOpen, setCentroDialogOpen] = useState(false);
  const [unidadDialogOpen, setUnidadDialogOpen] = useState(false);

  // Load related data when empresa changes
  useEffect(() => {
    if (form.empresa_id) {
      loadRelatedData(form.empresa_id);
    } else {
      setCuentas([]);
      setTerceros([]);
      setCentros([]);
    }
  }, [form.empresa_id]);

  // Load unidades on open
  useEffect(() => {
    if (open) {
      loadUnidades();
      loadEmpresas();
    }
  }, [open]);

  // Hydrate form when editing
  useEffect(() => {
    if (open) {
      if (presupuesto) {
        setForm({
          empresa_id: presupuesto.empresa_id,
          cuenta_id: presupuesto.cuenta_id || "",
          tercero_id: presupuesto.tercero_id || "",
          centro_negocio_id: presupuesto.centro_negocio_id || "",
          unidad_medida_id: presupuesto.unidad_medida_id || "",
          partida: presupuesto.partida,
          cantidad: String(presupuesto.cantidad),
          precio_unitario: String(presupuesto.precio_unitario),
          notas: presupuesto.notas || "",
          fecha_inicio: presupuesto.fecha_inicio ? new Date(presupuesto.fecha_inicio) : undefined,
          fecha_fin: presupuesto.fecha_fin ? new Date(presupuesto.fecha_fin) : undefined,
          frecuencia: presupuesto.frecuencia || "mensual",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, presupuesto]);

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

  const loadRelatedData = async (empresaId: string) => {
    const [cuentasRes, tercerosRes, centrosRes] = await Promise.all([
      supabase
        .from("cuentas_contables")
        .select("id, codigo, nombre, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("activa", true)
        .order("codigo"),
      supabase
        .from("terceros")
        .select("id, razon_social, rfc, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("razon_social"),
      supabase
        .from("centros_negocio")
        .select("id, codigo, nombre, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre"),
    ]);

    if (cuentasRes.data) setCuentas(cuentasRes.data);
    if (tercerosRes.data) setTerceros(tercerosRes.data);
    if (centrosRes.data) setCentros(centrosRes.data);
  };

  const loadUnidades = async () => {
    const { data } = await supabase
      .from("unidades_medida")
      .select("*")
      .eq("activa", true)
      .order("codigo");
    if (data) setUnidades(data);
  };

  const presupuestoCalculado = useMemo(() => {
    const cantidad = parseFloat(form.cantidad) || 0;
    const precio = parseFloat(form.precio_unitario) || 0;
    return cantidad * precio;
  }, [form.cantidad, form.precio_unitario]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  const handleSave = async () => {
    const cantidad = parseFloat(form.cantidad) || 0;
    const precio_unitario = parseFloat(form.precio_unitario) || 0;

    const result = presupuestoSchema.safeParse({
      empresa_id: form.empresa_id,
      partida: form.partida,
      cantidad,
      precio_unitario,
    });

    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const data = {
        empresa_id: form.empresa_id,
        cuenta_id: form.cuenta_id || null,
        tercero_id: form.tercero_id || null,
        centro_negocio_id: form.centro_negocio_id || null,
        unidad_medida_id: form.unidad_medida_id || null,
        partida: form.partida,
        cantidad,
        precio_unitario,
        notas: form.notas || null,
        fecha_inicio: form.fecha_inicio ? format(form.fecha_inicio, "yyyy-MM-dd") : null,
        fecha_fin: form.fecha_fin ? format(form.fecha_fin, "yyyy-MM-dd") : null,
        frecuencia: form.frecuencia,
      };

      if (presupuesto) {
        const { error } = await supabase
          .from("presupuestos")
          .update(data)
          .eq("id", presupuesto.id);
        if (error) throw error;
        toast({ title: "Presupuesto actualizado" });
      } else {
        // Obtener el máximo orden actual para la empresa
        const { data: maxData } = await supabase
          .from("presupuestos")
          .select("orden")
          .eq("empresa_id", form.empresa_id)
          .order("orden", { ascending: false })
          .limit(1);

        const nuevoOrden = maxData && maxData.length > 0 ? (maxData[0].orden || 0) + 1 : 1;

        const { error } = await supabase
          .from("presupuestos")
          .insert({ ...data, orden: nuevoOrden });
        if (error) throw error;
        toast({ title: "Presupuesto creado" });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEmpresaCreated = () => {
    loadEmpresas();
    setEmpresaDialogOpen(false);
  };

  const handleCuentaCreated = () => {
    if (form.empresa_id) loadRelatedData(form.empresa_id);
    setCuentaDialogOpen(false);
  };

  const handleTerceroCreated = () => {
    if (form.empresa_id) loadRelatedData(form.empresa_id);
    setTerceroDialogOpen(false);
  };

  const handleCentroCreated = () => {
    if (form.empresa_id) loadRelatedData(form.empresa_id);
    setCentroDialogOpen(false);
  };

  const handleUnidadCreated = (newUnidad?: UnidadMedida) => {
    loadUnidades();
    if (newUnidad) {
      setForm({ ...form, unidad_medida_id: newUnidad.id });
    }
    setUnidadDialogOpen(false);
  };

  // Options for SearchableSelect
  const empresaOptions = allEmpresas.map((e) => ({
    id: e.id,
    label: e.razon_social,
  }));

  const cuentaOptions = cuentas.map((c) => ({
    id: c.id,
    label: c.nombre,
    sublabel: c.codigo,
  }));

  const terceroOptions = terceros.map((t) => ({
    id: t.id,
    label: t.razon_social,
    sublabel: t.rfc,
  }));

  const centroOptions = centros.map((c) => ({
    id: c.id,
    label: c.nombre,
    sublabel: c.codigo,
  }));

  const unidadOptions = unidades.map((u) => ({
    id: u.id,
    label: u.nombre,
    sublabel: u.codigo,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {presupuesto ? "Editar Presupuesto" : "Nuevo Presupuesto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Empresa */}
            <div className="space-y-2">
              <Label htmlFor="empresa_id">Empresa *</Label>
              <SearchableSelect
                value={form.empresa_id}
                onValueChange={(value) =>
                  setForm({ ...form, empresa_id: value, cuenta_id: "", tercero_id: "", centro_negocio_id: "" })
                }
                options={empresaOptions}
                placeholder="Seleccionar empresa"
                searchPlaceholder="Buscar empresa..."
                emptyMessage="No se encontraron empresas"
                onCreateNew={() => setEmpresaDialogOpen(true)}
                createLabel="Nueva empresa"
              />
            </div>

            {/* Partida */}
            <div className="space-y-2">
              <Label htmlFor="partida">Partida *</Label>
              <Input
                id="partida"
                value={form.partida}
                onChange={(e) => setForm({ ...form, partida: e.target.value })}
                placeholder="Descripción de la partida"
              />
            </div>

            {/* Cuenta */}
            <div className="space-y-2">
              <Label htmlFor="cuenta_id">Cuenta Contable</Label>
              <SearchableSelect
                value={form.cuenta_id}
                onValueChange={(value) => setForm({ ...form, cuenta_id: value })}
                options={cuentaOptions}
                placeholder={form.empresa_id ? "Seleccionar cuenta" : "Primero seleccione empresa"}
                searchPlaceholder="Buscar cuenta..."
                emptyMessage="No se encontraron cuentas"
                disabled={!form.empresa_id}
                onCreateNew={() => setCuentaDialogOpen(true)}
                createLabel="Nueva cuenta"
              />
            </div>

            {/* Tercero */}
            <div className="space-y-2">
              <Label htmlFor="tercero_id">Tercero</Label>
              <SearchableSelect
                value={form.tercero_id}
                onValueChange={(value) => setForm({ ...form, tercero_id: value })}
                options={terceroOptions}
                placeholder={form.empresa_id ? "Seleccionar tercero" : "Primero seleccione empresa"}
                searchPlaceholder="Buscar tercero..."
                emptyMessage="No se encontraron terceros"
                disabled={!form.empresa_id}
                onCreateNew={() => setTerceroDialogOpen(true)}
                createLabel="Nuevo tercero"
              />
            </div>

            {/* Centro de Negocios */}
            <div className="space-y-2">
              <Label htmlFor="centro_negocio_id">Centro de Negocios</Label>
              <SearchableSelect
                value={form.centro_negocio_id}
                onValueChange={(value) => setForm({ ...form, centro_negocio_id: value })}
                options={centroOptions}
                placeholder={form.empresa_id ? "Seleccionar centro" : "Primero seleccione empresa"}
                searchPlaceholder="Buscar centro..."
                emptyMessage="No se encontraron centros"
                disabled={!form.empresa_id}
                onCreateNew={() => setCentroDialogOpen(true)}
                createLabel="Nuevo centro"
              />
            </div>

            {/* Unidad de Medida + Cantidad + Precio */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unidad_medida_id">Unidad de Medida</Label>
                <SearchableSelect
                  value={form.unidad_medida_id}
                  onValueChange={(value) => setForm({ ...form, unidad_medida_id: value })}
                  options={unidadOptions}
                  placeholder="Unidad"
                  searchPlaceholder="Buscar unidad..."
                  emptyMessage="No hay unidades"
                  onCreateNew={() => setUnidadDialogOpen(true)}
                  createLabel="Nueva unidad"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad *</Label>
                <Input
                  id="cantidad"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precio_unitario">Precio Unitario *</Label>
                <Input
                  id="precio_unitario"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio_unitario}
                  onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })}
                />
              </div>
            </div>

            {/* Sección de Fechas y Frecuencia para Flujo de Efectivo */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium text-sm text-muted-foreground">
                Configuración para Flujo de Efectivo
              </h4>
              
              <div className="grid grid-cols-3 gap-4">
                {/* Fecha Inicio */}
                <div className="space-y-2">
                  <Label>Fecha Inicio</Label>
                  <DateInput
                    value={form.fecha_inicio}
                    onChange={(date) => setForm({ ...form, fecha_inicio: date })}
                    placeholder="Seleccionar"
                  />
                </div>

                {/* Fecha Fin */}
                <div className="space-y-2">
                  <Label>Fecha Fin</Label>
                  <DateInput
                    value={form.fecha_fin}
                    onChange={(date) => setForm({ ...form, fecha_fin: date })}
                    placeholder="Seleccionar"
                    minDate={form.fecha_inicio}
                  />
                </div>

                {/* Frecuencia */}
                <div className="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select
                    value={form.frecuencia}
                    onValueChange={(value: PresupuestoForm["frecuencia"]) =>
                      setForm({ ...form, frecuencia: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                      <SelectItem value="bimestral">Bimestral</SelectItem>
                      <SelectItem value="trimestral">Trimestral</SelectItem>
                      <SelectItem value="semestral">Semestral</SelectItem>
                      <SelectItem value="anual">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Presupuesto calculado */}
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Presupuesto (Cantidad × Precio)
                </span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(presupuestoCalculado)}
                </span>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Notas adicionales..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs for inline creation */}
      <EmpresaDialog
        open={empresaDialogOpen}
        onOpenChange={setEmpresaDialogOpen}
        empresa={null}
        onSuccess={handleEmpresaCreated}
      />

      <CuentaDialog
        open={cuentaDialogOpen}
        onOpenChange={setCuentaDialogOpen}
        cuenta={null}
        empresas={allEmpresas}
        defaultEmpresaId={form.empresa_id}
        onSuccess={handleCuentaCreated}
      />

      <TerceroDialog
        open={terceroDialogOpen}
        onOpenChange={setTerceroDialogOpen}
        tercero={null}
        empresas={allEmpresas}
        onSuccess={handleTerceroCreated}
      />

      <CentroNegocioDialog
        open={centroDialogOpen}
        onOpenChange={setCentroDialogOpen}
        centro={null}
        empresas={allEmpresas}
        onSuccess={handleCentroCreated}
      />

      <UnidadMedidaDialog
        open={unidadDialogOpen}
        onOpenChange={setUnidadDialogOpen}
        unidad={null}
        onSuccess={handleUnidadCreated}
      />
    </>
  );
}
