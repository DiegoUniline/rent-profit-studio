/* eslint-disable @typescript-eslint/no-explicit-any */
// Reprogramación masiva de fechas: cientos de partidas con UNA propuesta, UNA
// confirmación y UNA transacción (rafa_reprogramar_masiva). La última
// instrucción manda: reemplaza la programación vigente de cada partida.
// - Partidas de Proyecto: sus pagos (la barra del Gantt se alinea sola).
// - Resto: sus flujos programados capturados a mano.

import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { TODOS_LOS_ROLES, ErrorPermiso, accesoProyecto, esContable, tieneRol } from "../permisos.ts";
import { enlaces, leerPorIds, leerTodo, ref, resolverEmpresa } from "../datos.ts";
import { type Preparacion, proponerAccion, registrarAccion } from "../acciones.ts";
import { distribuirSaldoEntrePeriodos, numeroFinito } from "../../negocio/calculos.ts";
import { calcularFechasPorFrecuencia, fechaLocal, isoLocal, sumarDias, sumarMeses } from "../../negocio/fechas.ts";
import { moneda, r2 } from "./util.ts";

export const MAX_PARTIDAS_REPROGRAMACION = 1000;
const FRECUENCIAS = ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"] as const;
type Frecuencia = (typeof FRECUENCIAS)[number];

export interface EntradaReprogramacion {
  empresa_id?: string;
  centro_negocio_id?: string;
  presupuesto_ids?: string[];
  texto?: string;
  desde_partida?: string;
  hasta_partida?: string;
  modo: "mover" | "recorrer" | "reprogramar";
  fecha_inicio?: string;
  fecha_fin?: string;
  dias?: number;
  meses?: number;
  frecuencia?: Frecuencia;
  numero_pagos?: number;
}

interface Movimiento {
  fecha: string;
  monto: number;
  concepto: string | null;
  es_anticipo: boolean;
}

function fallo(errores: string[], faltantes?: string[]): Preparacion {
  return {
    ok: false,
    errores,
    faltantes,
    descripcion: "",
    vista_previa: { resumen: "", tablas: [], advertencias: [], efectos: [] },
    huella_datos: null,
    registros_afectados: [],
    rpc: { nombre: "", args: {} },
    requiere_confirmacion: true,
  };
}

