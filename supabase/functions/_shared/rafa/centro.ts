/* eslint-disable @typescript-eslint/no-explicit-any */
// Resumen de un centro de negocio y aviso semanal (docs/rafa/conversaciones-por-centro.md).
// Reutiliza las herramientas de consulta de Rafa (mismas reglas, permisos y
// cálculos que en la conversación): resumen_presupuesto,
// comparar_programacion_presupuesto, consultar_programaciones y consultar_tareas.

import type { Contexto, ResultadoHerramienta, Tabla } from "./tipos.ts";
import { ejecutarHerramienta } from "./registro.ts";
import { cargarAncla, type AnclaConversacion } from "./ancla.ts";

const moneda = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

/** Semana de lunes a domingo que contiene la fecha (yyyy-mm-dd). */
export function semanaDe(fecha: string): { desde: string; hasta: string } {
  const d = new Date(`${fecha}T00:00:00Z`);
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  const lunes = new Date(d.getTime() - desplazamiento * 86400000);
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}

export interface ResumenCentro {
  centro: AnclaConversacion;
  semana: { desde: string; hasta: string };
  generado: string;
  presupuesto: {
    egresos: { presupuestado: number; ejercido: number; por_ejercer: number };
    ingresos: { presupuestado: number; ejercido: number; por_ejercer: number };
    partidas: number;
    excedidas: { presupuesto_id: string; partida: string; presupuestado: number; ejercido: number; exceso: number }[];
  } | null;
  pagos_semana: {
    egresos: number;
    ingresos: number;
    lista: { id: string; fecha: string; tipo: string; monto: number; partida: string | null; tercero: string | null; observaciones: string | null }[];
  } | null;
  excesos_semana: { presupuesto_id: string; partida: string; disponible_final: number }[] | null;
  sin_partida: { cantidad: number; monto: number; lista: { programacion_id: string; fecha: string; monto: number; observaciones: string | null }[] } | null;
  tareas_vencidas: { id: string; titulo: string; vence: string | null; estado: string; responsable: string | null }[] | null;
  avisos: string[];
}

function datosDe(r: ResultadoHerramienta | null, avisos: string[], que: string): any {
  if (!r) return null;
  if (!r.ok) {
    avisos.push(`${que}: ${r.resumen}`);
    return null;
  }
  return r.datos as any;
}

export async function resumenCentro(ctx: Contexto, centroId: string): Promise<ResumenCentro> {
  const ancla = await cargarAncla(ctx, centroId);
  if (!ancla) throw new Error("El centro de negocio no existe o no tienes acceso.");
  const semana = semanaDe(ctx.hoy);
  const base = { empresa_id: ancla.empresa_id, centro_negocio_id: ancla.centro_id };
  const [pres, comp, prog, tareas] = await Promise.all([
    ejecutarHerramienta(ctx, "resumen_presupuesto", base),
    ejecutarHerramienta(ctx, "comparar_programacion_presupuesto", { ...base, ...semana }),
    ejecutarHerramienta(ctx, "consultar_programaciones", { ...base, ...semana, estados: ["pendiente"] }),
    ancla.proyecto_id ? ejecutarHerramienta(ctx, "consultar_tareas", { proyecto_id: ancla.proyecto_id, solo_vencidas: true }) : Promise.resolve(null),
  ]);
  const avisos: string[] = [];
  const dp = datosDe(pres, avisos, "Presupuesto");
  const dc = datosDe(comp, avisos, "Programación vs presupuesto");
  const dg = datosDe(prog, avisos, "Pagos de la semana");
  const dt = datosDe(tareas, avisos, "Tareas");

  return {
    centro: ancla,
    semana,
    generado: ctx.hoy,
    presupuesto: dp
      ? {
          egresos: dp.totales.egresos,
          ingresos: dp.totales.ingresos,
          partidas: (dp.partidas || []).length,
          excedidas: (dp.partidas || [])
            .filter((p: any) => p.activo && p.presupuestado > 0 && p.ejercido > p.presupuestado)
            .map((p: any) => ({ presupuesto_id: p.id, partida: p.partida, presupuestado: p.presupuestado, ejercido: p.ejercido, exceso: r2(p.ejercido - p.presupuestado) })),
        }
      : null,
    pagos_semana: dg
      ? {
          egresos: dg.kpi_pendientes?.egresos ?? 0,
          ingresos: dg.kpi_pendientes?.ingresos ?? 0,
          lista: (dg.programaciones || []).map((p: any) => ({
            id: p.id,
            fecha: p.fecha,
            tipo: p.tipo,
            monto: p.monto,
            partida: p.partida ?? null,
            tercero: p.tercero ?? null,
            observaciones: p.observaciones ?? null,
          })),
        }
      : null,
    excesos_semana: dc
      ? (dc.partidas || []).filter((p: any) => p.excede).map((p: any) => ({ presupuesto_id: p.presupuesto_id, partida: p.partida, disponible_final: p.disponible_final }))
      : null,
    sin_partida: dc
      ? (() => {
          const lista = (dc.excepciones || [])
            .filter((x: any) => x.motivo === "sin_partida")
            .map((x: any) => ({ programacion_id: x.programacion_id, fecha: x.fecha, monto: x.monto, observaciones: x.observaciones ?? null }));
          return { cantidad: lista.length, monto: r2(lista.reduce((s: number, x: any) => s + (x.monto || 0), 0)), lista };
        })()
      : null,
    tareas_vencidas: dt ? (dt.tareas || []).map((t: any) => ({ id: t.id, titulo: t.titulo, vence: t.vence, estado: t.estado, responsable: t.responsable })) : null,
    avisos,
  };
}

