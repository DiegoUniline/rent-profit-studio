/* eslint-disable @typescript-eslint/no-explicit-any */
// Motor de acciones de Rafa: propuesta → confirmación → ejecución.
//
// - preparar() es determinista a partir de la base: valida, calcula la vista
//   previa y la "huella" (hash de los registros y valores presentados).
// - La confirmación solo llega desde la interfaz (endpoint `confirmar`), nunca
//   desde el modelo. Al confirmar se vuelve a preparar con datos y permisos
//   actuales; si la huella cambió, la acción queda `desactualizada` y se
//   presenta una nueva propuesta.
// - La ejecución llama una RPC SECURITY INVOKER (RLS del usuario) que corre en
//   una transacción y registra rafa_ejecuciones: reintentos sin duplicados.

import type { AccionResumen, Contexto, Referencia, ResultadoHerramienta, Tabla } from "./tipos.ts";
import { errorComoResultado } from "./herramientas/util.ts";

export interface VistaPrevia {
  resumen: string;
  tablas: Tabla[];
  totales?: Record<string, unknown>;
  advertencias: string[];
  efectos: string[];
}

export interface Preparacion {
  ok: boolean;
  errores?: string[];
  faltantes?: string[];
  descripcion: string;
  vista_previa: VistaPrevia;
  /** Datos que deben seguir iguales al confirmar (valores, estados, updated_at). */
  huella_datos: unknown;
  registros_afectados: Referencia[];
  rpc: { nombre: string; args: Record<string, unknown> };
  requiere_confirmacion: boolean;
}

export interface DefinicionAccion<E = any> {
  herramienta: string;
  preparar(ctx: Contexto, entrada: E): Promise<Preparacion>;
}

const registro = new Map<string, DefinicionAccion>();

export function registrarAccion(def: DefinicionAccion) {
  registro.set(def.herramienta, def);
}

export function obtenerAccion(nombre: string): DefinicionAccion | undefined {
  return registro.get(nombre);
}

function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
}

export async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function huellaDe(herramienta: string, entrada: unknown, prep: Preparacion): Promise<string> {
  return sha256(canonico({ herramienta, entrada, datos: prep.huella_datos, rpc: prep.rpc }));
}

function resumenAccion(fila: any): AccionResumen {
  return {
    id: fila.id,
    estado: fila.estado,
    herramienta: fila.herramienta,
    descripcion: fila.descripcion,
    requiere_confirmacion: fila.requiere_confirmacion,
    huella: fila.huella,
    vista_previa: fila.vista_previa,
    expira_at: fila.expira_at,
    resultado: fila.resultado ?? undefined,
    error: fila.error ?? null,
  };
}

function resultadoDeAccion(fila: any, mensaje: string): ResultadoHerramienta {
  const prev = fila.vista_previa as VistaPrevia;
  return {
    ok: !["fallida", "desactualizada", "expirada", "cancelada"].includes(fila.estado),
    tipo: "accion",
    resumen: mensaje,
    accion: resumenAccion(fila),
    tablas: prev?.tablas,
    advertencias: prev?.advertencias,
    referencias: fila.registros_afectados || [],
    datos: { estado: fila.estado, resultado: fila.resultado ?? null, error: fila.error ?? null },
  };
}

/** Prepara y registra una acción. Si no requiere confirmación, la ejecuta. */
export async function proponerAccion(ctx: Contexto, herramienta: string, entrada: unknown): Promise<ResultadoHerramienta> {
  const def = obtenerAccion(herramienta);
  if (!def) return { ok: false, tipo: "error", resumen: `Acción ${herramienta} no registrada.`, error: "accion_desconocida" };
  let prep: Preparacion;
  try {
    prep = await def.preparar(ctx, entrada);
  } catch (e) {
    return errorComoResultado(e);
  }
  if (!prep.ok) {
    return {
      ok: false,
      tipo: "error",
      resumen: `No preparé la operación: ${(prep.errores || []).join(" ")}`,
      error: (prep.errores || []).join(" "),
      faltantes: prep.faltantes,
      tablas: prep.vista_previa?.tablas,
      advertencias: prep.vista_previa?.advertencias,
    };
  }
  const huella = await huellaDe(herramienta, entrada, prep);

  // Reutiliza una propuesta idéntica y vigente (el modelo puede repetir la llamada).
  const { data: existente } = await ctx.servicio
    .from("rafa_acciones")
    .select("*")
    .eq("user_id", ctx.usuario.id)
    .eq("huella", huella)
    .eq("estado", "propuesta")
    .gt("expira_at", new Date().toISOString())
    .maybeSingle();
  if (existente) {
    return resultadoDeAccion(existente, `${prep.descripcion}. Ya estaba propuesta y espera tu confirmación.`);
  }

  const { data: fila, error } = await ctx.servicio
    .from("rafa_acciones")
    .insert({
      user_id: ctx.usuario.id,
      conversacion_id: ctx.conversacionId,
      herramienta,
      descripcion: prep.descripcion,
      estado: "propuesta",
      requiere_confirmacion: prep.requiere_confirmacion,
      entrada,
      vista_previa: prep.vista_previa,
      huella,
      registros_afectados: prep.registros_afectados,
      version_conocimiento: ctx.versionConocimiento,
    })
    .select("*")
    .single();
  if (error) return { ok: false, tipo: "error", resumen: `No pude registrar la propuesta: ${error.message}`, error: error.message };

  if (!prep.requiere_confirmacion) {
    return ejecutarAccionRegistrada(ctx, fila, prep);
  }
  return resultadoDeAccion(fila, `PROPUESTA (sin ejecutar): ${prep.descripcion}. Requiere que el usuario pulse Confirmar en la interfaz.`);
}

