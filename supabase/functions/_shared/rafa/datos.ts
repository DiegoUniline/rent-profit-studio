/* eslint-disable @typescript-eslint/no-explicit-any */
// Acceso a datos controlado: paginación con tope, errores explícitos (nunca
// se devuelve un resultado parcial como si fuera completo) y resolución de
// empresa/proyecto sin elegir silenciosamente.

import type { Contexto, Referencia } from "./tipos.ts";
import { ErrorPermiso, esContable } from "./permisos.ts";

export class ErrorDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDatos";
  }
}

export class ErrorFaltante extends Error {
  faltantes: string[];
  opciones?: unknown;
  constructor(mensaje: string, faltantes: string[], opciones?: unknown) {
    super(mensaje);
    this.name = "ErrorFaltante";
    this.faltantes = faltantes;
    this.opciones = opciones;
  }
}

export const TAMANO_PAGINA = 1000;
/** Tope de filas que una herramienta puede leer para un cálculo. */
export const TOPE_LECTURA = 20000;

/**
 * Lee todas las filas de una consulta paginando de 1000 en 1000 hasta `tope`.
 * Si la base devuelve error, se lanza (no se devuelven filas acumuladas como
 * si estuvieran completas). `truncado` indica si se alcanzó el tope.
 */
export async function leerTodo<T = any>(
  construir: () => any,
  tope = TOPE_LECTURA
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  let desde = 0;
  while (true) {
    const { data, error } = await construir().range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new ErrorDatos(`Error al consultar la base: ${error.message}`);
    const lote = (data || []) as T[];
    filas.push(...lote);
    if (lote.length < TAMANO_PAGINA) return { filas, truncado: false };
    desde += TAMANO_PAGINA;
    if (filas.length >= tope) return { filas: filas.slice(0, tope), truncado: true };
  }
}

/** Ejecuta una consulta simple y lanza si hay error. */
export async function consultar<T = any>(consulta: any): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw new ErrorDatos(`Error al consultar la base: ${error.message}`);
  return data as T;
}

/** Divide una lista de ids en bloques para filtros `in` (límite de URL de PostgREST). */
export function bloques<T>(lista: T[], tam = 150): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) r.push(lista.slice(i, i + tam));
  return r;
}

export async function leerPorIds<T = any>(
  ctx: Contexto,
  tabla: string,
  columnas: string,
  campo: string,
  ids: string[],
  extra?: (q: any) => any
): Promise<T[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const todas: T[] = [];
  for (const b of bloques(unicos)) {
    const { filas } = await leerTodo<T>(() => {
      let q = ctx.db.from(tabla).select(columnas).in(campo, b);
      if (extra) q = extra(q);
      // Orden fijo: sin él, paginar con range() puede saltar o repetir filas.
      return q.order("id");
    });
    todas.push(...filas);
  }
  return todas;
}

export interface EmpresaRef {
  id: string;
  nombre: string;
}

export async function empresasVisibles(ctx: Contexto): Promise<EmpresaRef[]> {
  const data = await consultar<any[]>(
    ctx.db.from("empresas").select("id, razon_social, nombre_comercial, activa").eq("activa", true).order("razon_social")
  );
  return (data || []).map((e) => ({ id: e.id, nombre: e.nombre_comercial || e.razon_social }));
}

/**
 * Resuelve la empresa de una consulta. Nunca elige "la primera": si no se
 * indicó y hay más de una visible, lanza ErrorFaltante con las opciones.
 */
export async function resolverEmpresa(ctx: Contexto, empresaId: string | undefined): Promise<EmpresaRef> {
  const empresas = await empresasVisibles(ctx);
  if (empresaId) {
    const e = empresas.find((x) => x.id === empresaId);
    if (!e) throw new ErrorPermiso("La empresa indicada no existe, está inactiva o no es visible para tu usuario.");
    return e;
  }
  if (empresas.length === 1) return empresas[0];
  throw new ErrorFaltante(
    "Falta indicar la empresa: hay varias empresas activas.",
    ["empresa_id"],
    empresas
  );
}

export interface ProyectoRef {
  id: string;
  nombre: string;
  empresa_id: string;
  centro_negocio_id: string;
  activo: boolean;
}

export async function leerProyecto(ctx: Contexto, proyectoId: string): Promise<ProyectoRef> {
  const p = await consultar<any>(
    ctx.db.from("proyectos").select("id, nombre, empresa_id, centro_negocio_id, activo").eq("id", proyectoId).maybeSingle()
  );
  if (!p) throw new ErrorPermiso("El proyecto no existe o no tienes acceso a él.");
  return p as ProyectoRef;
}

/** Verifica que un registro pertenece a la empresa del alcance (evita inyectar ids de otra empresa). */
export function exigirMismaEmpresa(registroEmpresa: string | null | undefined, empresaId: string, que: string) {
  if (registroEmpresa !== empresaId) {
    throw new ErrorPermiso(`${que} no pertenece a la empresa de la consulta.`);
  }
}

// Enlaces a pantallas de la aplicación (rutas de src/App.tsx).
export const enlaces = {
  asiento: (id: string) => `/asientos/${id}`,
  presupuestoEjercido: (id: string) => `/presupuestos/${id}/ejercido`,
  presupuestos: () => `/presupuestos`,
  proyecto: (id: string) => `/proyectos/${id}`,
  cuenta: (id: string) => `/cuentas/${id}`,
  programacion: () => `/programacion`,
  terceros: () => `/terceros`,
  centros: () => `/centros-negocio`,
  empresas: () => `/empresas`,
};

export function ref(entidad: string, id: string, etiqueta: string, enlace?: string): Referencia {
  return { entidad, id, etiqueta, enlace };
}

export function soloContable(ctx: Contexto) {
  return esContable(ctx);
}
