import React, { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency } from "@/lib/accounting-utils";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/date-utils";
import { FileSpreadsheet, FileText, TrendingUp, TrendingDown, DollarSign, CalendarDays, Layers, GripVertical } from "lucide-react";
import { format, startOfMonth, differenceInMonths } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SortableFlujoRow } from "./SortableFlujoRow";

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
type GroupingType = "ninguno" | "cuenta" | "centro";

interface FlujoMensual {
  presupuestoId: string;
  partida: string;
  codigoCuenta: string;
  nombreCuenta: string;
  tipo: TipoFlujo;
  montoTotal: number;
  frecuencia: string;
  meses: number[];
  orden: number;
  centroNegocioCodigo: string;
  centroNegocioNombre: string;
}

interface GrupoFlujo {
  key: string;
  label: string;
  flujos: FlujoMensual[];
  totalMeses: number[];
}

// Determina si es entrada o salida basado en el código de cuenta
function determinarTipoFlujo(codigoCuenta: string): TipoFlujo {
  if (!codigoCuenta) return "salida";
  
  const primerDigito = codigoCuenta.charAt(0);
  
  // Entradas: Activo (1), Ingresos (4)
  if (primerDigito === "1" || primerDigito === "4") {
    return "entrada";
  }
  
  // Salidas: Pasivo (2), Costos (5), Gastos (6)
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

// Generar años disponibles
function getAnosDisponibles(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1, currentYear + 2];
}

