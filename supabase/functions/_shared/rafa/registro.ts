// Catálogo de herramientas de Rafa. Agregar un módulo nuevo = escribir sus
// herramientas y añadirlas aquí; el motor, la validación, los permisos y la
// documentación generada (docs/rafa/herramientas.md) se adaptan solos.

import type { Contexto, Herramienta, ResultadoHerramienta } from "./tipos.ts";
import { validarEntrada } from "./validacion.ts";
import { errorComoResultado } from "./herramientas/util.ts";
import { buscarConocimientoTool, describirEntidadTool } from "./herramientas/conocimiento.ts";
import { buscarRegistrosTool, detalleRegistroTool, listarEmpresasTool } from "./herramientas/catalogos.ts";
import {
  compararProgramacionPresupuestoTool,
  consultarProgramacionesTool,
  excepcionesRespaldoTool,
  explicarPartidaTool,
  flujoProyectadoTool,
  resumenPresupuestoTool,
  sugerirProgramacionTool,
} from "./herramientas/finanzas.ts";
import { auditoriaProyectoTool, consultarTareasTool, resumenProyectoTool } from "./herramientas/proyectos.ts";
import { consultarAsientosTool, saldosCuentasTool } from "./herramientas/contabilidad.ts";
import { simularProyeccionUnidadesTool } from "./herramientas/simulaciones.ts";
import {
  proponerAjustePresupuestoTool,
  proponerAplicarAsientosTool,
  proponerAsientosBorradorTool,
  proponerCambioEstadoTool,
  proponerProgramacionesTool,
  proponerTareaTool,
  simularIncrementoTool,
} from "./herramientas/acciones.ts";
import { proponerPlanPresupuestoTool } from "./plan.ts";
import { abrirArchivosTool } from "./herramientas/archivos.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const HERRAMIENTAS: Herramienta<any>[] = [
  buscarConocimientoTool,
  describirEntidadTool,
  listarEmpresasTool,
  buscarRegistrosTool,
  detalleRegistroTool,
  consultarProgramacionesTool,
  compararProgramacionPresupuestoTool,
  excepcionesRespaldoTool,
  resumenPresupuestoTool,
  explicarPartidaTool,
  flujoProyectadoTool,
  sugerirProgramacionTool,
  resumenProyectoTool,
  consultarTareasTool,
  auditoriaProyectoTool,
  consultarAsientosTool,
  saldosCuentasTool,
  simularIncrementoTool,
  simularProyeccionUnidadesTool,
  proponerProgramacionesTool,
  proponerAsientosBorradorTool,
  proponerAjustePresupuestoTool,
  proponerCambioEstadoTool,
  proponerAplicarAsientosTool,
  proponerTareaTool,
  proponerPlanPresupuestoTool,
  abrirArchivosTool,
];

const porNombre = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));

export function herramientaPorNombre(nombre: string) {
  return porNombre.get(nombre);
}

export function herramientasDisponibles(ctx: Contexto) {
  return HERRAMIENTAS.filter((h) => h.roles.some((r) => ctx.usuario.roles.includes(r)));
}

/** Definiciones en formato de "tools" compatible con OpenAI/Lovable AI Gateway. */
export function definicionesParaModelo(ctx: Contexto) {
  return herramientasDisponibles(ctx).map((h) => ({
    type: "function",
    function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
  }));
}

/**
 * Ejecuta una herramienta pedida por el modelo. El rol y la entrada se validan
 * aquí, en el servidor, aunque el modelo solo vea herramientas permitidas.
 */
export async function ejecutarHerramienta(ctx: Contexto, nombre: string, argumentos: unknown): Promise<ResultadoHerramienta> {
  const h = porNombre.get(nombre);
  if (!h) return { ok: false, tipo: "error", resumen: `La herramienta ${nombre} no existe. Esa capacidad no está disponible.`, error: "herramienta_desconocida" };
  if (!h.roles.some((r) => ctx.usuario.roles.includes(r))) {
    return { ok: false, tipo: "error", resumen: `Permiso denegado: tu rol no permite usar ${nombre}.`, error: "permiso_denegado" };
  }
  let entrada: unknown = argumentos;
  if (typeof argumentos === "string") {
    try {
      entrada = argumentos.trim() ? JSON.parse(argumentos) : {};
    } catch {
      return { ok: false, tipo: "error", resumen: "Los argumentos de la herramienta no son JSON válido.", error: "argumentos_invalidos" };
    }
  }
  const errores = validarEntrada(h.parametros, entrada ?? {});
  if (errores.length) {
    return { ok: false, tipo: "error", resumen: `Entrada inválida: ${errores.join("; ")}`, error: errores.join("; ") };
  }
  try {
    return await h.ejecutar(ctx, entrada ?? {});
  } catch (e) {
    return errorComoResultado(e);
  }
}
