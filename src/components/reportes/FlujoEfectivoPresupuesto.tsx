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
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency, Movimiento, AsientoContable } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, FileText, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronRight, Lock, ArrowRightLeft, Zap } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface FlujoProgramado {
  id: string;
  presupuesto_id: string | null;
  fecha: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  descripcion: string | null;
  auto_generado?: boolean;
  empresa_id?: string | null;
}

interface Presupuesto {
  id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  orden: number | null;
  cuenta?: {
    codigo: string;
    nombre: string;
  } | null;
  centro_negocio?: {
    codigo: string;
    nombre: string;
  } | null;
}

interface FlujoEfectivoPresupuestoProps {
  presupuestos: Presupuesto[];
  flujosProgramados: FlujoProgramado[];
  movimientos?: Movimiento[];
  asientos?: AsientoContable[];
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
  meses: number[]; // indexed by global month index
  mesesEjercido: number[];
  mesesAjustado: number[]; // ejercido for closed, programmed for future
  orden: number;
  autoGenerado?: boolean;
}

interface GrupoCuenta {
  codigoCuenta: string;
  nombreCuenta: string;
  flujos: FlujoMensual[];
  totalMeses: number[];
}

const MESES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function isMesCerrado(date: Date): boolean {
  const now = new Date();
  return date < startOfMonth(now);
}

function isMesActual(date: Date): boolean {
  const now = new Date();
  const start = startOfMonth(now);
  return date.getFullYear() === start.getFullYear() && date.getMonth() === start.getMonth();
}

function getEjercidoFromMovimiento(mov: any, _codigoCuenta: string): number {
  // debe and haber are mutually exclusive per row, so sum captures the actual amount
  return Number(mov.debe) + Number(mov.haber);
}

