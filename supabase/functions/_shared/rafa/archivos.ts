// Archivos de las conversaciones de Rafa: se guardan en Storage privado
// (rafa-archivos/{usuario}/{conversación}/{id}-{nombre}) y se registran en
// rafa_archivos con su conversación, centro y empresa, para volver a usarlos
// sin subirlos otra vez.

import type { Contexto } from "./tipos.ts";
import { esUuid } from "./validacion.ts";

export const BUCKET_ARCHIVOS = "rafa-archivos";
export const MAX_ARCHIVOS_POR_MENSAJE = 5;

export interface ArchivoEntrada {
  filename: string;
  mime: string;
  data: string; // base64 sin prefijo
}

export interface ArchivoReusado extends ArchivoEntrada {
  id: string;
}

export interface AlmacenArchivos {
  subir(ruta: string, base64: string, mime: string): Promise<void>;
  descargar(ruta: string): Promise<string>;
  eliminar(ruta: string): Promise<void>;
}

export function nombreSeguro(nombre: string): string {
  const limpio = (nombre || "archivo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return limpio || "archivo";
}

export function rutaArchivo(usuarioId: string, conversacionId: string, id: string, nombre: string): string {
  return `${usuarioId}/${conversacionId}/${id}-${nombreSeguro(nombre)}`;
}

function bytesDe(base64: string): number {
  const s = (base64 || "").replace(/=+$/, "");
  return Math.floor((s.length * 3) / 4);
}

/** Guarda los archivos nuevos del mensaje. Si alguno falla, lanza error (no se reporta éxito). */
export async function guardarArchivos(
  ctx: Contexto,
  almacen: AlmacenArchivos,
  conversacion: { id: string; centro_negocio_id: string | null; empresa_id: string | null },
  archivos: ArchivoEntrada[]
): Promise<{ id: string; nombre: string }[]> {
  const guardados: { id: string; nombre: string }[] = [];
  for (const a of archivos.slice(0, MAX_ARCHIVOS_POR_MENSAJE)) {
    const id = crypto.randomUUID();
    const ruta = rutaArchivo(ctx.usuario.id, conversacion.id, id, a.filename);
    try {
      await almacen.subir(ruta, a.data, a.mime || "application/octet-stream");
    } catch (e) {
      throw new Error(`No se pudo guardar el archivo ${a.filename}: ${e instanceof Error ? e.message : "error de almacenamiento"}`);
    }
    const { error } = await ctx.servicio.from("rafa_archivos").insert({
      id,
      user_id: ctx.usuario.id,
      conversacion_id: conversacion.id,
      centro_negocio_id: conversacion.centro_negocio_id,
      empresa_id: conversacion.empresa_id,
      nombre: (a.filename || "archivo").slice(0, 255),
      mime: a.mime || "application/octet-stream",
      tamano: bytesDe(a.data),
      ruta,
    });
    if (error) {
      await almacen.eliminar(ruta).catch(() => undefined);
      throw new Error(`No se pudo registrar el archivo ${a.filename}: ${error.message}`);
    }
    guardados.push({ id, nombre: a.filename });
  }
  return guardados;
}

/** Carga archivos ya guardados del usuario (RLS) para volver a enviarlos a Rafa. */
export async function cargarArchivosGuardados(ctx: Contexto, almacen: AlmacenArchivos, ids: unknown): Promise<ArchivoReusado[]> {
  const lista = Array.isArray(ids) ? Array.from(new Set(ids.filter(esUuid))).slice(0, MAX_ARCHIVOS_POR_MENSAJE) : [];
  if (!lista.length) return [];
  const { data, error } = await ctx.db.from("rafa_archivos").select("id, user_id, nombre, mime, ruta").in("id", lista);
  if (error) throw new Error(`No se pudieron leer los archivos guardados: ${error.message}`);
  const filas = ((data || []) as { id: string; user_id: string; nombre: string; mime: string; ruta: string }[]).filter(
    (f) => f.user_id === ctx.usuario.id
  );
  if (filas.length !== lista.length) throw new Error("Uno de los archivos ya no existe o no es tuyo.");
  const salida: ArchivoReusado[] = [];
  for (const f of filas) {
    try {
      salida.push({ id: f.id, filename: f.nombre, mime: f.mime, data: await almacen.descargar(f.ruta) });
    } catch (e) {
      throw new Error(`No se pudo leer el archivo ${f.nombre}: ${e instanceof Error ? e.message : "error de almacenamiento"}`);
    }
  }
  return salida;
}

export interface ArchivoDisponible {
  id: string;
  nombre: string;
  fecha: string;
  /** "conversacion" = subido en esta charla; "centro" = en otra charla del mismo centro. */
  origen: "conversacion" | "centro";
}

/** Archivos que Rafa puede abrir: los de esta charla y los de otras charlas del mismo centro. */
export async function archivosDisponibles(ctx: Contexto, conversacionId: string, centroId?: string | null): Promise<ArchivoDisponible[]> {
  let q = ctx.db.from("rafa_archivos").select("id, nombre, created_at, conversacion_id");
  q = centroId ? q.or(`conversacion_id.eq.${conversacionId},centro_negocio_id.eq.${centroId}`) : q.eq("conversacion_id", conversacionId);
  const { data } = await q.order("created_at", { ascending: false }).limit(40);
  return ((data || []) as { id: string; nombre: string; created_at: string; conversacion_id: string }[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fecha: String(f.created_at || "").slice(0, 10),
    origen: f.conversacion_id === conversacionId ? "conversacion" : "centro",
  }));
}

/** Descarga archivos ya autorizados (por la herramienta abrir_archivos) para dárselos al modelo. */
export async function descargarArchivos(almacen: AlmacenArchivos, archivos: { id: string; nombre: string; mime: string; ruta: string }[]): Promise<ArchivoReusado[]> {
  const salida: ArchivoReusado[] = [];
  for (const f of archivos.slice(0, MAX_ARCHIVOS_POR_MENSAJE)) {
    salida.push({ id: f.id, filename: f.nombre, mime: f.mime, data: await almacen.descargar(f.ruta) });
  }
  return salida;
}

function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function deBase64(base64: string): Uint8Array {
  const s = atob(base64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Almacén sobre Supabase Storage con el cliente de servicio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function crearAlmacenSupabase(cliente: any): AlmacenArchivos {
  const bucket = () => cliente.storage.from(BUCKET_ARCHIVOS);
  return {
    async subir(ruta, base64, mime) {
      const { error } = await bucket().upload(ruta, deBase64(base64), { contentType: mime, upsert: false });
      if (error) throw new Error(error.message);
    },
    async descargar(ruta) {
      const { data, error } = await bucket().download(ruta);
      if (error || !data) throw new Error(error?.message || "archivo no encontrado");
      return aBase64(new Uint8Array(await data.arrayBuffer()));
    },
    async eliminar(ruta) {
      await bucket().remove([ruta]);
    },
  };
}
