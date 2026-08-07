import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateNumeric } from "@/lib/date-utils";
import { CalendarClock, User } from "lucide-react";
import { ESTADOS, ESTADO_LABELS, isTareaVencida, type TareaEstado } from "@/lib/tarea-utils";
import type { Tarea } from "@/components/dialogs/TareaDialog";

interface TareaConResponsable extends Tarea {
  responsable?: { razon_social: string } | null;
}

interface Props {
  tareas: TareaConResponsable[];
  onEdit: (tarea: TareaConResponsable) => void;
  onPersist: (cambios: { id: string; estado: TareaEstado; orden: number }[]) => void;
  readOnly?: boolean;
}

type Columns = Record<TareaEstado, TareaConResponsable[]>;

function agrupar(tareas: TareaConResponsable[]): Columns {
  const cols: Columns = { pendiente: [], en_progreso: [], bloqueada: [], hecho: [] };
  tareas.forEach((t) => cols[t.estado].push(t));
  ESTADOS.forEach((e) => cols[e].sort((a, b) => a.orden - b.orden));
  return cols;
}

function TareaCard({ tarea, readOnly }: { tarea: TareaConResponsable; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarea.id,
    disabled: readOnly,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const vencida = isTareaVencida(tarea.fecha_vencimiento, tarea.estado);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : attributes)}
      {...(readOnly ? {} : listeners)}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm space-y-1.5 touch-none",
        !readOnly && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      {tarea.color && <div className="h-1 w-8 rounded-full" style={{ backgroundColor: tarea.color }} />}
      <p className="text-sm font-medium leading-snug">{tarea.titulo}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {tarea.responsable?.razon_social && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {tarea.responsable.razon_social}
          </span>
        )}
        {tarea.fecha_vencimiento && (
          <span className={cn("flex items-center gap-1", vencida && "text-red-600 dark:text-red-400 font-medium")}>
            <CalendarClock className="h-3 w-3" />
            {formatDateNumeric(tarea.fecha_vencimiento)}
          </span>
        )}
      </div>
    </div>
  );
}

function Columna({
  estado,
  tareas,
  onEdit,
  readOnly,
}: {
  estado: TareaEstado;
  tareas: TareaConResponsable[];
  onEdit: (t: TareaConResponsable) => void;
  readOnly?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: estado });

  return (
    <div className="flex-1 min-w-[240px]">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h4 className="text-sm font-semibold">{ESTADO_LABELS[estado]}</h4>
        <Badge variant="outline" className="text-[10px]">
          {tareas.length}
        </Badge>
      </div>
      <div ref={setNodeRef} className="space-y-2 min-h-[80px] rounded-lg bg-muted/30 p-2">
        <SortableContext items={tareas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tareas.map((t) => (
            <div key={t.id} onClick={() => !readOnly && onEdit(t)}>
              <TareaCard tarea={t} readOnly={readOnly} />
            </div>
          ))}
        </SortableContext>
        {tareas.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Sin tareas</p>
        )}
      </div>
    </div>
  );
}

export function TareaKanban({ tareas, onEdit, onPersist, readOnly }: Props) {
  const [columns, setColumns] = useState<Columns>(() => agrupar(tareas));
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setColumns(agrupar(tareas));
  }, [tareas]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const findColumn = (id: string): TareaEstado | null => {
    if (ESTADOS.includes(id as TareaEstado)) return id as TareaEstado;
    return ESTADOS.find((e) => columns[e].some((t) => t.id === id)) || null;
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumn(String(active.id));
    const overCol = findColumn(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((prev) => {
      const activeItems = prev[activeCol];
      const overItems = prev[overCol];
      const activeIdx = activeItems.findIndex((t) => t.id === active.id);
      if (activeIdx === -1) return prev;
      const [moved] = activeItems.slice(activeIdx, activeIdx + 1);
      const overIdx = overItems.findIndex((t) => t.id === over.id);
      const insertAt = overIdx >= 0 ? overIdx : overItems.length;
      const newOverItems = [...overItems];
      newOverItems.splice(insertAt, 0, { ...moved, estado: overCol });

      return {
        ...prev,
        [activeCol]: activeItems.filter((t) => t.id !== active.id),
        [overCol]: newOverItems,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumn(String(active.id));
    const overCol = findColumn(String(over.id));
    if (!activeCol || !overCol) return;

    let finalColumns = columns;
    if (activeCol === overCol) {
      const items = columns[activeCol];
      const oldIndex = items.findIndex((t) => t.id === active.id);
      const newIndex = items.findIndex((t) => t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalColumns = { ...columns, [activeCol]: arrayMove(items, oldIndex, newIndex) };
        setColumns(finalColumns);
      }
    }

    const cambios: { id: string; estado: TareaEstado; orden: number }[] = [];
    ESTADOS.forEach((estado) => {
      finalColumns[estado].forEach((t, idx) => {
        cambios.push({ id: t.id, estado, orden: idx });
      });
    });
    onPersist(cambios);
  };

  const activeTarea = activeId ? ESTADOS.flatMap((e) => columns[e]).find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {ESTADOS.map((estado) => (
          <Columna key={estado} estado={estado} tareas={columns[estado]} onEdit={onEdit} readOnly={readOnly} />
        ))}
      </div>
      <DragOverlay>{activeTarea ? <TareaCard tarea={activeTarea} /> : null}</DragOverlay>
    </DndContext>
  );
}
