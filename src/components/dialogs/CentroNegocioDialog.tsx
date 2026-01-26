import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmpresaDialog } from "./EmpresaDialog";

interface Empresa {
  id: string;
  razon_social: string;
}

interface CentroNegocio {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  tipo_actividad: string | null;
  responsable: string | null;
  activo: boolean;
}

interface CentroNegocioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centro: CentroNegocio | null;
  empresas: Empresa[];
  onSuccess: () => void;
}

const centroSchema = z.object({
  empresa_id: z.string().min(1, "La empresa es requerida"),
  nombre: z.string().min(1, "El nombre es requerido"),
});

interface CentroForm {
  empresa_id: string;
  nombre: string;
  tipo_actividad: string;
  responsable: string;
}

const emptyForm: CentroForm = {
  empresa_id: "",
  nombre: "",
  tipo_actividad: "",
  responsable: "",
};

const generateNextCode = async (empresaId: string): Promise<string> => {
  const { data } = await supabase
    .from("centros_negocio")
    .select("codigo")
    .eq("empresa_id", empresaId)
    .order("codigo", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const lastCode = data[0].codigo;
    const match = lastCode.match(/CN(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `CN${String(nextNum).padStart(3, "0")}`;
    }
  }
  return "CN001";
};

export function CentroNegocioDialog({
  open,
  onOpenChange,
  centro,
  empresas,
  onSuccess,
}: CentroNegocioDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CentroForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>(empresas);
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      loadEmpresas();
      if (centro) {
        setForm({
          empresa_id: centro.empresa_id,
          nombre: centro.nombre,
          tipo_actividad: centro.tipo_actividad || "",
          responsable: centro.responsable || "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, centro]);

  const loadEmpresas = async () => {
    const { data } = await supabase
      .from("empresas")
      .select("id, razon_social")
      .eq("activa", true)
      .order("razon_social");
    if (data) setAllEmpresas(data);
  };

  const handleEmpresaCreated = () => {
    loadEmpresas();
    setEmpresaDialogOpen(false);
  };

  const handleSave = async () => {
    const result = centroSchema.safeParse(form);
    if (!result.success) {
      toast({
        title: "Error de validación",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    let error;
    if (centro) {
      // Update: don't change the code
      const updateData = {
        empresa_id: form.empresa_id,
        nombre: form.nombre,
        tipo_actividad: form.tipo_actividad || null,
        responsable: form.responsable || null,
      };
      ({ error } = await supabase
        .from("centros_negocio")
        .update(updateData)
        .eq("id", centro.id));
    } else {
      // Insert: generate automatic code
      const codigo = await generateNextCode(form.empresa_id);
      const insertData = {
        empresa_id: form.empresa_id,
        codigo,
        nombre: form.nombre,
        tipo_actividad: form.tipo_actividad || null,
        responsable: form.responsable || null,
      };
      ({ error } = await supabase.from("centros_negocio").insert(insertData));
    }

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Error",
          description: "Ya existe un centro con ese código en esta empresa",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo guardar el centro de negocio",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: centro ? "Centro actualizado" : "Centro creado",
      description: `${form.nombre} ha sido ${centro ? "actualizado" : "creado"} exitosamente`,
    });

    onOpenChange(false);
    onSuccess();
  };

  const empresaOptions = allEmpresas.map((e) => ({
    id: e.id,
    label: e.razon_social,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {centro ? "Editar Centro de Negocio" : "Nuevo Centro de Negocio"}
            </DialogTitle>
            <DialogDescription>
              {centro
                ? "Modifica los datos del centro de negocio"
                : "Ingresa los datos del nuevo centro de negocio"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <SearchableSelect
                value={form.empresa_id}
                onValueChange={(value) => setForm({ ...form, empresa_id: value })}
                options={empresaOptions}
                placeholder="Selecciona una empresa"
                searchPlaceholder="Buscar empresa..."
                emptyMessage="No se encontraron empresas"
                onCreateNew={() => setEmpresaDialogOpen(true)}
                createLabel="Nueva empresa"
              />
            </div>

            {centro && (
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={centro.codigo}
                  disabled
                  className="bg-muted"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre del centro de negocio"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Actividad</Label>
              <Input
                value={form.tipo_actividad}
                onChange={(e) => setForm({ ...form, tipo_actividad: e.target.value })}
                placeholder="Ej: Construcción, Transporte"
              />
            </div>

            <div className="space-y-2">
              <Label>Responsable</Label>
              <Input
                value={form.responsable}
                onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                placeholder="Nombre del responsable"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EmpresaDialog
        open={empresaDialogOpen}
        onOpenChange={setEmpresaDialogOpen}
        empresa={null}
        onSuccess={handleEmpresaCreated}
      />
    </>
  );
}
