/* eslint-disable @typescript-eslint/no-explicit-any */
// Lecturas financieras reutilizadas por varias herramientas. Todas reciben un
// alcance explícito (empresa y/o ids) y usan el cliente del usuario (RLS).

import type { Contexto } from "./tipos.ts";
import { leerPorIds, leerTodo } from "./datos.ts";
import {
  calcularEjercidoPorNaturaleza,
  calcularEjercidoPorPartida,
  numeroFinito,
} from "../negocio/calculos.ts";

export type MetodoEjercido = "naturaleza" | "debe_haber";

export const DESCRIPCION_METODO: Record<MetodoEjercido, string> = {
  naturaleza:
    "Ejercido por naturaleza de la cuenta de la partida (pantalla Presupuestos y vista Ejercido): gastos/costos/pasivo/capital suman Debe; activo e ingresos suman Haber. Solo asientos aplicados.",
  debe_haber:
    "Ejercido como Debe + Haber de los renglones ligados (módulo Proyectos, reporte de flujo por presupuesto y cronograma público). Solo asientos aplicados.",
};

export interface Partida {
  id: string;
  empresa_id: string;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  activo: boolean;
  es_project: boolean;
  tipo_movimiento: string | null;
  centro_negocio_id: string | null;
  cuenta_id: string | null;
  tercero_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  avance_manual: number | null;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  centro_nombre: string | null;
}

const COLUMNAS_PARTIDA =
  "id, empresa_id, partida, cantidad, precio_unitario, activo, es_project, tipo_movimiento, centro_negocio_id, cuenta_id, tercero_id, fecha_inicio, fecha_fin, avance_manual, cuentas_contables:cuenta_id(codigo, nombre), centros_negocio:centro_negocio_id(nombre, codigo)";

function mapearPartida(p: any): Partida {
  return {
    id: p.id,
    empresa_id: p.empresa_id,
    partida: p.partida,
    cantidad: numeroFinito(p.cantidad),
    precio_unitario: numeroFinito(p.precio_unitario),
    activo: p.activo,
    es_project: p.es_project,
    tipo_movimiento: p.tipo_movimiento,
    centro_negocio_id: p.centro_negocio_id,
    cuenta_id: p.cuenta_id,
    tercero_id: p.tercero_id,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
    avance_manual: p.avance_manual === null || p.avance_manual === undefined ? null : Number(p.avance_manual),
    cuenta_codigo: p.cuentas_contables?.codigo ?? null,
    cuenta_nombre: p.cuentas_contables?.nombre ?? null,
    centro_nombre: p.centros_negocio?.nombre ?? null,
  };
}

export async function leerPartidas(
  ctx: Contexto,
  filtro: { empresaId: string; ids?: string[]; centroId?: string | null; incluirInactivas?: boolean; tipoMovimiento?: string | null; soloProject?: boolean }
): Promise<{ partidas: Partida[]; truncado: boolean }> {
  if (filtro.ids) {
    const filas = await leerPorIds<any>(ctx, "presupuestos", COLUMNAS_PARTIDA, "id", filtro.ids, (q) => q.eq("empresa_id", filtro.empresaId));
    return { partidas: filas.map(mapearPartida), truncado: false };
  }
  const { filas, truncado } = await leerTodo<any>(() => {
    let q = ctx.db.from("presupuestos").select(COLUMNAS_PARTIDA).eq("empresa_id", filtro.empresaId).order("orden").order("id");
    if (!filtro.incluirInactivas) q = q.eq("activo", true);
    if (filtro.centroId) q = q.eq("centro_negocio_id", filtro.centroId);
    if (filtro.soloProject) q = q.eq("es_project", true);
    if (filtro.tipoMovimiento === "pendiente") q = q.is("tipo_movimiento", null);
    else if (filtro.tipoMovimiento) q = q.eq("tipo_movimiento", filtro.tipoMovimiento);
    return q;
  });
  return { partidas: filas.map(mapearPartida), truncado };
}

