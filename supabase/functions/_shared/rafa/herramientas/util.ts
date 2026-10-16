import type { ResultadoHerramienta } from "../tipos.ts";
import { ErrorPermiso } from "../permisos.ts";
import { ErrorDatos, ErrorFaltante } from "../datos.ts";

export function moneda(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n || 0);
}

export function r2(n: number): number {
  return Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
}

/** Limpia texto libre para filtros de PostgREST (evita inyectar operadores). */
export function textoBusqueda(texto: string | undefined): string | null {
  if (!texto) return null;
  const limpio = texto.replace(/[^\p{L}\p{N} ._/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpio || null;
}

export function errorComoResultado(e: unknown): ResultadoHerramienta {
  if (e instanceof ErrorFaltante) {
    return {
      ok: false,
      tipo: "error",
      resumen: e.message,
      error: e.message,
      faltantes: e.faltantes,
      datos: e.opciones ? { opciones: e.opciones } : undefined,
    };
  }
  if (e instanceof ErrorPermiso) {
    return { ok: false, tipo: "error", resumen: `Permiso denegado: ${e.message}`, error: e.message };
  }
  if (e instanceof ErrorDatos) {
    return { ok: false, tipo: "error", resumen: e.message, error: e.message };
  }
  const mensaje = e instanceof Error ? e.message : String(e);
  return { ok: false, tipo: "error", resumen: `Error inesperado: ${mensaje}`, error: mensaje };
}
