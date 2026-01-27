import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableCell, TableRow } from "@/components/ui/table";
import { GripVertical } from "lucide-react";
import { formatCurrency } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";

interface FlujoMensual {
  presupuestoId: string;
  partida: string;
  codigoCuenta: string;
  nombreCuenta: string;
  tipo: "entrada" | "salida";
  montoTotal: number;
  frecuencia: string;
  meses: number[];
  centroNegocioCodigo?: string;
  centroNegocioNombre?: string;
}

interface SortableFlujoRowProps {
  flujo: FlujoMensual;
  tipo: "entrada" | "salida";
  canReorder: boolean;
}

export function SortableFlujoRow({ flujo, tipo, canReorder }: SortableFlujoRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: flujo.presupuestoId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hoverClass = tipo === "entrada" 
    ? "hover:bg-green-50/50 dark:hover:bg-green-950/20" 
    : "hover:bg-red-50/50 dark:hover:bg-red-950/20";

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        hoverClass,
        isDragging && "opacity-30 bg-muted"
      )}
    >
      {canReorder && (
        <TableCell className="w-[40px] sticky left-0 z-10 bg-background">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
            title="Arrastra para reordenar"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </TableCell>
      )}
      <TableCell className={cn("sticky z-10 bg-background", canReorder ? "left-[40px]" : "left-0", "pl-6")}>
        {flujo.partida}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {flujo.codigoCuenta}
      </TableCell>
      <TableCell className="text-center text-xs">
        {flujo.frecuencia}
      </TableCell>
      {flujo.meses.map((monto, i) => (
        <TableCell key={i} className={cn(
          "text-right font-mono text-sm",
          monto === 0 && "text-muted-foreground"
        )}>
          {monto !== 0 ? formatCurrency(monto) : "-"}
        </TableCell>
      ))}
    </TableRow>
  );
}
