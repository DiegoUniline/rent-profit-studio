import { Fragment } from "react";
import { formatDateNumeric } from "@/lib/date-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/accounting-utils";
import { agregarFinanciero } from "@/lib/project-utils";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import {
  claseTipoMovimiento,
  etiquetaTipoMovimiento,
  type TipoMovimientoValor,
} from "@/lib/tipo-movimiento";

export interface FilaResumenPartida {
  id: string;
  partida: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  responsable: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  presupuesto: number;
  proyectado: number;
  ejercido: number;
  avance: number;
  pendienteAjustar: boolean;
  vencida: boolean;
  tipoMovimiento?: TipoMovimientoValor;
}

interface Props {
  filas: FilaResumenPartida[];
  onEdit?: (presupuestoId: string) => void;
  readOnly?: boolean;
}

function avanceBadgeClass(avance: number) {
  if (avance > 100) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
  if (avance >= 100) return "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800";
  return "";
}

/** Avance agregado: promedio ponderado por presupuesto de los avances de cada
 * partida (así se respeta el avance manual / "Completada"). */
export function avancePonderado(filas: { presupuesto: number; avance: number }[]) {
  const base = filas.reduce((s, f) => s + f.presupuesto, 0);
  if (!base) {
    return filas.length ? filas.reduce((s, f) => s + f.avance, 0) / filas.length : 0;
  }
  return filas.reduce((s, f) => s + f.avance * f.presupuesto, 0) / base;
}

const ORDEN_TIPO: TipoMovimientoValor[] = ["ingreso", "egreso", "no_afecta", null];

function tipoOrden(t: TipoMovimientoValor | undefined): number {
  const idx = ORDEN_TIPO.indexOf(t ?? null);
  return idx === -1 ? 999 : idx;
}