const normalizar = (t: string) =>
  (t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Orden de la pantalla Presupuestos: `orden`, luego nombre con números naturales. */
export function ordenarPartidas<T extends { orden: number | null; partida: string; id: string }>(partidas: T[]): T[] {
  return [...partidas].sort(
    (a, b) =>
      (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER) ||
      a.partida.localeCompare(b.partida, "es", { numeric: true, sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );
}

/** Posición de la partida nombrada: coincidencia exacta o, si es única, parcial. */
export function ubicarPartida(partidas: { partida: string }[], nombre: string): { indice: number } | { error: string } {
  const buscado = normalizar(nombre);
  const exactas = partidas.map((p, i) => (normalizar(p.partida) === buscado ? i : -1)).filter((i) => i >= 0);
  if (exactas.length === 1) return { indice: exactas[0] };
  // Parcial por palabras completas: "lote 1" no es "lote 10".
  const patron = new RegExp(`(^|[^a-z0-9])${buscado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
  const parciales = exactas.length ? exactas : partidas.map((p, i) => (patron.test(normalizar(p.partida)) ? i : -1)).filter((i) => i >= 0);
  if (parciales.length === 1) return { indice: parciales[0] };
  if (!parciales.length) return { error: `No encontré la partida "${nombre}" en la selección.` };
  const ejemplos = parciales.slice(0, 5).map((i) => `"${partidas[i].partida}"`).join(", ");
  return { error: `"${nombre}" coincide con ${parciales.length} partidas (${ejemplos}${parciales.length > 5 ? ", …" : ""}); indica el nombre exacto.` };
}

const diasEntre = (a: string, b: string) => Math.round((fechaLocal(b).getTime() - fechaLocal(a).getTime()) / 86400000);

/**
 * Nuevas fechas de una programación existente (conserva montos y conceptos):
 * - mover: el primer pago cae en fecha_inicio y se conserva la separación; con
 *   fecha_fin, los pagos se reparten proporcionalmente entre inicio y fin.
 * - recorrer: cada pago se corre N meses y/o N días.
 */
export function moverMovimientos(actuales: Movimiento[], e: Pick<EntradaReprogramacion, "modo" | "fecha_inicio" | "fecha_fin" | "dias" | "meses">): Movimiento[] {
  if (!actuales.length) return [];
  const fechas = actuales.map((m) => m.fecha).sort();
  const min = fechas[0];
  const max = fechas[fechas.length - 1];
  return actuales.map((m) => {
    let nueva: Date;
    if (e.modo === "recorrer") {
      nueva = sumarDias(sumarMeses(fechaLocal(m.fecha), e.meses ?? 0), e.dias ?? 0);
    } else if (e.fecha_fin && max > min) {
      const tramo = diasEntre(e.fecha_inicio!, e.fecha_fin);
      nueva = sumarDias(fechaLocal(e.fecha_inicio!), Math.round((diasEntre(min, m.fecha) / diasEntre(min, max)) * tramo));
    } else {
      nueva = sumarDias(fechaLocal(m.fecha), diasEntre(min, e.fecha_inicio!));
    }
    return { ...m, fecha: isoLocal(nueva) };
  });
}

/** Programación nueva de `monto` (sin anticipo): por frecuencia, mensual entre inicio y fin, o un solo pago. */
export function programarMonto(monto: number, e: Pick<EntradaReprogramacion, "fecha_inicio" | "fecha_fin" | "frecuencia" | "numero_pagos">): Movimiento[] {
  if (!(monto > 0) || !e.fecha_inicio) return [];
  let frecuencia: Frecuencia = e.frecuencia ?? "mensual";
  let n = e.numero_pagos ?? 1;
  if (!e.numero_pagos && e.fecha_fin && e.fecha_fin > e.fecha_inicio) {
    const ini = fechaLocal(e.fecha_inicio);
    const fin = fechaLocal(e.fecha_fin);
    frecuencia = "mensual";
    n = (fin.getFullYear() - ini.getFullYear()) * 12 + fin.getMonth() - ini.getMonth() + 1;
    while (n > 1 && isoLocal(sumarMeses(ini, n - 1)) > e.fecha_fin) n--;
  }
  const fechas = calcularFechasPorFrecuencia(fechaLocal(e.fecha_inicio), frecuencia, n);
  const montos = distribuirSaldoEntrePeriodos(r2(monto), fechas.length);
  return fechas.map((f, i) => ({ fecha: isoLocal(f), monto: montos[i], concepto: `Pago ${i + 1}`, es_anticipo: false })).filter((m) => m.monto > 0);
}

const rango = (ms: { fecha: string }[]) => {
  if (!ms.length) return "Sin programación";
  const f = ms.map((m) => m.fecha).sort();
  return f[0] === f[f.length - 1] ? `${f[0]} (${ms.length})` : `${f[0]} a ${f[f.length - 1]} (${ms.length})`;
};
const firma = (ms: Movimiento[]) => JSON.stringify(ms.map((m) => [m.fecha, r2(m.monto), m.es_anticipo]).sort());

async function prepararReprogramacion(ctx: any, e: EntradaReprogramacion): Promise<Preparacion> {
  // 1. Instrucción completa.
  if (e.modo === "mover" && !e.fecha_inicio) return fallo(["Indica la fecha a la que se mueven las partidas."], ["fecha_inicio"]);
  if (e.modo === "recorrer" && !e.dias && !e.meses) return fallo(["Indica cuántos meses o días se recorren (negativo = adelantar)."], ["meses"]);
  if (e.modo === "reprogramar" && (!e.fecha_inicio || !e.frecuencia || !e.numero_pagos)) {
    return fallo(["Para reprogramar indica fecha del primer pago, frecuencia y número de pagos."], ["fecha_inicio", "frecuencia", "numero_pagos"]);
  }
  if (e.fecha_fin && e.fecha_inicio && e.fecha_fin < e.fecha_inicio) return fallo(["La fecha final es anterior a la inicial."]);
  if (!e.centro_negocio_id && !(e.presupuesto_ids || []).length) {
    return fallo(["Indica el centro de negocio (o las partidas) a reprogramar."], ["centro_negocio_id"]);
  }

  // 2. Selección de partidas (activas), en el orden de la pantalla Presupuestos.
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const columnas = "id, partida, empresa_id, centro_negocio_id, cantidad, precio_unitario, es_project, tipo_movimiento, orden";
  let partidas: any[];
  if ((e.presupuesto_ids || []).length) {
    partidas = await leerPorIds(ctx, "presupuestos", columnas, "id", e.presupuesto_ids!, (q) => q.eq("activo", true).eq("empresa_id", empresa.id));
    if (e.centro_negocio_id) partidas = partidas.filter((p) => p.centro_negocio_id === e.centro_negocio_id);
  } else {
    ({ filas: partidas } = await leerTodo(() =>
      ctx.db.from("presupuestos").select(columnas).eq("empresa_id", empresa.id).eq("centro_negocio_id", e.centro_negocio_id).eq("activo", true).order("id")
    ));
  }
  partidas = ordenarPartidas(partidas);
  if (e.texto) {
    const t = normalizar(e.texto);
    partidas = partidas.filter((p) => normalizar(p.partida).includes(t));
  }
  if (e.desde_partida || e.hasta_partida) {
    const desde = e.desde_partida ? ubicarPartida(partidas, e.desde_partida) : { indice: 0 };
    if ("error" in desde) return fallo([desde.error]);
    const hasta = e.hasta_partida ? ubicarPartida(partidas, e.hasta_partida) : { indice: partidas.length - 1 };
    if ("error" in hasta) return fallo([hasta.error]);
    partidas = partidas.slice(Math.min(desde.indice, hasta.indice), Math.max(desde.indice, hasta.indice) + 1);
  }
  if (!partidas.length) return fallo(["No hay partidas activas que coincidan con la selección."]);
  if (partidas.length > MAX_PARTIDAS_REPROGRAMACION) {
    return fallo([`La selección tiene ${partidas.length} partidas; el máximo por operación es ${MAX_PARTIDAS_REPROGRAMACION}. Divídela por rango o por texto.`]);
  }

  // 3. Proyecto vigente de cada partida de Proyecto y permisos.
  const centros = [...new Set(partidas.filter((p) => p.es_project && p.centro_negocio_id).map((p) => p.centro_negocio_id))];
  const proyectos = centros.length ? await leerPorIds(ctx, "proyectos", "id, nombre, empresa_id, centro_negocio_id", "centro_negocio_id", centros, (q) => q.eq("activo", true)) : [];
  const proyectoPorCentro = new Map(proyectos.map((p: any) => [p.centro_negocio_id, p]));
  for (const pr of proyectos as any[]) {
    if (!(await accesoProyecto(ctx, pr.id)).editarProgramacionFinanciera) {
      throw new ErrorPermiso(`No tienes permiso para editar la programación financiera del proyecto ${pr.nombre}.`);
    }
  }
  if (partidas.some((p) => !p.es_project) && !esContable(ctx)) {
    throw new ErrorPermiso("Solo admin/contador pueden reprogramar flujos de partidas que no son de proyecto.");
  }

  // 4. Programación vigente.
  const idsProyecto = partidas.filter((p) => p.es_project).map((p) => p.id);
  const idsFlujo = partidas.filter((p) => !p.es_project).map((p) => p.id);
  const programaciones = idsProyecto.length
    ? await leerPorIds(ctx, "proyecto_programacion_financiera", "id, presupuesto_id, modo, frecuencia, fecha_inicio, numero_pagos, anticipo_monto, anticipo_fecha", "presupuesto_id", idsProyecto)
    : [];
  const progPorPartida = new Map(programaciones.map((p: any) => [p.presupuesto_id, p]));
  const pagos = programaciones.length
    ? await leerPorIds(ctx, "proyecto_programacion_pagos", "id, programacion_id, fecha, monto, concepto, es_anticipo, orden", "programacion_id", programaciones.map((p: any) => p.id))
    : [];
  const flujos = idsFlujo.length
    ? await leerPorIds(ctx, "flujos_programados", "id, presupuesto_id, fecha, monto, descripcion, tipo", "presupuesto_id", idsFlujo, (q) => q.eq("auto_generado", false).is("asiento_movimiento_id", null))
    : [];
  const ejercido = new Map<string, number>();
  if (e.modo !== "recorrer" && idsProyecto.length) {
    const movs = await leerPorIds(ctx, "asiento_movimientos", "id, presupuesto_id, debe, haber, asientos_contables:asiento_id(estado)", "presupuesto_id", idsProyecto);
    (movs as any[])
      .filter((m) => m.asientos_contables?.estado === "aplicado")
      .forEach((m) => ejercido.set(m.presupuesto_id, (ejercido.get(m.presupuesto_id) || 0) + numeroFinito(m.debe) + numeroFinito(m.haber)));
  }

  // 5. Nueva programación por partida.
  const cambiosProyecto: any[] = [];
  const cambiosFlujo: any[] = [];
  const filas: Record<string, unknown>[] = [];
  const omitidas: string[] = [];
  const huella: unknown[] = [];
  let totalMovs = 0;

  for (const p of partidas) {
    const presupuestado = r2(numeroFinito(p.cantidad) * numeroFinito(p.precio_unitario));
    let actuales: (Movimiento & { id: string })[];
    if (p.es_project) {
      const prog = progPorPartida.get(p.id);
      actuales = (pagos as any[])
        .filter((g) => prog && g.programacion_id === prog.id)
        .map((g) => ({ id: g.id, fecha: g.fecha, monto: numeroFinito(g.monto), concepto: g.concepto, es_anticipo: Boolean(g.es_anticipo), orden: g.orden }))
        .sort((a: any, b: any) => (a.es_anticipo === b.es_anticipo ? a.orden - b.orden || a.fecha.localeCompare(b.fecha) : a.es_anticipo ? -1 : 1));
    } else {
      actuales = (flujos as any[])
        .filter((f) => f.presupuesto_id === p.id)
        .map((f) => ({ id: f.id, fecha: f.fecha, monto: numeroFinito(f.monto), concepto: f.descripcion, es_anticipo: false }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    huella.push([p.id, presupuestado, p.es_project, p.tipo_movimiento, actuales.map((a) => [a.id, a.fecha, a.monto]), r2(ejercido.get(p.id) || 0)]);

    if (p.es_project && !proyectoPorCentro.get(p.centro_negocio_id)) {
      omitidas.push(`${p.partida} (su proyecto no está activo)`);
      continue;
    }
    const pendiente = p.es_project ? r2(presupuestado - (ejercido.get(p.id) || 0)) : presupuestado;
    let nuevos: Movimiento[];
    if (e.modo === "reprogramar" || (e.modo === "mover" && !actuales.length)) {
      nuevos = programarMonto(pendiente, e);
      if (!nuevos.length) {
        omitidas.push(`${p.partida} (${pendiente > 0 ? "sin monto que programar" : "ya está pagada o su presupuesto es $0"})`);
        continue;
      }
    } else if (!actuales.length) {
      omitidas.push(`${p.partida} (no tiene programación que recorrer)`);
      continue;
    } else {
      nuevos = moverMovimientos(actuales, e);
    }
    const total = r2(nuevos.reduce((t, m) => t + m.monto, 0));
    if (p.es_project && total > presupuestado + 0.01) {
      omitidas.push(`${p.partida} (lo programado ${moneda(total)} supera su presupuesto ${moneda(presupuestado)}; ajústala primero)`);
      continue;
    }
    if (firma(nuevos) === firma(actuales)) {
      omitidas.push(`${p.partida} (ya está en esas fechas)`);
      continue;
    }

    // Flujos sin proyecto: los vigentes se actualizan en su lugar (por fecha); solo los sobrantes se eliminan (RLS: admin).
    const ordenados = [...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const eliminar = p.es_project ? [] : actuales.slice(ordenados.length).map((a) => a.id);
    if (eliminar.length && !tieneRol(ctx, "admin")) {
      omitidas.push(`${p.partida} (quedaría con ${ordenados.length} de ${actuales.length} flujos; eliminar los sobrantes requiere admin)`);
      continue;
    }

    totalMovs += nuevos.length;
    filas.push({
      partida: p.partida,
      origen: p.es_project ? "Proyecto" : "Flujo",
      antes: rango(actuales),
      despues: rango(nuevos),
      monto: total,
    });
    if (p.es_project) {
      const prog = progPorPartida.get(p.id);
      const anticipo = nuevos.find((m) => m.es_anticipo);
      const regulares = nuevos.filter((m) => !m.es_anticipo);
      // Correr fechas conserva la cadencia; repartir entre inicio y fin la vuelve manual.
      const conservaCadencia = prog && actuales.length && (e.modo === "recorrer" || !e.fecha_fin);
      const automatica = !actuales.length || e.modo === "reprogramar";
      cambiosProyecto.push({
        presupuesto_id: p.id,
        proyecto_id: proyectoPorCentro.get(p.centro_negocio_id).id,
        empresa_id: p.empresa_id,
        modo: conservaCadencia ? prog.modo : automatica && regulares.length > 1 ? "automatica" : "manual",
        frecuencia: conservaCadencia ? prog.frecuencia : automatica && regulares.length > 1 ? e.frecuencia ?? "mensual" : null,
        fecha_inicio: regulares[0]?.fecha ?? null,
        numero_pagos: regulares.length,
        anticipo_monto: anticipo ? r2(anticipo.monto) : 0,
        anticipo_fecha: anticipo?.fecha ?? null,
        esperados: actuales.length,
        pagos: nuevos.map((m) => ({ fecha: m.fecha, monto: r2(m.monto), concepto: m.concepto, es_anticipo: m.es_anticipo })),
      });
    } else {
      const tipoPartida = p.tipo_movimiento === "ingreso" || p.tipo_movimiento === "egreso" ? p.tipo_movimiento : null;
      cambiosFlujo.push({
        presupuesto_id: p.id,
        empresa_id: p.empresa_id,
        tipo: tipoPartida ?? (flujos as any[]).find((f) => f.presupuesto_id === p.id)?.tipo ?? "egreso",
        esperados: actuales.length,
        filas: ordenados.map((m, i) => ({ id: actuales[i]?.id ?? null, fecha: m.fecha, monto: r2(m.monto), descripcion: m.concepto })),
        eliminar,
      });
    }
  }

  if (!filas.length) {
    return fallo([`Ninguna partida cambia: ${omitidas.slice(0, 10).join("; ")}${omitidas.length > 10 ? ` y ${omitidas.length - 10} más` : ""}.`]);
  }

  const queHace =
    e.modo === "recorrer"
      ? `recorrer ${[e.meses ? `${e.meses} mes(es)` : "", e.dias ? `${e.dias} día(s)` : ""].filter(Boolean).join(" y ")}`
      : e.modo === "reprogramar"
        ? `${e.numero_pagos} pago(s) ${e.frecuencia} desde ${e.fecha_inicio}`
        : e.fecha_fin
          ? `del ${e.fecha_inicio} al ${e.fecha_fin}`
          : `a partir del ${e.fecha_inicio}`;
  const advertencias = [
    "Reemplaza la programación vigente de cada partida (manda la última instrucción).",
    ...(omitidas.length ? [`Sin cambio ${omitidas.length} partida(s): ${omitidas.slice(0, 15).join("; ")}${omitidas.length > 15 ? "; …" : ""}.`] : []),
  ];
  return {
    ok: true,
    descripcion: `Reprogramar ${filas.length} partida(s): ${queHace}`,
    vista_previa: {
      resumen: `${filas.length} partida(s) (${cambiosProyecto.length} de proyecto, ${cambiosFlujo.length} con flujos programados) quedan con ${totalMovs} pagos; ${queHace}.`,
      tablas: [
        {
          titulo: "Partidas a reprogramar",
          columnas: [
            { clave: "partida", etiqueta: "Partida" },
            { clave: "origen", etiqueta: "Origen" },
            { clave: "antes", etiqueta: "Antes" },
            { clave: "despues", etiqueta: "Después" },
            { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
          ],
          filas,
          totales: { monto: r2(filas.reduce((t, f) => t + Number(f.monto), 0)) },
        },
      ],
      advertencias,
      efectos: [
        "Una sola transacción: si una partida falla no se aplica ninguna.",
        "Partidas de proyecto: cambia sus pagos programados y la barra del Gantt se ajusta sola.",
        "Partidas sin proyecto: cambia sus flujos programados (no toca IVA automático ni flujos ligados a asientos).",
        "No crea asientos ni programaciones de tesorería.",
      ],
    },
    huella_datos: huella,
    registros_afectados: [
      ...(proyectos as any[]).map((pr) => ref("proyecto", pr.id, pr.nombre, enlaces.proyecto(pr.id))),
      ...(cambiosFlujo.length ? [ref("presupuestos", empresa.id, `Presupuestos de ${empresa.nombre}`, enlaces.presupuestos())] : []),
    ],
    rpc: { nombre: "rafa_reprogramar_masiva", args: { p_cambios: { proyecto: cambiosProyecto, flujos: cambiosFlujo } } },
    requiere_confirmacion: true,
  };
}

export const proponerReprogramacionMasivaTool: Herramienta<EntradaReprogramacion> = {
  nombre: "proponer_reprogramacion_masiva",
  modulo: "proyectos",
  tipo: "accion",
  descripcion:
    "Propone mover o reprogramar las FECHAS de muchas partidas a la vez (hasta 1000) con una sola confirmación: \"de la partida X a la Y\" (desde_partida/hasta_partida en el orden de Presupuestos), por texto, o por lista de ids, dentro de un centro. " +
    "modo=mover: el primer pago cae en fecha_inicio conservando la separación (con fecha_fin se reparten entre ambas fechas); las partidas sin programación se programan en esa fecha (o mensual hasta fecha_fin). " +
    "modo=recorrer: corre cada pago N meses y/o días (negativo = adelantar). " +
    "modo=reprogramar: reemplaza por numero_pagos pagos con frecuencia desde fecha_inicio, repartiendo lo pendiente. " +
    "Reemplaza lo ya programado (manda la última instrucción). Úsala SIEMPRE que sean 2 o más partidas.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      centro_negocio_id: s.uuid("Centro de negocio de las partidas"),
      presupuesto_ids: s.lista(s.uuid("Partida"), "Partidas exactas (opcional)", MAX_PARTIDAS_REPROGRAMACION),
      texto: s.texto("Solo partidas cuyo nombre contiene este texto", 120),
      desde_partida: s.texto("Nombre de la primera partida del rango", 200),
      hasta_partida: s.texto("Nombre de la última partida del rango", 200),
      modo: s.enumerado(["mover", "recorrer", "reprogramar"], "Qué hacer con las fechas"),
      fecha_inicio: s.fecha("Fecha destino / primer pago"),
      fecha_fin: s.fecha("Fecha final (opcional, solo mover)"),
      meses: s.entero("Meses a recorrer (negativo = adelantar)", -120, 120),
      dias: s.entero("Días a recorrer (negativo = adelantar)", -3650, 3650),
      frecuencia: s.enumerado([...FRECUENCIAS], "Frecuencia (reprogramar)"),
      numero_pagos: s.entero("Número de pagos (reprogramar, 1 a 120)", 1, 120),
    },
    ["modo"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: [
    "Centro o lista de partidas obligatorio; máximo 1000 partidas activas",
    "Permiso de editar programación financiera de cada proyecto; flujos sin proyecto solo admin/contador",
    "Lo programado no supera el presupuesto",
    "Al confirmar: rafa_reprogramar_masiva (una transacción; falla si los pagos cambiaron)",
  ],
  devuelve: "Propuesta con antes/después por partida; al confirmar reemplaza la programación de todas en una transacción.",
  confirmacion: "siempre",
  anclaCentro: true,
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_reprogramacion_masiva", e),
};
registrarAccion({ herramienta: "proponer_reprogramacion_masiva", preparar: prepararReprogramacion });
