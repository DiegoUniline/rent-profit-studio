// Reglas de captura de asientos contables (pólizas de partida doble).
// Fuente compartida: AsientoDialog, AsientoDetalle y las herramientas de Rafa
// aplican exactamente estas validaciones y mensajes.

export type TipoAsiento = "ingreso" | "egreso" | "diario";

export interface CabeceraAsiento {
  empresa_id: string;
  fecha: string;
  tipo: TipoAsiento | string;
  centro_negocio_id?: string | null;
}

export interface RenglonAsiento {
  cuenta_id: string;
  debe: number;
  haber: number;
  presupuesto_id?: string | null;
}

export interface PresupuestoAlcance {
  id: string;
  empresa_id: string;
  centro_negocio_id: string | null;
}

export function totalesAsiento(movimientos: { debe: number; haber: number }[]) {
  const totalDebe = movimientos.reduce((sum, m) => sum + (Number(m.debe) || 0), 0);
  const totalHaber = movimientos.reduce((sum, m) => sum + (Number(m.haber) || 0), 0);
  const balanced = Math.abs(totalDebe - totalHaber) < 0.01;
  return { totalDebe, totalHaber, balanced };
}

export interface OpcionesValidacionAsiento {
  /**
   * Exigir que cada partida presupuestal ligada pertenezca a la empresa y al
   * centro de negocio del asiento. AsientoDialog y Rafa lo exigen; la página
   * AsientoDetalle históricamente no lo hacía (ver docs/rafa/pendientes.md).
   */
  validarAlcancePartidas?: boolean;
  /** Rechazar importes negativos (Rafa lo exige; la interfaz no lo validaba). */
  rechazarNegativos?: boolean;
}

/**
 * Devuelve el primer error de captura (mismo texto que muestra la interfaz)
 * o null si el asiento es válido.
 */
export function validarAsiento(
  cabecera: CabeceraAsiento,
  movimientos: RenglonAsiento[],
  presupuestos: PresupuestoAlcance[],
  opciones: OpcionesValidacionAsiento = {}
): string | null {
  const { validarAlcancePartidas = true, rechazarNegativos = false } = opciones;
  if (!cabecera.empresa_id) return "La empresa es requerida";
  if (!cabecera.fecha) return "La fecha es requerida";
  if (!["ingreso", "egreso", "diario"].includes(String(cabecera.tipo))) return "Tipo de asiento inválido";

  if (movimientos.length === 0) return "Debe agregar al menos un movimiento";

  const invalidos = movimientos.filter(
    (m) => !m.cuenta_id || ((Number(m.debe) || 0) === 0 && (Number(m.haber) || 0) === 0)
  );
  if (invalidos.length > 0) return "Todos los movimientos deben tener cuenta y un monto en Debe o Haber";

  if (rechazarNegativos && movimientos.some((m) => (Number(m.debe) || 0) < 0 || (Number(m.haber) || 0) < 0)) {
    return "Los importes de Debe y Haber no pueden ser negativos";
  }

  if (!totalesAsiento(movimientos).balanced) {
    return "El asiento no está cuadrado. Total Debe debe ser igual a Total Haber";
  }

  if (cabecera.tipo === "diario") {
    const tienePresupuesto = movimientos.some((m) => m.presupuesto_id && m.presupuesto_id !== "");
    if (!tienePresupuesto) {
      return "Las pólizas de diario requieren al menos un movimiento con presupuesto asignado";
    }
  }

  if (validarAlcancePartidas) {
    const invalida = movimientos.find((m) => {
      if (!m.presupuesto_id) return false;
      const p = presupuestos.find((x) => x.id === m.presupuesto_id);
      if (!p) return true;
      if (p.empresa_id !== cabecera.empresa_id) return true;
      if (p.centro_negocio_id && p.centro_negocio_id !== (cabecera.centro_negocio_id || null)) return true;
      return false;
    });
    if (invalida) {
      return "Hay partidas presupuestales que no pertenecen al centro de negocios seleccionado. Selecciónelas de nuevo.";
    }
  }

  return null;
}