export interface MovimientoPartida {
  id: string;
  asiento_id: string;
  presupuesto_id: string | null;
  debe: number;
  haber: number;
  partida: string;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  estado_asiento: string | null;
  fecha: string | null;
  numero_asiento: number | null;
  tipo_asiento: string | null;
  empresa_id: string | null;
}

export async function leerMovimientosDePartidas(ctx: Contexto, presupuestoIds: string[]): Promise<MovimientoPartida[]> {
  const filas = await leerPorIds<any>(
    ctx,
    "asiento_movimientos",
    "id, asiento_id, presupuesto_id, debe, haber, partida, cuentas_contables:cuenta_id(codigo, nombre), asientos_contables:asiento_id(estado, fecha, numero_asiento, tipo, empresa_id)",
    "presupuesto_id",
    presupuestoIds
  );
  return filas.map((m) => ({
    id: m.id,
    asiento_id: m.asiento_id,
    presupuesto_id: m.presupuesto_id,
    debe: numeroFinito(m.debe),
    haber: numeroFinito(m.haber),
    partida: m.partida,
    cuenta_codigo: m.cuentas_contables?.codigo ?? null,
    cuenta_nombre: m.cuentas_contables?.nombre ?? null,
    estado_asiento: m.asientos_contables?.estado ?? null,
    fecha: m.asientos_contables?.fecha ?? null,
    numero_asiento: m.asientos_contables?.numero_asiento ?? null,
    tipo_asiento: m.asientos_contables?.tipo ?? null,
    empresa_id: m.asientos_contables?.empresa_id ?? null,
  }));
}

/** Ejercido por partida con el método indicado; ignora asientos de otra empresa. */
export function ejercidoPorPartidas(
  partidas: Partida[],
  movimientos: MovimientoPartida[],
  metodo: MetodoEjercido
): Map<string, number> {
  const resultado = new Map<string, number>();
  const porPartida = new Map<string, MovimientoPartida[]>();
  const empresaDe = new Map(partidas.map((p) => [p.id, p.empresa_id]));
  movimientos.forEach((m) => {
    if (!m.presupuesto_id) return;
    if (m.empresa_id && empresaDe.get(m.presupuesto_id) && m.empresa_id !== empresaDe.get(m.presupuesto_id)) return;
    const l = porPartida.get(m.presupuesto_id) || [];
    l.push(m);
    porPartida.set(m.presupuesto_id, l);
  });
  if (metodo === "debe_haber") {
    const asientos = movimientos.map((m) => ({ id: m.asiento_id, estado: m.estado_asiento || "" }));
    const mapa = calcularEjercidoPorPartida(
      Array.from(porPartida.values()).flat().map((m) => ({ asiento_id: m.asiento_id, presupuesto_id: m.presupuesto_id, debe: m.debe, haber: m.haber })),
      asientos
    );
    partidas.forEach((p) => resultado.set(p.id, mapa.get(p.id) || 0));
    return resultado;
  }
  partidas.forEach((p) => {
    const movs = porPartida.get(p.id) || [];
    resultado.set(
      p.id,
      calcularEjercidoPorNaturaleza(
        movs.map((m) => ({ asiento_id: m.asiento_id, presupuesto_id: m.presupuesto_id, debe: m.debe, haber: m.haber, cuenta_codigo: m.cuenta_codigo, estado_asiento: m.estado_asiento })),
        p.cuenta_codigo
      )
    );
  });
  return resultado;
}

export interface ProgramacionTesoreria {
  id: string;
  empresa_id: string;
  tipo: string;
  estado: string;
  fecha_programada: string;
  monto: number;
  observaciones: string | null;
  presupuesto_id: string | null;
  centro_negocio_id: string | null;
  tercero_id: string | null;
  asiento_id: string | null;
  asiento_estado: string | null;
  asiento_numero: number | null;
  partida_nombre: string | null;
  centro_nombre: string | null;
  tercero_nombre: string | null;
  updated_at: string;
}

