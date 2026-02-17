import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/date-utils";
import { FileSpreadsheet, FileText, TrendingUp, TrendingDown, DollarSign, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { format, startOfMonth, differenceInMonths } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Presupuesto {
  id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  frecuencia: "semanal" | "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | null;
  orden: number | null;
  cuenta?: {
    codigo: string;
    nombre: string;
  } | null;
  tercero?: {
    razon_social: string;
  } | null;
  centro_negocio?: {
    codigo: string;
    nombre: string;
  } | null;
}

interface FlujoEfectivoPresupuestoProps {
  presupuestos: Presupuesto[];
  loading?: boolean;
  empresaNombre: string;
  onOrderUpdate?: () => void;
}

type TipoFlujo = "entrada" | "salida";

interface FlujoMensual {
  presupuestoId: string;
  partida: string;
  codigoCuenta: string;
  nombreCuenta: string;
  tipo: TipoFlujo;
  montoTotal: number;
  frecuencia: string;
  meses: number[]; // 12 entries per year
  orden: number;
  centroNegocioCodigo: string;
  centroNegocioNombre: string;
}

interface GrupoCuenta {
  codigoCuenta: string;
  nombreCuenta: string;
  flujos: FlujoMensual[];
  totalMeses: number[];
}

// Determina si es entrada o salida basado en el código de cuenta
function determinarTipoFlujo(codigoCuenta: string): TipoFlujo {
  if (!codigoCuenta) return "salida";
  const primerDigito = codigoCuenta.charAt(0);
  if (primerDigito === "1" || primerDigito === "4") return "entrada";
  return "salida";
}

// Calcular la frecuencia en meses
function getFrecuenciaEnMeses(frecuencia: string | null): number {
  switch (frecuencia) {
    case "semanal": return 0.25;
    case "mensual": return 1;
    case "bimestral": return 2;
    case "trimestral": return 3;
    case "semestral": return 6;
    case "anual": return 12;
    default: return 1;
  }
}

// Nombre de la frecuencia
function getNombreFrecuencia(frecuencia: string | null): string {
  switch (frecuencia) {
    case "semanal": return "Semanal";
    case "mensual": return "Mensual";
    case "bimestral": return "Bimestral";
    case "trimestral": return "Trimestral";
    case "semestral": return "Semestral";
    case "anual": return "Anual";
    default: return "Mensual";
  }
}

// Generar años disponibles (current + 3 more = 4 years)
function getAnosDisponibles(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
}

const MESES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function FlujoEfectivoPresupuesto({
  presupuestos,
  loading,
  empresaNombre,
}: FlujoEfectivoPresupuestoProps) {
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entradas" | "salidas">("todos");
  const anosDisponibles = useMemo(() => getAnosDisponibles(), []);
  const [anosSeleccionados, setAnosSeleccionados] = useState<number[]>([new Date().getFullYear()]);
  const [expandedCuentas, setExpandedCuentas] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));

  const toggleCuenta = (key: string) => {
    setExpandedCuentas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  // All months across all selected years (for global totals)
  const allMeses = useMemo(() => {
    if (anosSeleccionados.length === 0) return [];
    const meses: Date[] = [];
    const sortedYears = [...anosSeleccionados].sort((a, b) => a - b);
    sortedYears.forEach(year => {
      for (let month = 0; month < 12; month++) {
        meses.push(new Date(year, month, 1));
      }
    });
    return meses;
  }, [anosSeleccionados]);

  const numMeses = allMeses.length;

  // Process presupuestos into monthly flows (same logic as before)
  const flujosMensuales = useMemo(() => {
    if (numMeses === 0) return [];
    const flujos: FlujoMensual[] = [];

    presupuestos.forEach((p) => {
      if (!p.fecha_inicio || !p.fecha_fin) return;
      const fechaInicio = parseLocalDate(p.fecha_inicio);
      const fechaFin = parseLocalDate(p.fecha_fin);
      const montoTotal = p.cantidad * p.precio_unitario;
      const codigoCuenta = p.cuenta?.codigo || "";
      const tipo = determinarTipoFlujo(codigoCuenta);
      const frecuencia = p.frecuencia || "mensual";
      const frecuenciaEnMeses = getFrecuenciaEnMeses(frecuencia);

      const mesesEnPeriodo = differenceInMonths(fechaFin, fechaInicio) + 1;
      let numOcurrencias: number;
      if (frecuencia === "semanal") {
        numOcurrencias = mesesEnPeriodo * 4;
      } else {
        numOcurrencias = Math.ceil(mesesEnPeriodo / frecuenciaEnMeses);
      }
      const montoPorOcurrencia = numOcurrencias > 0 ? montoTotal / numOcurrencias : montoTotal;

      const mesesMonto: number[] = new Array(numMeses).fill(0);

      allMeses.forEach((mesActual, index) => {
        const inicioMes = startOfMonth(mesActual);
        const mesEstaEnRango =
          (inicioMes >= startOfMonth(fechaInicio) && inicioMes <= fechaFin) ||
          (mesActual >= fechaInicio && mesActual <= fechaFin);
        if (!mesEstaEnRango) return;

        if (frecuencia === "semanal") {
          const montoSemanal = montoTotal / numOcurrencias;
          mesesMonto[index] = montoSemanal * 4;
        } else if (frecuencia === "mensual") {
          mesesMonto[index] = montoPorOcurrencia;
        } else {
          const mesesDesdeInicio = differenceInMonths(inicioMes, startOfMonth(fechaInicio));
          if (mesesDesdeInicio % frecuenciaEnMeses === 0) {
            mesesMonto[index] = montoPorOcurrencia;
          }
        }
      });

      if (mesesMonto.some(m => m !== 0)) {
        flujos.push({
          presupuestoId: p.id,
          partida: p.partida,
          codigoCuenta,
          nombreCuenta: p.cuenta?.nombre || "Sin cuenta",
          tipo,
          montoTotal,
          frecuencia: getNombreFrecuencia(frecuencia),
          meses: mesesMonto,
          orden: p.orden || 0,
          centroNegocioCodigo: p.centro_negocio?.codigo || "",
          centroNegocioNombre: p.centro_negocio?.nombre || "Sin centro",
        });
      }
    });

    return flujos.sort((a, b) => a.orden - b.orden);
  }, [presupuestos, allMeses, numMeses]);

  // Global totals
  const totalesMensuales = useMemo(() => {
    const entradas: number[] = new Array(numMeses).fill(0);
    const salidas: number[] = new Array(numMeses).fill(0);
    flujosMensuales.forEach((flujo) => {
      flujo.meses.forEach((monto, index) => {
        if (flujo.tipo === "entrada") entradas[index] += monto;
        else salidas[index] += monto;
      });
    });
    const saldos: number[] = [];
    let saldoAcumulado = 0;
    for (let i = 0; i < numMeses; i++) {
      saldoAcumulado += entradas[i] - salidas[i];
      saldos.push(saldoAcumulado);
    }
    return { entradas, salidas, saldos };
  }, [flujosMensuales, numMeses]);

  const totalesGenerales = useMemo(() => ({
    totalEntradas: totalesMensuales.entradas.reduce((a, b) => a + b, 0),
    totalSalidas: totalesMensuales.salidas.reduce((a, b) => a + b, 0),
    saldoFinal: totalesMensuales.saldos[numMeses - 1] || 0,
  }), [totalesMensuales, numMeses]);

  // Per-year data: extract 12-month slices for each selected year
  const sortedYears = useMemo(() => [...anosSeleccionados].sort((a, b) => a - b), [anosSeleccionados]);

  const yearData = useMemo(() => {
    return sortedYears.map((year, yearIdx) => {
      const startIdx = yearIdx * 12;
      const endIdx = startIdx + 12;

      // Slice flows for this year
      const yearEntradas: number[] = totalesMensuales.entradas.slice(startIdx, endIdx);
      const yearSalidas: number[] = totalesMensuales.salidas.slice(startIdx, endIdx);
      const yearSaldos: number[] = totalesMensuales.saldos.slice(startIdx, endIdx);

      // Group flows by cuenta for this year
      const entradasGrupos: Record<string, { flujos: FlujoMensual[]; meses12: number[][] }> = {};
      const salidasGrupos: Record<string, { flujos: FlujoMensual[]; meses12: number[][] }> = {};

      flujosMensuales.forEach(flujo => {
        const slice = flujo.meses.slice(startIdx, endIdx);
        if (slice.every(m => m === 0)) return;

        const target = flujo.tipo === "entrada" ? entradasGrupos : salidasGrupos;
        const key = flujo.codigoCuenta || "sin-cuenta";
        if (!target[key]) target[key] = { flujos: [], meses12: [] };
        target[key].flujos.push(flujo);
        target[key].meses12.push(slice);
      });

      const buildGrupos = (grupos: typeof entradasGrupos): GrupoCuenta[] =>
        Object.entries(grupos)
          .map(([codigoCuenta, { flujos, meses12 }]) => ({
            codigoCuenta,
            nombreCuenta: flujos[0]?.nombreCuenta || "Sin cuenta",
            flujos,
            totalMeses: meses12.reduce(
              (acc, m) => acc.map((v, i) => v + m[i]),
              new Array(12).fill(0)
            ),
          }))
          .sort((a, b) => a.codigoCuenta.localeCompare(b.codigoCuenta));

      return {
        year,
        startIdx,
        entradas: yearEntradas,
        salidas: yearSalidas,
        saldos: yearSaldos,
        gruposEntradas: buildGrupos(entradasGrupos),
        gruposSalidas: buildGrupos(salidasGrupos),
        totalEntradas: yearEntradas.reduce((a, b) => a + b, 0),
        totalSalidas: yearSalidas.reduce((a, b) => a + b, 0),
      };
    });
  }, [sortedYears, flujosMensuales, totalesMensuales]);

  // Export Excel
  const exportarExcel = () => {
    const detalleData = flujosMensuales.map((f) => {
      const fila: Record<string, any> = {
        Partida: f.partida,
        Cuenta: f.codigoCuenta,
        Tipo: f.tipo === "entrada" ? "Entrada" : "Salida",
        Frecuencia: f.frecuencia,
        "Monto Base": f.montoTotal,
      };
      allMeses.forEach((mes, i) => {
        fila[format(mes, "MMM yyyy", { locale: es })] = f.meses[i];
      });
      return fila;
    });
    const resumenData = allMeses.map((mes, i) => ({
      Mes: format(mes, "MMMM yyyy", { locale: es }),
      Entradas: totalesMensuales.entradas[i],
      Salidas: totalesMensuales.salidas[i],
      "Flujo Neto": totalesMensuales.entradas[i] - totalesMensuales.salidas[i],
      "Saldo Acumulado": totalesMensuales.saldos[i],
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenData), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleData), "Detalle");
    XLSX.writeFile(wb, `Flujo_Efectivo_${empresaNombre}.xlsx`);
  };

  // Export PDF
  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const anosLabel = anosSeleccionados.length > 0 ? anosSeleccionados.sort().join(", ") : "Sin años";
    doc.setFontSize(16);
    doc.text(`Flujo de Efectivo - Proyección ${anosLabel}`, pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(empresaNombre, pageWidth / 2, 22, { align: "center" });

    let startY = 30;
    yearData.forEach(yd => {
      const resumenData = yd.entradas.map((entrada, i) => [
        MESES_LABELS[i],
        formatCurrency(entrada),
        formatCurrency(yd.salidas[i]),
        formatCurrency(entrada - yd.salidas[i]),
        formatCurrency(yd.saldos[i]),
      ]);
      doc.setFontSize(12);
      doc.text(`${yd.year}`, 14, startY);
      autoTable(doc, {
        startY: startY + 4,
        head: [["Mes", "Entradas", "Salidas", "Flujo Neto", "Saldo Acumulado"]],
        body: resumenData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
      });
      startY = (doc as any).lastAutoTable.finalY + 10;
      if (startY > 170) {
        doc.addPage();
        startY = 15;
      }
    });

    doc.save(`Flujo_Efectivo_${empresaNombre}_${anosLabel}.pdf`);
  };

  // Render a cuenta group row for a specific year
  const renderGrupoCuentaYear = (
    grupo: GrupoCuenta,
    tipo: TipoFlujo,
    year: number,
    yearStartIdx: number
  ) => {
    const key = `${year}-${tipo}-${grupo.codigoCuenta}`;
    const isExpanded = expandedCuentas.has(key);
    const bgClass = tipo === "entrada"
      ? "bg-green-50/50 dark:bg-green-950/30 hover:bg-green-100/50 dark:hover:bg-green-950/40"
      : "bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100/50 dark:hover:bg-red-950/40";
    const textClass = tipo === "entrada"
      ? "text-green-800 dark:text-green-300"
      : "text-red-800 dark:text-red-300";

    return (
      <React.Fragment key={key}>
        <TableRow
          className={cn(bgClass, "cursor-pointer transition-colors")}
          onClick={() => toggleCuenta(key)}
        >
          <TableCell className="sticky left-0 z-10 pl-6" style={{ background: "inherit" }}>
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="font-medium">{grupo.codigoCuenta}</span>
              <span className={cn("text-sm", textClass)}>{grupo.nombreCuenta}</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({grupo.flujos.length} {grupo.flujos.length === 1 ? "partida" : "partidas"})
              </span>
            </div>
          </TableCell>
          <TableCell className="text-center text-xs text-muted-foreground">-</TableCell>
          {grupo.totalMeses.map((monto, i) => (
            <TableCell key={i} className={cn("text-right font-mono text-sm font-medium", monto === 0 && "text-muted-foreground", textClass)}>
              {monto !== 0 ? formatCurrency(monto) : "-"}
            </TableCell>
          ))}
        </TableRow>

        {isExpanded && grupo.flujos.map((flujo, fIdx) => {
          const slice = flujo.meses.slice(yearStartIdx, yearStartIdx + 12);
          return (
            <TableRow
              key={`${key}-${flujo.presupuestoId}-${fIdx}`}
              className={cn(
                tipo === "entrada"
                  ? "hover:bg-green-50/30 dark:hover:bg-green-950/10"
                  : "hover:bg-red-50/30 dark:hover:bg-red-950/10"
              )}
            >
              <TableCell className="sticky left-0 z-10 bg-background pl-12">
                <span className="text-sm">{flujo.partida}</span>
              </TableCell>
              <TableCell className="text-center text-xs text-muted-foreground">{flujo.frecuencia}</TableCell>
              {slice.map((monto, i) => (
                <TableCell key={i} className={cn("text-right font-mono text-sm", monto === 0 && "text-muted-foreground")}>
                  {monto !== 0 ? formatCurrency(monto) : "-"}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </React.Fragment>
    );
  };

  const mostrarEntradas = filtroTipo === "todos" || filtroTipo === "entradas";
  const mostrarSalidas = filtroTipo === "todos" || filtroTipo === "salidas";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">Total Entradas ({sortedYears.join(", ") || "Sin años"})</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 truncate">
                  {formatCurrency(totalesGenerales.totalEntradas)}
                </p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 opacity-50 shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">Total Salidas ({sortedYears.join(", ") || "Sin años"})</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 truncate">
                  {formatCurrency(totalesGenerales.totalSalidas)}
                </p>
              </div>
              <TrendingDown className="h-6 w-6 sm:h-8 sm:w-8 text-red-600 opacity-50 shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">Saldo Final Proyectado</p>
                <p className={cn(
                  "text-xl sm:text-2xl font-bold truncate",
                  totalesGenerales.saldoFinal >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {formatCurrency(totalesGenerales.saldoFinal)}
                </p>
              </div>
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-primary opacity-50 shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y acciones */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Filtro de años */}
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">Años:</span>
                <div className="flex gap-1 bg-muted p-1 rounded-lg">
                  {anosDisponibles.map((ano) => {
                    const isSelected = anosSeleccionados.includes(ano);
                    return (
                      <Button
                        key={ano}
                        variant={isSelected ? "default" : "ghost"}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            if (anosSeleccionados.length > 1) {
                              setAnosSeleccionados(prev => prev.filter(a => a !== ano));
                            }
                          } else {
                            setAnosSeleccionados(prev => [...prev, ano].sort());
                          }
                        }}
                        className="px-3 h-8"
                      >
                        {ano}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="hidden sm:block h-6 w-px bg-border" />

              {/* Filtro de tipo */}
              <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
                <Button variant={filtroTipo === "todos" ? "default" : "ghost"} onClick={() => setFiltroTipo("todos")} size="sm" className="h-8">Todos</Button>
                <Button variant={filtroTipo === "entradas" ? "default" : "ghost"} onClick={() => setFiltroTipo("entradas")} size="sm" className="gap-1 h-8">
                  <TrendingUp className="h-3.5 w-3.5" />Entradas
                </Button>
                <Button variant={filtroTipo === "salidas" ? "default" : "ghost"} onClick={() => setFiltroTipo("salidas")} size="sm" className="gap-1 h-8">
                  <TrendingDown className="h-3.5 w-3.5" />Salidas
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={exportarPDF} className="gap-1.5">
                <FileText className="h-4 w-4" />PDF
              </Button>
              <Button variant="default" size="sm" onClick={exportarExcel} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" />Excel
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedYears(new Set(sortedYears))}
                  className="text-xs"
                >
                  Expandir todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedYears(new Set())}
                  className="text-xs"
                >
                  Contraer todos
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Year blocks */}
      {anosSeleccionados.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Selecciona al menos un año para ver la proyección
            </div>
          </CardContent>
        </Card>
      ) : (
        yearData.map((yd) => {
          const isOpen = expandedYears.has(yd.year);
          const yearSaldo = yd.saldos[11] || 0;

          return (
            <Collapsible key={yd.year} open={isOpen} onOpenChange={() => toggleYear(yd.year)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        <CardTitle className="text-lg">
                          📊 Flujo de Efectivo {yd.year}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          ↑ {formatCurrency(yd.totalEntradas)}
                        </span>
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          ↓ {formatCurrency(yd.totalSalidas)}
                        </span>
                        <span className={cn(
                          "font-bold",
                          yearSaldo >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          = {formatCurrency(yearSaldo)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ScrollArea className="w-full whitespace-nowrap">
                      <div className="min-w-max">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="sticky left-0 z-10 bg-muted/50 min-w-[300px]">Cuenta / Concepto</TableHead>
                              <TableHead className="min-w-[80px] text-center">Frecuencia</TableHead>
                              {MESES_LABELS.map((label, i) => (
                                <TableHead key={i} className="min-w-[110px] text-right">{label}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {yd.gruposEntradas.length === 0 && yd.gruposSalidas.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                                  No hay presupuestos con datos para {yd.year}
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {/* ENTRADAS */}
                                {mostrarEntradas && yd.gruposEntradas.length > 0 && (
                                  <>
                                    <TableRow className="bg-green-100/50 dark:bg-green-950/40">
                                      <TableCell colSpan={14} className="sticky left-0 z-10 bg-green-100/50 dark:bg-green-950/40 font-bold text-green-800 dark:text-green-300">
                                        <div className="flex items-center gap-2">
                                          <TrendingUp className="h-4 w-4" />
                                          ENTRADAS DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {yd.gruposEntradas.map(g => renderGrupoCuentaYear(g, "entrada", yd.year, yd.startIdx))}
                                    <TableRow className="bg-green-50 dark:bg-green-950/30 font-semibold border-t-2 border-green-200 dark:border-green-800">
                                      <TableCell className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/30 pl-4" colSpan={2}>Total Entradas</TableCell>
                                      {yd.entradas.map((monto, i) => (
                                        <TableCell key={i} className="text-right font-mono text-green-700 dark:text-green-400">
                                          {monto !== 0 ? formatCurrency(monto) : "-"}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  </>
                                )}

                                {/* SALIDAS */}
                                {mostrarSalidas && yd.gruposSalidas.length > 0 && (
                                  <>
                                    <TableRow className="bg-red-100/50 dark:bg-red-950/40">
                                      <TableCell colSpan={14} className="sticky left-0 z-10 bg-red-100/50 dark:bg-red-950/40 font-bold text-red-800 dark:text-red-300">
                                        <div className="flex items-center gap-2">
                                          <TrendingDown className="h-4 w-4" />
                                          SALIDAS DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {yd.gruposSalidas.map(g => renderGrupoCuentaYear(g, "salida", yd.year, yd.startIdx))}
                                    <TableRow className="bg-red-50 dark:bg-red-950/30 font-semibold border-t-2 border-red-200 dark:border-red-800">
                                      <TableCell className="sticky left-0 z-10 bg-red-50 dark:bg-red-950/30 pl-4" colSpan={2}>Total Salidas</TableCell>
                                      {yd.salidas.map((monto, i) => (
                                        <TableCell key={i} className="text-right font-mono text-red-700 dark:text-red-400">
                                          {monto !== 0 ? formatCurrency(monto) : "-"}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  </>
                                )}

                                {/* FLUJO NETO */}
                                {filtroTipo === "todos" && (
                                  <>
                                    <TableRow className="bg-muted/30">
                                      <TableCell colSpan={14} className="sticky left-0 z-10 bg-muted/30 font-bold">
                                        <div className="flex items-center gap-2">
                                          <DollarSign className="h-4 w-4" />FLUJO DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    <TableRow className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                                      <TableCell className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30 pl-6" colSpan={2}>Flujo Neto del Período</TableCell>
                                      {yd.entradas.map((entrada, i) => {
                                        const neto = entrada - yd.salidas[i];
                                        return (
                                          <TableCell key={i} className={cn("text-right font-mono", neto >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                                            {neto !== 0 ? formatCurrency(neto) : "-"}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                    <TableRow className="bg-primary/10 font-bold text-base border-t-2 border-primary/30">
                                      <TableCell className="sticky left-0 z-10 bg-primary/10 pl-6" colSpan={2}>Saldo Acumulado</TableCell>
                                      {yd.saldos.map((saldo, i) => (
                                        <TableCell key={i} className={cn("text-right font-mono", saldo >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                                          {formatCurrency(saldo)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  </>
                                )}
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })
      )}
    </div>
  );
}
