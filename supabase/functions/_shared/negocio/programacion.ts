// Comparación de la programación de tesorería (tabla `programaciones`) contra
// el presupuesto de cada partida, con efecto acumulado y sin doble conteo.
//
// Reglas (documentadas en docs/rafa/cifras.md):
// - Consumido = ejercido (asientos `aplicado` ligados a la partida, por el
//   método elegido) + programaciones `pendiente` cuya fecha es ≤ fin de la
//   ventana.
// - Una programación `pendiente` cuyo asiento ligado (programaciones.asiento_id)
//   ya está `aplicado` NO se suma: su importe ya está en el ejercido.
// - Las programaciones `ejecutado` no se suman: en este sistema "ejecutar" solo
//   cambia el estado (no crea asiento); su efecto real se mide en el ejercido.
//   Se reportan aparte para revisión.
// - `cancelado` nunca cuenta.
// - Programaciones sin partida, con partida inactiva o de otra empresa/centro
//   son excepciones (no pueden compararse).

import { calcularMontoPresupuestado, numeroFinito, redondear2 } from "./calculos.ts";

export interface PartidaComparable {
  id: string;
  partida: string;
  empresa_id: string;
  centro_negocio_id: string | null;
  activo: boolean;
  es_project: boolean;
  tipo_movimiento: string | null;
  cantidad: unknown;
  precio_unitario: unknown;
}

export interface ProgramacionComparable {
  id: string;
  empresa_id: string;
  centro_negocio_id: string | null;
  presupuesto_id: string | null;
  fecha_programada: string;
  monto: unknown;
  tipo: string;
  estado: string;
  asiento_id: string | null;
  asiento_estado?: string | null;
}

export interface FilaComparacion {
  programacion_id: string;
  fecha: string;
  monto: number;
  consumido_tras: number;
  disponible_tras: number;
  excede: boolean;
}

export interface ComparacionPartida {
  presupuesto_id: string;
  partida: string;
  tipo_movimiento: string | null;
  presupuestado: number;
  ejercido: number;
  pendiente_previo: number;
  programado_ventana: number;
  consumido_final: number;
  disponible_final: number;
  excede: boolean;
  primera_excedida: string | null;
  filas: FilaComparacion[];
  advertencias: string[];
}

export interface ExcepcionProgramacion {
  programacion_id: string;
  fecha: string;
  monto: number;
  motivo: "sin_partida" | "partida_inactiva" | "partida_no_encontrada" | "partida_otra_empresa" | "partida_otro_centro";
}

export interface ResultadoComparacion {
  ventana: { desde: string; hasta: string };
  partidas: ComparacionPartida[];
  excepciones: ExcepcionProgramacion[];
  excluidas_por_asiento_aplicado: { programacion_id: string; monto: number; asiento_id: string }[];
  ejecutadas_en_ventana: { programacion_id: string; monto: number; asiento_id: string | null }[];
  totales: {
    programaciones_en_ventana: number;
    monto_en_ventana: number;
    monto_comparado: number;
    monto_excepciones: number;
    partidas_excedidas: number;
  };
}

function cuentaComoPendiente(p: ProgramacionComparable): boolean {
  if (p.estado !== "pendiente") return false;
  if (p.asiento_id && p.asiento_estado === "aplicado") return false;
  return true;
}

