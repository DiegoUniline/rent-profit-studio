// Guardado de una partida presupuestal y sus pagos programados mediante la
// RPC atómica e idempotente guardar_presupuesto (ver migración
// 20261017000000_presupuestos_guardado_atomico.sql).
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export interface FlujoEditable {
  id?: string;
  fecha: Date | undefined;
  monto: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
}

export interface FlujoParaGuardar {
  id: string | null;
  fecha: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  descripcion: string | null;
}

export interface DatosPresupuesto {
  empresa_id: string;
  cuenta_id: string | null;
  centro_negocio_id: string | null;
  unidad_medida_id: string | null;
  partida: string;
  cantidad: number;
  precio_unitario: number;
  notas: string | null;
  tipo_movimiento: string | null;
}

export interface SolicitudGuardado {
  id: string | null;
  datos: DatosPresupuesto;
  /** null = no tocar los pagos (partidas administradas desde Proyectos). */
  flujos: FlujoParaGuardar[] | null;
  /** updated_at leído al abrir; null al crear. */
  version: string | null;
}

export interface ResultadoGuardado {
  presupuesto_id: string;
  creado: boolean;
  flujos: { insertados: number; actualizados: number; eliminados: number };
  repetido?: boolean;
}

/**
 * Filas del formulario → pagos a guardar. Las existentes conservan su id (se
 * actualizan); las nuevas van sin id (se insertan). Las filas sin fecha o con
 * monto ≤ 0 se descartan como antes; si eran existentes, se eliminan.
 */
export function flujosParaGuardar(filas: FlujoEditable[]): FlujoParaGuardar[] {
  return filas
    .filter((f) => f.fecha && parseFloat(f.monto) > 0)
    .map((f) => ({
      id: f.id ?? null,
      fecha: format(f.fecha!, "yyyy-MM-dd"),
      monto: parseFloat(f.monto),
      tipo: f.tipo,
      descripcion: f.descripcion || null,
    }));
}

/** Huella de la solicitud: un reintento idéntico reutiliza la misma clave de operación. */
export function firmaSolicitud(s: SolicitudGuardado): string {
  return JSON.stringify([s.id, s.datos, s.flujos, s.version]);
}

/** Mensaje para el usuario a partir del error de la RPC (todo error revierte el guardado completo). */
export function mensajeErrorGuardado(mensaje: string | undefined): string {
  const m = mensaje || "No se pudo guardar";
  if (m.startsWith("PRESUPUESTO_DESACTUALIZADO")) {
    return "El presupuesto cambió desde que lo abriste. Ciérralo y vuelve a abrirlo; no se guardó ningún cambio.";
  }
  if (/row-level security/i.test(m)) return "No tienes permiso para realizar este guardado. No se guardó ningún cambio.";
  return /no se guardó ningún cambio/i.test(m) ? m : `${m}. No se guardó ningún cambio.`.replace("..", ".");
}

export async function guardarPresupuesto(operacion: string, s: SolicitudGuardado): Promise<ResultadoGuardado> {
  // p_id va null al crear (los tipos generados no reflejan argumentos uuid nulos).
  const args = {
    p_operacion: operacion,
    p_id: s.id,
    p_datos: s.datos as unknown as Json,
    p_flujos: s.flujos as unknown as Json,
    p_version: s.version ?? undefined,
  } as Database["public"]["Functions"]["guardar_presupuesto"]["Args"];
  const { data, error } = await supabase.rpc("guardar_presupuesto", args);
  if (error) {
    // Otra petición con la misma clave ya terminó el guardado.
    if (error.message?.startsWith("PRESUPUESTO_OPERACION_REPETIDA")) {
      return { presupuesto_id: s.id ?? "", creado: false, flujos: { insertados: 0, actualizados: 0, eliminados: 0 }, repetido: true };
    }
    throw new Error(mensajeErrorGuardado(error.message));
  }
  return data as unknown as ResultadoGuardado;
}
