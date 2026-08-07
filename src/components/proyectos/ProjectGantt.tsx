import { useMemo } from "react";
import { addMonths, startOfMonth, format, differenceInCalendarDays, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CalendarRange } from "lucide-react";

export interface FilaGantt {
  id: string;
  partida: string;
  cuentaCodigo: string;
  cuentaNombre?: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  avance: number;
  vencida: boolean;
}

interface Props {
  filas: FilaGantt[];
}

const LABEL_COL = "260px";

function parseLocal(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function CronogramaCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          Cronograma
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ProjectGantt({ filas }: Props) {
  const conFechas = useMemo(
    () => filas.filter((f) => f.fechaInicio && f.fechaFin).sort((a, b) => (a.fechaInicio! < b.fechaInicio! ? -1 : 1)),
    [filas]
  );

  const grupos = useMemo(() => {
    const map = new Map<string, FilaGantt[]>();
    conFechas.forEach((f) => {
      const key = f.cuentaCodigo || "sin-cuenta";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [conFechas]);

  const rango = useMemo(() => {
    if (conFechas.length === 0) return null;
    let min = parseLocal(conFechas[0].fechaInicio!);
    let max = parseLocal(conFechas[0].fechaFin!);
    conFechas.forEach((f) => {
      const inicio = parseLocal(f.fechaInicio!);
      const fin = parseLocal(f.fechaFin!);
      if (inicio < min) min = inicio;
      if (fin > max) max = fin;
    });
    // Padding de un mes a cada lado para que las barras no queden pegadas al borde.
    const inicio = startOfMonth(addMonths(min, -1));
    const fin = startOfMonth(addMonths(max, 1));
    return { inicio, fin };
  }, [conFechas]);

  const meses = useMemo(() => {
    if (!rango) return [];
    const result: Date[] = [];
    let cursor = rango.inicio;
    let guard = 0;
    while (cursor <= rango.fin && guard < 60) {
      result.push(cursor);
      cursor = addMonths(cursor, 1);
      guard++;
    }
    return result;
  }, [rango]);

  if (!rango || conFechas.length === 0) {
    return (
      <CronogramaCard>
        <div className="text-sm text-muted-foreground py-6 text-center">
          Ninguna partida tiene fecha inicio y fecha fin definidas todavía.
        </div>
      </CronogramaCard>
    );
  }

  const totalDias = differenceInCalendarDays(rango.fin, rango.inicio) || 1;
  const hoy = new Date();
  const hoyPct = Math.min(100, Math.max(0, (differenceInCalendarDays(hoy, rango.inicio) / totalDias) * 100));

  const posicion = (f: FilaGantt) => {
    const inicio = parseLocal(f.fechaInicio!);
    const fin = parseLocal(f.fechaFin!);
    const left = (differenceInCalendarDays(inicio, rango.inicio) / totalDias) * 100;
    const width = Math.max(1.5, (differenceInCalendarDays(fin, inicio) / totalDias) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <CronogramaCard>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="min-w-[760px]">
          {/* Header de meses */}
          <div className="grid mb-1" style={{ gridTemplateColumns: `${LABEL_COL} 1fr` }}>
            <div />
            <div className="relative flex rounded-t-md overflow-hidden border border-b-0 border-border/60">
              {meses.map((m, i) => {
                const esMesActual = isSameMonth(m, hoy);
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 py-1.5 text-[11px] font-medium text-center capitalize border-l first:border-l-0 border-border/50",
                      esMesActual ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {format(m, "MMM yy", { locale: es })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative rounded-md border border-border/60 overflow-hidden">
            {/* Línea de "hoy", superpuesta a todas las filas */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-foreground/40"
              style={{ left: `calc(${LABEL_COL} + (100% - ${LABEL_COL}) * ${hoyPct / 100})` }}
            />

            {grupos.map(([codigo, items], gIdx) => (
              <div key={codigo}>
                {/* Encabezado de cuenta */}
                <div
                  className="grid items-center bg-muted/50 border-b border-border/50"
                  style={{ gridTemplateColumns: `${LABEL_COL} 1fr` }}
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-foreground/80 truncate">
                    {codigo !== "sin-cuenta" ? codigo : "Sin cuenta"}
                    {items[0].cuentaNombre ? ` · ${items[0].cuentaNombre}` : ""}
                  </div>
                  <div className="relative h-full min-h-[26px]">
                    {meses.map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-border/40"
                        style={{ left: `${(i / meses.length) * 100}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Filas de partidas */}
                {items.map((f, rIdx) => {
                  const pos = posicion(f);
                  const barClass = f.vencida
                    ? "bg-gradient-to-r from-red-500 to-red-400 dark:from-red-500 dark:to-red-400"
                    : f.avance >= 100
                    ? "bg-gradient-to-r from-green-600 to-green-500 dark:from-green-500 dark:to-green-400"
                    : "bg-gradient-to-r from-primary to-primary/80";
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "grid items-center",
                        rIdx % 2 === 1 && "bg-muted/20",
                        (gIdx < grupos.length - 1 || rIdx < items.length - 1) && "border-b border-border/30"
                      )}
                      style={{ gridTemplateColumns: `${LABEL_COL} 1fr` }}
                    >
                      <div className="px-2.5 py-2 text-xs truncate" title={f.partida}>
                        {f.partida}
                      </div>
                      <div className="relative h-8">
                        {meses.map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-border/40"
                            style={{ left: `${(i / meses.length) * 100}%` }}
                          />
                        ))}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute top-1.5 bottom-1.5 rounded-full shadow-sm ring-1 ring-black/5 cursor-default",
                                  barClass
                                )}
                                style={pos}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {f.fechaInicio} a {f.fechaFin} · Avance {f.avance.toFixed(0)}%
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary inline-block" />En curso
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Completada (100%+)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Vencida
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-px border-l-2 border-dashed border-foreground/50 inline-block" />Hoy
        </div>
      </div>
    </CronogramaCard>
  );
}
