import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Edit, Power, GripVertical, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Presupuesto {
  id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  activo: boolean;
  orden: number;
  ejercido?: number;
  porEjercer?: number;
  porcentaje?: number;
  cuentas_contables?: { codigo: string } | null;
  terceros?: { razon_social: string } | null;
  centros_negocio?: { codigo: string; nombre: string } | null;
  unidades_medida?: { codigo: string } | null;
}

interface SortablePresupuestoRowProps {
  presupuesto: Presupuesto;
  canEdit: boolean;
  canDelete?: boolean;
  formatCurrency: (value: number) => string;
  getProgressColor: (porcentaje: number) => string;
  onEdit: (p: Presupuesto) => void;
  onToggleActivo: (p: Presupuesto) => void;
}

export function SortablePresupuestoRow({
  presupuesto: p,
  canEdit,
  canDelete = false,
  formatCurrency,
  getProgressColor,
  onEdit,
  onToggleActivo,
}: SortablePresupuestoRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const presupuestado = p.cantidad * p.precio_unitario;
  const ejercido = p.ejercido || 0;
  const porEjercer = p.porEjercer || 0;
  const porcentaje = p.porcentaje || 0;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        !p.activo && "opacity-50",
        isDragging && "opacity-30 bg-muted"
      )}
    >
      {canEdit && (
        <TableCell className="w-[40px]">
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
      <TableCell>
        <div>
          <div className="font-medium">{p.partida}</div>
          {p.unidades_medida && (
            <div className="text-xs text-muted-foreground">
              {p.cantidad.toLocaleString("es-MX")} {p.unidades_medida.codigo}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {p.cuentas_contables ? (
          <span className="text-sm">{p.cuentas_contables.codigo}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {p.terceros ? (
          <span className="text-sm">{p.terceros.razon_social}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {p.centros_negocio ? (
          <span className="text-sm" title={p.centros_negocio.codigo}>
            {p.centros_negocio.nombre}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(presupuestado)}
      </TableCell>
      <TableCell className="text-right font-mono text-green-600">
        {formatCurrency(ejercido)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-mono",
          porEjercer < 0 && "text-destructive"
        )}
      >
        {formatCurrency(porEjercer)}
        {porEjercer < 0 && (
          <AlertTriangle className="h-3 w-3 inline ml-1 text-destructive" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={cn("h-full transition-all", getProgressColor(porcentaje))}
              style={{ width: `${Math.min(porcentaje, 100)}%` }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-medium min-w-[40px]",
              porcentaje > 100 && "text-destructive"
            )}
          >
            {porcentaje.toFixed(0)}%
          </span>
        </div>
      </TableCell>
      <TableCell>
        {porcentaje > 100 ? (
          <Badge variant="destructive">Sobregiro</Badge>
        ) : porcentaje >= 80 ? (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
            Alerta
          </Badge>
        ) : p.activo ? (
          <Badge variant="default">Activo</Badge>
        ) : (
          <Badge variant="secondary">Inactivo</Badge>
        )}
      </TableCell>
      {canEdit && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(p)}
              title="Editar"
            >
              <Edit className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onToggleActivo(p)}
                title={p.activo ? "Desactivar" : "Activar"}
              >
                <Power className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