export function compararProgramacionContraPresupuesto(
  ventana: { desde: string; hasta: string },
  programaciones: ProgramacionComparable[],
  partidas: PartidaComparable[],
  ejercidoPorPartida: Map<string, number>
): ResultadoComparacion {
  const partidasMap = new Map(partidas.map((p) => [p.id, p]));
  const enVentana = (p: ProgramacionComparable) => p.fecha_programada >= ventana.desde && p.fecha_programada <= ventana.hasta;

  const excepciones: ExcepcionProgramacion[] = [];
  const excluidas: ResultadoComparacion["excluidas_por_asiento_aplicado"] = [];
  const ejecutadas: ResultadoComparacion["ejecutadas_en_ventana"] = [];
  const porPartida = new Map<string, ProgramacionComparable[]>();

  let programacionesEnVentana = 0;
  let montoEnVentana = 0;
  let montoExcepciones = 0;

  for (const p of programaciones) {
    if (p.estado === "cancelado") continue;
    const monto = numeroFinito(p.monto);
    const dentro = enVentana(p);
    if (dentro) {
      programacionesEnVentana++;
      montoEnVentana += monto;
      if (p.estado === "ejecutado") ejecutadas.push({ programacion_id: p.id, monto, asiento_id: p.asiento_id });
    }
    if (p.estado === "pendiente" && p.asiento_id && p.asiento_estado === "aplicado") {
      if (dentro) excluidas.push({ programacion_id: p.id, monto, asiento_id: p.asiento_id });
      continue;
    }
    if (!cuentaComoPendiente(p) || p.fecha_programada > ventana.hasta) continue;

    let motivo: ExcepcionProgramacion["motivo"] | null = null;
    const partida = p.presupuesto_id ? partidasMap.get(p.presupuesto_id) : undefined;
    if (!p.presupuesto_id) motivo = "sin_partida";
    else if (!partida) motivo = "partida_no_encontrada";
    else if (!partida.activo) motivo = "partida_inactiva";
    else if (partida.empresa_id !== p.empresa_id) motivo = "partida_otra_empresa";
    else if (partida.centro_negocio_id && p.centro_negocio_id && partida.centro_negocio_id !== p.centro_negocio_id)
      motivo = "partida_otro_centro";

    if (motivo) {
      if (dentro) {
        excepciones.push({ programacion_id: p.id, fecha: p.fecha_programada, monto, motivo });
        montoExcepciones += monto;
      }
      continue;
    }
    const lista = porPartida.get(p.presupuesto_id!) || [];
    lista.push(p);
    porPartida.set(p.presupuesto_id!, lista);
  }

  const resultado: ComparacionPartida[] = [];
  let montoComparado = 0;

  porPartida.forEach((lista, presupuestoId) => {
    const partida = partidasMap.get(presupuestoId)!;
    const ventanaItems = lista.filter(enVentana).sort((a, b) =>
      a.fecha_programada === b.fecha_programada ? a.id.localeCompare(b.id) : a.fecha_programada.localeCompare(b.fecha_programada)
    );
    if (ventanaItems.length === 0) return; // sin programación en la ventana: no se reporta
    const previas = lista.filter((p) => p.fecha_programada < ventana.desde);

    const presupuestado = calcularMontoPresupuestado(partida.cantidad, partida.precio_unitario);
    const ejercido = ejercidoPorPartida.get(presupuestoId) || 0;
    const pendientePrevio = previas.reduce((s, p) => s + numeroFinito(p.monto), 0);

    let consumido = ejercido + pendientePrevio;
    let primeraExcedida: string | null = null;
    const filas: FilaComparacion[] = ventanaItems.map((p) => {
      const monto = numeroFinito(p.monto);
      consumido += monto;
      const disponible = presupuestado - consumido;
      const excede = disponible < -0.005;
      if (excede && !primeraExcedida) primeraExcedida = p.id;
      return {
        programacion_id: p.id,
        fecha: p.fecha_programada,
        monto,
        consumido_tras: redondear2(consumido),
        disponible_tras: redondear2(disponible),
        excede,
      };
    });

    const advertencias: string[] = [];
    const tipos = new Set(ventanaItems.map((p) => p.tipo));
    if (partida.tipo_movimiento && (partida.tipo_movimiento === "ingreso" || partida.tipo_movimiento === "egreso")) {
      tipos.forEach((t) => {
        if (t !== partida.tipo_movimiento) {
          advertencias.push(`Hay programaciones de tipo ${t} ligadas a una partida clasificada como ${partida.tipo_movimiento}.`);
        }
      });
    } else if (!partida.tipo_movimiento) {
      advertencias.push("La partida está pendiente de clasificar (tipo de movimiento nulo).");
    }
    if (partida.es_project) {
      advertencias.push(
        "Partida de Proyecto: su proyección vive en la programación financiera del proyecto; aquí solo se compara la programación de tesorería."
      );
    }

    const programadoVentana = ventanaItems.reduce((s, p) => s + numeroFinito(p.monto), 0);
    montoComparado += programadoVentana;
    const disponibleFinal = presupuestado - consumido;
    resultado.push({
      presupuesto_id: presupuestoId,
      partida: partida.partida,
      tipo_movimiento: partida.tipo_movimiento,
      presupuestado: redondear2(presupuestado),
      ejercido: redondear2(ejercido),
      pendiente_previo: redondear2(pendientePrevio),
      programado_ventana: redondear2(programadoVentana),
      consumido_final: redondear2(consumido),
      disponible_final: redondear2(disponibleFinal),
      excede: disponibleFinal < -0.005,
      primera_excedida: primeraExcedida,
      filas,
      advertencias,
    });
  });

  resultado.sort((a, b) => a.disponible_final - b.disponible_final);

  return {
    ventana,
    partidas: resultado,
    excepciones,
    excluidas_por_asiento_aplicado: excluidas,
    ejecutadas_en_ventana: ejecutadas,
    totales: {
      programaciones_en_ventana: programacionesEnVentana,
      monto_en_ventana: redondear2(montoEnVentana),
      monto_comparado: redondear2(montoComparado),
      monto_excepciones: redondear2(montoExcepciones),
      partidas_excedidas: resultado.filter((r) => r.excede).length,
    },
  };
}

