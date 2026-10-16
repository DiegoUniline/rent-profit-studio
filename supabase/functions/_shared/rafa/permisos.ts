// Permisos de Rafa, verificados en el servidor en cada herramienta.
//
// Rafa aplica la matriz de la aplicación (rutas de src/App.tsx y
// src/lib/project-permissions.ts), que es MÁS estricta que RLS: las políticas
// de lectura de varias tablas contables permiten SELECT a cualquier usuario
// autenticado, pero la aplicación solo muestra esos módulos a admin/contador.
// Además, toda consulta se hace con el JWT del usuario, así que RLS sigue
// aplicando como segunda barrera.

import type { Contexto, Rol } from "./tipos.ts";

export class ErrorPermiso extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorPermiso";
  }
}

export const ROLES_CONTABLES: Rol[] = ["admin", "contador"];
export const TODOS_LOS_ROLES: Rol[] = ["admin", "contador", "usuario", "arquitecto"];

export function tieneRol(ctx: Contexto, ...roles: Rol[]): boolean {
  return ctx.usuario.roles.some((r) => roles.includes(r));
}

export function esContable(ctx: Contexto): boolean {
  return tieneRol(ctx, "admin", "contador");
}

export function exigirContable(ctx: Contexto, accion = "consultar este módulo") {
  if (!esContable(ctx)) {
    throw new ErrorPermiso(`Tu rol no permite ${accion}. Requiere rol administrador o contador.`);
  }
}

export interface AccesoProyecto {
  ver: boolean;
  verProgramacionFinanciera: boolean;
  editarCronograma: boolean;
  editarProgramacionFinanciera: boolean;
  editarPresupuesto: boolean;
}

/** Misma regla que useProyectoAcceso, evaluada en el servidor. */
export async function accesoProyecto(ctx: Contexto, proyectoId: string): Promise<AccesoProyecto> {
  if (esContable(ctx)) {
    return { ver: true, verProgramacionFinanciera: true, editarCronograma: true, editarProgramacionFinanciera: true, editarPresupuesto: true };
  }
  if (tieneRol(ctx, "arquitecto")) {
    return { ver: true, verProgramacionFinanciera: true, editarCronograma: true, editarProgramacionFinanciera: false, editarPresupuesto: false };
  }
  const { data, error } = await ctx.db
    .from("proyecto_usuarios")
    .select("editar_cronograma, ver_programacion_financiera, editar_programacion_financiera")
    .eq("proyecto_id", proyectoId)
    .eq("user_id", ctx.usuario.id)
    .maybeSingle();
  if (error || !data) {
    return { ver: false, verProgramacionFinanciera: false, editarCronograma: false, editarProgramacionFinanciera: false, editarPresupuesto: false };
  }
  return {
    ver: true,
    verProgramacionFinanciera: Boolean(data.ver_programacion_financiera),
    editarCronograma: Boolean(data.editar_cronograma),
    editarProgramacionFinanciera: Boolean(data.editar_programacion_financiera),
    editarPresupuesto: false,
  };
}

export async function exigirVerProyecto(ctx: Contexto, proyectoId: string): Promise<AccesoProyecto> {
  const acceso = await accesoProyecto(ctx, proyectoId);
  if (!acceso.ver) throw new ErrorPermiso("No tienes acceso a este proyecto.");
  return acceso;
}
