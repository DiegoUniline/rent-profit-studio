/* eslint-disable @typescript-eslint/no-explicit-any */
// Un turno de conversación: guarda el mensaje del usuario, arma el contexto
// (historial desde la base, contexto de la conversación y de la pantalla,
// conocimiento recuperado), ejecuta el bucle modelo ↔ herramientas y guarda
// la respuesta con todos los datos estructurados y la versión de conocimiento.

import type { Contexto, ContextoConversacion, ContextoPantalla, Referencia, ResultadoHerramienta } from "./tipos.ts";
import type { LlamadaModelo, MensajeModelo } from "./llm.ts";
import { definicionesParaModelo, ejecutarHerramienta } from "./registro.ts";
import { promptSistema } from "./prompt.ts";
import { esUuid } from "./validacion.ts";

export const MAX_ITERACIONES = 8;
export const MAX_HERRAMIENTAS_POR_TURNO = 16;
const MAX_HISTORIAL = 16;
const MAX_CARACTERES_RESULTADO = 12000;

export interface EntradaTurno {
  conversacion_id?: string;
  mensaje: string;
  contexto_pantalla?: ContextoPantalla;
  archivos?: { filename: string; mime: string; data: string }[];
  audio?: { data: string; format: string };
}

export interface LlamadaRegistrada {
  nombre: string;
  argumentos: unknown;
  resultado: ResultadoHerramienta;
}

export interface SalidaTurno {
  conversacion_id: string;
  mensaje_id: string | null;
  contenido: string;
  herramientas: LlamadaRegistrada[];
  contexto: ContextoConversacion;
  version_conocimiento: string;
}

function compactarParaModelo(r: ResultadoHerramienta): string {
  const base = {
    ok: r.ok,
    tipo: r.tipo,
    resumen: r.resumen,
    alcance: r.alcance,
    faltantes: r.faltantes,
    advertencias: r.advertencias,
    error: r.error,
    accion: r.accion
      ? { id: r.accion.id, estado: r.accion.estado, descripcion: r.accion.descripcion, requiere_confirmacion: r.accion.requiere_confirmacion, resultado: r.accion.resultado, error: r.accion.error }
      : undefined,
    referencias: r.referencias?.slice(0, 30),
    datos: r.datos,
  };
  let texto = JSON.stringify(base);
  if (texto.length > MAX_CARACTERES_RESULTADO) {
    texto = JSON.stringify({ ...base, datos: undefined, datos_recortados: JSON.stringify(r.datos).slice(0, MAX_CARACTERES_RESULTADO - 2000) + "…[recortado: pide una consulta más acotada]" });
  }
  return texto;
}

function memoriaDe(llamadas: LlamadaRegistrada[]): string {
  return llamadas
    .map((l) => {
      const a = l.resultado.alcance;
      const refs = (l.resultado.referencias || [])
        .filter((r) => r.entidad !== "documento")
        .slice(0, 12)
        .map((r) => `${r.entidad} "${r.etiqueta}"=${r.id}${r.enlace ? ` (${r.enlace})` : ""}`)
        .join("; ");
      return `${l.nombre}(${JSON.stringify(l.argumentos).slice(0, 300)}) → ${l.resultado.ok ? "ok" : "error"}: ${l.resultado.resumen.slice(0, 300)}${a ? ` [alcance: ${JSON.stringify({ empresa: a.empresa?.nombre, proyecto: a.proyecto?.nombre, periodo: a.periodo, registros: a.registros, truncado: a.truncado })}]` : ""}${l.resultado.accion ? ` [acción ${l.resultado.accion.id} ${l.resultado.accion.estado}]` : ""}${refs ? ` [referencias: ${refs}]` : ""}`;
    })
    .join("\n");
}

