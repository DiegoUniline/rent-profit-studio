// Fuente única de verdad del tipo de movimiento de una partida presupuestal.
// El valor se persiste en presupuestos.tipo_movimiento. NULL = pendiente de
// clasificar: la partida se muestra, pero NO afecta ningún total financiero.

export type TipoMovimiento = "ingreso" | "egreso" | "no_afecta";

/** Valor de la partida tal como llega de la base de datos (null = pendiente). */
export type TipoMovimientoValor = TipoMovimiento | null;

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  no_afecta: "No afecta el flujo",
};

export const TIPO_MOVIMIENTO_OPCIONES: { value: TipoMovimiento; label: string }[] = [
  { value: "ingreso", label: "Ingreso" },
  { value: "egreso", label: "Egreso" },
  { value: "no_afecta", label: "No afecta el flujo" },
];

export const PENDIENTE_LABEL = "Pendiente de clasificar";

export function etiquetaTipoMovimiento(tipo: TipoMovimientoValor | undefined): string {
  return tipo ? TIPO_MOVIMIENTO_LABELS[tipo] : PENDIENTE_LABEL;
}

/** Clases de badge por tipo, usando tokens semánticos del sistema. */
export function claseTipoMovimiento(tipo: TipoMovimientoValor | undefined): string {
  switch (tipo) {
    case "ingreso":
      return "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800";
    case "egreso":
      return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
    case "no_afecta":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
}

/** ¿Este tipo participa en los totales de flujo (ingresos/egresos/neto)? */
export function afectaFlujo(tipo: TipoMovimientoValor | undefined): boolean {
  return tipo === "ingreso" || tipo === "egreso";
}

/** Signo del movimiento sobre el flujo neto: +1 ingreso, -1 egreso, 0 el resto. */
export function signoFlujo(tipo: TipoMovimientoValor | undefined): 1 | -1 | 0 {
  if (tipo === "ingreso") return 1;
  if (tipo === "egreso") return -1;
  return 0;
}

export type FiltroTipoMovimiento = "todos" | TipoMovimiento | "pendiente";

export const FILTRO_TIPO_OPCIONES: { value: FiltroTipoMovimiento; label: string }[] = [
  { value: "todos", label: "Todos los tipos" },
  { value: "ingreso", label: "Ingresos" },
  { value: "egreso", label: "Egresos" },
  { value: "no_afecta", label: "Sin afectación" },
  { value: "pendiente", label: PENDIENTE_LABEL },
];

export function coincideFiltroTipo(
  tipo: TipoMovimientoValor | undefined,
  filtro: FiltroTipoMovimiento
): boolean {
  if (filtro === "todos") return true;
  if (filtro === "pendiente") return !tipo;
  return tipo === filtro;
}

export interface ResumenFlujoTipo {
  totalPresupuestado: number;
  ingresos: number;
  egresos: number;
  sinAfectacion: number;
  flujoNeto: number;
  pendientesCount: number;
  pendientesMonto: number;
}

/**
 * Agrega montos por tipo de movimiento. Los importes nunca se alteran: solo se
 * clasifican. Pendientes y "no afecta" quedan fuera del flujo neto.
 */
export function resumirPorTipoMovimiento(
  items: { tipoMovimiento: TipoMovimientoValor | undefined; monto: number }[]
): ResumenFlujoTipo {
  let ingresos = 0;
  let egresos = 0;
  let sinAfectacion = 0;
  let pendientesCount = 0;
  let pendientesMonto = 0;
  let totalPresupuestado = 0;

  items.forEach(({ tipoMovimiento, monto }) => {
    totalPresupuestado += monto;
    if (tipoMovimiento === "ingreso") ingresos += monto;
    else if (tipoMovimiento === "egreso") egresos += monto;
    else if (tipoMovimiento === "no_afecta") sinAfectacion += monto;
    else {
      pendientesCount += 1;
      pendientesMonto += monto;
    }
  });

  return {
    totalPresupuestado,
    ingresos,
    egresos,
    sinAfectacion,
    flujoNeto: ingresos - egresos,
    pendientesCount,
    pendientesMonto,
  };
}