const COLUMNAS_PROGRAMACION =
  "id, empresa_id, tipo, estado, fecha_programada, monto, observaciones, presupuesto_id, centro_negocio_id, tercero_id, asiento_id, updated_at, presupuestos:presupuesto_id(partida), centros_negocio:centro_negocio_id(nombre), terceros:tercero_id(razon_social), asientos_contables:asiento_id(estado, numero_asiento)";

function mapearProgramacion(p: any): ProgramacionTesoreria {
  return {
    id: p.id,
    empresa_id: p.empresa_id,
    tipo: p.tipo,
    estado: p.estado,
    fecha_programada: p.fecha_programada,
    monto: numeroFinito(p.monto),
    observaciones: p.observaciones,
    presupuesto_id: p.presupuesto_id,
    centro_negocio_id: p.centro_negocio_id,
    tercero_id: p.tercero_id,
    asiento_id: p.asiento_id,
    asiento_estado: p.asientos_contables?.estado ?? null,
    asiento_numero: p.asientos_contables?.numero_asiento ?? null,
    partida_nombre: p.presupuestos?.partida ?? null,
    centro_nombre: p.centros_negocio?.nombre ?? null,
    tercero_nombre: p.terceros?.razon_social ?? null,
    updated_at: p.updated_at,
  };
}

export interface FiltroProgramaciones {
  empresaId: string;
  desde?: string;
  hasta?: string;
  estados?: string[];
  tipo?: string;
  centroId?: string;
  presupuestoIds?: string[];
  terceroId?: string;
  sinPartida?: boolean;
  ids?: string[];
}

export async function leerProgramaciones(
  ctx: Contexto,
  f: FiltroProgramaciones
): Promise<{ programaciones: ProgramacionTesoreria[]; truncado: boolean }> {
  if (f.ids) {
    const filas = await leerPorIds<any>(ctx, "programaciones", COLUMNAS_PROGRAMACION, "id", f.ids, (q) => q.eq("empresa_id", f.empresaId));
    return { programaciones: filas.map(mapearProgramacion), truncado: false };
  }
  const construir = (ids?: string[]) => () => {
    let q = ctx.db.from("programaciones").select(COLUMNAS_PROGRAMACION).eq("empresa_id", f.empresaId).order("fecha_programada").order("id");
    if (f.desde) q = q.gte("fecha_programada", f.desde);
    if (f.hasta) q = q.lte("fecha_programada", f.hasta);
    if (f.estados?.length) q = q.in("estado", f.estados);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.centroId) q = q.eq("centro_negocio_id", f.centroId);
    if (f.terceroId) q = q.eq("tercero_id", f.terceroId);
    if (f.sinPartida) q = q.is("presupuesto_id", null);
    if (ids) q = q.in("presupuesto_id", ids);
    return q;
  };
  if (f.presupuestoIds) {
    const todas: ProgramacionTesoreria[] = [];
    let truncado = false;
    for (let i = 0; i < f.presupuestoIds.length; i += 150) {
      const r = await leerTodo<any>(construir(f.presupuestoIds.slice(i, i + 150)));
      todas.push(...r.filas.map(mapearProgramacion));
      truncado = truncado || r.truncado;
    }
    return { programaciones: todas, truncado };
  }
  const { filas, truncado } = await leerTodo<any>(construir());
  return { programaciones: filas.map(mapearProgramacion), truncado };
}

export interface PagoProyecto {
  presupuesto_id: string;
  proyecto_id: string;
  fecha: string;
  monto: number;
  concepto: string | null;
  es_anticipo: boolean;
}

/**
 * Programación propia de Proyecto (proyecto_programacion_financiera +
 * proyecto_programacion_pagos) para las partidas dadas. Solo se aceptan
 * programaciones cuyo proyecto corresponde al centro de la partida.
 */
