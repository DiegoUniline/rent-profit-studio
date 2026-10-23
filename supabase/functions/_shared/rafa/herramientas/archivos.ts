/* eslint-disable @typescript-eslint/no-explicit-any */
// Rafa abre por sí mismo archivos guardados de la conversación o de su centro
// (docs/rafa/conversaciones-por-centro.md). La herramienta valida que los
// archivos sean del usuario y de esta charla o de su mismo centro; el motor los
// descarga y se los entrega al modelo en el siguiente paso.

import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { TODOS_LOS_ROLES } from "../permisos.ts";

export const NOMBRE_ABRIR_ARCHIVOS = "abrir_archivos";

export const abrirArchivosTool: Herramienta<{ archivo_ids: string[] }> = {
  nombre: NOMBRE_ABRIR_ARCHIVOS,
  modulo: "general",
  tipo: "consulta",
  descripcion:
    "Abre archivos ya guardados de esta conversación o de su centro de negocio (los de la lista ARCHIVOS GUARDADOS del contexto) para leerlos en el siguiente paso, por ejemplo \"con el catálogo que subí ayer\". Úsala en vez de pedir al usuario que vuelva a subirlos. Máximo 5.",
  parametros: s.objeto({ archivo_ids: s.lista(s.uuid("Id del archivo guardado"), "Archivos a abrir", 5) }, ["archivo_ids"]),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Archivos del propio usuario", "De esta conversación o de otra charla del mismo centro de negocio"],
  devuelve: "Los archivos abiertos; su contenido llega en el siguiente paso.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    const ids = Array.from(new Set(e.archivo_ids || []));
    if (!ids.length) return { ok: false, tipo: "error", resumen: "Indica qué archivo abrir.", error: "sin_archivos", faltantes: ["archivo_ids"] };
    const { data: conv } = ctx.conversacionId
      ? await ctx.db.from("rafa_conversaciones").select("id, centro_negocio_id").eq("id", ctx.conversacionId).maybeSingle()
      : { data: null };
    const { data, error } = await ctx.db.from("rafa_archivos").select("id, user_id, conversacion_id, centro_negocio_id, nombre, mime, ruta, created_at").in("id", ids);
    if (error) return { ok: false, tipo: "error", resumen: `No pude leer los archivos guardados: ${error.message}`, error: "lectura" };
    const permitidos = ((data || []) as any[]).filter(
      (f) =>
        f.user_id === ctx.usuario.id &&
        (f.conversacion_id === ctx.conversacionId || (conv?.centro_negocio_id && f.centro_negocio_id === conv.centro_negocio_id))
    );
    if (permitidos.length !== ids.length) {
      return {
        ok: false,
        tipo: "error",
        resumen: "Uno de los archivos no existe, no es tuyo o no pertenece a esta conversación ni a su centro.",
        error: "archivo_no_permitido",
      };
    }
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Abrí ${permitidos.length} archivo(s): ${permitidos.map((f) => f.nombre).join(", ")}. Su contenido llega en el siguiente paso.`,
      datos: { archivos: permitidos.map((f) => ({ id: f.id, nombre: f.nombre, mime: f.mime, ruta: f.ruta, fecha: String(f.created_at).slice(0, 10) })) },
    };
  },
};
