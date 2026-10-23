// Guardados atómicos e idempotentes de asientos y de la programación
// financiera de partidas de proyecto (migración 20261025000000).
import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type Funciones = Database["public"]["Functions"];

/**
 * Clave de operación por guardado: un reintento con los mismos datos reutiliza
 * la clave (el servidor no repite el guardado); datos distintos = clave nueva.
 */
export function useClaveOperacion() {
  const ref = useRef<{ firma: string; operacion: string } | null>(null);
  const clave = useCallback((datos: unknown) => {
    const firma = JSON.stringify(datos);
    if (!ref.current || ref.current.firma !== firma) ref.current = { firma, operacion: crypto.randomUUID() };
    return ref.current.operacion;
  }, []);
  const reiniciar = useCallback(() => {
    ref.current = null;
  }, []);
  return { clave, reiniciar };
}

/** Mensaje para el usuario: todo error de estas RPC revierte el guardado completo. */
export function mensajeErrorGuardadoAtomico(mensaje: string | undefined): string {
  const m = mensaje || "No se pudo guardar";
  if (/_DESACTUALIZADO/.test(m)) return `${m.replace(/^[A-Z_]+:\s*/, "")}. No se guardó ningún cambio.`.replace("..", ".");
  if (/row-level security/i.test(m)) return "No tienes permiso para realizar este guardado. No se guardó ningún cambio.";
  return /no se guardó ningún cambio/i.test(m) ? m : `${m}. No se guardó ningún cambio.`.replace("..", ".");
}

export interface MovimientoParaGuardar {
  id?: string | null;
  cuenta_id: string;
  partida: string;
  debe: number;
  haber: number;
  presupuesto_id?: string | null;
}

export interface SolicitudAsiento {
  id: string | null;
  datos: {
    empresa_id: string;
    fecha: string;
    tipo: string;
    tercero_id: string | null;
    centro_negocio_id: string | null;
    observaciones: string | null;
  };
  movimientos: MovimientoParaGuardar[];
  /** updated_at leído al abrir; null al crear. */
  version: string | null;
}

export async function guardarAsiento(operacion: string, s: SolicitudAsiento) {
  const args = {
    p_operacion: operacion,
    p_id: s.id,
    p_datos: s.datos as unknown as Json,
    p_movimientos: s.movimientos.map((m) => ({ ...m, id: m.id || null, presupuesto_id: m.presupuesto_id || null })) as unknown as Json,
    p_version: s.version ?? undefined,
  } as Funciones["guardar_asiento"]["Args"];
  const { data, error } = await supabase.rpc("guardar_asiento", args);
  if (error) throw new Error(mensajeErrorGuardadoAtomico(error.message));
  return data as unknown as { asiento_id: string; creado: boolean; repetido?: boolean };
}

export interface SolicitudProgramacionPartida {
  datos: {
    presupuesto_id: string;
    proyecto_id: string;
    empresa_id: string;
    modo: "automatica" | "manual";
    frecuencia: string | null;
    fecha_inicio: string | null;
    numero_pagos: number | null;
    tiene_anticipo: boolean;
    anticipo_monto: number;
    anticipo_fecha: string | null;
  };
  /** Pagos sin el anticipo (el anticipo va en datos). */
  pagos: { fecha: string; monto: number; concepto: string | null }[];
}

export async function guardarProgramacionPartida(operacion: string, s: SolicitudProgramacionPartida) {
  const { data, error } = await supabase.rpc("guardar_programacion_partida", {
    p_operacion: operacion,
    p_datos: s.datos as unknown as Json,
    p_pagos: s.pagos as unknown as Json,
  });
  if (error) throw new Error(mensajeErrorGuardadoAtomico(error.message));
  return data as unknown as { programacion_id: string; creada: boolean; pagos: number; total: number; repetido?: boolean };
}