export function FlujoEfectivoPresupuesto({
  presupuestos,
  flujosProgramados,
  movimientos = [],
  asientos = [],
  loading,
  empresaNombre,
}: FlujoEfectivoPresupuestoProps) {
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entradas" | "salidas">("todos");
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

  // Auto-detect years from flujos_programados dates
  const detectedYears = useMemo(() => {
    const yearsSet = new Set<number>();
    flujosProgramados.forEach(f => {
      const year = parseInt(f.fecha.substring(0, 4));
      if (!isNaN(year)) yearsSet.add(year);
    });
    // Always include current year
    yearsSet.add(new Date().getFullYear());
    return [...yearsSet].sort((a, b) => a - b);
  }, [flujosProgramados]);

  // Build asiento map for date lookup
  const asientoMap = useMemo(() => {
    const map = new Map<string, AsientoContable>();
    asientos.forEach(a => map.set(a.id, a));
    return map;
  }, [asientos]);

  // Build ejercido per presupuesto per month
  const ejercidoPorPresupuestoMes = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    movimientos.forEach(mov => {
      const movAny = mov as any;
      if (!movAny.presupuesto_id) return;
      const asiento = asientoMap.get(mov.asiento_id);
      if (!asiento || asiento.estado !== "aplicado") return;
      const fechaAsiento = new Date(asiento.fecha + "T00:00:00");
      const mesKey = format(fechaAsiento, "yyyy-MM");
      const presupuesto = presupuestos.find(p => p.id === movAny.presupuesto_id);
      const codigoCuenta = presupuesto?.cuenta?.codigo || "";
      const monto = getEjercidoFromMovimiento(mov, codigoCuenta);
      if (!result.has(movAny.presupuesto_id)) {
        result.set(movAny.presupuesto_id, new Map());
      }
      const mesMap = result.get(movAny.presupuesto_id)!;
      mesMap.set(mesKey, (mesMap.get(mesKey) || 0) + monto);
    });
    return result;
  }, [movimientos, asientoMap, presupuestos]);

  // Group flujos by presupuesto, then distribute into months per year
  const flujosMensuales = useMemo(() => {
    // Separate budget-linked and auto-generated flujos
    const flujosByPresupuesto = new Map<string, FlujoProgramado[]>();
    const autoFlujos: FlujoProgramado[] = [];

    flujosProgramados.forEach(f => {
      if (f.auto_generado && !f.presupuesto_id) {
        autoFlujos.push(f);
      } else if (f.presupuesto_id) {
        if (!flujosByPresupuesto.has(f.presupuesto_id)) {
          flujosByPresupuesto.set(f.presupuesto_id, []);
        }
        flujosByPresupuesto.get(f.presupuesto_id)!.push(f);
      }
    });

    const allFlujos: FlujoMensual[] = [];
    const numMonths = detectedYears.length * 12;

    // Process budget-linked flujos
    flujosByPresupuesto.forEach((flujos, presupuestoId) => {
      const presupuesto = presupuestos.find(p => p.id === presupuestoId);
      if (!presupuesto) return;

      const codigoCuenta = presupuesto.cuenta?.codigo || "";
      const primerFlujo = flujos[0];
      const tipo: TipoFlujo = primerFlujo.tipo === "ingreso" ? "entrada" : "salida";

      const meses = new Array(numMonths).fill(0);
      const mesesEjercido = new Array(numMonths).fill(0);
      const mesesAjustado = new Array(numMonths).fill(0);

      flujos.forEach(f => {
        const fecha = new Date(f.fecha + "T00:00:00");
        const year = fecha.getFullYear();
        const month = fecha.getMonth();
        const yearIdx = detectedYears.indexOf(year);
        if (yearIdx === -1) return;
        const globalIdx = yearIdx * 12 + month;
        meses[globalIdx] += f.monto;
      });

      const ejercidoMap = ejercidoPorPresupuestoMes.get(presupuestoId);
      detectedYears.forEach((year, yearIdx) => {
        for (let month = 0; month < 12; month++) {
          const mesKey = `${year}-${String(month + 1).padStart(2, "0")}`;
          const globalIdx = yearIdx * 12 + month;
          if (ejercidoMap?.has(mesKey)) {
            mesesEjercido[globalIdx] = ejercidoMap.get(mesKey)!;
          }
        }
      });

      detectedYears.forEach((year, yearIdx) => {
        for (let month = 0; month < 12; month++) {
          const globalIdx = yearIdx * 12 + month;
          const monthDate = new Date(year, month, 1);
          if (isMesCerrado(monthDate) || isMesActual(monthDate)) {
            // Closed or current month: ALWAYS use real (ejercido), even if 0
            mesesAjustado[globalIdx] = mesesEjercido[globalIdx];
          } else {
            // Future month: use programmed
            mesesAjustado[globalIdx] = meses[globalIdx];
          }
        }
      });

      if (mesesAjustado.some(m => m !== 0) || meses.some(m => m !== 0)) {
        allFlujos.push({
          presupuestoId,
          partida: presupuesto.partida,
          codigoCuenta,
          nombreCuenta: presupuesto.cuenta?.nombre || "Sin cuenta",
          tipo,
          meses,
          mesesEjercido,
          mesesAjustado,
          orden: presupuesto.orden || 0,
        });
      }
    });

    // Process auto-generated IVA flujos - group by descripcion pattern
    if (autoFlujos.length > 0) {
      // Group by tipo (ingreso/egreso) and month
      const ivaIngresos = new Array(numMonths).fill(0);
      const ivaEgresos = new Array(numMonths).fill(0);

      autoFlujos.forEach(f => {
        const fecha = new Date(f.fecha + "T00:00:00");
        const year = fecha.getFullYear();
        const month = fecha.getMonth();
        const yearIdx = detectedYears.indexOf(year);
        if (yearIdx === -1) return;
        const globalIdx = yearIdx * 12 + month;
        if (f.tipo === "ingreso") {
          ivaIngresos[globalIdx] += f.monto;
        } else {
          ivaEgresos[globalIdx] += f.monto;
        }
      });

      if (ivaIngresos.some(m => m !== 0)) {
        allFlujos.push({
          presupuestoId: "iva-trasladado-auto",
          partida: "IVA Trasladado (Auto)",
          codigoCuenta: "IVA",
          nombreCuenta: "IVA Trasladado",
          tipo: "entrada",
          meses: ivaIngresos,
          mesesEjercido: ivaIngresos, // auto-generated = already real
          mesesAjustado: ivaIngresos,
          orden: 99990,
          autoGenerado: true,
        });
      }

      if (ivaEgresos.some(m => m !== 0)) {
        allFlujos.push({
          presupuestoId: "iva-favor-auto",
          partida: "IVA a Favor (Auto)",
          codigoCuenta: "IVA",
          nombreCuenta: "IVA a Favor",
          tipo: "salida",
          meses: ivaEgresos,
          mesesEjercido: ivaEgresos,
          mesesAjustado: ivaEgresos,
          orden: 99991,
          autoGenerado: true,
        });
      }
    }

    return allFlujos.sort((a, b) => a.orden - b.orden);
  }, [presupuestos, flujosProgramados, detectedYears, ejercidoPorPresupuestoMes]);

  // Per-year data
  const yearData = useMemo(() => {
    return detectedYears.map((year, yearIdx) => {
      const startIdx = yearIdx * 12;

      const entradas = new Array(12).fill(0);
      const salidas = new Array(12).fill(0);

      flujosMensuales.forEach(flujo => {
        for (let i = 0; i < 12; i++) {
          const globalIdx = startIdx + i;
          const val = flujo.mesesAjustado[globalIdx] || 0;
          if (flujo.tipo === "entrada") entradas[i] += val;
          else salidas[i] += val;
        }
      });

      const saldos: number[] = [];
      // For accumulated balance, carry from previous year
      const prevYearLastSaldo = yearIdx > 0 ? (() => {
        // Sum all prior years
        let acc = 0;
        for (let py = 0; py < yearIdx; py++) {
          for (let m = 0; m < 12; m++) {
            const gi = py * 12 + m;
            flujosMensuales.forEach(f => {
              const v = f.mesesAjustado[gi] || 0;
              if (f.tipo === "entrada") acc += v;
              else acc -= v;
            });
          }
        }
        return acc;
      })() : 0;

      let saldoAcumulado = prevYearLastSaldo;
      for (let i = 0; i < 12; i++) {
        saldoAcumulado += entradas[i] - salidas[i];
        saldos.push(saldoAcumulado);
      }

      // Group by cuenta
      const entradasGrupos: Record<string, { flujos: FlujoMensual[]; meses12: number[][] }> = {};
      const salidasGrupos: Record<string, { flujos: FlujoMensual[]; meses12: number[][] }> = {};

      flujosMensuales.forEach(flujo => {
        const slice = flujo.mesesAjustado.slice(startIdx, startIdx + 12);
        const sliceOrig = flujo.meses.slice(startIdx, startIdx + 12);
        if (slice.every(m => m === 0) && sliceOrig.every(m => m === 0)) return;

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
        entradas,
        salidas,
        saldos,
        gruposEntradas: buildGrupos(entradasGrupos),
        gruposSalidas: buildGrupos(salidasGrupos),
        totalEntradas: entradas.reduce((a, b) => a + b, 0),
        totalSalidas: salidas.reduce((a, b) => a + b, 0),
      };
    });
  }, [detectedYears, flujosMensuales]);

  // Global totals
  const totalesGenerales = useMemo(() => {
    let totalEntradas = 0;
    let totalSalidas = 0;
    yearData.forEach(yd => {
      totalEntradas += yd.totalEntradas;
      totalSalidas += yd.totalSalidas;
    });
    const lastYear = yearData[yearData.length - 1];
    const saldoFinal = lastYear?.saldos[11] || 0;
    return { totalEntradas, totalSalidas, saldoFinal };
  }, [yearData]);

  // Export Excel
  const exportarExcel = () => {
    const resumenData: any[] = [];
    yearData.forEach(yd => {
      for (let i = 0; i < 12; i++) {
        const monthDate = new Date(yd.year, i, 1);
        resumenData.push({
          Año: yd.year,
          Mes: format(monthDate, "MMMM", { locale: es }),
          Estado: isMesCerrado(monthDate) ? "Cerrado (Real)" : "Proyectado",
          Entradas: yd.entradas[i],
          Salidas: yd.salidas[i],
          "Flujo Neto": yd.entradas[i] - yd.salidas[i],
          "Saldo Acumulado": yd.saldos[i],
        });
      }
    });

    const detalleData = flujosProgramados.map(f => {
      const p = presupuestos.find(p => p.id === f.presupuesto_id);
      return {
        Partida: p?.partida || "",
        Cuenta: p?.cuenta?.codigo || "",
        Fecha: f.fecha,
        Monto: f.monto,
        Tipo: f.tipo === "ingreso" ? "Entrada" : "Salida",
        Descripcion: f.descripcion || "",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenData), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleData), "Detalle");
    XLSX.writeFile(wb, `Flujo_Efectivo_${empresaNombre}.xlsx`);
  };

  // Export PDF
  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const yearsLabel = detectedYears.join(", ");
    doc.setFontSize(16);
    doc.text(`Flujo de Efectivo - ${yearsLabel}`, pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(empresaNombre, pageWidth / 2, 22, { align: "center" });

    let startY = 30;
    yearData.forEach(yd => {
      const data = yd.entradas.map((entrada, i) => {
        const monthDate = new Date(yd.year, i, 1);
        const cerrado = isMesCerrado(monthDate);
        return [
          `${MESES_LABELS[i]}${cerrado ? " ✓" : ""}`,
          formatCurrency(entrada),
          formatCurrency(yd.salidas[i]),
          formatCurrency(entrada - yd.salidas[i]),
          formatCurrency(yd.saldos[i]),
        ];
      });
      doc.setFontSize(12);
      doc.text(`${yd.year}`, 14, startY);
      autoTable(doc, {
        startY: startY + 4,
        head: [["Mes", "Entradas", "Salidas", "Flujo Neto", "Saldo Acumulado"]],
        body: data,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
      });
      startY = (doc as any).lastAutoTable.finalY + 10;
      if (startY > 170) {
        doc.addPage();
        startY = 15;
      }
    });

    doc.save(`Flujo_Efectivo_${empresaNombre}_${yearsLabel}.pdf`);
  };

  const renderMesHeader = (monthIndex: number, year: number) => {
    const monthDate = new Date(year, monthIndex, 1);
    const cerrado = isMesCerrado(monthDate);
    const actual = isMesActual(monthDate);
    const esReal = cerrado || actual;
    return (
      <TableHead key={monthIndex} className="min-w-[110px] text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span>{MESES_LABELS[monthIndex]}</span>
          {esReal ? (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              <Lock className="h-2.5 w-2.5 mr-0.5" />{actual ? "Parcial" : "Real"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
              <ArrowRightLeft className="h-2.5 w-2.5 mr-0.5" />Proy.
            </Badge>
          )}
        </div>
      </TableHead>
    );
  };

  const renderMontoCell = (monto: number, year: number, monthIndex: number, textClass?: string) => {
    const monthDate = new Date(year, monthIndex, 1);
    const cerrado = isMesCerrado(monthDate);
    return (
      <TableCell
        className={cn(
          "text-right font-mono text-sm",
          monto === 0 && "text-muted-foreground",
          cerrado && "bg-blue-50/30 dark:bg-blue-950/10",
          textClass
        )}
      >
        {monto !== 0 ? formatCurrency(monto) : "-"}
      </TableCell>
    );
  };

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
              {grupo.flujos.some(f => f.autoGenerado) && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                  <Zap className="h-2.5 w-2.5 mr-0.5" />Auto IVA
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-2">
                ({grupo.flujos.length} {grupo.flujos.length === 1 ? "partida" : "partidas"})
              </span>
            </div>
          </TableCell>
          {grupo.totalMeses.map((monto, i) => renderMontoCell(monto, year, i, textClass))}
        </TableRow>

        {isExpanded && grupo.flujos.map((flujo, fIdx) => {
          const sliceAjustado = flujo.mesesAjustado.slice(yearStartIdx, yearStartIdx + 12);
          const sliceOrig = flujo.meses.slice(yearStartIdx, yearStartIdx + 12);
          return (
            <React.Fragment key={`${key}-${flujo.presupuestoId}-${fIdx}`}>
              <TableRow
                className={cn(
                  tipo === "entrada"
                    ? "hover:bg-green-50/30 dark:hover:bg-green-950/10"
                    : "hover:bg-red-50/30 dark:hover:bg-red-950/10"
                )}
              >
                <TableCell className="sticky left-0 z-10 bg-background pl-12">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{flujo.partida}</span>
                    {flujo.autoGenerado && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                        <Zap className="h-2.5 w-2.5 mr-0.5" />Auto
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {sliceAjustado.map((monto, i) => {
                  const monthDate = new Date(year, i, 1);
                  const cerrado = isMesCerrado(monthDate);
                  const original = sliceOrig[i];
                  return (
                    <TableCell
                      key={i}
                      className={cn(
                        "text-right font-mono text-sm",
                        monto === 0 && "text-muted-foreground",
                        cerrado && "bg-blue-50/30 dark:bg-blue-950/10"
                      )}
                      title={cerrado
                        ? `Real: ${formatCurrency(monto)} | Programado: ${formatCurrency(original)}`
                        : `Programado: ${formatCurrency(monto)}`
                      }
                    >
                      {monto !== 0 ? formatCurrency(monto) : "-"}
                    </TableCell>
                  );
                })}
              </TableRow>
            </React.Fragment>
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
                <p className="text-sm text-muted-foreground truncate">Total Entradas</p>
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
                <p className="text-sm text-muted-foreground truncate">Total Salidas</p>
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

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-blue-600" />
          <span><strong>Real</strong> = Mes cerrado con ejercicio real</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="h-3 w-3 text-amber-600" />
          <span><strong>Proy.</strong> = Programado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-violet-600" />
          <span><strong>Auto</strong> = IVA generado desde asientos</span>
        </div>
      </div>

      {/* Filtros y acciones */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Info de años detectados */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">Años detectados:</span>
                <div className="flex gap-1">
                  {detectedYears.map(year => (
                    <Badge key={year} variant="secondary">{year}</Badge>
                  ))}
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
                  onClick={() => setExpandedYears(new Set(detectedYears))}
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
      {detectedYears.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              No hay flujos programados. Agrega fechas y montos en los presupuestos para generar el flujo de efectivo.
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
                              {MESES_LABELS.map((_, i) => renderMesHeader(i, yd.year))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {yd.gruposEntradas.length === 0 && yd.gruposSalidas.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                                  No hay flujos programados para {yd.year}
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {/* ENTRADAS */}
                                {mostrarEntradas && yd.gruposEntradas.length > 0 && (
                                  <>
                                    <TableRow className="bg-green-100/50 dark:bg-green-950/40">
                                      <TableCell colSpan={13} className="sticky left-0 z-10 bg-green-100/50 dark:bg-green-950/40 font-bold text-green-800 dark:text-green-300">
                                        <div className="flex items-center gap-2">
                                          <TrendingUp className="h-4 w-4" />
                                          ENTRADAS DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {yd.gruposEntradas.map(g => renderGrupoCuentaYear(g, "entrada", yd.year, yd.startIdx))}
                                    <TableRow className="bg-green-50 dark:bg-green-950/30 font-semibold border-t-2 border-green-200 dark:border-green-800">
                                      <TableCell className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/30 pl-4">Total Entradas</TableCell>
                                      {yd.entradas.map((monto, i) => (
                                        <TableCell key={i} className={cn(
                                          "text-right font-mono text-green-700 dark:text-green-400",
                                          isMesCerrado(new Date(yd.year, i, 1)) && "bg-blue-50/30 dark:bg-blue-950/10"
                                        )}>
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
                                      <TableCell colSpan={13} className="sticky left-0 z-10 bg-red-100/50 dark:bg-red-950/40 font-bold text-red-800 dark:text-red-300">
                                        <div className="flex items-center gap-2">
                                          <TrendingDown className="h-4 w-4" />
                                          SALIDAS DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {yd.gruposSalidas.map(g => renderGrupoCuentaYear(g, "salida", yd.year, yd.startIdx))}
                                    <TableRow className="bg-red-50 dark:bg-red-950/30 font-semibold border-t-2 border-red-200 dark:border-red-800">
                                      <TableCell className="sticky left-0 z-10 bg-red-50 dark:bg-red-950/30 pl-4">Total Salidas</TableCell>
                                      {yd.salidas.map((monto, i) => (
                                        <TableCell key={i} className={cn(
                                          "text-right font-mono text-red-700 dark:text-red-400",
                                          isMesCerrado(new Date(yd.year, i, 1)) && "bg-blue-50/30 dark:bg-blue-950/10"
                                        )}>
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
                                      <TableCell colSpan={13} className="sticky left-0 z-10 bg-muted/30 font-bold">
                                        <div className="flex items-center gap-2">
                                          <DollarSign className="h-4 w-4" />FLUJO DE EFECTIVO
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    <TableRow className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                                      <TableCell className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30 pl-6">Flujo Neto del Período</TableCell>
                                      {yd.entradas.map((entrada, i) => {
                                        const neto = entrada - yd.salidas[i];
                                        return (
                                          <TableCell key={i} className={cn(
                                            "text-right font-mono",
                                            neto >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400",
                                            isMesCerrado(new Date(yd.year, i, 1)) && "bg-blue-50/50 dark:bg-blue-950/20"
                                          )}>
                                            {neto !== 0 ? formatCurrency(neto) : "-"}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                    <TableRow className="bg-primary/10 font-bold text-base border-t-2 border-primary/30">
                                      <TableCell className="sticky left-0 z-10 bg-primary/10 pl-6">Saldo Acumulado</TableCell>
                                      {yd.saldos.map((saldo, i) => (
                                        <TableCell key={i} className={cn(
                                          "text-right font-mono",
                                          saldo >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                        )}>
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
