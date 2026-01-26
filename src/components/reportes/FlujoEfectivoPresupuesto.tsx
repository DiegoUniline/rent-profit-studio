import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, FileText, TrendingUp, TrendingDown, DollarSign, CalendarDays } from "lucide-react";
import { format, addMonths, startOfMonth, startOfYear, endOfYear, differenceInMonths } from "date-fns";
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
  meses: number[]; // Array de meses con montos
}

// Determina si es entrada o salida basado en el código de cuenta
function determinarTipoFlujo(codigoCuenta: string): TipoFlujo {
  if (!codigoCuenta) return "salida";
  
  const primerDigito = codigoCuenta.charAt(0);
  
  // Entradas: Activo (1), Ingresos (4)
  // Activo = dinero que nos deben (cuentas por cobrar) o disponible
  // Ingresos = ventas, servicios
  if (primerDigito === "1" || primerDigito === "4") {
    return "entrada";
  }
  
  // Salidas: Pasivo (2), Costos (5), Gastos (6)
  // Pasivo = lo que debemos pagar
  // Costos = costo de lo vendido
  // Gastos = gastos operativos
  return "salida";
}

// Calcular la frecuencia en meses
function getFrecuenciaEnMeses(frecuencia: string | null): number {
  switch (frecuencia) {
    case "semanal": return 0.25; // ~1 semana en fracción de mes
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

// Generar años disponibles (actual + 3 hacia adelante)
function getAnosDisponibles(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1, currentYear + 2];
}

export function FlujoEfectivoPresupuesto({
  presupuestos,
  loading,
  empresaNombre,
}: FlujoEfectivoPresupuestoProps) {
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entradas" | "salidas">("todos");
  
  // Estado para filtrar años
  const anosDisponibles = useMemo(() => getAnosDisponibles(), []);
  const [anosSeleccionados, setAnosSeleccionados] = useState<number[]>([new Date().getFullYear()]);

  // Generar los meses basados en los años seleccionados
  const mesesFiltrados = useMemo(() => {
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

  // Cantidad de meses a procesar
  const numMeses = mesesFiltrados.length;

  // Procesar presupuestos en flujos mensuales
  const flujosMensuales = useMemo(() => {
    if (numMeses === 0) return [];
    
    const flujos: FlujoMensual[] = [];

    presupuestos.forEach((p) => {
      if (!p.fecha_inicio || !p.fecha_fin) return;

      const fechaInicio = new Date(p.fecha_inicio);
      const fechaFin = new Date(p.fecha_fin);
      const montoTotal = p.cantidad * p.precio_unitario;
      const codigoCuenta = p.cuenta?.codigo || "";
      const tipo = determinarTipoFlujo(codigoCuenta);
      const frecuencia = p.frecuencia || "mensual";
      const frecuenciaEnMeses = getFrecuenciaEnMeses(frecuencia);

      // Crear array dinámico de meses
      const mesesMonto: number[] = new Array(numMeses).fill(0);

      // Distribuir el monto según la frecuencia
      mesesFiltrados.forEach((mesActual, index) => {
        const inicioMes = startOfMonth(mesActual);

        // Verificar si el mes está dentro del rango del presupuesto
        const mesEstaEnRango = 
          (inicioMes >= startOfMonth(fechaInicio) && inicioMes <= fechaFin) ||
          (mesActual >= fechaInicio && mesActual <= fechaFin);

        if (!mesEstaEnRango) return;

        // Calcular el monto para este mes según frecuencia
        if (frecuencia === "semanal") {
          // Para semanal, calculamos cuántas semanas hay en el mes dentro del rango
          const semanasEnMes = 4; // Aproximación
          mesesMonto[index] = montoTotal * semanasEnMes;
        } else if (frecuencia === "mensual") {
          mesesMonto[index] = montoTotal;
        } else {
          // Para frecuencias mayores a mensual, solo ponemos el monto en los meses correspondientes
          const mesesDesdeInicio = differenceInMonths(inicioMes, startOfMonth(fechaInicio));
          if (mesesDesdeInicio % frecuenciaEnMeses === 0) {
            mesesMonto[index] = montoTotal;
          }
        }
      });

      // Solo agregar si hay al menos un mes con monto
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
        });
      }
    });

    return flujos;
  }, [presupuestos, mesesFiltrados, numMeses]);

  // Filtrar flujos
  const flujosFiltrados = useMemo(() => {
    if (filtroTipo === "todos") return flujosMensuales;
    if (filtroTipo === "entradas") return flujosMensuales.filter(f => f.tipo === "entrada");
    return flujosMensuales.filter(f => f.tipo === "salida");
  }, [flujosMensuales, filtroTipo]);

  // Calcular totales por mes
  const totalesMensuales = useMemo(() => {
    const entradas: number[] = new Array(numMeses).fill(0);
    const salidas: number[] = new Array(numMeses).fill(0);

    flujosMensuales.forEach((flujo) => {
      flujo.meses.forEach((monto, index) => {
        if (flujo.tipo === "entrada") {
          entradas[index] += monto;
        } else {
          salidas[index] += monto;
        }
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

  // Totales generales
  const totalesGenerales = useMemo(() => {
    return {
      totalEntradas: totalesMensuales.entradas.reduce((a, b) => a + b, 0),
      totalSalidas: totalesMensuales.salidas.reduce((a, b) => a + b, 0),
      saldoFinal: totalesMensuales.saldos[numMeses - 1] || 0,
    };
  }, [totalesMensuales, numMeses]);

  // Exportar a Excel
  const exportarExcel = () => {
    // Hoja de detalle
    const detalleData = flujosMensuales.map((f) => {
      const fila: Record<string, any> = {
        Partida: f.partida,
        Cuenta: f.codigoCuenta,
        Tipo: f.tipo === "entrada" ? "Entrada" : "Salida",
        Frecuencia: f.frecuencia,
        "Monto Base": f.montoTotal,
      };
      mesesFiltrados.forEach((mes, i) => {
        fila[format(mes, "MMM yyyy", { locale: es })] = f.meses[i];
      });
      return fila;
    });

    // Hoja de resumen
    const resumenData = mesesFiltrados.map((mes, i) => ({
      Mes: format(mes, "MMMM yyyy", { locale: es }),
      Entradas: totalesMensuales.entradas[i],
      Salidas: totalesMensuales.salidas[i],
      "Flujo Neto": totalesMensuales.entradas[i] - totalesMensuales.salidas[i],
      "Saldo Acumulado": totalesMensuales.saldos[i],
    }));

    const wb = XLSX.utils.book_new();
    const wsDetalle = XLSX.utils.json_to_sheet(detalleData);
    const wsResumen = XLSX.utils.json_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");
    XLSX.writeFile(wb, `Flujo_Efectivo_${empresaNombre}.xlsx`);
  };

  // Exportar a PDF
  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const anosLabel = anosSeleccionados.length > 0 
      ? anosSeleccionados.sort().join(", ") 
      : "Sin años seleccionados";
    
    doc.setFontSize(16);
    doc.text(`Flujo de Efectivo - Proyección ${anosLabel}`, pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(empresaNombre, pageWidth / 2, 22, { align: "center" });

    // Tabla resumen (primeros 12 meses o todos si hay menos)
    const resumenData = mesesFiltrados.slice(0, 12).map((mes, i) => [
      format(mes, "MMM yy", { locale: es }),
      formatCurrency(totalesMensuales.entradas[i]),
      formatCurrency(totalesMensuales.salidas[i]),
      formatCurrency(totalesMensuales.entradas[i] - totalesMensuales.salidas[i]),
      formatCurrency(totalesMensuales.saldos[i]),
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["Mes", "Entradas", "Salidas", "Flujo Neto", "Saldo Acumulado"]],
      body: resumenData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`Flujo_Efectivo_${empresaNombre}_${anosLabel}.pdf`);
  };

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
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Entradas ({anosSeleccionados.length > 0 ? `${anosSeleccionados.sort().join(", ")}` : "Sin años"})</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totalesGenerales.totalEntradas)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Salidas ({anosSeleccionados.length > 0 ? `${anosSeleccionados.sort().join(", ")}` : "Sin años"})</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(totalesGenerales.totalSalidas)}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo Final Proyectado</p>
                <p className={cn(
                  "text-2xl font-bold",
                  totalesGenerales.saldoFinal >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
                )}>
                  {formatCurrency(totalesGenerales.saldoFinal)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y acciones */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4">
            {/* Fila de filtros */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Filtro de años */}
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium shrink-0">Años:</span>
                <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg">
                  {anosDisponibles.map((ano) => {
                    const isSelected = anosSeleccionados.includes(ano);
                    return (
                      <Button
                        key={ano}
                        variant={isSelected ? "default" : "ghost"}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            // No permitir deseleccionar si es el último
                            if (anosSeleccionados.length > 1) {
                              setAnosSeleccionados(prev => prev.filter(a => a !== ano));
                            }
                          } else {
                            setAnosSeleccionados(prev => [...prev, ano].sort());
                          }
                        }}
                        className="min-w-[50px]"
                      >
                        {ano}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Separador vertical - oculto en móvil */}
              <div className="h-8 w-px bg-border hidden sm:block" />

              {/* Filtro de tipo */}
              <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg">
                <Button
                  variant={filtroTipo === "todos" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("todos")}
                  size="sm"
                >
                  Todos
                </Button>
                <Button
                  variant={filtroTipo === "entradas" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("entradas")}
                  size="sm"
                  className="gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Entradas
                </Button>
                <Button
                  variant={filtroTipo === "salidas" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("salidas")}
                  size="sm"
                  className="gap-2"
                >
                  <TrendingDown className="h-4 w-4" />
                  Salidas
                </Button>
              </div>
            </div>

            {/* Fila de acciones (exportar) */}
            <div className="flex flex-wrap gap-2">
              <Button variant="default" onClick={exportarPDF} className="gap-2">
                <FileText className="h-4 w-4" />
                PDF
              </Button>
              <Button variant="default" onClick={exportarExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de flujo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Flujo de Efectivo - Proyección {anosSeleccionados.sort().join(", ")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mesesFiltrados.length > 0 ? (
              <>Vista desde {format(mesesFiltrados[0], "MMMM yyyy", { locale: es })} hasta {format(mesesFiltrados[mesesFiltrados.length - 1], "MMMM yyyy", { locale: es })}</>
            ) : (
              "Selecciona al menos un año para ver la proyección"
            )}
          </p>
        </CardHeader>
        <CardContent>
          {mesesFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Selecciona al menos un año para ver la proyección
            </div>
          ) : (
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 z-10 bg-muted/50 min-w-[200px]">Partida</TableHead>
                    <TableHead className="sticky left-[200px] z-10 bg-muted/50 min-w-[120px]">Cuenta</TableHead>
                    <TableHead className="min-w-[80px] text-center">Tipo</TableHead>
                    <TableHead className="min-w-[80px] text-center">Frecuencia</TableHead>
                    {mesesFiltrados.map((mes, i) => (
                      <TableHead key={i} className="min-w-[100px] text-right">
                        {format(mes, "MMM yy", { locale: es })}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flujosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4 + mesesFiltrados.length} className="text-center py-8 text-muted-foreground">
                        No hay presupuestos con fechas configuradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {flujosFiltrados.map((flujo) => (
                        <TableRow key={flujo.presupuestoId}>
                          <TableCell className="sticky left-0 z-10 bg-background font-medium">
                            {flujo.partida}
                          </TableCell>
                          <TableCell className="sticky left-[200px] z-10 bg-background font-mono text-xs">
                            {flujo.codigoCuenta}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={flujo.tipo === "entrada" ? "default" : "destructive"} className="text-xs">
                              {flujo.tipo === "entrada" ? "Entrada" : "Salida"}
                            </Badge>
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
                      ))}
                      
                      {/* Fila de totales entradas */}
                      <TableRow className="bg-green-50 dark:bg-green-950/30 font-semibold">
                        <TableCell className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/30" colSpan={4}>
                          Total Entradas
                        </TableCell>
                        {totalesMensuales.entradas.map((monto, i) => (
                          <TableCell key={i} className="text-right font-mono text-green-700 dark:text-green-400">
                            {monto !== 0 ? formatCurrency(monto) : "-"}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* Fila de totales salidas */}
                      <TableRow className="bg-red-50 dark:bg-red-950/30 font-semibold">
                        <TableCell className="sticky left-0 z-10 bg-red-50 dark:bg-red-950/30" colSpan={4}>
                          Total Salidas
                        </TableCell>
                        {totalesMensuales.salidas.map((monto, i) => (
                          <TableCell key={i} className="text-right font-mono text-red-700 dark:text-red-400">
                            {monto !== 0 ? formatCurrency(monto) : "-"}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* Fila de flujo neto */}
                      <TableRow className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                        <TableCell className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30" colSpan={4}>
                          Flujo Neto
                        </TableCell>
                        {totalesMensuales.entradas.map((entrada, i) => {
                          const neto = entrada - totalesMensuales.salidas[i];
                          return (
                            <TableCell key={i} className={cn(
                              "text-right font-mono",
                              neto >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                            )}>
                              {neto !== 0 ? formatCurrency(neto) : "-"}
                            </TableCell>
                          );
                        })}
                      </TableRow>

                      {/* Fila de saldo acumulado */}
                      <TableRow className="bg-primary/10 font-bold text-lg">
                        <TableCell className="sticky left-0 z-10 bg-primary/10" colSpan={4}>
                          Saldo Acumulado
                        </TableCell>
                        {totalesMensuales.saldos.map((saldo, i) => (
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
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