async function marcar(ctx: Contexto, id: string, cambios: Record<string, unknown>) {
  const { data } = await ctx.servicio.from("rafa_acciones").update(cambios).eq("id", id).select("*").single();
  return data;
}

async function ejecutarAccionRegistrada(ctx: Contexto, fila: any, prep: Preparacion): Promise<ResultadoHerramienta> {
  // Transición atómica propuesta → ejecutando: solo una petición gana.
  const { data: tomada } = await ctx.servicio
    .from("rafa_acciones")
    .update({ estado: "ejecutando", confirmada_at: new Date().toISOString() })
    .eq("id", fila.id)
    .eq("estado", "propuesta")
    .select("*");
  if (!tomada || tomada.length === 0) {
    const { data: actual } = await ctx.servicio.from("rafa_acciones").select("*").eq("id", fila.id).single();
    if (actual?.estado === "ejecutando") return reconciliar(ctx, actual, prep);
    return resultadoDeAccion(actual, `La acción ya estaba en estado ${actual?.estado}; no se repitió.`);
  }
  return llamarRpc(ctx, tomada[0], prep);
}

async function llamarRpc(ctx: Contexto, fila: any, prep: Preparacion): Promise<ResultadoHerramienta> {
  const { data, error } = await ctx.db.rpc(prep.rpc.nombre, { p_accion_id: fila.id, ...prep.rpc.args });
  if (error) {
    const mensaje = error.message || String(error);
    // Otra petición pudo completar la misma acción mientras tanto: nunca se
    // degrada una acción ya ejecutada a fallida.
    const { data: yaEjecutada } = await ctx.servicio.from("rafa_ejecuciones").select("resultado").eq("accion_id", fila.id).maybeSingle();
    if (yaEjecutada || mensaje.includes("RAFA_YA_EJECUTADA")) return reconciliar(ctx, fila, prep);
    const estado = mensaje.includes("RAFA_DESACTUALIZADA") ? "desactualizada" : "fallida";
    const actualizada = await marcar(ctx, fila.id, { estado, error: mensaje, finalizada_at: new Date().toISOString() });
    return resultadoDeAccion(
      actualizada || { ...fila, estado, error: mensaje },
      estado === "desactualizada"
        ? `NO EJECUTADA: los datos cambiaron desde la propuesta (${mensaje}). No se aplicó ningún cambio; prepara una nueva propuesta.`
        : `FALLÓ: ${mensaje}. La operación es transaccional: no se aplicó ningún cambio.`
    );
  }
  const actualizada = await marcar(ctx, fila.id, { estado: "ejecutada", resultado: data, error: null, finalizada_at: new Date().toISOString() });
  return resultadoDeAccion(actualizada || { ...fila, estado: "ejecutada", resultado: data }, `EJECUTADA: ${fila.descripcion}.`);
}

/** Acción en 'ejecutando' (reintento o corte de red): consulta si ya se registró la ejecución. */
async function reconciliar(ctx: Contexto, fila: any, prep: Preparacion): Promise<ResultadoHerramienta> {
  const { data: ejec } = await ctx.servicio.from("rafa_ejecuciones").select("resultado").eq("accion_id", fila.id).maybeSingle();
  if (ejec) {
    const actualizada = await marcar(ctx, fila.id, { estado: "ejecutada", resultado: ejec.resultado, error: null, finalizada_at: new Date().toISOString() });
    return resultadoDeAccion(actualizada || fila, `EJECUTADA (reintento detectado, no se duplicó): ${fila.descripcion}.`);
  }
  // No hay registro: la ejecución anterior no se confirmó. Reintentar es seguro
  // porque la RPC registra la ejecución con PK = acción en la misma transacción.
  return llamarRpc(ctx, fila, prep);
}

