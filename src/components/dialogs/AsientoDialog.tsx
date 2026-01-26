import { useState, useEffect, useMemo } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { z } from "zod";
import { Plus, Trash2, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "./EmpresaDialog";
import { CuentaDialog } from "./CuentaDialog";
import { TerceroDialog } from "./TerceroDialog";
import { CentroNegocioDialog } from "./CentroNegocioDialog";

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

interface Presupuesto {
  id: string;
  partida: string;
  empresa_id: string;
  cuenta_id: string | null;
  centro_negocio_id: string | null;
}

type TipoAsiento = "ingreso" | "egreso" | "diario";
type EstadoAsiento = "borrador" | "aplicado" | "cancelado";

interface AsientoContable {
  id: string;
  empresa_id: string;
  fecha: string;
  tipo: TipoAsiento;
  tercero_id: string | null;
  centro_negocio_id: string | null;
  numero_asiento: number;
  observaciones: string | null;
  estado: EstadoAsiento;
  total_debe: number;
  total_haber: number;
}

interface Movimiento {
  id?: string;
  cuenta_id: string;
  cuenta_codigo?: string;
  cuenta_nombre?: string;
  partida: string;
  debe: number;
  haber: number;
  orden: number;
  presupuesto_id?: string;
  isNew?: boolean;
}

interface AsientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asiento: AsientoContable | null;
  empresas: Empresa[];
  onSuccess: () => void;
}

const asientoSchema = z.object({
  empresa_id: z.string().min(1, "La empresa es requerida"),
  fecha: z.string().min(1, "La fecha es requerida"),
  tipo: z.enum(["ingreso", "egreso", "diario"]),
});

interface AsientoForm {
  empresa_id: string;
  fecha: string;
  tipo: TipoAsiento;
  tercero_id: string;
  centro_negocio_id: string;
  observaciones: string;
}

const emptyForm: AsientoForm = {
  empresa_id: "",
  fecha: new Date().toISOString().split("T")[0],
  tipo: "diario",
  tercero_id: "",
  centro_negocio_id: "",
  observaciones: "",
};

