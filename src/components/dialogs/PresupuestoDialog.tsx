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
import { CentroNegocioDialog } from "./CentroNegocioDialog";
import { UnidadMedidaDialog } from "./UnidadMedidaDialog";
import { Plus, Trash2, Copy } from "lucide-react";

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
  centro_negocio_id: string;
  unidad_medida_id: string;
  partida: string;
  cantidad: string;
  precio_unitario: string;
  notas: string;
}

interface FlujoRow {
  id?: string; // existing DB id
  fecha: Date | undefined;
  monto: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  isNew?: boolean;
}

const emptyForm: PresupuestoForm = {
  empresa_id: "",
  cuenta_id: "",
  centro_negocio_id: "",
  unidad_medida_id: "",
  partida: "",
  cantidad: "1",
  precio_unitario: "0",
  notas: "",
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
  const [flujoRows, setFlujoRows] = useState<FlujoRow[]>([]);
  
  // Related data states
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [centros, setCentros] = useState<CentroNegocio[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);

  // Dialog states for inline creation
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [centroDialogOpen, setCentroDialogOpen] = useState(false);
  const [unidadDialogOpen, setUnidadDialogOpen] = useState(false);

  // Load related data when empresa changes
  useEffect(() => {
    if (form.empresa_id) {
      loadRelatedData(form.empresa_id);
    } else {
      setCuentas([]);
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
          centro_negocio_id: presupuesto.centro_negocio_id || "",
          unidad_medida_id: presupuesto.unidad_medida_id || "",
          partida: presupuesto.partida,
          cantidad: String(presupuesto.cantidad),
          precio_unitario: String(presupuesto.precio_unitario),
          notas: presupuesto.notas || "",
        });
        loadFlujoRows(presupuesto.id);
      } else {
        setForm(emptyForm);
        setFlujoRows([]);
      }
    }
  }, [open, presupuesto]);

  const loadFlujoRows = async (presupuestoId: string) => {
    const { data, error } = await supabase
      .from("flujos_programados")
      .select("*")
      .eq("presupuesto_id", presupuestoId)
      .order("fecha", { ascending: true });
    
    if (data) {
      setFlujoRows(data.map((f: any) => ({
        id: f.id,
        fecha: new Date(f.fecha + "T00:00:00"),
        monto: String(f.monto),
        tipo: f.tipo as "ingreso" | "egreso",
        descripcion: f.descripcion || "",
      })));
    }
  };

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

  const loadRelatedData = async (empresaId: string) => {
    const [cuentasRes, centrosRes] = await Promise.all([
      supabase
        .from("cuentas_contables")
        .select("id, codigo, nombre, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("activa", true)
        .order("codigo"),
      supabase
        .from("centros_negocio")
        .select("id, codigo, nombre, empresa_id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre"),
    ]);

    if (cuentasRes.data) setCuentas(cuentasRes.data);
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

  const totalFlujos = useMemo(() => {
    return flujoRows.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
  }, [flujoRows]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  // Flujo row management
  const addFlujoRow = () => {
    setFlujoRows(prev => [...prev, {
      fecha: undefined,
      monto: "",
      tipo: "egreso",
      descripcion: "",
      isNew: true,
    }]);
  };

  const duplicateFlujoRow = (index: number) => {
    const source = flujoRows[index];
    setFlujoRows(prev => [...prev, {
      fecha: source.fecha,
      monto: source.monto,
      tipo: source.tipo,
      descripcion: source.descripcion,
      isNew: true,
    }]);
  };

  const removeFlujoRow = (index: number) => {
    setFlujoRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateFlujoRow = (index: number, updates: Partial<FlujoRow>) => {
    setFlujoRows(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
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
        centro_negocio_id: form.centro_negocio_id || null,
        unidad_medida_id: form.unidad_medida_id || null,
        partida: form.partida,
        cantidad,
        precio_unitario,
        notas: form.notas || null,
        // Keep legacy fields null for new entries
        fecha_inicio: null as string | null,
        fecha_fin: null as string | null,
        frecuencia: "mensual" as const,
      };

      let presupuestoId: string;

      if (presupuesto) {
        const { error } = await supabase
          .from("presupuestos")
          .update(data)
          .eq("id", presupuesto.id);
        if (error) throw error;
        presupuestoId = presupuesto.id;
      } else {
        const { data: maxData } = await supabase
          .from("presupuestos")
          .select("orden")
          .eq("empresa_id", form.empresa_id)
          .order("orden", { ascending: false })
          .limit(1);

        const nuevoOrden = maxData && maxData.length > 0 ? (maxData[0].orden || 0) + 1 : 1;

        const { data: insertData, error } = await supabase
          .from("presupuestos")
          .insert({ ...data, orden: nuevoOrden })
          .select("id")
          .single();
        if (error) throw error;
        presupuestoId = insertData.id;
      }

      // Save flujos_programados: delete all existing and re-insert
      await supabase
        .from("flujos_programados")
        .delete()
        .eq("presupuesto_id", presupuestoId);

      const validFlujos = flujoRows.filter(r => r.fecha && parseFloat(r.monto) > 0);
      if (validFlujos.length > 0) {
        const flujosToInsert = validFlujos.map(r => ({
          presupuesto_id: presupuestoId,
          fecha: format(r.fecha!, "yyyy-MM-dd"),
          monto: parseFloat(r.monto),
          tipo: r.tipo,
          descripcion: r.descripcion || null,
        }));

        const { error: flujoError } = await supabase
          .from("flujos_programados")
          .insert(flujosToInsert);
        if (flujoError) throw flujoError;
      }

      toast({ title: presupuesto ? "Presupuesto actualizado" : "Presupuesto creado" });
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
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
                  setForm({ ...form, empresa_id: value, cuenta_id: "", centro_negocio_id: "" })
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

            {/* Programación de Flujo */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  📊 Programación de Flujo
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Total: <strong className="text-foreground">{formatCurrency(totalFlujos)}</strong></span>
                </div>
              </div>

              {flujoRows.length > 0 && (
                <div className="space-y-2">
                  {flujoRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_120px_100px_1fr_auto_auto] gap-2 items-end">
                      <div className="space-y-1">
                        {index === 0 && <Label className="text-xs">Fecha</Label>}
                        <DateInput
                          value={row.fecha}
                          onChange={(date) => updateFlujoRow(index, { fecha: date })}
                          placeholder="dd/mm/aaaa"
                        />
                      </div>
                      <div className="space-y-1">
                        {index === 0 && <Label className="text-xs">Monto</Label>}
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.monto}
                          onChange={(e) => updateFlujoRow(index, { monto: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                        {index === 0 && <Label className="text-xs">Tipo</Label>}
                        <Select
                          value={row.tipo}
                          onValueChange={(val: "ingreso" | "egreso") => updateFlujoRow(index, { tipo: val })}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ingreso">Ingreso</SelectItem>
                            <SelectItem value="egreso">Egreso</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        {index === 0 && <Label className="text-xs">Descripción</Label>}
                        <Input
                          value={row.descripcion}
                          onChange={(e) => updateFlujoRow(index, { descripcion: e.target.value })}
                          placeholder="Opcional..."
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => duplicateFlujoRow(index)}
                        title="Duplicar fila"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeFlujoRow(index)}
                        title="Eliminar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFlujoRow}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar fecha
              </Button>

              {flujoRows.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin programación de flujo. Agrega fechas y montos para generar el flujo de efectivo automáticamente.
                </p>
              )}
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
