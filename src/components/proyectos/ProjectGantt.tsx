import { useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  addYears,
  startOfMonth,
  startOfWeek,
  startOfYear,
  isSameMonth,
  isSameWeek,
  isSameYear,
  format,
  differenceInCalendarDays,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarRange, Share2, FileDown, MessageCircle, Mail, Link as LinkIcon } from "lucide-react";

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

export interface CronogramaAcciones {
  onExportarPDF?: () => void;
  onCompartirWhatsApp?: () => void;
  onCompartirCorreo?: () => void;
  onCopiarLink?: () => void;
}

interface Props {
  filas: FilaGantt[];
  acciones?: CronogramaAcciones;
}

type Granularidad = "semana" | "mes" | "anio";

const LABEL_COL = "260px";

const GRANULARIDADES: { value: Granularidad; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "anio", label: "Año" },
];

const CONFIG: Record<
  Granularidad,
  {
    startOf: (d: Date) => Date;
    step: (d: Date, n: number) => Date;
    isCurrent: (d: Date, hoy: Date) => boolean;
    label: (d: Date) => string;
    pad: number;
    minWidth: number;
  }
> = {
  semana: {
    startOf: (d) => startOfWeek(d, { weekStartsOn: 1 }),
    step: (d, n) => addWeeks(d, n),
    isCurrent: (d, hoy) => isSameWeek(d, hoy, { weekStartsOn: 1 }),
    label: (d) => format(d, "dd MMM", { locale: es }),
    pad: 2,
    minWidth: 64,
  },
  mes: {
    startOf: startOfMonth,
    step: (d, n) => addMonths(d, n),
    isCurrent: (d, hoy) => isSameMonth(d, hoy),
    label: (d) => format(d, "MMM yy", { locale: es }),
    pad: 1,
    minWidth: 56,
  },
  anio: {
    startOf: startOfYear,
    step: (d, n) => addYears(d, n),
    isCurrent: (d, hoy) => isSameYear(d, hoy),
    label: (d) => format(d, "yyyy", { locale: es }),
    pad: 1,
    minWidth: 72,
  },
};

function parseLocal(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function CronogramaCard({
  children,
  granularidad,
  onGranularidadChange,
  acciones,
}: {
  children: React.ReactNode;
  granularidad: Granularidad;
  onGranularidadChange: (g: Granularidad) => void;
  acciones?: CronogramaAcciones;
}) {
  const tieneAcciones =
    acciones &&
    (acciones.onExportarPDF || acciones.onCompartirWhatsApp || acciones.onCompartirCorreo || acciones.onCopiarLink);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            Cronograma
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {GRANULARIDADES.map((g) => (
                <Button
                  key={g.value}
                  variant={granularidad === g.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => onGranularidadChange(g.value)}
                >
                  {g.label}
                </Button>
              ))}
            </div>
            {tieneAcciones && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs gap-1.5">
                    <Share2 className="h-3.5 w-3.5" />
                    Compartir
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {acciones?.onCompartirWhatsApp && (
                    <DropdownMenuItem onClick={acciones.onCompartirWhatsApp} className="gap-2">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </DropdownMenuItem>
                  )}
                  {acciones?.onCompartirCorreo && (
                    <DropdownMenuItem onClick={acciones.onCompartirCorreo} className="gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      Correo electrónico
                    </DropdownMenuItem>
                  )}
                  {acciones?.onExportarPDF && (
                    <DropdownMenuItem onClick={acciones.onExportarPDF} className="gap-2">
                      <FileDown className="h-3.5 w-3.5" />
                      Descargar PDF
                    </DropdownMenuItem>
                  )}
                  {acciones?.onCopiarLink && (
                    <DropdownMenuItem onClick={acciones.onCopiarLink} className="gap-2">
                      <LinkIcon className="h-3.5 w-3.5" />
                      Copiar link público
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ProjectGantt({ filas, acciones }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>(
    () => (localStorage.getItem("project_gantt_granularidad") as Granularidad) || "mes"
  );

  const handleGranularidadChange = (g: Granularidad) => {
    setGranularidad(g);
    localStorage.setItem("project_gantt_granularidad", g);
  };

  const cfg = CONFIG[granularidad];

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
    // Padding a cada lado para que las barras no queden pegadas al borde.
    const inicio = cfg.startOf(cfg.step(min, -cfg.pad));
    const fin = cfg.startOf(cfg.step(max, cfg.pad));
    return { inicio, fin };
  }, [conFechas, granularidad]);

  const periodos = useMemo(() => {
    if (!rango) return [];
    const result: Date[] = [];
    let cursor = rango.inicio;
    let guard = 0;
    while (cursor <= rango.fin && guard < 400) {
      result.push(cursor);
      cursor = cfg.step(cursor, 1);
      guard++;
    }
    return result;
  }, [rango, granularidad]);

  if (!rango || conFechas.length === 0) {
    return (
      <CronogramaCard granularidad={granularidad} onGranularidadChange={handleGranularidadChange} acciones={acciones}>
        <div className="text-sm text-muted-foreground py-6 text-center">
          Ninguna partida tiene fecha inicio y fecha fin definidas todavía.
        </div>
      </CronogramaCard>
    );
  }

  const totalDias = differenceInCalendarDays(rango.fin, rango.inicio) || 1;
  const hoy = new Date();
  const hoyPct = Math.min(100, Math.max(0, (differenceInCalendarDays(hoy, rango.inicio) / totalDias) * 100));
  const anchoMinimo = periodos.length * cfg.minWidth;

  const posicion = (f: FilaGantt) => {
    const inicio = parseLocal(f.fechaInicio!);
    const fin = parseLocal(f.fechaFin!);
    const left = (differenceInCalendarDays(inicio, rango.inicio) / totalDias) * 100;
    const width = Math.max(1.5, (differenceInCalendarDays(fin, inicio) / totalDias) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <CronogramaCard granularidad={granularidad} onGranularidadChange={handleGranularidadChange} acciones={acciones}>
      <ScrollArea className="w-full whitespace-nowrap">
        <div style={{ minWidth: `${Math.max(760, anchoMinimo + 260)}px` }}>
          {/* Header de periodos */}
          <div className="grid mb-1" style={{ gridTemplateColumns: `${LABEL_COL} 1fr` }}>
            <div />
            <div className="relative flex rounded-t-md overflow-hidden border border-b-0 border-border/60">
              {periodos.map((p, i) => {
                const esActual = cfg.isCurrent(p, hoy);
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 py-1.5 text-[11px] font-medium text-center capitalize border-l first:border-l-0 border-border/50",
                      esActual ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {cfg.label(p)}
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
                    {periodos.map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-border/40"
                        style={{ left: `${(i / periodos.length) * 100}%` }}
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
                        {periodos.map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-border/40"
                            style={{ left: `${(i / periodos.length) * 100}%` }}
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
