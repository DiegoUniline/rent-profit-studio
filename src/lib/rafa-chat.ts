// Cliente del chat de Rafa: llama a la Edge Function rafa-asistente (modos
// chat/confirmar/cancelar) y lee las conversaciones propias (RLS).
import { supabase } from "@/integrations/supabase/client";
import type { PlanRafa } from "@/lib/rafa-types";
import { traerPorBloques, traerTodo } from "@/lib/traer-todo";

export interface ColumnaTablaRafa {
  clave: string;
  etiqueta: string;
  tipo?: "texto" | "moneda" | "numero" | "fecha" | "porcentaje" | "enlace";
}

export interface TablaRafa {
  titulo: string;
  columnas: ColumnaTablaRafa[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
}

export interface ReferenciaRafa {
  entidad: string;
  id: string;
  etiqueta: string;
  enlace?: string;
}

export interface AlcanceRafa {
  empresa?: { id: string; nombre: string } | null;
  proyecto?: { id: string; nombre: string } | null;
  periodo?: { desde: string; hasta: string } | null;
  filtros?: Record<string, unknown>;
  registros: number;
  total?: number | null;
  truncado: boolean;
  nota?: string;
}

export interface AccionRafa {
  id: string;
  estado: string;
  herramienta: string;
  descripcion: string;
  requiere_confirmacion: boolean;
  huella: string;
  vista_previa: { resumen?: string; tablas?: TablaRafa[]; advertencias?: string[]; efectos?: string[] } | null;
  expira_at?: string;
  resultado?: unknown;
  error?: string | null;
}

export interface HerramientaUsada {
  nombre: string;
  argumentos: unknown;
  ok: boolean;
  tipo: string;
  resumen: string;
  alcance: AlcanceRafa | null;
  tablas: TablaRafa[];
  referencias: ReferenciaRafa[];
  accion: AccionRafa | null;
  advertencias: string[];
  faltantes?: string[];
  opciones?: { id: string; nombre: string }[] | null;
  error: string | null;
  plan?: PlanRafa | null;
}

export interface MensajeRafa {
  id: string;
  rol: "usuario" | "asistente";
  contenido: string;
  datos: { herramientas?: HerramientaUsada[]; adjuntos?: string[]; archivos?: { id: string; nombre: string }[]; completo?: boolean };
  version_conocimiento: string | null;
  created_at: string;
}

export interface ConversacionRafa {
  id: string;
  titulo: string;
  updated_at: string;
  contexto: Record<string, unknown>;
  /** Centro de negocio al que está anclada la conversación (null = general). */
  centro_negocio_id: string | null;
  empresa_id: string | null;
  centros_negocio?: { codigo: string; nombre: string; activo?: boolean; empresas?: EmpresaDeCentro } | null;
}

/** Empresa embebida en el centro (para distinguir centros con el mismo nombre). */
export type EmpresaDeCentro = { razon_social?: string | null; nombre_comercial?: string | null } | null;

export const nombreEmpresa = (e?: EmpresaDeCentro) => e?.nombre_comercial || e?.razon_social || "";

export interface CentroRafa {
  id: string;
  codigo: string;
  nombre: string;
  empresas?: EmpresaDeCentro;
  empresa_id: string;
  /** false = dado de baja. */
  activo?: boolean;
}

export interface ArchivoRafa {
  id: string;
  conversacion_id: string;
  nombre: string;
  mime: string;
  tamano: number;
  ruta: string;
  created_at: string;
}

export const BUCKET_ARCHIVOS_RAFA = "rafa-archivos";

export interface ContextoPantalla {
  ruta?: string;
  empresa_id?: string;
  proyecto_id?: string;
  registro?: { entidad: string; id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros de empresa que cada pantalla persiste en localStorage. */
const FILTRO_EMPRESA_POR_RUTA: Record<string, string> = {
  "/programacion": "programacion_filter_empresa",
  "/asientos": "asientos_filter_company",
  "/presupuestos": "presupuestos_filter_company",
  "/terceros": "terceros_filter_empresa",
  "/centros-negocio": "centros_filter_empresa",
  "/cuentas": "cuentas_filter_empresa",
  "/proyectos": "proyectos_filter_empresa",
};

/** Deduce el registro y la empresa de la pantalla actual para darlos como contexto a Rafa. */
export function contextoDeRuta(ruta: string, leerAlmacen: (k: string) => string | null = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}): ContextoPantalla {
  const ctx: ContextoPantalla = { ruta };
  const partes = ruta.split("/").filter(Boolean);
  const id = partes[1];
  if (id && UUID.test(id)) {
    if (partes[0] === "proyectos") {
      ctx.proyecto_id = id;
      ctx.registro = { entidad: "proyecto", id };
    } else if (partes[0] === "asientos") ctx.registro = { entidad: "asiento", id };
    else if (partes[0] === "presupuestos") ctx.registro = { entidad: "presupuesto", id };
    else if (partes[0] === "cuentas") ctx.registro = { entidad: "cuenta", id };
  }
  const clave = FILTRO_EMPRESA_POR_RUTA[`/${partes[0] || ""}`];
  const empresa = clave ? leerAlmacen(clave) : null;
  if (empresa && UUID.test(empresa)) ctx.empresa_id = empresa;
  return ctx;
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rafa-asistente", { body });
  if (error) {
    // La función responde JSON con { error } también en códigos 4xx/5xx.
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.json === "function") {
      try {
        const cuerpo = await contexto.json();
        if (cuerpo?.error) throw new Error(cuerpo.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw error;
  }
  if (data?.error && !data?.tipo) throw new Error(data.error);
  return data as T;
}

export interface RespuestaChat {
  conversacion_id: string;
  mensaje_id: string | null;
  contenido: string;
  version_conocimiento: string;
}

export function enviarMensaje(payload: {
  conversacion_id?: string | null;
  mensaje: string;
  contexto_pantalla?: ContextoPantalla;
  archivos?: { filename: string; mime: string; data: string }[];
  /** Ids de archivos ya guardados que se vuelven a enviar a Rafa. */
  archivos_guardados?: string[];
  audio?: { data: string; format: string };
  /** Centro al crear una conversación nueva anclada. */
  centro_negocio_id?: string | null;
}) {
  return invocar<RespuestaChat>({
    modo: "chat",
    ...payload,
    conversacion_id: payload.conversacion_id || undefined,
    centro_negocio_id: payload.conversacion_id ? undefined : payload.centro_negocio_id || undefined,
  });
}

export interface ResultadoAccion {
  ok: boolean;
  resumen: string;
  accion?: AccionRafa;
  error?: string;
}

export function confirmarAccion(accion: Pick<AccionRafa, "id" | "huella">) {
  return invocar<ResultadoAccion>({ modo: "confirmar", accion_id: accion.id, huella: accion.huella });
}

export function cancelarAccion(accionId: string) {
  return invocar<ResultadoAccion>({ modo: "cancelar", accion_id: accionId });
}

const COLUMNAS_CONVERSACION = "id, titulo, updated_at, contexto, centro_negocio_id, empresa_id, centros_negocio:centro_negocio_id(codigo, nombre, activo, empresas:empresa_id(razon_social, nombre_comercial))";
const COLUMNAS_CENTRO = "id, codigo, nombre, empresa_id, activo, empresas:empresa_id(razon_social, nombre_comercial)";

/** Las charlas de centros dados de baja no se muestran (se conservan). */
export const conversacionVisible = (c: Pick<ConversacionRafa, "centro_negocio_id" | "centros_negocio">) =>
  !c.centro_negocio_id || c.centros_negocio?.activo !== false;

export async function listarConversaciones(): Promise<ConversacionRafa[]> {
  const { data, error } = await supabase
    .from("rafa_conversaciones")
    .select(COLUMNAS_CONVERSACION)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as unknown as ConversacionRafa[];
}

/** Centros activos para anclar conversaciones. */
/** Centros activos; con soloBajas, los dados de baja. */
export async function listarCentros(soloBajas = false): Promise<CentroRafa[]> {
  const { data, error } = await traerTodo((d, h) => supabase.from("centros_negocio").select(COLUMNAS_CENTRO).eq("activo", !soloBajas).order("nombre").order("id").range(d, h));
  if (error) throw error;
  return (data || []) as unknown as CentroRafa[];
}

export async function obtenerCentro(id: string): Promise<CentroRafa | null> {
  const { data, error } = await supabase.from("centros_negocio").select(COLUMNAS_CENTRO).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as CentroRafa | null) ?? null;
}

/** Crea una conversación anclada a un centro (la empresa la pone la base desde el centro). */
export async function crearConversacionDeCentro(centro: Pick<CentroRafa, "id" | "nombre"> & { empresas?: EmpresaDeCentro }): Promise<ConversacionRafa> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Sesión inválida. Vuelve a iniciar sesión.");
  // El título lleva la empresa: hay centros con el mismo nombre en distintas empresas.
  const empresa = nombreEmpresa(centro.empresas ?? (await obtenerCentro(centro.id))?.empresas);
  const titulo = `Centro ${centro.nombre}${empresa ? ` · ${empresa}` : ""}`.slice(0, 80);
  const { data, error } = await supabase
    .from("rafa_conversaciones")
    .insert({ user_id: u.user.id, titulo, centro_negocio_id: centro.id })
    .select(COLUMNAS_CONVERSACION)
    .single();
  if (error) throw new Error(`No se pudo crear la conversación del centro: ${error.message}`);
  return data as unknown as ConversacionRafa;
}

/** Conversación más reciente del centro; si no hay, la crea. */
export async function conversacionDeCentro(centro: Pick<CentroRafa, "id" | "nombre"> & { empresas?: EmpresaDeCentro }): Promise<ConversacionRafa> {
  const { data, error } = await supabase
    .from("rafa_conversaciones")
    .select(COLUMNAS_CONVERSACION)
    .eq("centro_negocio_id", centro.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const existente = (data || [])[0] as unknown as ConversacionRafa | undefined;
  return existente ?? crearConversacionDeCentro(centro);
}

/** Cambia (o quita) el centro de una conversación. */
export async function asignarCentro(conversacionId: string, centroId: string | null) {
  const { error } = await supabase.from("rafa_conversaciones").update({ centro_negocio_id: centroId }).eq("id", conversacionId);
  if (error) throw new Error(`No se pudo cambiar el centro de la conversación: ${error.message}`);
}

export async function listarArchivos(conversacionId: string): Promise<ArchivoRafa[]> {
  const { data, error } = await traerTodo((d, h) => supabase
    .from("rafa_archivos")
    .select("id, conversacion_id, nombre, mime, tamano, ruta, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(d, h));
  if (error) throw error;
  return (data || []) as ArchivoRafa[];
}

export async function urlArchivo(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ARCHIVOS_RAFA).createSignedUrl(ruta, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || "No se pudo abrir el archivo.");
  return data.signedUrl;
}

export async function cargarMensajes(conversacionId: string): Promise<MensajeRafa[]> {
  const { data, error } = await supabase
    .from("rafa_mensajes")
    .select("id, rol, contenido, datos, version_conocimiento, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []) as unknown as MensajeRafa[];
}

/** Estado más reciente de las acciones mostradas (pueden haberse confirmado en otra pestaña). */
export async function estadoAcciones(ids: string[]): Promise<Map<string, AccionRafa>> {
  if (ids.length === 0) return new Map();
  const { data } = await traerPorBloques(ids, (b, d, h) =>
    supabase
      .from("rafa_acciones")
      .select("id, estado, herramienta, descripcion, requiere_confirmacion, huella, vista_previa, expira_at, resultado, error")
      .in("id", b)
      .order("id")
      .range(d, h)
  );
  return new Map(((data || []) as unknown as AccionRafa[]).map((a) => [a.id, a]));
}

export async function eliminarConversacion(id: string) {
  // Primero los archivos guardados (Storage); la fila se borra en cascada.
  const archivos = await listarArchivos(id);
  if (archivos.length) {
    const { error: errorArchivos } = await supabase.storage.from(BUCKET_ARCHIVOS_RAFA).remove(archivos.map((a) => a.ruta));
    if (errorArchivos) throw new Error(`No se pudieron eliminar los archivos de la conversación: ${errorArchivos.message}`);
  }
  const { error } = await supabase.from("rafa_conversaciones").delete().eq("id", id);
  if (error) throw error;
}

export const ETIQUETA_ESTADO_ACCION: Record<string, string> = {
  propuesta: "Propuesta · pendiente de confirmar",
  ejecutando: "Ejecutando",
  ejecutada: "Ejecutada",
  fallida: "Fallida · sin cambios",
  parcial: "Parcialmente completada",
  cancelada: "Cancelada",
  desactualizada: "Desactualizada · sin cambios",
  expirada: "Expirada · sin cambios",
};

// ---------------------------------------------------------------- resumen y avisos por centro
export interface ResumenCentroRafa {
  centro: { centro_id: string; centro_codigo: string; centro_nombre: string; empresa_nombre: string; proyecto_id: string | null; proyecto_nombre: string | null };
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
  sin_partida: { cantidad: number; monto: number } | null;
  tareas_vencidas: { id: string; titulo: string; vence: string | null; estado: string; responsable: string | null }[] | null;
  avisos: string[];
}

export function resumenDeCentro(centroId: string) {
  return invocar<ResumenCentroRafa>({ modo: "resumen_centro", centro_negocio_id: centroId });
}

/** Deja el aviso de la semana en la charla de cada centro (una vez por semana; lo decide el servidor). */
export function generarAvisosSemana() {
  return invocar<{ semana: string; generados: number; errores: string[] }>({ modo: "avisos_semana" });
}
