import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { cn } from "@/lib/utils";
import { formatDateNumeric } from "@/lib/date-utils";
import { TareaDialog, type Tarea } from "@/components/dialogs/TareaDialog";
import { TareaKanban } from "@/components/proyectos/TareaKanban";
import { ESTADO_BADGE_CLASS, ESTADO_LABELS, isTareaVencida, type TareaEstado } from "@/lib/tarea-utils";
import { ListChecks, LayoutGrid, List, Plus, Pencil, Trash2 } from "lucide-react";

interface TareaConResponsable extends Tarea {
  responsable?: { razon_social: string } | null;
}

interface Props {
  proyectoId: string;
  empresaId: string;
  canEdit: boolean;
}

export function ProyectoTareas({ proyectoId, empresaId, canEdit }: Props) {
  const { toast } = useToast();
  const [tareas, setTareas] = useState<TareaConResponsable[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"tabla" | "kanban">(
    () => (localStorage.getItem("proyecto_tareas_vista") as "tabla" | "kanban") || "kanban"
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TareaConResponsable | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("proyecto_tareas_vista", vista);
  }, [vista]);

  const fetchTareas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proyecto_tareas")
      .select("*, responsable:responsable_tercero_id(razon_social)")
      .eq("proyecto_id", proyectoId)
      .order("orden");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTareas((data || []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTareas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const indicadores = useMemo(() => {
    const vencidas = tareas.filter((t) => isTareaVencida(t.fecha_vencimiento, t.estado)).length;
    const hechas = tareas.filter((t) => t.estado === "hecho").length;
    return { total: tareas.length, vencidas, hechas };
  }, [tareas]);

  const openNueva = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEditar = (t: TareaConResponsable) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("proyecto_tareas").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tarea eliminada" });
    fetchTareas();
  };

  const handlePersistKanban = async (cambios: { id: string; estado: TareaEstado; orden: number }[]) => {
    // Actualiza en optimista local y persiste en BD.
    setTareas((prev) =>
      prev.map((t) => {
        const cambio = cambios.find((c) => c.id === t.id);
        return cambio ? { ...t, estado: cambio.estado, orden: cambio.orden } : t;
      })
    );
    const results = await Promise.all(
      cambios.map((c) => supabase.from("proyecto_tareas").update({ estado: c.estado, orden: c.orden }).eq("id", c.id))
    );
    const conError = results.find((r) => r.error);
    if (conError?.error) {
      toast({ title: "Error al guardar el tablero", description: conError.error.message, variant: "destructive" });
      fetchTareas();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Tareas
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{indicadores.total} tareas</Badge>
            {indicadores.vencidas > 0 && (
              <Badge variant="outline" className="text-red-600 border-red-300">
                {indicadores.vencidas} vencidas
              </Badge>
            )}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button
                variant={vista === "kanban" ? "default" : "ghost"}
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => setVista("kanban")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </Button>
              <Button
                variant={vista === "tabla" ? "default" : "ghost"}
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => setVista("tabla")}
              >
                <List className="h-3.5 w-3.5" />
                Tabla
              </Button>
            </div>
            {canEdit && (
              <Button size="sm" className="h-7 gap-1.5" onClick={openNueva}>
                <Plus className="h-3.5 w-3.5" />
                Nueva tarea
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
        ) : tareas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sin tareas todavía. {canEdit && 'Usa "Nueva tarea" para agregar la primera.'}
          </p>
        ) : vista === "kanban" ? (
          <TareaKanban tareas={tareas} onEdit={openEditar} onPersist={handlePersistKanban} readOnly={!canEdit} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tareas.map((t) => {
                const vencida = isTareaVencida(t.fecha_vencimiento, t.estado);
                return (
                  <TableRow key={t.id} className={canEdit ? "cursor-pointer" : ""} onClick={() => canEdit && openEditar(t)}>
                    <TableCell>
                      {t.color && <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
                    </TableCell>
                    <TableCell className="font-medium">{t.titulo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.responsable?.razon_social || "Sin responsable"}
                    </TableCell>
                    <TableCell className={cn("text-sm", vencida && "text-red-600 dark:text-red-400 font-medium")}>
                      {t.fecha_vencimiento ? formatDateNumeric(t.fecha_vencimiento) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ESTADO_BADGE_CLASS[t.estado]}>
                        {ESTADO_LABELS[t.estado]}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditar(t);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <TareaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proyectoId={proyectoId}
        empresaId={empresaId}
        tarea={editing}
        onSuccess={fetchTareas}
        onDelete={(id) => setDeleteId(id)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarea?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