/** Texto del aviso semanal (markdown breve) a partir del resumen. */
export function textoAviso(r: ResumenCentro): string {
  const lineas = [`**Aviso semanal · ${r.centro.centro_nombre} (${r.semana.desde} a ${r.semana.hasta})**`];
  if (r.pagos_semana) {
    lineas.push(
      `- Pagos pendientes esta semana: ${r.pagos_semana.lista.filter((p) => p.tipo === "egreso").length} por ${moneda(r.pagos_semana.egresos)}; cobros pendientes: ${moneda(r.pagos_semana.ingresos)}.`
    );
  }
  if (r.excesos_semana) {
    lineas.push(
      r.excesos_semana.length
        ? `- Exceden su presupuesto con lo programado: ${r.excesos_semana.length} (${r.excesos_semana.slice(0, 5).map((p) => p.partida).join(", ")}${r.excesos_semana.length > 5 ? "…" : ""}).`
        : "- Ninguna partida excede su presupuesto con lo programado esta semana."
    );
  }
  if (r.sin_partida) {
    lineas.push(
      r.sin_partida.cantidad
        ? `- Pagos programados sin partida: ${r.sin_partida.cantidad} por ${moneda(r.sin_partida.monto)}.`
        : "- Todos los pagos programados de la semana tienen partida."
    );
  }
  if (r.presupuesto?.excedidas.length) lineas.push(`- Partidas con ejercido mayor a su presupuesto: ${r.presupuesto.excedidas.length}.`);
  if (r.tareas_vencidas) lineas.push(`- Tareas vencidas del proyecto: ${r.tareas_vencidas.length}.`);
  r.avisos.forEach((a) => lineas.push(`- No se pudo revisar ${a}`));
  lineas.push("", `Aviso automático de Rafa con datos del ${r.generado}. Pregúntame para ver cifras actualizadas o el detalle.`);
  return lineas.join("\n");
}