export async function leerProgramacionPropia(ctx: Contexto, partidas: Partida[]): Promise<Map<string, PagoProyecto[]>> {
  const projectIds = partidas.filter((p) => p.es_project).map((p) => p.id);
  const mapa = new Map<string, PagoProyecto[]>();
  if (projectIds.length === 0) return mapa;
  const programaciones = await leerPorIds<any>(ctx, "proyecto_programacion_financiera", "id, presupuesto_id, proyecto_id, empresa_id", "presupuesto_id", projectIds);
  if (programaciones.length === 0) return mapa;
  const proyectos = await leerPorIds<any>(ctx, "proyectos", "id, centro_negocio_id, empresa_id", "id", programaciones.map((p) => p.proyecto_id));
  const proyectoMap = new Map(proyectos.map((p) => [p.id, p]));
  const partidaMap = new Map(partidas.map((p) => [p.id, p]));
  const validas = programaciones.filter((prog) => {
    const proy = proyectoMap.get(prog.proyecto_id);
    const part = partidaMap.get(prog.presupuesto_id);
    return proy && part && proy.centro_negocio_id === part.centro_negocio_id && proy.empresa_id === part.empresa_id && prog.empresa_id === part.empresa_id;
  });
  const pagos = await leerPorIds<any>(ctx, "proyecto_programacion_pagos", "programacion_id, proyecto_id, fecha, monto, concepto, es_anticipo", "programacion_id", validas.map((v) => v.id));
  validas.forEach((prog) => {
    mapa.set(
      prog.presupuesto_id,
      pagos
        .filter((p) => p.programacion_id === prog.id && p.proyecto_id === prog.proyecto_id)
        .map((p) => ({
          presupuesto_id: prog.presupuesto_id,
          proyecto_id: prog.proyecto_id,
          fecha: p.fecha,
          monto: numeroFinito(p.monto),
          concepto: p.concepto,
          es_anticipo: p.es_anticipo,
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
    );
  });
  return mapa;
}

export interface FlujoLegacy {
  id: string;
  presupuesto_id: string | null;
  fecha: string;
  monto: number;
  tipo: string;
  descripcion: string | null;
  auto_generado: boolean;
  empresa_id: string | null;
}

export async function leerFlujosLegacy(ctx: Contexto, presupuestoIds: string[]): Promise<FlujoLegacy[]> {
  const filas = await leerPorIds<any>(ctx, "flujos_programados", "id, presupuesto_id, fecha, monto, tipo, descripcion, auto_generado, empresa_id", "presupuesto_id", presupuestoIds);
  return filas.map((f) => ({ ...f, monto: numeroFinito(f.monto) }));
}

/**
 * Proyectado por partida con la regla de fuente única: partidas de Proyecto
 * usan solo su programación propia (sin programación = $0); el resto usa
 * flujos_programados. Devuelve también el detalle de qué fuente se usó.
 */
export function proyectadoPorPartida(
  partidas: Partida[],
  flujos: FlujoLegacy[],
  propias: Map<string, PagoProyecto[]>,
  rango?: { desde?: string; hasta?: string }
): Map<string, { total: number; fuente: "proyecto_programacion_pagos" | "flujos_programados"; filas: { fecha: string; monto: number; descripcion: string | null }[] }> {
  const dentro = (fecha: string) => (!rango?.desde || fecha >= rango.desde) && (!rango?.hasta || fecha <= rango.hasta);
  const r = new Map<string, { total: number; fuente: "proyecto_programacion_pagos" | "flujos_programados"; filas: { fecha: string; monto: number; descripcion: string | null }[] }>();
  partidas.forEach((p) => {
    if (p.es_project) {
      const filas = (propias.get(p.id) || []).filter((x) => dentro(x.fecha) && x.monto > 0).map((x) => ({ fecha: x.fecha, monto: x.monto, descripcion: x.concepto }));
      r.set(p.id, { total: filas.reduce((s, x) => s + x.monto, 0), fuente: "proyecto_programacion_pagos", filas });
    } else {
      const filas = flujos
        .filter((f) => f.presupuesto_id === p.id && !f.auto_generado && dentro(f.fecha))
        .map((f) => ({ fecha: f.fecha, monto: f.monto, descripcion: f.descripcion }));
      r.set(p.id, { total: filas.reduce((s, x) => s + x.monto, 0), fuente: "flujos_programados", filas });
    }
  });
  return r;
}