export function AsientoDialog({
  open,
  onOpenChange,
  asiento,
  empresas,
  onSuccess,
}: AsientoDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<AsientoForm>(emptyForm);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [saving, setSaving] = useState(false);
  
  // Related data states
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [centros, setCentros] = useState<CentroNegocio[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);

  // Dialog states for inline creation
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [terceroDialogOpen, setTerceroDialogOpen] = useState(false);
  const [centroDialogOpen, setCentroDialogOpen] = useState(false);

  // Load related data when empresa changes
  useEffect(() => {
    if (form.empresa_id) {
      loadRelatedData(form.empresa_id);
    } else {
      setCuentas([]);
      setTerceros([]);
      setCentros([]);
      setPresupuestos([]);
    }
  }, [form.empresa_id]);

  // Load empresas on open
  useEffect(() => {
    if (open) {
      loadEmpresas();
    }
  }, [open]);

  // Hydrate form when editing
  useEffect(() => {
    if (open) {
      if (asiento) {
        setForm({
          empresa_id: asiento.empresa_id,
          fecha: asiento.fecha,
          tipo: asiento.tipo,
          tercero_id: asiento.tercero_id || "",
          centro_negocio_id: asiento.centro_negocio_id || "",
          observaciones: asiento.observaciones || "",
        });
        loadMovimientos(asiento.id);
      } else {
        setForm(emptyForm);
        setMovimientos([]);
      }
    }
  }, [open, asiento]);

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

  const loadRelatedData = async (empresaId: string) => {
    const [cuentasRes, tercerosRes, centrosRes, presupuestosRes] = await Promise.all([
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
      supabase
        .from("presupuestos")
        .select("id, partida, empresa_id, cuenta_id, centro_negocio_id")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("partida"),
    ]);

    if (cuentasRes.data) setCuentas(cuentasRes.data);
    if (tercerosRes.data) setTerceros(tercerosRes.data);
    if (centrosRes.data) setCentros(centrosRes.data);
    if (presupuestosRes.data) setPresupuestos(presupuestosRes.data);
  };

  const loadMovimientos = async (asientoId: string) => {
    const { data } = await supabase
      .from("asiento_movimientos")
      .select("*, cuentas_contables(codigo, nombre)")
      .eq("asiento_id", asientoId)
      .order("orden");
    
    if (data) {
      setMovimientos(
        data.map((m: any) => ({
          id: m.id,
          cuenta_id: m.cuenta_id,
          cuenta_codigo: m.cuentas_contables?.codigo,
          cuenta_nombre: m.cuentas_contables?.nombre,
          partida: m.partida,
          debe: Number(m.debe),
          haber: Number(m.haber),
          orden: m.orden,
          presupuesto_id: m.presupuesto_id || "",
        }))
      );
    }
  };

  const totals = useMemo(() => {
    const totalDebe = movimientos.reduce((sum, m) => sum + (m.debe || 0), 0);
    const totalHaber = movimientos.reduce((sum, m) => sum + (m.haber || 0), 0);
    const balanced = Math.abs(totalDebe - totalHaber) < 0.01;
    return { totalDebe, totalHaber, balanced };
  }, [movimientos]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  const addMovimiento = () => {
    setMovimientos([
      ...movimientos,
      {
        cuenta_id: "",
        partida: "",
        debe: 0,
        haber: 0,
        orden: movimientos.length,
        presupuesto_id: "",
        isNew: true,
      },
    ]);
  };

  const duplicateMovimiento = (index: number) => {
    const original = movimientos[index];
    const duplicado: Movimiento = {
      cuenta_id: original.cuenta_id,
      cuenta_codigo: original.cuenta_codigo,
      cuenta_nombre: original.cuenta_nombre,
      partida: original.partida,
      debe: original.debe,
      haber: original.haber,
      orden: movimientos.length,
      presupuesto_id: original.presupuesto_id,
      isNew: true,
    };
    setMovimientos([...movimientos, duplicado]);
    toast({ title: "Línea duplicada", description: "Puede editar los valores de la nueva línea" });
  };

  const removeMovimiento = (index: number) => {
    setMovimientos(movimientos.filter((_, i) => i !== index));
  };

  const updateMovimiento = (index: number, field: keyof Movimiento, value: any) => {
    const updated = [...movimientos];
    updated[index] = { ...updated[index], [field]: value };
    
    // Update cuenta info when cuenta_id changes
    if (field === "cuenta_id") {
      const cuenta = cuentas.find((c) => c.id === value);
      if (cuenta) {
        updated[index].cuenta_codigo = cuenta.codigo;
        updated[index].cuenta_nombre = cuenta.nombre;
      }
    }
    
    setMovimientos(updated);
  };

  const handleSave = async () => {
    const result = asientoSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    // Validate movimientos
    if (movimientos.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un movimiento",
        variant: "destructive",
      });
      return;
    }

    const invalidMovimientos = movimientos.filter(
      (m) => !m.cuenta_id || !m.partida || (m.debe === 0 && m.haber === 0)
    );
    if (invalidMovimientos.length > 0) {
      toast({
        title: "Error",
        description: "Todos los movimientos deben tener cuenta, partida y un monto",
        variant: "destructive",
      });
      return;
    }

    if (!totals.balanced) {
      toast({
        title: "Error",
        description: "El asiento no está cuadrado. Total Debe debe ser igual a Total Haber",
        variant: "destructive",
      });
      return;
    }

    // For "diario" type, at least one movimiento must have a presupuesto assigned
    if (form.tipo === "diario") {
      const hasPresupuesto = movimientos.some((m) => m.presupuesto_id && m.presupuesto_id !== "");
      if (!hasPresupuesto) {
        toast({
          title: "Error",
          description: "Las pólizas de diario requieren al menos un movimiento con presupuesto asignado",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const asientoData = {
        empresa_id: form.empresa_id,
        fecha: form.fecha,
        tipo: form.tipo,
        tercero_id: form.tercero_id || null,
        centro_negocio_id: form.centro_negocio_id || null,
        observaciones: form.observaciones || null,
        total_debe: totals.totalDebe,
        total_haber: totals.totalHaber,
      };

      let asientoId: string;

      if (asiento) {
        // Update existing
        const { error } = await supabase
          .from("asientos_contables")
          .update(asientoData)
          .eq("id", asiento.id);
        if (error) throw error;
        asientoId = asiento.id;

        // Delete existing movimientos
        await supabase
          .from("asiento_movimientos")
          .delete()
          .eq("asiento_id", asiento.id);
      } else {
        // Create new
        const { data: newAsiento, error } = await supabase
          .from("asientos_contables")
          .insert({ ...asientoData, created_by: user?.id })
          .select()
          .single();
        if (error) throw error;
        asientoId = newAsiento.id;
      }

      // Insert movimientos
      const movimientosData = movimientos.map((m, idx) => ({
        asiento_id: asientoId,
        cuenta_id: m.cuenta_id,
        partida: m.partida,
        debe: m.debe,
        haber: m.haber,
        orden: idx,
        presupuesto_id: m.presupuesto_id || null,
      }));

      const { error: movError } = await supabase
        .from("asiento_movimientos")
        .insert(movimientosData);
      if (movError) throw movError;

      toast({ title: asiento ? "Asiento actualizado" : "Asiento creado" });
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

  // Options for SearchableSelect
  const empresaOptions = allEmpresas.map((e) => ({
    id: e.id,
    label: e.razon_social,
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

  const cuentaOptions = cuentas.map((c) => ({
    id: c.id,
    label: c.nombre,
    sublabel: c.codigo,
  }));

  const presupuestoOptions = presupuestos.map((p) => ({
    id: p.id,
    label: p.partida,
  }));

  // Filter presupuestos by cuenta for each movimiento
  const getPresupuestoOptionsForMovimiento = (cuentaId: string) => {
    const filtered = presupuestos.filter(
      (p) => !p.cuenta_id || p.cuenta_id === cuentaId
    );
    return filtered.map((p) => ({
      id: p.id,
      label: p.partida,
    }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {asiento ? `Editar Asiento #${asiento.numero_asiento}` : "Nuevo Asiento Contable"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Header Fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* Empresa */}
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <SearchableSelect
                  value={form.empresa_id}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      empresa_id: value,
                      tercero_id: "",
                      centro_negocio_id: "",
                    })
                  }
                  options={empresaOptions}
                  placeholder="Seleccionar empresa"
                  searchPlaceholder="Buscar empresa..."
                  emptyMessage="No se encontraron empresas"
                  onCreateNew={() => setEmpresaDialogOpen(true)}
                  createLabel="Nueva empresa"
                />
              </div>

              {/* Fecha */}
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => setForm({ ...form, tipo: value as TipoAsiento })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso</SelectItem>
                    <SelectItem value="diario">Diario</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tercero */}
              <div className="space-y-2">
                <Label>Tercero</Label>
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
              <div className="space-y-2 col-span-2">
                <Label>Centro de Negocios</Label>
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

              {/* Observaciones */}
              <div className="space-y-2 col-span-2">
                <Label>Observaciones</Label>
                <Textarea
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>
            </div>

            {/* Movimientos Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Movimientos</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMovimiento}
                  disabled={!form.empresa_id}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Agregar Línea
                </Button>
              </div>

              {movimientos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  {form.empresa_id
                    ? "Haga clic en 'Agregar Línea' para añadir movimientos"
                    : "Primero seleccione una empresa"}
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Cuenta</TableHead>
                        <TableHead className="w-[180px]">Partida</TableHead>
                        <TableHead className="w-[180px]">Presupuesto</TableHead>
                        <TableHead className="w-[120px] text-right">Debe</TableHead>
                        <TableHead className="w-[120px] text-right">Haber</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimientos.map((mov, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <SearchableSelect
                              value={mov.cuenta_id}
                              onValueChange={(value) => updateMovimiento(idx, "cuenta_id", value)}
                              options={cuentaOptions}
                              placeholder="Cuenta"
                              searchPlaceholder="Buscar cuenta..."
                              emptyMessage="No hay cuentas"
                              onCreateNew={() => setCuentaDialogOpen(true)}
                              createLabel="Nueva cuenta"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={mov.partida}
                              onChange={(e) => updateMovimiento(idx, "partida", e.target.value)}
                              placeholder="Descripción"
                            />
                          </TableCell>
                          <TableCell>
                            <SearchableSelect
                              value={mov.presupuesto_id || ""}
                              onValueChange={(value) => updateMovimiento(idx, "presupuesto_id", value)}
                              options={getPresupuestoOptionsForMovimiento(mov.cuenta_id)}
                              placeholder="Sin presupuesto"
                              searchPlaceholder="Buscar presupuesto..."
                              emptyMessage="No hay presupuestos"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={mov.debe || ""}
                              onChange={(e) =>
                                updateMovimiento(idx, "debe", parseFloat(e.target.value) || 0)
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={mov.haber || ""}
                              onChange={(e) =>
                                updateMovimiento(idx, "haber", parseFloat(e.target.value) || 0)
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => duplicateMovimiento(idx)}
                                title="Duplicar línea"
                                className="h-8 w-8"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeMovimiento(idx)}
                                className="text-destructive h-8 w-8"
                                title="Eliminar línea"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Totals */}
              {movimientos.length > 0 && (
                <div className="flex justify-end">
                  <div className="w-[400px] space-y-2">
                    <div className="flex justify-between px-4 py-2 bg-muted rounded">
                      <span className="font-medium">Total Debe:</span>
                      <span className="font-mono">{formatCurrency(totals.totalDebe)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 bg-muted rounded">
                      <span className="font-medium">Total Haber:</span>
                      <span className="font-mono">{formatCurrency(totals.totalHaber)}</span>
                    </div>
                    <div
                      className={`flex justify-between items-center px-4 py-2 rounded ${
                        totals.balanced
                          ? "bg-green-100 dark:bg-green-900/30"
                          : "bg-red-100 dark:bg-red-900/30"
                      }`}
                    >
                      <span className="font-medium flex items-center gap-2">
                        {totals.balanced ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        Diferencia:
                      </span>
                      <span className="font-mono font-bold">
                        {formatCurrency(Math.abs(totals.totalDebe - totals.totalHaber))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !totals.balanced}>
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
    </>
  );
}