export function ProjectSummaryTable({ filas, onEdit, readOnly }: Props) {
  // Agrupación: Tipo de movimiento -> Cuenta -> partidas
  const gruposPorTipo = new Map<TipoMovimientoValor, Map<string, FilaResumenPartida[]>>();
  filas.forEach((f) => {
    const tipo = f.tipoMovimiento ?? null;
    if (!gruposPorTipo.has(tipo)) gruposPorTipo.set(tipo, new Map());
    const gruposCuenta = gruposPorTipo.get(tipo)!;
    const key = f.cuentaCodigo || "sin-cuenta";
    if (!gruposCuenta.has(key)) gruposCuenta.set(key, []);
    gruposCuenta.get(key)!.push(f);
  });

  const totalGeneral = agregarFinanciero(filas.map((f) => ({ presupuesto: f.presupuesto, proyectado: f.proyectado, ejercido: f.ejercido })));

  return (
    <ScrollArea className="w-full whitespace-nowrap">
    <div className="min-w-max">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cuenta / Partida</TableHead>
          <TableHead className="w-32">Tipo</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead>Inicio</TableHead>
          <TableHead>Fin</TableHead>
          <TableHead className="text-right">Presupuesto</TableHead>
          <TableHead className="text-right">Proyectado</TableHead>
          <TableHead className="text-right">Ejercido</TableHead>
          <TableHead className="text-right">Disponible</TableHead>
          <TableHead className="text-right">Avance</TableHead>
          {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...gruposPorTipo.entries()]
          .sort(([a], [b]) => tipoOrden(a) - tipoOrden(b))
          .map(([tipo, gruposCuenta]) => {
            const itemsTipo = [...gruposCuenta.values()].flat();
            const totalTipo = agregarFinanciero(
              itemsTipo.map((i) => ({ presupuesto: i.presupuesto, proyectado: i.proyectado, ejercido: i.ejercido }))
            );
            return (
              <Fragment key={`tipo-${tipo ?? "pendiente"}`}>
                <TableRow className="bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold border-y-2 border-emerald-100 dark:border-emerald-900/40">
                  <TableCell colSpan={readOnly ? 9 : 10}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-xs px-2 py-0.5", claseTipoMovimiento(tipo))}>
                        {etiquetaTipoMovimiento(tipo)}
                      </Badge>
                      <span className="text-emerald-900 dark:text-emerald-100 text-sm">
                        {itemsTipo.length} partida{itemsTipo.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {[...gruposCuenta.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([codigo, items]) => {
                    const agregadoCuenta = agregarFinanciero(
                      items.map((i) => ({ presupuesto: i.presupuesto, proyectado: i.proyectado, ejercido: i.ejercido }))
                    );
                    return (
                      <Fragment key={`cuenta-${codigo}-${tipo ?? "pendiente"}`}>
                        <TableRow className="bg-muted/40 font-medium">
                          <TableCell colSpan={4}>
                            {codigo !== "sin-cuenta" ? `${codigo} ${items[0].cuentaNombre}` : "Sin cuenta"}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(agregadoCuenta.presupuesto)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(agregadoCuenta.proyectado)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(agregadoCuenta.ejercido)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right",
                              agregadoCuenta.disponible < 0 && "text-red-600 dark:text-red-400"
                            )}
                          >
                            {formatCurrency(agregadoCuenta.disponible)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={avanceBadgeClass(avancePonderado(items))}>
                              {avancePonderado(items).toFixed(1)}%
                            </Badge>
                          </TableCell>
                          {!readOnly && <TableCell />}
                        </TableRow>
                        {items.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="pl-8 text-sm">{f.partida}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-xs px-1.5 py-0", claseTipoMovimiento(f.tipoMovimiento))}>
                                {etiquetaTipoMovimiento(f.tipoMovimiento)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {f.responsable || <span className="text-muted-foreground">Sin responsable</span>}
                            </TableCell>
                            <TableCell className="text-sm">{f.fechaInicio ? formatDateNumeric(f.fechaInicio) : "-"}</TableCell>
                            <TableCell className="text-sm">
                              <span className={f.vencida ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                                {f.fechaFin ? formatDateNumeric(f.fechaFin) : "-"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(f.presupuesto)}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(f.proyectado)}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(f.ejercido)}</TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm",
                                f.presupuesto - f.ejercido < 0 && "text-red-600 dark:text-red-400"
                              )}
                            >
                              {formatCurrency(f.presupuesto - f.ejercido)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Badge variant="outline" className={avanceBadgeClass(f.avance)}>
                                  {f.avance.toFixed(1)}%
                                </Badge>
                                {f.pendienteAjustar && (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                    title="La suma programada no coincide con el presupuesto autorizado vigente de esta partida"
                                  >
                                    Programación pendiente de ajustar
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            {!readOnly && (
                              <TableCell className="text-right">
                                {onEdit && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(f.id)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                <TableRow className="bg-emerald-50/30 dark:bg-emerald-950/10 font-medium border-t border-emerald-100 dark:border-emerald-900/30">
                  <TableCell colSpan={4}>Total {etiquetaTipoMovimiento(tipo)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalTipo.presupuesto)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalTipo.proyectado)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalTipo.ejercido)}</TableCell>
                  <TableCell
                    className={cn("text-right", totalTipo.disponible < 0 && "text-red-600 dark:text-red-400")}
                  >
                    {formatCurrency(totalTipo.disponible)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={avanceBadgeClass(avancePonderado(itemsTipo))}>
                      {avancePonderado(itemsTipo).toFixed(1)}%
                    </Badge>
                  </TableCell>
                  {!readOnly && <TableCell />}
                </TableRow>
              </Fragment>
            );
          })}
        <TableRow className="bg-primary/5 font-semibold border-t-2 border-primary/20">
          <TableCell colSpan={readOnly ? 9 : 10}>Total del Project</TableCell>
          <TableCell className="text-right">{formatCurrency(totalGeneral.presupuesto)}</TableCell>
          <TableCell className="text-right">{formatCurrency(totalGeneral.proyectado)}</TableCell>
          <TableCell className="text-right">{formatCurrency(totalGeneral.ejercido)}</TableCell>
          <TableCell className={cn("text-right", totalGeneral.disponible < 0 && "text-red-600 dark:text-red-400")}>
            {formatCurrency(totalGeneral.disponible)}
          </TableCell>
          <TableCell className="text-right">
            <Badge variant="outline" className={avanceBadgeClass(avancePonderado(filas))}>
              {avancePonderado(filas).toFixed(1)}%
            </Badge>
          </TableCell>
          {!readOnly && <TableCell />}
        </TableRow>
      </TableBody>
    </Table>
    </div>
    <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