/** Confirmación desde la interfaz. `huellaCliente` debe ser la que el usuario vio. */
export async function confirmarAccion(ctx: Contexto, accionId: string, huellaCliente: string): Promise<ResultadoHerramienta> {
  const { data: fila } = await ctx.servicio.from("rafa_acciones").select("*").eq("id", accionId).eq("user_id", ctx.usuario.id).maybeSingle();
  if (!fila) return { ok: false, tipo: "error", resumen: "No encontré esa acción para tu usuario.", error: "accion_no_encontrada" };
  const def = obtenerAccion(fila.herramienta);
  if (!def) return { ok: false, tipo: "error", resumen: "Acción no soportada.", error: "accion_desconocida" };

  if (fila.estado === "ejecutada") return resultadoDeAccion(fila, "La acción ya se había ejecutado; no se repitió.");
  if (["cancelada", "desactualizada", "expirada", "fallida", "parcial"].includes(fila.estado)) {
    return resultadoDeAccion(fila, `La acción está ${fila.estado}; no puede confirmarse.`);
  }
  if (fila.huella !== huellaCliente) {
    return { ok: false, tipo: "error", resumen: "La confirmación no corresponde a la versión presentada de la propuesta.", error: "huella_distinta", accion: resumenAccion(fila) };
  }
  if (fila.estado === "propuesta" && new Date(fila.expira_at).getTime() < Date.now()) {
    const exp = await marcar(ctx, fila.id, { estado: "expirada", finalizada_at: new Date().toISOString() });
    return resultadoDeAccion(exp || fila, "La propuesta expiró; pide a Rafa que la prepare de nuevo con datos actuales.");
  }

  if (fila.estado === "ejecutando") {
    const { data: ejec } = await ctx.servicio.from("rafa_ejecuciones").select("resultado").eq("accion_id", fila.id).maybeSingle();
    if (ejec) {
      const act = await marcar(ctx, fila.id, { estado: "ejecutada", resultado: ejec.resultado, error: null, finalizada_at: new Date().toISOString() });
      return resultadoDeAccion(act || fila, `EJECUTADA (reintento detectado, no se duplicó): ${fila.descripcion}.`);
    }
  }

  // Revalidar con datos y permisos actuales.
  let prep: Preparacion;
  try {
    prep = await def.preparar(ctx, fila.entrada);
  } catch (e) {
    const r = errorComoResultado(e);
    if (fila.estado === "propuesta") await marcar(ctx, fila.id, { estado: "desactualizada", error: r.error, finalizada_at: new Date().toISOString() });
    return { ...r, resumen: `NO EJECUTADA: ${r.resumen}` };
  }
  if (fila.estado === "ejecutando") return reconciliar(ctx, fila, prep);
  if (!prep.ok) {
    const act = await marcar(ctx, fila.id, { estado: "desactualizada", error: (prep.errores || []).join(" "), finalizada_at: new Date().toISOString() });
    return resultadoDeAccion(act || fila, `NO EJECUTADA: con los datos actuales la operación ya no es válida: ${(prep.errores || []).join(" ")}`);
  }
  const huellaActual = await huellaDe(fila.herramienta, fila.entrada, prep);
  if (huellaActual !== fila.huella) {
    const { data: nueva } = await ctx.servicio
      .from("rafa_acciones")
      .insert({
        user_id: ctx.usuario.id,
        conversacion_id: fila.conversacion_id,
        herramienta: fila.herramienta,
        descripcion: prep.descripcion,
        estado: "propuesta",
        requiere_confirmacion: true,
        entrada: fila.entrada,
        vista_previa: prep.vista_previa,
        huella: huellaActual,
        registros_afectados: prep.registros_afectados,
        version_conocimiento: ctx.versionConocimiento,
      })
      .select("*")
      .single();
    await marcar(ctx, fila.id, { estado: "desactualizada", reemplazada_por: nueva?.id ?? null, error: "Los datos cambiaron desde la propuesta", finalizada_at: new Date().toISOString() });
    return resultadoDeAccion(nueva, "NO EJECUTADA: los datos cambiaron desde que se presentó la propuesta. Revisa la propuesta actualizada y confirma de nuevo.");
  }
  return ejecutarAccionRegistrada(ctx, fila, prep);
}

export async function cancelarAccion(ctx: Contexto, accionId: string): Promise<ResultadoHerramienta> {
  const { data } = await ctx.servicio
    .from("rafa_acciones")
    .update({ estado: "cancelada", finalizada_at: new Date().toISOString() })
    .eq("id", accionId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "propuesta")
    .select("*");
  if (!data || data.length === 0) return { ok: false, tipo: "error", resumen: "La acción no está pendiente de confirmación.", error: "no_cancelable" };
  return resultadoDeAccion(data[0], "Propuesta cancelada; no se aplicó ningún cambio.");
}
