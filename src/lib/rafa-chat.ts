// Cliente del chat de Rafa: llama a la Edge Function rafa-asistente (modos
// chat/confirmar/cancelar) y lee las conversaciones propias (RLS).
import { supabase } from "@/integrations/supabase/client";
import type { PlanRafa } from "@/lib/rafa-types";

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
  error: string | null;
  plan?: PlanRafa | null;
}

export interface MensajeRafa {
  id: string;
  rol: "usuario" | "asistente";
  contenido: string;
  datos: { herramientas?: HerramientaUsada[]; adjuntos?: string[]; completo?: boolean };
  version_conocimiento: string | null;
  created_at: string;
}

export interface ConversacionRafa {
  id: string;
  titulo: string;
  updated_at: string;
  contexto: Record<string, unknown>;
}

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
  audio?: { data: string; format: string };
}) {
  return invocar<RespuestaChat>({ modo: "chat", ...payload, conversacion_id: payload.conversacion_id || undefined });
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

export async function listarConversaciones(): Promise<ConversacionRafa[]> {
  const { data, error } = await supabase
    .from("rafa_conversaciones")
    .select("id, titulo, updated_at, contexto")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []) as ConversacionRafa[];
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
  const { data } = await supabase
    .from("rafa_acciones")
    .select("id, estado, herramienta, descripcion, requiere_confirmacion, huella, vista_previa, expira_at, resultado, error")
    .in("id", ids);
  return new Map(((data || []) as unknown as AccionRafa[]).map((a) => [a.id, a]));
}

export async function eliminarConversacion(id: string) {
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