/** Tablas del aviso (se muestran bajo el mensaje y se pueden exportar). */
export function tablasAviso(r: ResumenCentro): Tabla[] {
  const tablas: Tabla[] = [];
  if (r.pagos_semana?.lista.length) {
    tablas.push({
      titulo: `Pagos y cobros pendientes ${r.semana.desde} a ${r.semana.hasta}`,
      columnas: [
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
        { clave: "tipo", etiqueta: "Tipo" },
        { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
        { clave: "partida", etiqueta: "Partida" },
        { clave: "tercero", etiqueta: "Tercero" },
        { clave: "observaciones", etiqueta: "Observaciones" },
      ],
      filas: r.pagos_semana.lista.map((p) => ({ ...p, _enlace: "/programacion" })),
    });
  }
  if (r.excesos_semana?.length) {
    tablas.push({
      titulo: "Partidas que exceden con lo programado",
      columnas: [
        { clave: "partida", etiqueta: "Partida" },
        { clave: "disponible_final", etiqueta: "Disponible final", tipo: "moneda" },
      ],
      filas: r.excesos_semana.map((p) => ({ ...p, _enlace: `/presupuestos/${p.presupuesto_id}/ejercido` })),
    });
  }
  if (r.sin_partida?.lista.length) {
    tablas.push({
      titulo: "Pagos programados sin partida",
      columnas: [
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
        { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
        { clave: "observaciones", etiqueta: "Observaciones" },
      ],
      filas: r.sin_partida.lista.map((p) => ({ ...p, _enlace: "/programacion" })),
    });
  }
  return tablas;
}

const MAX_CENTROS_POR_LLAMADA = 40;

/**
 * Deja el aviso de la semana en la charla más reciente de cada centro del
 * usuario, una sola vez por semana (rafa_avisos reserva usuario+centro+semana).
 */
export async function asegurarAvisosSemana(ctx: Contexto): Promise<{ semana: string; generados: number; errores: string[] }> {
  const semana = semanaDe(ctx.hoy);
  const { data: convs, error } = await ctx.db
    .from("rafa_conversaciones")
    .select("id, centro_negocio_id, updated_at")
    .not("centro_negocio_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`No se pudieron leer tus conversaciones: ${error.message}`);
  const porCentro = new Map<string, string>();
  for (const c of (convs || []) as { id: string; centro_negocio_id: string }[]) {
    if (!porCentro.has(c.centro_negocio_id)) porCentro.set(c.centro_negocio_id, c.id);
  }
  // Centros dados de baja: sin aviso.
  const ids = Array.from(porCentro.keys());
  const { data: activos } = ids.length ? await ctx.db.from("centros_negocio").select("id").in("id", ids).eq("activo", true) : { data: [] };
  const vigentes = new Set(((activos || []) as { id: string }[]).map((c) => c.id));
  const errores: string[] = [];
  let generados = 0;
  for (const [centroId, conversacionId] of Array.from(porCentro.entries()).filter(([c]) => vigentes.has(c)).slice(0, MAX_CENTROS_POR_LLAMADA)) {
    // Reserva: si ya existe para esta semana, no se repite (también con dos pestañas a la vez).
    const { error: errReserva } = await ctx.servicio
      .from("rafa_avisos")
      .insert({ user_id: ctx.usuario.id, centro_negocio_id: centroId, semana: semana.desde, conversacion_id: conversacionId });
    if (errReserva) {
      if (errReserva.code !== "23505") errores.push(`${centroId}: ${errReserva.message}`);
      continue;
    }
    try {
      const r = await resumenCentro(ctx, centroId);
      const { error: errMsg } = await ctx.servicio.from("rafa_mensajes").insert({
        conversacion_id: conversacionId,
        user_id: ctx.usuario.id,
        rol: "asistente",
        contenido: textoAviso(r),
        datos: {
          aviso_semana: semana.desde,
          herramientas: [
            {
              nombre: "aviso_semanal",
              argumentos: { centro_negocio_id: centroId, ...semana },
              ok: true,
              tipo: "consulta",
              resumen: `Aviso semanal de ${r.centro.centro_nombre}`,
              alcance: { empresa: { id: r.centro.empresa_id, nombre: r.centro.empresa_nombre }, periodo: semana, filtros: { centro_negocio_id: centroId }, registros: r.pagos_semana?.lista.length ?? 0, truncado: false },
              tablas: tablasAviso(r),
              referencias: [],
              accion: null,
              advertencias: r.avisos,
              error: null,
            },
          ],
          memoria: `aviso_semanal(${centroId}, ${semana.desde}) → ${textoAviso(r).slice(0, 400)}`,
        },
        version_conocimiento: ctx.versionConocimiento,
      });
      if (errMsg) throw new Error(errMsg.message);
      await ctx.servicio.from("rafa_conversaciones").update({ updated_at: new Date().toISOString() }).eq("id", conversacionId).eq("user_id", ctx.usuario.id);
      generados++;
    } catch (e) {
      // Se libera la reserva para reintentar en la siguiente apertura.
      await ctx.servicio.from("rafa_avisos").delete().eq("user_id", ctx.usuario.id).eq("centro_negocio_id", centroId).eq("semana", semana.desde);
      errores.push(`${centroId}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { semana: semana.desde, generados, errores };
}