function actualizarContexto(previo: ContextoConversacion, llamadas: LlamadaRegistrada[]): ContextoConversacion {
  const c: ContextoConversacion = { ...previo };
  for (const l of llamadas) {
    const args = (l.argumentos || {}) as Record<string, unknown>;
    const a = l.resultado.alcance;
    if (!l.resultado.ok) continue;
    if (a?.empresa?.id) {
      c.empresa_id = a.empresa.id;
      c.empresa_nombre = a.empresa.nombre;
    } else if (typeof args.empresa_id === "string") c.empresa_id = args.empresa_id;
    if (a?.proyecto?.id) {
      c.proyecto_id = a.proyecto.id;
      c.proyecto_nombre = a.proyecto.nombre;
    }
    if (a?.periodo?.desde && a?.periodo?.hasta) c.periodo = { desde: a.periodo.desde, hasta: a.periodo.hasta };
  }
  const refs: Referencia[] = [];
  llamadas.forEach((l) => (l.resultado.referencias || []).forEach((r) => refs.push(r)));
  if (refs.length) c.ultimas_referencias = refs.filter((r) => r.entidad !== "documento").slice(0, 25);
  return c;
}

function contenidoUsuario(entrada: EntradaTurno): unknown {
  const partes: unknown[] = [{ type: "text", text: entrada.mensaje || "(sin texto)" }];
  if (entrada.audio) {
    partes.push({ type: "text", text: "El usuario adjunta un audio con la instrucción: transcríbelo y úsalo como instrucción principal." });
    partes.push({ type: "input_audio", input_audio: { data: entrada.audio.data, format: entrada.audio.format } });
  }
  for (const a of entrada.archivos || []) {
    if (a.mime?.startsWith("image/")) partes.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}` } });
    else partes.push({ type: "file", file: { filename: a.filename, file_data: `data:${a.mime || "application/pdf"};base64,${a.data}` } });
  }
  return partes.length === 1 ? entrada.mensaje : partes;
}

export async function procesarTurno(ctx: Contexto, entrada: EntradaTurno, llamarModelo: LlamadaModelo): Promise<SalidaTurno> {
  const mensaje = (entrada.mensaje || "").slice(0, 8000);
  if (!mensaje && !entrada.audio && !(entrada.archivos || []).length) throw new Error("Escribe un mensaje para Rafa.");

  // 1. Conversación (propia, por RLS).
  let conversacion: { id: string; contexto: ContextoConversacion } | null = null;
  if (entrada.conversacion_id) {
    if (!esUuid(entrada.conversacion_id)) throw new Error("Conversación inválida.");
    const { data } = await ctx.db.from("rafa_conversaciones").select("id, contexto, user_id").eq("id", entrada.conversacion_id).maybeSingle();
    if (!data || data.user_id !== ctx.usuario.id) throw new Error("La conversación no existe o no es tuya.");
    conversacion = { id: data.id, contexto: (data.contexto || {}) as ContextoConversacion };
  } else {
    const { data, error } = await ctx.db
      .from("rafa_conversaciones")
      .insert({ user_id: ctx.usuario.id, titulo: (mensaje || "Conversación con Rafa").slice(0, 80) })
      .select("id, contexto")
      .single();
    if (error) throw new Error(`No pude crear la conversación: ${error.message}`);
    conversacion = { id: data.id, contexto: {} };
  }
  ctx.conversacionId = conversacion.id;

  // 2. Historial desde la base (no se confía en el historial del navegador).
  const { data: historial } = await ctx.db
    .from("rafa_mensajes")
    .select("rol, contenido, datos, created_at")
    .eq("conversacion_id", conversacion.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORIAL);

  // 3. Guardar el mensaje del usuario (sin el contenido binario de adjuntos).
  const { error: errorMensajeUsuario } = await ctx.servicio.from("rafa_mensajes").insert({
    conversacion_id: conversacion.id,
    user_id: ctx.usuario.id,
    rol: "usuario",
    contenido: mensaje,
    datos: {
      contexto_pantalla: entrada.contexto_pantalla ?? null,
      adjuntos: (entrada.archivos || []).map((a) => a.filename),
      audio: Boolean(entrada.audio),
    },
    version_conocimiento: ctx.versionConocimiento,
  });
  if (errorMensajeUsuario) throw new Error(`No se pudo guardar tu mensaje: ${errorMensajeUsuario.message}`);

  const mensajes: MensajeModelo[] = [
    { role: "system", content: promptSistema(ctx, conversacion.contexto, entrada.contexto_pantalla, mensaje) },
    ...((historial || []) as any[])
      .reverse()
      .map((m): MensajeModelo =>
        m.rol === "usuario"
          ? { role: "user", content: m.contenido }
          : {
              role: "assistant",
              content: `${m.contenido}${m.datos?.memoria ? `\n\n[Registro interno de herramientas de esa respuesta (datos de ese momento, pueden haber cambiado):\n${m.datos.memoria}]` : ""}`,
            }
      ),
    { role: "user", content: contenidoUsuario({ ...entrada, mensaje }) },
  ];

  // 4. Bucle modelo ↔ herramientas.
  const herramientas = definicionesParaModelo(ctx);
  const llamadas: LlamadaRegistrada[] = [];
  let contenido = "";
  let terminado = false;
  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const r = await llamarModelo({ messages: mensajes, tools: herramientas });
    if (!r.tool_calls.length) {
      contenido = r.content || "";
      terminado = true;
      break;
    }
    mensajes.push({ role: "assistant", content: r.content ?? "", tool_calls: r.tool_calls });
    for (const tc of r.tool_calls) {
      let resultado: ResultadoHerramienta;
      let argumentos: unknown = tc.function.arguments;
      try {
        argumentos = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        // ejecutarHerramienta reporta el JSON inválido.
      }
      if (llamadas.length >= MAX_HERRAMIENTAS_POR_TURNO) {
        resultado = { ok: false, tipo: "error", resumen: "Se alcanzó el máximo de consultas por mensaje; responde con lo obtenido e indica qué faltó.", error: "limite_herramientas" };
      } else {
        resultado = await ejecutarHerramienta(ctx, tc.function.name, argumentos);
      }
      llamadas.push({ nombre: tc.function.name, argumentos, resultado });
      mensajes.push({ role: "tool", tool_call_id: tc.id, content: compactarParaModelo(resultado) });
    }
  }
  if (!terminado) {
    contenido =
      "No terminé de resolver la solicitud dentro del límite de pasos. Abajo están los resultados que sí obtuve; dime cómo acotarla para continuar.";
  }

  // 5. Contexto de la conversación y respuesta persistida.
  const contexto = actualizarContexto(conversacion.contexto, llamadas);
  const { error: errorContexto } = await ctx.servicio.from("rafa_conversaciones").update({ contexto }).eq("id", conversacion.id).eq("user_id", ctx.usuario.id);
  if (errorContexto) throw new Error(`Tu mensaje se guardó, pero no se pudo actualizar la conversación: ${errorContexto.message}`);
  const datos = {
    herramientas: llamadas.map((l) => ({
      nombre: l.nombre,
      argumentos: l.argumentos,
      ok: l.resultado.ok,
      tipo: l.resultado.tipo,
      resumen: l.resultado.resumen,
      alcance: l.resultado.alcance ?? null,
      tablas: l.resultado.tablas ?? [],
      referencias: l.resultado.referencias ?? [],
      accion: l.resultado.accion ?? null,
      advertencias: l.resultado.advertencias ?? [],
      faltantes: l.resultado.faltantes ?? [],
      // Opciones para elegir (por ejemplo, empresas cuando falta empresa_id):
      // la interfaz las muestra como botones.
      opciones: Array.isArray((l.resultado.datos as any)?.opciones) ? (l.resultado.datos as any).opciones : null,
      error: l.resultado.error ?? null,
      plan: l.resultado.tipo === "plan" ? (l.resultado.datos as any)?.plan ?? null : null,
    })),
    memoria: memoriaDe(llamadas),
    completo: terminado,
  };
  const { data: guardado, error: errorRespuesta } = await ctx.servicio
    .from("rafa_mensajes")
    .insert({ conversacion_id: conversacion.id, user_id: ctx.usuario.id, rol: "asistente", contenido, datos, version_conocimiento: ctx.versionConocimiento })
    .select("id")
    .single();
  if (errorRespuesta || !guardado) throw new Error(`Tu mensaje se guardó, pero no se pudo guardar la respuesta de Rafa: ${errorRespuesta?.message || "Sin confirmación de guardado"}`);

  return {
    conversacion_id: conversacion.id,
    mensaje_id: guardado?.id ?? null,
    contenido,
    herramientas: llamadas,
    contexto,
    version_conocimiento: ctx.versionConocimiento,
  };
}