export interface ValidacionRespaldo {
  ok: boolean;
  errores: string[];
  detalle: { presupuesto_id: string; presupuestado: number; consumido_previo: number; nuevo: number; disponible_tras: number }[];
}

/**
 * Respaldo presupuestal para NUEVAS programaciones definitivas creadas por
 * Rafa: cada una debe tener partida activa de la misma empresa (y centro, si
 * ambos lo indican) y, para egresos, el acumulado no puede exceder el
 * presupuesto. Las programaciones existentes sin partida no se modifican: se
 * reportan como excepciones con `compararProgramacionContraPresupuesto`.
 */
export function validarRespaldoPresupuestal(
  nuevas: { presupuesto_id: string | null; empresa_id: string; centro_negocio_id: string | null; tipo: string; fecha_programada: string; monto: number }[],
  existentes: ProgramacionComparable[],
  partidas: PartidaComparable[],
  ejercidoPorPartida: Map<string, number>
): ValidacionRespaldo {
  const errores: string[] = [];
  const partidasMap = new Map(partidas.map((p) => [p.id, p]));
  const detalle: ValidacionRespaldo["detalle"] = [];
  const agrupadas = new Map<string, typeof nuevas>();

  nuevas.forEach((n, i) => {
    const etiqueta = `Programación ${i + 1} (${n.fecha_programada}, ${n.monto})`;
    if (!(n.monto > 0)) errores.push(`${etiqueta}: el monto debe ser mayor a cero.`);
    if (!n.presupuesto_id) {
      errores.push(`${etiqueta}: requiere partida presupuestal (respaldo presupuestal obligatorio).`);
      return;
    }
    const partida = partidasMap.get(n.presupuesto_id);
    if (!partida) return errores.push(`${etiqueta}: la partida no existe o no es visible.`);
    if (!partida.activo) return errores.push(`${etiqueta}: la partida "${partida.partida}" está inactiva.`);
    if (partida.empresa_id !== n.empresa_id) return errores.push(`${etiqueta}: la partida pertenece a otra empresa.`);
    if (partida.centro_negocio_id && n.centro_negocio_id && partida.centro_negocio_id !== n.centro_negocio_id) {
      return errores.push(`${etiqueta}: la partida no pertenece al centro de negocio indicado.`);
    }
    const lista = agrupadas.get(n.presupuesto_id) || [];
    lista.push(n);
    agrupadas.set(n.presupuesto_id, lista);
  });

  agrupadas.forEach((lista, presupuestoId) => {
    const partida = partidasMap.get(presupuestoId)!;
    const presupuestado = calcularMontoPresupuestado(partida.cantidad, partida.precio_unitario);
    const pendientes = existentes
      .filter((p) => p.presupuesto_id === presupuestoId && cuentaComoPendiente(p))
      .reduce((s, p) => s + numeroFinito(p.monto), 0);
    const consumidoPrevio = (ejercidoPorPartida.get(presupuestoId) || 0) + pendientes;
    const nuevo = lista.reduce((s, n) => s + n.monto, 0);
    const disponible = presupuestado - consumidoPrevio - nuevo;
    detalle.push({
      presupuesto_id: presupuestoId,
      presupuestado: redondear2(presupuestado),
      consumido_previo: redondear2(consumidoPrevio),
      nuevo: redondear2(nuevo),
      disponible_tras: redondear2(disponible),
    });
    const esEgreso = lista.some((n) => n.tipo === "egreso");
    if (esEgreso && disponible < -0.005) {
      errores.push(
        `La partida "${partida.partida}" no tiene respaldo suficiente: presupuesto ${redondear2(presupuestado)}, ya consumido o comprometido ${redondear2(consumidoPrevio)}, nuevo ${redondear2(nuevo)} (excede por ${redondear2(-disponible)}).`
      );
    }
  });

  return { ok: errores.length === 0, errores, detalle };
}