export function FlujoEfectivoPresupuesto({
  presupuestos,
  loading,
  empresaNombre,
  onOrderUpdate,
}: FlujoEfectivoPresupuestoProps) {
  const { toast } = useToast();
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entradas" | "salidas">("todos");
  const [updatingOrder, setUpdatingOrder] = useState(false);
  
  // Estado de agrupación persistido en localStorage
  const [grouping, setGrouping] = useState<GroupingType>(() => {
    const saved = localStorage.getItem("flujo_efectivo_grouping");
    return (saved as GroupingType) || "ninguno";
  });

  // Estado para filtrar años
  const anosDisponibles = useMemo(() => getAnosDisponibles(), []);
  const [anosSeleccionados, setAnosSeleccionados] = useState<number[]>([new Date().getFullYear()]);

  // Sensores para dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Guardar agrupación en localStorage
  const handleGroupingChange = (value: string) => {
    if (value) {
      setGrouping(value as GroupingType);
      localStorage.setItem("flujo_efectivo_grouping", value);
    }
  };

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

  const numMeses = mesesFiltrados.length;

  // Procesar presupuestos en flujos mensuales
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

      // Calcular cuántas ocurrencias hay en el periodo del presupuesto
      const mesesEnPeriodo = differenceInMonths(fechaFin, fechaInicio) + 1;
      let numOcurrencias: number;

      if (frecuencia === "semanal") {
        numOcurrencias = mesesEnPeriodo * 4; // 4 semanas por mes
      } else {
        numOcurrencias = Math.ceil(mesesEnPeriodo / frecuenciaEnMeses);
      }

      // Monto por cada ocurrencia (total dividido entre ocurrencias)
      const montoPorOcurrencia = numOcurrencias > 0 ? montoTotal / numOcurrencias : montoTotal;

      const mesesMonto: number[] = new Array(numMeses).fill(0);

      mesesFiltrados.forEach((mesActual, index) => {
        const inicioMes = startOfMonth(mesActual);

        const mesEstaEnRango = 
          (inicioMes >= startOfMonth(fechaInicio) && inicioMes <= fechaFin) ||
          (mesActual >= fechaInicio && mesActual <= fechaFin);

        if (!mesEstaEnRango) return;

        if (frecuencia === "semanal") {
          // Para semanal: monto por semana * 4 semanas del mes
          const montoSemanal = montoTotal / numOcurrencias;
          mesesMonto[index] = montoSemanal * 4;
        } else if (frecuencia === "mensual") {
          mesesMonto[index] = montoPorOcurrencia;
        } else {
          // Trimestral, semestral, anual, bimestral
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

    // Ordenar por el campo orden
    return flujos.sort((a, b) => a.orden - b.orden);
  }, [presupuestos, mesesFiltrados, numMeses]);

  // Separar y ordenar flujos por tipo
  const flujosEntradas = useMemo(() => {
    return flujosMensuales.filter(f => f.tipo === "entrada");
  }, [flujosMensuales]);

  const flujosSalidas = useMemo(() => {
    return flujosMensuales.filter(f => f.tipo === "salida");
  }, [flujosMensuales]);

  // Agrupar flujos según el tipo de agrupación
  const gruposEntradas = useMemo((): GrupoFlujo[] => {
    if (grouping === "ninguno") return [];
    
    const grupos: Record<string, FlujoMensual[]> = {};
    
    flujosEntradas.forEach(flujo => {
      const key = grouping === "cuenta" 
        ? flujo.codigoCuenta || "sin-cuenta"
        : flujo.centroNegocioCodigo || "sin-centro";
      
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(flujo);
    });
    
    return Object.entries(grupos).map(([key, flujos]) => ({
      key,
      label: grouping === "cuenta" 
        ? `${key} - ${flujos[0]?.nombreCuenta || "Sin cuenta"}`
        : `${key} - ${flujos[0]?.centroNegocioNombre || "Sin centro"}`,
      flujos,
      totalMeses: flujos.reduce((acc, f) => {
        return acc.map((v, i) => v + f.meses[i]);
      }, new Array(numMeses).fill(0) as number[]),
    })).sort((a, b) => a.key.localeCompare(b.key));
  }, [flujosEntradas, grouping, numMeses]);

  const gruposSalidas = useMemo((): GrupoFlujo[] => {
    if (grouping === "ninguno") return [];
    
    const grupos: Record<string, FlujoMensual[]> = {};
    
    flujosSalidas.forEach(flujo => {
      const key = grouping === "cuenta" 
        ? flujo.codigoCuenta || "sin-cuenta"
        : flujo.centroNegocioCodigo || "sin-centro";
      
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(flujo);
    });
    
    return Object.entries(grupos).map(([key, flujos]) => ({
      key,
      label: grouping === "cuenta" 
        ? `${key} - ${flujos[0]?.nombreCuenta || "Sin cuenta"}`
        : `${key} - ${flujos[0]?.centroNegocioNombre || "Sin centro"}`,
      flujos,
      totalMeses: flujos.reduce((acc, f) => {
        return acc.map((v, i) => v + f.meses[i]);
      }, new Array(numMeses).fill(0) as number[]),
    })).sort((a, b) => a.key.localeCompare(b.key));
  }, [flujosSalidas, grouping, numMeses]);

  const mostrarEntradas = filtroTipo === "todos" || filtroTipo === "entradas";
  const mostrarSalidas = filtroTipo === "todos" || filtroTipo === "salidas";

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

  // Manejar drag and drop
  const handleDragEnd = useCallback(async (event: DragEndEvent, flujos: FlujoMensual[], tipo: TipoFlujo) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = flujos.findIndex(f => f.presupuestoId === active.id);
    const newIndex = flujos.findIndex(f => f.presupuestoId === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(flujos, oldIndex, newIndex);

    setUpdatingOrder(true);
    try {
      // Actualizar orden en la base de datos
      const updates = reordered.map((flujo, index) => ({
        id: flujo.presupuestoId,
        orden: index + 1,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("presupuestos")
          .update({ orden: update.orden })
          .eq("id", update.id);
        
        if (error) throw error;
      }

      toast({ title: "Orden actualizado" });
      onOrderUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error al actualizar orden",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingOrder(false);
    }
  }, [onOrderUpdate, toast]);

  // Exportar a Excel
  const exportarExcel = () => {
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

  // Renderizar filas de flujo (sin agrupación)
  const renderFlujoRows = (flujos: FlujoMensual[], tipo: TipoFlujo) => {
    const canReorder = grouping === "ninguno";
    
    if (!canReorder) {
      return flujos.map((flujo) => (
        <TableRow key={flujo.presupuestoId} className={cn(
          tipo === "entrada" 
            ? "hover:bg-green-50/50 dark:hover:bg-green-950/20" 
            : "hover:bg-red-50/50 dark:hover:bg-red-950/20"
        )}>
          <TableCell className="sticky left-0 z-10 bg-background pl-6">
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
      ));
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => handleDragEnd(e, flujos, tipo)}
      >
        <SortableContext
          items={flujos.map(f => f.presupuestoId)}
          strategy={verticalListSortingStrategy}
        >
          {flujos.map((flujo) => (
            <SortableFlujoRow
              key={flujo.presupuestoId}
              flujo={flujo}
              tipo={tipo}
              canReorder={true}
            />
          ))}
        </SortableContext>
      </DndContext>
    );
  };

  // Renderizar grupo con sus flujos
  const renderGrupo = (grupo: GrupoFlujo, tipo: TipoFlujo) => {
    const bgClass = tipo === "entrada" 
      ? "bg-green-50/30 dark:bg-green-950/20" 
      : "bg-red-50/30 dark:bg-red-950/20";
    
    return (
      <React.Fragment key={grupo.key}>
        {/* Header del grupo */}
        <TableRow className={bgClass}>
          <TableCell className="sticky left-0 z-10 pl-4 font-medium" style={{ background: "inherit" }}>
            {grupo.label}
          </TableCell>
          <TableCell colSpan={2}></TableCell>
          {grupo.totalMeses.map((monto, i) => (
            <TableCell key={i} className={cn(
              "text-right font-mono text-xs font-medium",
              monto === 0 && "text-muted-foreground"
            )}>
              {monto !== 0 ? formatCurrency(monto) : "-"}
            </TableCell>
          ))}
        </TableRow>
        {/* Filas del grupo */}
        {grupo.flujos.map((flujo) => (
          <TableRow key={flujo.presupuestoId} className={cn(
            tipo === "entrada" 
              ? "hover:bg-green-50/50 dark:hover:bg-green-950/20" 
              : "hover:bg-red-50/50 dark:hover:bg-red-950/20"
          )}>
            <TableCell className="sticky left-0 z-10 bg-background pl-8">
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
        ))}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const canReorder = grouping === "ninguno";

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">Total Entradas ({anosSeleccionados.length > 0 ? `${anosSeleccionados.sort().join(", ")}` : "Sin años"})</p>
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
                <p className="text-sm text-muted-foreground truncate">Total Salidas ({anosSeleccionados.length > 0 ? `${anosSeleccionados.sort().join(", ")}` : "Sin años"})</p>
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
                  totalesGenerales.saldoFinal >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
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
            {/* Fila de filtros */}
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
                <Button
                  variant={filtroTipo === "todos" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("todos")}
                  size="sm"
                  className="h-8"
                >
                  Todos
                </Button>
                <Button
                  variant={filtroTipo === "entradas" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("entradas")}
                  size="sm"
                  className="gap-1 h-8"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Entradas
                </Button>
                <Button
                  variant={filtroTipo === "salidas" ? "default" : "ghost"}
                  onClick={() => setFiltroTipo("salidas")}
                  size="sm"
                  className="gap-1 h-8"
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Salidas
                </Button>
              </div>

              <div className="hidden sm:block h-6 w-px bg-border" />

              {/* Agrupación */}
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">Agrupar:</span>
                <ToggleGroup
                  type="single"
                  value={grouping}
                  onValueChange={handleGroupingChange}
                  className="bg-muted p-1 rounded-lg"
                >
                  <ToggleGroupItem value="ninguno" className="h-8 px-3 text-xs">
                    Ninguno
                  </ToggleGroupItem>
                  <ToggleGroupItem value="cuenta" className="h-8 px-3 text-xs">
                    Cuenta
                  </ToggleGroupItem>
                  <ToggleGroupItem value="centro" className="h-8 px-3 text-xs">
                    Centro
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            {/* Fila de acciones */}
            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={exportarPDF} className="gap-1.5">
                <FileText className="h-4 w-4" />
                PDF
              </Button>
              <Button variant="default" size="sm" onClick={exportarExcel} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              {canReorder && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                  <GripVertical className="h-3 w-3" />
                  Arrastra para reordenar
                </span>
              )}
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
                    {canReorder && <TableHead className="w-[40px] sticky left-0 z-10 bg-muted/50"></TableHead>}
                    <TableHead className={cn("sticky z-10 bg-muted/50 min-w-[250px]", canReorder ? "left-[40px]" : "left-0")}>Concepto</TableHead>
                    <TableHead className="min-w-[100px]">Cuenta</TableHead>
                    <TableHead className="min-w-[80px] text-center">Frecuencia</TableHead>
                    {mesesFiltrados.map((mes, i) => (
                      <TableHead key={i} className="min-w-[100px] text-right">
                        {format(mes, "MMM yy", { locale: es })}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flujosEntradas.length === 0 && flujosSalidas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(canReorder ? 4 : 3) + mesesFiltrados.length} className="text-center py-8 text-muted-foreground">
                        No hay presupuestos con fechas configuradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* SECCIÓN ENTRADAS */}
                      {mostrarEntradas && (
                        <>
                          <TableRow className="bg-green-100/50 dark:bg-green-950/40">
                            <TableCell colSpan={(canReorder ? 4 : 3) + mesesFiltrados.length} className="sticky left-0 z-10 bg-green-100/50 dark:bg-green-950/40 font-bold text-green-800 dark:text-green-300">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                ENTRADAS DE EFECTIVO
                              </div>
                            </TableCell>
                          </TableRow>
                          {grouping === "ninguno" 
                            ? renderFlujoRows(flujosEntradas, "entrada")
                            : gruposEntradas.map(g => renderGrupo(g, "entrada"))
                          }
                          {/* Subtotal Entradas */}
                          <TableRow className="bg-green-50 dark:bg-green-950/30 font-semibold border-t-2 border-green-200 dark:border-green-800">
                            <TableCell className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/30 pl-4" colSpan={canReorder ? 4 : 3}>
                              Total Entradas
                            </TableCell>
                            {totalesMensuales.entradas.map((monto, i) => (
                              <TableCell key={i} className="text-right font-mono text-green-700 dark:text-green-400">
                                {monto !== 0 ? formatCurrency(monto) : "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        </>
                      )}

                      {/* SECCIÓN SALIDAS */}
                      {mostrarSalidas && (
                        <>
                          <TableRow className="bg-red-100/50 dark:bg-red-950/40">
                            <TableCell colSpan={(canReorder ? 4 : 3) + mesesFiltrados.length} className="sticky left-0 z-10 bg-red-100/50 dark:bg-red-950/40 font-bold text-red-800 dark:text-red-300">
                              <div className="flex items-center gap-2">
                                <TrendingDown className="h-4 w-4" />
                                SALIDAS DE EFECTIVO
                              </div>
                            </TableCell>
                          </TableRow>
                          {grouping === "ninguno" 
                            ? renderFlujoRows(flujosSalidas, "salida")
                            : gruposSalidas.map(g => renderGrupo(g, "salida"))
                          }
                          {/* Subtotal Salidas */}
                          <TableRow className="bg-red-50 dark:bg-red-950/30 font-semibold border-t-2 border-red-200 dark:border-red-800">
                            <TableCell className="sticky left-0 z-10 bg-red-50 dark:bg-red-950/30 pl-4" colSpan={canReorder ? 4 : 3}>
                              Total Salidas
                            </TableCell>
                            {totalesMensuales.salidas.map((monto, i) => (
                              <TableCell key={i} className="text-right font-mono text-red-700 dark:text-red-400">
                                {monto !== 0 ? formatCurrency(monto) : "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        </>
                      )}

                      {/* SECCIÓN FLUJO DE EFECTIVO */}
                      {filtroTipo === "todos" && (
                        <>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={(canReorder ? 4 : 3) + mesesFiltrados.length} className="sticky left-0 z-10 bg-muted/30 font-bold">
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                FLUJO DE EFECTIVO
                              </div>
                            </TableCell>
                          </TableRow>

                          <TableRow className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                            <TableCell className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30 pl-6" colSpan={canReorder ? 4 : 3}>
                              Flujo Neto del Período
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

                          <TableRow className="bg-primary/10 font-bold text-base border-t-2 border-primary/30">
                            <TableCell className="sticky left-0 z-10 bg-primary/10 pl-6" colSpan={canReorder ? 4 : 3}>
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
