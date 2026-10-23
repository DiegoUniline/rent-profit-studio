// Centro de negocio al que está anclada una conversación (docs/rafa/conversaciones-por-centro.md).
// Se carga en el servidor con RLS del usuario y se usa como valor por defecto
// de las herramientas: el usuario no tiene que repetir empresa ni centro.

import type { Contexto, Herramienta } from "./tipos.ts";

export interface AnclaConversacion {
  centro_id: string;
  centro_codigo: string;
  centro_nombre: string;
  empresa_id: string;
  empresa_nombre: string;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  /** false = el centro está dado de baja. */
  activo?: boolean;
}

export async function cargarAncla(ctx: Contexto, centroId: string | null | undefined): Promise<AnclaConversacion | null> {
  if (!centroId) return null;
  const { data: centro } = await ctx.db
    .from("centros_negocio")
    .select("id, codigo, nombre, empresa_id, activo, empresas:empresa_id(razon_social, nombre_comercial)")
    .eq("id", centroId)
    .maybeSingle();
  if (!centro?.empresa_id) return null;
  const { data: proyecto } = await ctx.db
    .from("proyectos")
    .select("id, nombre")
    .eq("centro_negocio_id", centroId)
    .eq("activo", true)
    .maybeSingle();
  return {
    centro_id: centro.id,
    centro_codigo: centro.codigo ?? "",
    centro_nombre: centro.nombre ?? "",
    empresa_id: centro.empresa_id,
    empresa_nombre: centro.empresas?.nombre_comercial || centro.empresas?.razon_social || "",
    proyecto_id: proyecto?.id ?? null,
    proyecto_nombre: proyecto?.nombre ?? null,
    activo: centro.activo !== false,
  };
}

/**
 * Completa los argumentos que el modelo NO indicó con el ancla de la
 * conversación. Nunca reemplaza un valor explícito: para consultar toda la
 * empresa el modelo pasa centro_negocio_id: null.
 * - empresa_id: en cualquier herramienta que lo acepte, salvo que se haya
 *   indicado otro proyecto u otro centro.
 * - centro_negocio_id (o proyecto_id si la herramienta solo acepta proyecto):
 *   solo en consultas y simulaciones; las propuestas usan sus propios ids.
 */
export function aplicarAncla(
  h: Pick<Herramienta, "tipo" | "parametros"> | undefined,
  argumentos: unknown,
  ancla: AnclaConversacion | null
): unknown {
  if (!h || !ancla || !argumentos || typeof argumentos !== "object" || Array.isArray(argumentos)) return argumentos;
  const props = h.parametros?.properties || {};
  const a = { ...(argumentos as Record<string, unknown>) };
  // Otro proyecto u otro centro explícito (null = toda la empresa del centro, no otro alcance).
  const otroAlcance =
    (a.proyecto_id !== undefined && a.proyecto_id !== null && a.proyecto_id !== ancla.proyecto_id) ||
    (a.centro_negocio_id !== undefined && a.centro_negocio_id !== null && a.centro_negocio_id !== ancla.centro_id);
  if (props.empresa_id && a.empresa_id === undefined && !otroAlcance) a.empresa_id = ancla.empresa_id;
  const otraEmpresa = a.empresa_id !== undefined && a.empresa_id !== null && a.empresa_id !== ancla.empresa_id;
  if ((h.tipo === "consulta" || h.tipo === "simulacion") && !otraEmpresa) {
    if (props.centro_negocio_id && a.centro_negocio_id === undefined && a.proyecto_id === undefined && a.presupuesto_id === undefined) {
      a.centro_negocio_id = ancla.centro_id;
    } else if (!props.centro_negocio_id && props.proyecto_id && a.proyecto_id === undefined && ancla.proyecto_id) {
      a.proyecto_id = ancla.proyecto_id;
    }
  }
  return a;
}
