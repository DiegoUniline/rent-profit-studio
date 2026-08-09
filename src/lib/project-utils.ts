// Utilidades del módulo Project (Análisis → Proyectos)
// Reutiliza los tipos y la fórmula de ejercido ya usados en el Reporte de Flujo
// (FlujoEfectivoPresupuesto.tsx) para no crear una segunda fuente de verdad.

import { addWeeks, addMonths, addYears } from "date-fns";
import type { Movimiento, AsientoContable } from "@/lib/accounting-utils";

export type FrecuenciaProgramacion = "semanal" | "mensual" | "trimestral" | "semestral" | "anual";

export interface FlujoProgramadoLite {
  presupuesto_id: string | null;
  fecha: string;
  monto: number;
}

export interface MovimientoConPresupuesto extends Movimiento {
  presupuesto_id: string | null;
}

/**
 * Ejercido por partida: suma de debe+haber de los movimientos de asientos
 * `aplicado` ligados a esa partida (mismo cálculo que FlujoEfectivoPresupuesto).
 */
export function calcularEjercidoPorPartida(
  movimientos: MovimientoConPresupuesto[],
  asientos: AsientoContable[]
): Map<string, number> {
  const asientoMap = new Map(asientos.map((a) => [a.id, a]));
  const result = new Map<string, number>();

  movimientos.forEach((mov) => {
    if (!mov.presupuesto_id) return;
    const asiento = asientoMap.get(mov.asiento_id);
    if (!asiento || asiento.estado !== "aplicado") return;
    const monto = Number(mov.debe) + Number(mov.haber);
    result.set(mov.presupuesto_id, (result.get(mov.presupuesto_id) || 0) + monto);
  });

  return result;
}

/**
 * Proyectado por partida: suma de flujos_programados.monto, opcionalmente
 * acotado a una fecha de corte ("proyectado acumulado a la fecha").
 */
export function calcularProyectadoPorPartida(
  flujos: FlujoProgramadoLite[],
  hastaFecha?: Date
): Map<string, number> {
  const result = new Map<string, number>();

  flujos.forEach((f) => {
    if (!f.presupuesto_id) return;
    if (hastaFecha) {
      const fecha = new Date(f.fecha + "T00:00:00");
      if (fecha > hastaFecha) return;
    }
    result.set(f.presupuesto_id, (result.get(f.presupuesto_id) || 0) + Number(f.monto));
  });

  return result;
}

/** Avance financiero: ejercido / presupuesto × 100. Sin tope 100%, 0% si presupuesto = 0. */
export function calcularAvance(ejercido: number, presupuesto: number): number {
  if (!presupuesto) return 0;
  return (ejercido / presupuesto) * 100;
}

/** Disponible: presupuesto - ejercido (puede ser negativo si hay sobre-ejercicio). */
export function calcularDisponible(presupuesto: number, ejercido: number): number {
  return presupuesto - ejercido;
}

/** Desviación vs. plan: ejercido acumulado - proyectado acumulado. */
export function calcularDesviacion(ejercidoAcumulado: number, proyectadoAcumulado: number): number {
  return ejercidoAcumulado - proyectadoAcumulado;
}

/**
 * ¿La programación de una partida ya no cuadra con su presupuesto vigente?
 * Se calcula en cliente (no se persiste): compara la suma de flujos
 * programados contra cantidad × precio_unitario actual.
 */
export function programacionPendienteDeAjustar(
  totalProgramado: number,
  presupuestoPartida: number
): boolean {
  // Tolerancia de centavo por acumulación de redondeos.
  return Math.abs(totalProgramado - presupuestoPartida) > 0.01;
}

/**
 * Reparte un saldo en N periodos sin perder ni agregar centavos: cada periodo
 * recibe el monto base redondeado a 2 decimales, y el último absorbe el
 * residuo de redondeo (mismo criterio ya usado para partidas individuales en
 * ProyectoPartidaSeguimientoDialog.distribuirAutomaticamente).
 */
export function distribuirSaldoEntrePeriodos(saldo: number, numPeriodos: number): number[] {
  if (numPeriodos <= 0) return [];
  const base = Math.floor((saldo / numPeriodos) * 100) / 100;
  const restante = Math.round((saldo - base * numPeriodos) * 100) / 100;
  return Array.from({ length: numPeriodos }, (_, i) => (i === numPeriodos - 1 ? base + restante : base));
}

/** Avanza una fecha una unidad de la frecuencia dada. */
function avanzarFrecuencia(fecha: Date, frecuencia: FrecuenciaProgramacion, n: number): Date {
  switch (frecuencia) {
    case "semanal":
      return addWeeks(fecha, n);
    case "mensual":
      return addMonths(fecha, n);
    case "trimestral":
      return addMonths(fecha, n * 3);
    case "semestral":
      return addMonths(fecha, n * 6);
    case "anual":
      return addYears(fecha, n);
  }
}

/** Calcula las N fechas de pago a partir de una fecha inicial y una frecuencia. */
export function calcularFechasPorFrecuencia(
  fechaInicio: Date,
  frecuencia: FrecuenciaProgramacion,
  numPeriodos: number
): Date[] {
  if (numPeriodos <= 0) return [];
  return Array.from({ length: numPeriodos }, (_, i) => avanzarFrecuencia(fechaInicio, frecuencia, i));
}

export interface AgregadoFinanciero {
  presupuesto: number;
  proyectado: number;
  ejercido: number;
  disponible: number;
  avance: number;
  desviacion: number;
}

/**
 * Suma montos (nunca promedia porcentajes) para agregar de partida → cuenta
 * o de cuenta → Project, según la regla del spec.
 */
export function agregarFinanciero(
  items: Omit<AgregadoFinanciero, "avance" | "desviacion" | "disponible">[]
): AgregadoFinanciero {
  const presupuesto = items.reduce((s, i) => s + i.presupuesto, 0);
  const proyectado = items.reduce((s, i) => s + i.proyectado, 0);
  const ejercido = items.reduce((s, i) => s + i.ejercido, 0);
  const disponible = presupuesto - ejercido;
  return {
    presupuesto,
    proyectado,
    ejercido,
    disponible,
    avance: calcularAvance(ejercido, presupuesto),
    desviacion: calcularDesviacion(ejercido, proyectado),
  };
}
