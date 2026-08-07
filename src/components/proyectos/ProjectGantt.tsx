import { useMemo } from "react";
import { addMonths, startOfMonth, format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface FilaGantt {
  id: string;
  partida: string;
  cuentaCodigo: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  avance: number;
  vencida: boolean;
}

interface Props {
  filas: FilaGantt[];
}

function parseLocal(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export function ProjectGantt({ filas }: Props) {
  const conFechas = useMemo(
    () => filas.filter((f) => f.fechaInicio && f.fechaFin).sort((a, b) => (a.fechaInicio! < b.fechaInicio! ? -1 : 1)),
    [filas]
  );

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cronograma</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-6 text-center">
          Ninguna partida tiene fecha inicio y fecha fin definidas todavía.
        </CardContent>
      </Card>
    );
  }

  const totalDias = differenceInCalendarDays(rango.fin, rango.inicio) || 1;
  const hoy = new Date();
  const hoyPct = Math.min(100, Math.max(0, (differenceInCalendarDays(hoy, rango.inicio) / totalDias) * 100));

  const posicion = (f: FilaGantt) => {
    const inicio = parseLocal(f.fechaInicio!);
    const fin = parseLocal(f.fechaFin!);
    const left = (differenceInCalendarDays(inicio, rango.inicio) / totalDias) * 100;
    const width = Math.max(1, (differenceInCalendarDays(fin, inicio) / totalDias) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cronograma</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Header de meses */}
            <div className="grid grid-cols-[220px_1fr] mb-2">
              <div />
              <div className="relative flex border-b pb-1">
                {meses.map((m, i) => (
                  <div
                    key={i}
                    className="flex-1 text-xs text-muted-foreground text-center capitalize border-l first:border-l-0"
                  >
                    {format(m, "MMM yy", { locale: es })}
                  </div>
                ))}
              </div>
            </div>

            {/* Filas */}
            <div className="space-y-1.5">
              {conFechas.map((f) => {
                const pos = posicion(f);
                const barColor = f.vencida
                  ? "bg-red-400 dark:bg-red-600"
                  : f.avance >= 100
                  ? "bg-green-500 dark:bg-green-600"
                  : "bg-primary";
                return (
                  <div key={f.id} className="grid grid-cols-[220px_1fr] items-center gap-2">
                    <div className="text-xs truncate pr-2" title={f.partida}>
                      <span className="text-muted-foreground">{f.cuentaCodigo}</span> {f.partida}
                    </div>
                    <div className="relative h-5 bg-muted/40 rounded">
                      {meses.map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-l border-border/50"
                          style={{ left: `${(i / meses.length) * 100}%` }}
                        />
                      ))}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-foreground/40 z-10"
                        style={{ left: `${hoyPct}%` }}
                      />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn("absolute top-0.5 bottom-0.5 rounded", barColor)}
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
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-primary inline-block" />En curso
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-green-500 inline-block" />Completada (100%+)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-red-400 inline-block" />Vencida
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-px bg-foreground/40 inline-block" />Hoy
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
