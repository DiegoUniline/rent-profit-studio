/* eslint-disable @typescript-eslint/no-explicit-any */
// Dar de baja o reactivar registros desde Rafa (baja lógica, con confirmación).
// Un centro puede darse de baja en cascada con sus partidas activas y su
// proyecto; al reactivarlo vuelve exactamente lo que se dio de baja con él.

import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, ErrorPermiso, exigirContable } from "../permisos.ts";
import { enlaces, leerTodo, ref } from "../datos.ts";
import { type Preparacion, proponerAccion, registrarAccion } from "../acciones.ts";
import { calcularMontoPresupuestado } from "../../negocio/calculos.ts";
import { moneda, r2 } from "./util.ts";

type Entidad = "centro_negocio" | "presupuesto" | "tercero" | "cuenta" | "proyecto";
const TABLAS: Record<Entidad, { tabla: string; columna: string; nombre: string; etiqueta: string; enlace: (id: string) => string }> = {
  centro_negocio: { tabla: "centros_negocio", columna: "activo", nombre: "codigo, nombre", etiqueta: "centro de negocio", enlace: () => enlaces.centros() },
  presupuesto: { tabla: "presupuestos", columna: "activo", nombre: "partida, centro_negocio_id, cantidad, precio_unitario", etiqueta: "partida", enlace: (id) => enlaces.presupuestoEjercido(id) },
  tercero: { tabla: "terceros", columna: "activo", nombre: "razon_social, rfc", etiqueta: "tercero", enlace: () => enlaces.terceros() },
  cuenta: { tabla: "cuentas_contables", columna: "activa", nombre: "codigo, nombre", etiqueta: "cuenta contable", enlace: (id) => enlaces.cuenta(id) },
  proyecto: { tabla: "proyectos", columna: "activo", nombre: "nombre, centro_negocio_id", etiqueta: "proyecto", enlace: (id) => enlaces.proyecto(id) },
};

interface EntradaBaja {
  entidad: Entidad;
  id: string;
  reactivar?: boolean;
  en_cascada?: boolean;
}

function fallo(errores: string[]): Preparacion {
  return { ok: false, errores, descripcion: "", vista_previa: { resumen: "", tablas: [], advertencias: [], efectos: [] }, huella_datos: null, registros_afectados: [], rpc: { nombre: "", args: {} }, requiere_confirmacion: true };
}

