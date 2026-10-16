// Utilidades del módulo Project (Análisis → Proyectos).
// Las fórmulas viven en supabase/functions/_shared/negocio para que la
// aplicación y el asistente Rafa (Edge Function) usen exactamente la misma
// fuente de verdad. Este archivo las reexporta con los nombres de siempre.

import type { Movimiento } from "../../supabase/functions/_shared/negocio/contabilidad";

export type {
  FrecuenciaProgramacion,
  FrecuenciaConCadencia,
} from "../../supabase/functions/_shared/negocio/fechas";
export { calcularFechasPorFrecuencia } from "../../supabase/functions/_shared/negocio/fechas";

export type {
  FlujoProgramadoLite,
  ProgramacionPropiaPartida,
  AgregadoFinanciero,
} from "../../supabase/functions/_shared/negocio/calculos";
export {
  numeroFinito,
  calcularMontoPresupuestado,
  calcularEjercidoPorPartida,
  calcularEjercidoPorNaturaleza,
  ladoEjercidoPorCodigo,
  calcularProyectadoPorPartida,
  calcularAvance,
  calcularDisponible,
  calcularDesviacion,
  programacionPendienteDeAjustar,
  resolverFlujosEfectivos,
  distribuirSaldoEntrePeriodos,
  distribuirUnidades,
  agregarFinanciero,
} from "../../supabase/functions/_shared/negocio/calculos";

export interface MovimientoConPresupuesto extends Movimiento {
  presupuesto_id: string | null;
}
