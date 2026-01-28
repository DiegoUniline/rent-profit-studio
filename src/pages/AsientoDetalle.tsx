import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, Copy, Save } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "@/components/dialogs/EmpresaDialog";
import { CuentaDialog } from "@/components/dialogs/CuentaDialog";
import { TerceroDialog } from "@/components/dialogs/TerceroDialog";
import { CentroNegocioDialog } from "@/components/dialogs/CentroNegocioDialog";

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

const asientoSchema = z.object({
  empresa_id: z.string().min(1, "La empresa es requerida"),
  fecha: z.string().min(1, "La fecha es requerida"),
  tipo: z.enum(["ingreso", "egreso", "diario"]),
});

export default function AsientoDetalle() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isEditing = !!id && id !== "nuevo";
  const isCopy = searchParams.get("copy") === "true";
  const copyFromId = searchParams.get("from");

  const [form, setForm] = useState<AsientoForm>(emptyForm);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [numeroAsiento, setNumeroAsiento] = useState<number | null>(null);

  // Related data states
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [centros, setCentros] = useState<CentroNegocio[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);

  // Dialog states for inline creation
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [terceroDialogOpen, setTerceroDialogOpen] = useState(false);
  const [centroDialogOpen, setCentroDialogOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    loadEmpresas();
  }, []);

  // Load asiento if editing or copying
  useEffect(() => {
    const loadAsiento = async () => {
      const asientoId = isEditing ? id : copyFromId;
      if (!asientoId) {
        setLoading(false);
        return;
      }

      try {
        const { data: asiento, error } = await supabase
          .from("asientos_contables")
          .select("*")
          .eq("id", asientoId)
          .single();

        if (error) throw error;

        if (asiento) {
          setForm({
            empresa_id: asiento.empresa_id,
            fecha: isCopy ? new Date().toISOString().split("T")[0] : asiento.fecha,
            tipo: asiento.tipo as TipoAsiento,
            tercero_id: asiento.tercero_id || "",
            centro_negocio_id: asiento.centro_negocio_id || "",
            observaciones: isCopy
              ? `Copia de #${asiento.numero_asiento}${asiento.observaciones ? ` - ${asiento.observaciones}` : ""}`
              : asiento.observaciones || "",
          });

          if (!isCopy) {
            setNumeroAsiento(asiento.numero_asiento);
          }

          // Load movimientos
          const { data: movimientosData } = await supabase
            .from("asiento_movimientos")
            .select("*, cuentas_contables(codigo, nombre)")
            .eq("asiento_id", asientoId)
            .order("orden");

          if (movimientosData) {
            setMovimientos(
              movimientosData.map((m: any, idx: number) => ({
                id: isCopy ? undefined : m.id,
                cuenta_id: m.cuenta_id,
                cuenta_codigo: m.cuentas_contables?.codigo,
                cuenta_nombre: m.cuentas_contables?.nombre,
                partida: m.partida,
                debe: Number(m.debe),
                haber: Number(m.haber),
                orden: idx,
                presupuesto_id: m.presupuesto_id || "",
                isNew: isCopy,
              }))
            );
          }
        }
      } catch (error: any) {
        toast({
          title: "Error al cargar asiento",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadAsiento();
  }, [id, copyFromId, isCopy]);

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

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setEmpresas(data);
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

    // Auto-fill partida from presupuesto when selected
    if (field === "presupuesto_id" && value) {
      const presupuesto = presupuestos.find((p) => p.id === value);
      if (presupuesto) {
        updated[index].partida = presupuesto.partida;
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
      (m) => !m.cuenta_id || (m.debe === 0 && m.haber === 0)
    );
    if (invalidMovimientos.length > 0) {
      toast({
        title: "Error",
        description: "Todos los movimientos deben tener cuenta y un monto en Debe o Haber",
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

      if (isEditing) {
        // Update existing
        const { error } = await supabase
          .from("asientos_contables")
          .update(asientoData)
          .eq("id", id);
        if (error) throw error;
        asientoId = id!;

        // Delete existing movimientos
        await supabase
          .from("asiento_movimientos")
          .delete()
          .eq("asiento_id", id);
      } else {
        // Create new (including copy mode)
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

      toast({ title: isEditing ? "Asiento actualizado" : "Asiento creado" });
      navigate("/asientos");
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
  const empresaOptions = empresas.map((e) => ({
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

  const getPresupuestoOptionsForMovimiento = (cuentaId: string) => {
    const filtered = presupuestos.filter(
      (p) => !p.cuenta_id || p.cuenta_id === cuentaId
    );
    return filtered.map((p) => ({
      id: p.id,
      label: p.partida,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const title = isCopy
    ? "Copiar Asiento"
    : isEditing
      ? `Editar Asiento #${numeroAsiento}`
      : "Nuevo Asiento Contable";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/asientos")}
          title="Volver a Asientos"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">
            {isEditing ? "Modifica los datos del asiento contable" : "Registra un nuevo asiento contable"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/asientos")}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !totals.balanced} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div className="space-y-2">
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
            <div className="space-y-2 lg:col-span-1">
              <Label>Observaciones</Label>
              <Textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                placeholder="Notas adicionales..."
                rows={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Movimientos Section */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-base font-semibold">Movimientos</Label>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Cuenta</TableHead>
                  <TableHead className="min-w-[220px]">PARTIDA</TableHead>
                  <TableHead className="w-[120px] text-right">Debe</TableHead>
                  <TableHead className="w-[120px] text-right">Haber</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((mov, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="p-1">
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
                    <TableCell className="p-1">
                      <SearchableSelect
                        value={mov.presupuesto_id || ""}
                        onValueChange={(value) => updateMovimiento(idx, "presupuesto_id", value)}
                        options={getPresupuestoOptionsForMovimiento(mov.cuenta_id)}
                        placeholder="Seleccionar partida..."
                        searchPlaceholder="Buscar presupuesto..."
                        emptyMessage="No hay presupuestos"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mov.debe || ""}
                        onChange={(e) =>
                          updateMovimiento(idx, "debe", parseFloat(e.target.value) || 0)
                        }
                        className="text-right h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mov.haber || ""}
                        onChange={(e) =>
                          updateMovimiento(idx, "haber", parseFloat(e.target.value) || 0)
                        }
                        className="text-right h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="flex gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => duplicateMovimiento(idx)}
                          title="Duplicar línea"
                          className="h-7 w-7"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMovimiento(idx)}
                          className="text-destructive h-7 w-7"
                          title="Eliminar línea"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Add Line Row - Odoo Style */}
                <TableRow
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={form.empresa_id ? addMovimiento : undefined}
                >
                  <TableCell
                    colSpan={5}
                    className={`p-2 text-center ${!form.empresa_id ? "text-muted-foreground" : "text-primary"}`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="text-sm">
                        {form.empresa_id ? "Agregar línea" : "Primero seleccione una empresa"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

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
        </CardContent>
      </Card>

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
        empresas={empresas}
        defaultEmpresaId={form.empresa_id}
        onSuccess={handleCuentaCreated}
      />

      <TerceroDialog
        open={terceroDialogOpen}
        onOpenChange={setTerceroDialogOpen}
        tercero={null}
        empresas={empresas}
        onSuccess={handleTerceroCreated}
      />

      <CentroNegocioDialog
        open={centroDialogOpen}
        onOpenChange={setCentroDialogOpen}
        centro={null}
        empresas={empresas}
        onSuccess={handleCentroCreated}
      />
    </div>
  );
}