async function prepararBaja(ctx: any, e: EntradaBaja): Promise<Preparacion> {
  exigirContable(ctx, "dar de baja o reactivar registros");
  const cfg = TABLAS[e.entidad];
  if (!cfg) return fallo(["Tipo de registro no soportado."]);
  const { data: r } = await ctx.db.from(cfg.tabla).select(`id, empresa_id, ${cfg.columna}, ${cfg.nombre}`).eq("id", e.id).maybeSingle();
  if (!r) throw new ErrorPermiso(`El ${cfg.etiqueta} no existe o no tienes acceso.`);
  const activo = Boolean(r[cfg.columna]);
  const nuevo = Boolean(e.reactivar);
  if (activo === nuevo) return fallo([`El ${cfg.etiqueta} ya está ${activo ? "activo" : "dado de baja"}.`]);
  const nombre = r.razon_social ?? (r.codigo ? `${r.codigo} · ${r.nombre}` : r.nombre ?? r.partida);
  const cascada = e.entidad === "centro_negocio" && e.en_cascada !== false;
  const advertencias: string[] = [];
  const efectos: string[] = [
    nuevo ? `Vuelve a aparecer en listas, selectores y en Rafa.` : `Deja de aparecer en listas, selectores y en Rafa (sus datos e historial se conservan; se puede reactivar).`,
  ];
  const filas: Record<string, unknown>[] = [{ registro: `${cfg.etiqueta}: ${nombre}`, antes: activo ? "Activo" : "Baja", despues: nuevo ? "Activo" : "Baja" }];
  let huellaExtra: unknown = null;

  if (e.entidad === "centro_negocio") {
    if (!nuevo) {
      const { filas: partidas } = await leerTodo<any>(() => ctx.db.from("presupuestos").select("id, cantidad, precio_unitario").eq("centro_negocio_id", r.id).eq("activo", true).order("id"));
      const { data: proyecto } = await ctx.db.from("proyectos").select("id, nombre, activo").eq("centro_negocio_id", r.id).maybeSingle();
      const total = r2((partidas || []).reduce((t: number, p: any) => t + calcularMontoPresupuestado(p.cantidad, p.precio_unitario), 0));
      if (cascada) {
        if ((partidas || []).length) filas.push({ registro: `${(partidas || []).length} partida(s) activas (${moneda(total)})`, antes: "Activas", despues: "Baja" });
        if (proyecto?.activo) filas.push({ registro: `proyecto: ${proyecto.nombre}`, antes: "Activo", despues: "Baja" });
        efectos.push("Al reactivar el centro, vuelven exactamente estas partidas y el proyecto.");
      } else if ((partidas || []).length) advertencias.push(`Sus ${(partidas || []).length} partidas activas (${moneda(total)}) seguirán activas.`);
      huellaExtra = { partidas: (partidas || []).map((p: any) => p.id).sort(), proyecto: proyecto?.activo ?? null };
    } else if (cascada) {
      const { filas: guardadas } = await leerTodo<any>(() => ctx.db.from("bajas_en_cascada").select("entidad, registro_id").eq("centro_negocio_id", r.id).order("registro_id"));
      const np = (guardadas || []).filter((g: any) => g.entidad === "presupuesto").length;
      const nq = (guardadas || []).filter((g: any) => g.entidad === "proyecto").length;
      if (np || nq) filas.push({ registro: `${np} partida(s) y ${nq} proyecto(s) dados de baja con el centro`, antes: "Baja", despues: "Activos" });
      huellaExtra = { guardadas: (guardadas || []).length };
    }
  }
  if (!nuevo && (e.entidad === "presupuesto" || e.entidad === "centro_negocio")) {
    let q = ctx.db.from("programaciones").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
    q = e.entidad === "presupuesto" ? q.eq("presupuesto_id", r.id) : q.eq("centro_negocio_id", r.id);
    const { count } = await q;
    if (count) advertencias.push(`Hay ${count} programación(es) de pago pendientes ligadas; no se cancelan.`);
  }

  return {
    ok: true,
    descripcion: `${nuevo ? "Reactivar" : "Dar de baja"} ${cfg.etiqueta} ${nombre}${cascada && e.entidad === "centro_negocio" ? " (con sus partidas y proyecto)" : ""}`,
    vista_previa: {
      resumen: `${nuevo ? "Reactivar" : "Dar de baja"} ${cfg.etiqueta} ${nombre}.`,
      tablas: [{ titulo: "Cambios", columnas: [{ clave: "registro", etiqueta: "Registro" }, { clave: "antes", etiqueta: "Antes" }, { clave: "despues", etiqueta: "Después" }], filas }],
      advertencias,
      efectos,
    },
    huella_datos: { activo, extra: huellaExtra },
    registros_afectados: [ref(e.entidad, r.id, String(nombre), cfg.enlace(r.id))],
    rpc: { nombre: "rafa_cambiar_activo", args: { p_cambio: { entidad: e.entidad, id: r.id, activo: nuevo, en_cascada: cascada } } },
    requiere_confirmacion: true,
  };
}

export const proponerBajaTool: Herramienta<EntradaBaja> = {
  nombre: "proponer_baja",
  modulo: "general",
  tipo: "accion",
  descripcion:
    "Propone dar de baja (o reactivar con reactivar=true) un centro de negocio, partida de presupuesto, tercero, cuenta contable o proyecto. Es baja lógica: el registro y su historial se conservan y deja de aparecer en listas y en Rafa. Un centro se da de baja con sus partidas activas y su proyecto (en_cascada, por defecto sí); al reactivarlo vuelven exactamente esos. Requiere confirmación.",
  parametros: s.objeto(
    {
      entidad: s.enumerado(["centro_negocio", "presupuesto", "tercero", "cuenta", "proyecto"], "Tipo de registro"),
      id: s.uuid("Registro"),
      reactivar: s.booleano("true para reactivar en vez de dar de baja"),
      en_cascada: s.booleano("Solo centros: incluir sus partidas y proyecto (por defecto sí)"),
    },
    ["entidad", "id"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador (RLS)", "El registro no está ya en ese estado", "Avisa programaciones pendientes ligadas"],
  devuelve: "Propuesta con antes/después; al confirmar, cambiar_activo en una transacción.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_baja", e),
};
registrarAccion({ herramienta: "proponer_baja", preparar: prepararBaja });
