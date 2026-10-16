// Aritmética de fechas sin dependencias, compartida por la aplicación web y
// las Edge Functions (Deno). Replica la semántica de date-fns 3 que ya usaba
// la aplicación: sumar meses o años conserva el día y, si no existe en el mes
// destino, lo recorta al último día (31-ene + 1 mes = 28/29-feb).

export type FrecuenciaProgramacion =
  | "semanal"
  | "quincenal"
  | "mensual"
  | "trimestral"
  | "semestral"
  | "anual"
  | "personalizada";

/** Frecuencias con cadencia calculable automáticamente (excluye "personalizada"). */
export type FrecuenciaConCadencia = Exclude<FrecuenciaProgramacion, "personalizada">;

export function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha.getTime());
  r.setDate(r.getDate() + dias);
  return r;
}

export function sumarMeses(fecha: Date, meses: number): Date {
  const r = new Date(fecha.getTime());
  const dia = r.getDate();
  const destino = new Date(r.getTime());
  destino.setDate(1);
  destino.setMonth(destino.getMonth() + meses);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return destino;
}

/** Avanza una fecha `n` unidades de la frecuencia dada. */
export function avanzarFrecuencia(fecha: Date, frecuencia: FrecuenciaConCadencia, n: number): Date {
  switch (frecuencia) {
    case "semanal":
      return sumarDias(fecha, n * 7);
    case "quincenal":
      return sumarDias(fecha, n * 15);
    case "mensual":
      return sumarMeses(fecha, n);
    case "trimestral":
      return sumarMeses(fecha, n * 3);
    case "semestral":
      return sumarMeses(fecha, n * 6);
    case "anual":
      return sumarMeses(fecha, n * 12);
  }
}

/**
 * N fechas de pago a partir de una fecha inicial y una frecuencia.
 * No aplica a "personalizada": ahí el usuario captura cada fecha.
 */
export function calcularFechasPorFrecuencia(
  fechaInicio: Date,
  frecuencia: FrecuenciaConCadencia,
  numPeriodos: number
): Date[] {
  if (numPeriodos <= 0) return [];
  return Array.from({ length: numPeriodos }, (_, i) => avanzarFrecuencia(fechaInicio, frecuencia, i));
}

/** "yyyy-mm-dd" → Date local (evita el corrimiento UTC de new Date("yyyy-mm-dd")). */
export function fechaLocal(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Date → "yyyy-mm-dd" con la fecha local. */
export function isoLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ¿Es una fecha ISO válida yyyy-mm-dd? */
export function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const f = fechaLocal(valor);
  return !Number.isNaN(f.getTime()) && isoLocal(f) === valor;
}

/** Lunes y domingo de la semana (ISO, lunes a domingo) que contiene la fecha. */
export function semanaDe(iso: string): { desde: string; hasta: string } {
  const f = fechaLocal(iso);
  const dow = (f.getDay() + 6) % 7; // 0 = lunes
  const lunes = sumarDias(f, -dow);
  return { desde: isoLocal(lunes), hasta: isoLocal(sumarDias(lunes, 6)) };
}
