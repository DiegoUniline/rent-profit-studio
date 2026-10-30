// Fórmulas financieras del sistema, en una sola fuente compartida por la
// aplicación web (src/lib/project-utils.ts las reexporta) y por las
// herramientas de Rafa (Edge Function). No dependen de ninguna librería.

/** Convierte valores numéricos de Supabase a un número finito; ausencia o dato inválido = 0. */
export function numeroFinito(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/** Redondeo monetario a centavos. */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Importe autorizado de una partida. Proyectos, Presupuestos y Rafa usan
 * siempre esta misma fórmula para evitar diferencias por null/undefined/NaN.
 */
export function calcularMontoPresupuestado(cantidad: unknown, precioUnitario: unknown): number {
  return numeroFinito(cantidad) * numeroFinito(precioUnitario);
}

export interface MovimientoEjercido {
  asiento_id: string;
  presupuesto_id: string | null;
  debe: unknown;
  haber: unknown;
  /** Código de la cuenta del renglón (solo lo usa el método por naturaleza como respaldo). */
  cuenta_codigo?: string | null;
}

export interface AsientoEstado {
  id: string;
  estado: string;
}

/**
 * Ejercido por partida — MÉTODO "debe + haber" (módulo Proyectos, Reporte de
 * flujo por presupuesto y cronograma público): suma debe+haber de los
 * movimientos de asientos `aplicado` ligados a la partida.
 */
export function calcularEjercidoPorPartida(
  movimientos: MovimientoEjercido[],
  asientos: AsientoEstado[]
): Map<string, number> {
  const asientoMap = new Map(asientos.map((a) => [a.id, a]));
  const result = new Map<string, number>();

  movimientos.forEach((mov) => {
    if (!mov.presupuesto_id) return;
    const asiento = asientoMap.get(mov.asiento_id);
    if (!asiento || asiento.estado !== "aplicado") return;
    const monto = numeroFinito(mov.debe) + numeroFinito(mov.haber);
    result.set(mov.presupuesto_id, (result.get(mov.presupuesto_id) || 0) + monto);
  });

  return result;
}

/**
 * Lado que cuenta como "ejercido" según el código de la cuenta (MÉTODO "por
 * naturaleza", pantalla Presupuestos y Ejercido de una partida):
 * activo (1) → haber; pasivo (2) y capital (3) → debe; costos/gastos (5, 6)
 * → debe; ingresos (4) y el resto → haber.
 */
export function ladoEjercidoPorCodigo(codigoCuenta: string): "debe" | "haber" {
  const c = codigoCuenta || "";
  if (c.startsWith("1")) return "haber";
  if (c.startsWith("2") || c.startsWith("3")) return "debe";
  if (c.startsWith("5") || c.startsWith("6")) return "debe";
  return "haber";
}

/**
 * Ejercido de UNA partida por naturaleza (misma regla que Presupuestos.tsx):
 * usa la cuenta de la partida; si no tiene, la del primer movimiento.
 * Solo movimientos de asientos `aplicado`.
 */
export function calcularEjercidoPorNaturaleza(
  movimientosPartida: (MovimientoEjercido & { estado_asiento?: string | null })[],
  codigoCuentaPartida: string | null | undefined
): number {
  const aplicados = movimientosPartida.filter((m) => m.estado_asiento === "aplicado");
  if (aplicados.length === 0) return 0;
  const codigo = codigoCuentaPartida || aplicados[0]?.cuenta_codigo || "";
  const lado = ladoEjercidoPorCodigo(codigo);
  return aplicados.reduce((s, m) => s + numeroFinito(lado === "debe" ? m.debe : m.haber), 0);
}

export interface FlujoProgramadoLite {
  presupuesto_id: string | null;
  fecha: string;
  monto: number;
}

/**
 * Proyectado por partida: suma de montos de flujo, opcionalmente acotada a una
 * fecha de corte ("proyectado acumulado a la fecha").
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
    const monto = numeroFinito(f.monto);
    result.set(f.presupuesto_id, (result.get(f.presupuesto_id) || 0) + monto);
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

/** ¿La programación de una partida ya no cuadra con su presupuesto vigente? (tolerancia 1 centavo) */
export function programacionPendienteDeAjustar(totalProgramado: number, presupuestoPartida: number): boolean {
  return Math.abs(totalProgramado - presupuestoPartida) > 0.01;
}

export interface ProgramacionPropiaPartida {
  pagos: { fecha: string; monto: number }[];
}

/**
 * Fuente única de proyección por partida: si una partida es de Proyecto
 * (`es_project`), su única fuente es proyecto_programacion_pagos; sus filas de
 * flujos_programados (legacy) se excluyen aunque aún no tenga programación
 * propia (proyectado $0). Las partidas que no son de Proyecto siguen usando
 * flujos_programados.
 *
 * Dirección (entrada/salida): manda presupuestos.tipo_movimiento de la partida
 * (`tipoPorPresupuesto`). Los pagos de proyecto no tienen tipo propio; los
 * flujos legacy conservan el suyo solo si la partida no es Ingreso ni Egreso.
 */
export function resolverFlujosEfectivos<T extends { presupuesto_id: string | null; tipo?: string }>(
  flujosLegacy: T[],
  programacionesPorPartida: Map<string, ProgramacionPropiaPartida>,
  presupuestosGestionadosPorProyecto: ReadonlySet<string> = new Set(programacionesPorPartida.keys()),
  presupuestosVigentes?: ReadonlySet<string>,
  tipoPorPresupuesto?: ReadonlyMap<string, string | null | undefined>
): (T | { presupuesto_id: string; fecha: string; monto: number; tipo: "ingreso" | "egreso" })[] {
  const resultado: (T | { presupuesto_id: string; fecha: string; monto: number; tipo: "ingreso" | "egreso" })[] = [];
  const tipoDe = (id: string | null) => {
    const t = id ? tipoPorPresupuesto?.get(id) : null;
    return t === "ingreso" || t === "egreso" ? t : null;
  };

  flujosLegacy.forEach((f) => {
    if (f.presupuesto_id && presupuestosVigentes && !presupuestosVigentes.has(f.presupuesto_id)) return;
    if (f.presupuesto_id && presupuestosGestionadosPorProyecto.has(f.presupuesto_id)) return;
    const tipo = tipoDe(f.presupuesto_id);
    resultado.push(tipo && f.tipo !== tipo ? { ...f, tipo } : f);
  });

  programacionesPorPartida.forEach((propia, presupuestoId) => {
    if (!presupuestosGestionadosPorProyecto.has(presupuestoId)) return;
    if (presupuestosVigentes && !presupuestosVigentes.has(presupuestoId)) return;
    const tipo = tipoDe(presupuestoId) ?? "egreso";
    propia.pagos.forEach((pago) => {
      const monto = numeroFinito(pago.monto);
      if (monto <= 0) return;
      resultado.push({ presupuesto_id: presupuestoId, fecha: pago.fecha, monto, tipo });
    });
  });

  return resultado;
}

/**
 * Reparte un saldo en N periodos sin perder ni agregar centavos: cada periodo
 * recibe el monto base truncado a 2 decimales y el último absorbe el residuo.
 */
export function distribuirSaldoEntrePeriodos(saldo: number, numPeriodos: number): number[] {
  if (numPeriodos <= 0) return [];
  const base = Math.floor((saldo / numPeriodos) * 100) / 100;
  const restante = Math.round((saldo - base * numPeriodos) * 100) / 100;
  return Array.from({ length: numPeriodos }, (_, i) => (i === numPeriodos - 1 ? base + restante : base));
}

/**
 * Reparte unidades enteras/decimales en periodos de `porPeriodo` hasta
 * completar `total`: 550 en lotes de 15 → 36 periodos de 15 y uno de 10.
 */
export function distribuirUnidades(total: number, porPeriodo: number): number[] {
  if (!(total > 0) || !(porPeriodo > 0)) return [];
  const completos = Math.floor(total / porPeriodo + 1e-9);
  const resto = Math.round((total - completos * porPeriodo) * 1e6) / 1e6;
  const periodos = Array.from({ length: completos }, () => porPeriodo);
  if (resto > 0) periodos.push(resto);
  return periodos;
}

export interface AgregadoFinanciero {
  presupuesto: number;
  proyectado: number;
  ejercido: number;
  disponible: number;
  avance: number;
  desviacion: number;
}

/** Suma montos (nunca promedia porcentajes) para agregar partida → cuenta → Project. */
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

/** Signo de un tipo de movimiento sobre el flujo neto: +1 ingreso, -1 egreso, 0 el resto. */
export function signoFlujo(tipo: string | null | undefined): 1 | -1 | 0 {
  if (tipo === "ingreso") return 1;
  if (tipo === "egreso") return -1;
  return 0;
}
