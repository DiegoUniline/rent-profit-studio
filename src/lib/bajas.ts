// Baja lógica (activo/activa = false) y reactivación con la función cambiar_activo
// (migración 20261027000000). Un centro se da de baja con sus partidas activas
// y su proyecto; al reactivarlo vuelven exactamente esos.
import { supabase } from "@/integrations/supabase/client";

export type EntidadBaja = "centro_negocio" | "presupuesto" | "tercero" | "cuenta" | "proyecto" | "empresa" | "unidad";

export interface ResultadoBaja {
  entidad: EntidadBaja;
  id: string;
  activo: boolean;
  partidas: number;
  proyectos: number;
}

export async function cambiarActivo(entidad: EntidadBaja, id: string, activo: boolean, enCascada = false): Promise<ResultadoBaja> {
  const { data, error } = await supabase.rpc("cambiar_activo", { p_entidad: entidad, p_id: id, p_activo: activo, p_en_cascada: enCascada });
  if (error) throw new Error(/row-level security|permiso/i.test(error.message) ? "No tienes permiso para dar de baja o reactivar este registro." : error.message);
  return data as unknown as ResultadoBaja;
}

/** Lo que se dará de baja con el centro (para avisarlo antes de confirmar). */
export async function impactoBajaCentro(centroId: string): Promise<{ partidas: number; proyecto: string | null }> {
  const [{ count }, { data: proyecto }] = await Promise.all([
    supabase.from("presupuestos").select("id", { count: "exact", head: true }).eq("centro_negocio_id", centroId).eq("activo", true),
    supabase.from("proyectos").select("nombre, activo").eq("centro_negocio_id", centroId).maybeSingle(),
  ]);
  return { partidas: count ?? 0, proyecto: proyecto?.activo ? proyecto.nombre : null };
}
