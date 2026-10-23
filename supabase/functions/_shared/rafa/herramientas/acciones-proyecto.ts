/* eslint-disable @typescript-eslint/no-explicit-any */
// Acciones de Rafa sobre proyectos y catálogos, siempre con vista previa y
// confirmación del usuario (mismo mecanismo que las demás acciones: huella de
// los datos presentados, recálculo al confirmar y RPC transaccional):
// cronograma de una partida, programación financiera de una partida de
// proyecto, alta de terceros con RFC y accesos de usuarios a proyectos.

import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, TODOS_LOS_ROLES, ErrorPermiso, accesoProyecto, exigirContable } from "../permisos.ts";
import { enlaces, ref, resolverEmpresa, leerProyecto } from "../datos.ts";
import { type Preparacion, proponerAccion, registrarAccion } from "../acciones.ts";
import { distribuirSaldoEntrePeriodos, numeroFinito } from "../../negocio/calculos.ts";
import { calcularFechasPorFrecuencia, fechaLocal, isoLocal } from "../../negocio/fechas.ts";
import { moneda, r2 } from "./util.ts";

function fallo(errores: string[], faltantes?: string[]): Preparacion {
  return {
    ok: false,
    errores,
    faltantes,
    descripcion: "",
    vista_previa: { resumen: "", tablas: [], advertencias: [], efectos: [] },
    huella_datos: null,
    registros_afectados: [],
    rpc: { nombre: "", args: {} },
    requiere_confirmacion: true,
  };
}

const COLUMNAS_CAMBIO = [
  { clave: "campo", etiqueta: "Campo" },
  { clave: "antes", etiqueta: "Antes" },
  { clave: "despues", etiqueta: "Después" },
];

async function leerPartidaConProyecto(ctx: any, presupuestoId: string) {
  const { data: partida } = await ctx.db
    .from("presupuestos")
    .select("id, partida, empresa_id, centro_negocio_id, cantidad, precio_unitario, activo, es_project, fecha_inicio, fecha_fin, avance_manual")
    .eq("id", presupuestoId)
    .maybeSingle();
  if (!partida) throw new ErrorPermiso("La partida no existe o no tienes acceso.");
  const { data: proyecto } = partida.centro_negocio_id
    ? await ctx.db.from("proyectos").select("id, nombre, empresa_id, centro_negocio_id, activo").eq("centro_negocio_id", partida.centro_negocio_id).maybeSingle()
    : { data: null };
  return { partida, proyecto };
}

// ===========================================================================
// 1. Cronograma de una partida (fechas y avance)
// ===========================================================================
interface EntradaCronograma {
  presupuesto_id: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  avance_manual?: number;
}

async function prepararCronograma(ctx: any, e: EntradaCronograma): Promise<Preparacion> {
  const { partida, proyecto } = await leerPartidaConProyecto(ctx, e.presupuesto_id);
  if (proyecto) {
    const acceso = await accesoProyecto(ctx, proyecto.id);
    if (!acceso.editarCronograma) throw new ErrorPermiso("No tienes permiso para editar el cronograma de este proyecto.");
  } else exigirContable(ctx, "editar el cronograma de partidas");
  if (e.fecha_inicio === undefined && e.fecha_fin === undefined && e.avance_manual === undefined) {
    return fallo(["Indica la fecha de inicio, la de fin o el avance."], ["fecha_inicio", "fecha_fin", "avance_manual"]);
  }
  const nuevo = {
    fecha_inicio: e.fecha_inicio !== undefined ? e.fecha_inicio : partida.fecha_inicio,
    fecha_fin: e.fecha_fin !== undefined ? e.fecha_fin : partida.fecha_fin,
    avance_manual: e.avance_manual !== undefined ? e.avance_manual : partida.avance_manual,
  };
  if (nuevo.fecha_inicio && nuevo.fecha_fin && nuevo.fecha_inicio > nuevo.fecha_fin) return fallo(["La fecha de inicio es posterior a la de fin."]);
  if (nuevo.avance_manual !== null && nuevo.avance_manual !== undefined && (nuevo.avance_manual < 0 || nuevo.avance_manual > 100)) {
    return fallo(["El avance debe estar entre 0 y 100."]);
  }
  const fila = (campo: string, antes: unknown, despues: unknown) => ({ campo, antes: antes ?? "—", despues: despues ?? "—" });
  return {
    ok: true,
    descripcion: `Actualizar el cronograma de "${partida.partida}"`,
    vista_previa: {
      resumen: `Cronograma de ${partida.partida}${proyecto ? ` (${proyecto.nombre})` : ""}.`,
      tablas: [
        {
          titulo: "Cambios al cronograma",
          columnas: COLUMNAS_CAMBIO,
          filas: [
            fila("Inicio", partida.fecha_inicio, nuevo.fecha_inicio),
            fila("Fin", partida.fecha_fin, nuevo.fecha_fin),
            fila("Avance %", partida.avance_manual, nuevo.avance_manual),
          ],
        },
      ],
      advertencias: [],
      efectos: ["Cambia el cronograma y el avance que se ven en el proyecto y en el enlace público del cronograma."],
    },
    huella_datos: { inicio: partida.fecha_inicio, fin: partida.fecha_fin, avance: partida.avance_manual },
    registros_afectados: [ref("presupuesto", partida.id, partida.partida, proyecto ? enlaces.proyecto(proyecto.id) : enlaces.presupuestoEjercido(partida.id))],
    rpc: { nombre: "rafa_actualizar_cronograma", args: { p_cambio: { presupuesto_id: partida.id, ...nuevo } } },
    requiere_confirmacion: true,
  };
}

export const proponerCronogramaTool: Herramienta<EntradaCronograma> = {
  nombre: "proponer_cronograma_partida",
  modulo: "proyectos",
  tipo: "accion",
  descripcion: "Propone cambiar las fechas de inicio/fin y el avance (%) de una partida en el cronograma del proyecto. Solo cambia lo indicado; requiere confirmación.",
  parametros: s.objeto(
    {
      presupuesto_id: s.uuid("Partida"),
      fecha_inicio: s.fecha("Nueva fecha de inicio"),
      fecha_fin: s.fecha("Nueva fecha de fin"),
      avance_manual: s.numero("Avance en % (0 a 100)", 0, 100),
    },
    ["presupuesto_id"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Permiso de editar cronograma del proyecto (admin/contador/arquitecto o acceso asignado)", "Inicio ≤ fin", "Avance 0–100"],
  devuelve: "Propuesta con antes/después; al confirmar, actualizar_cronograma_partida.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_cronograma_partida", e),
};
registrarAccion({ herramienta: "proponer_cronograma_partida", preparar: prepararCronograma });

// ===========================================================================
// 2. Programación financiera de una partida de proyecto
// ===========================================================================
const FRECUENCIAS = ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"];
interface EntradaProgramacionFinanciera {
  presupuesto_id: string;
  frecuencia: "semanal" | "quincenal" | "mensual" | "trimestral" | "semestral" | "anual";
  fecha_inicio: string;
  numero_pagos: number;
  anticipo_monto?: number;
  anticipo_fecha?: string;
}

async function prepararProgramacionFinanciera(ctx: any, e: EntradaProgramacionFinanciera): Promise<Preparacion> {
  const { partida, proyecto } = await leerPartidaConProyecto(ctx, e.presupuesto_id);
  if (!partida.es_project || !proyecto || !proyecto.activo) {
    return fallo(["La partida no pertenece a un proyecto activo: su programación se captura en Presupuestos (flujos programados)."]);
  }
  if (!partida.activo) return fallo(["La partida está dada de baja."]);
  const acceso = await accesoProyecto(ctx, proyecto.id);
  if (!acceso.editarProgramacionFinanciera) throw new ErrorPermiso("No tienes permiso para editar la programación financiera de este proyecto.");

  const presupuestado = r2(numeroFinito(partida.cantidad) * numeroFinito(partida.precio_unitario));
  const { data: movs } = await ctx.db.from("asiento_movimientos").select("debe, haber, asientos_contables:asiento_id(estado)").eq("presupuesto_id", partida.id);
  const ejercido = r2(((movs || []) as any[]).filter((m) => m.asientos_contables?.estado === "aplicado").reduce((t, m) => t + numeroFinito(m.debe) + numeroFinito(m.haber), 0));
  const anticipo = r2(Math.max(0, e.anticipo_monto ?? 0));
  if (anticipo > 0 && !e.anticipo_fecha) return fallo(["Indica la fecha del anticipo."], ["anticipo_fecha"]);
  const saldo = r2(presupuestado - ejercido - anticipo);
  if (saldo < 0) return fallo([`El anticipo (${moneda(anticipo)}) más lo ya pagado (${moneda(ejercido)}) supera el presupuesto (${moneda(presupuestado)}).`]);
  if (saldo === 0 && anticipo === 0) return fallo([`No queda nada por programar: el presupuesto (${moneda(presupuestado)}) ya está pagado.`]);

  const fechas = calcularFechasPorFrecuencia(fechaLocal(e.fecha_inicio), e.frecuencia, e.numero_pagos);
  const montos = distribuirSaldoEntrePeriodos(saldo, fechas.length);
  const pagos = fechas.map((f, i) => ({ fecha: isoLocal(f), monto: montos[i], concepto: `Pago ${i + 1}` })).filter((p) => p.monto > 0);

  const { data: existente } = await ctx.db.from("proyecto_programacion_financiera").select("id").eq("presupuesto_id", partida.id).maybeSingle();
  const { data: actuales } = existente
    ? await ctx.db.from("proyecto_programacion_pagos").select("id, fecha, monto").eq("programacion_id", existente.id)
    : { data: [] };
  const totalActual = r2(((actuales || []) as any[]).reduce((t, p) => t + numeroFinito(p.monto), 0));
  const filas = [
    ...(anticipo > 0 ? [{ fecha: e.anticipo_fecha, concepto: "Anticipo", monto: anticipo }] : []),
    ...pagos.map((p) => ({ fecha: p.fecha, concepto: p.concepto, monto: p.monto })),
  ];
  return {
    ok: true,
    descripcion: `Programar ${filas.length} pagos de "${partida.partida}" en ${proyecto.nombre}`,
    vista_previa: {
      resumen: `Presupuesto ${moneda(presupuestado)}, ya pagado ${moneda(ejercido)}; se programan ${moneda(r2(saldo + anticipo))} en ${filas.length} pagos (${e.frecuencia}).`,
      tablas: [
        {
          titulo: "Pagos que quedarán programados",
          columnas: [
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "concepto", etiqueta: "Concepto" },
            { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
          ],
          filas,
          totales: { monto: r2(saldo + anticipo) },
        },
      ],
      advertencias: (actuales || []).length ? [`Reemplaza ${(actuales || []).length} pagos programados actuales por ${moneda(totalActual)}.`] : [],
      efectos: ["Es la única fuente del proyectado de esta partida (Proyectos y Presupuestos).", "No crea asientos ni programaciones de tesorería."],
    },
    huella_datos: {
      presupuestado,
      ejercido,
      actuales: ((actuales || []) as any[]).map((p) => [p.id, p.fecha, numeroFinito(p.monto)]).sort(),
    },
    registros_afectados: [ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id)), ref("presupuesto", partida.id, partida.partida, enlaces.presupuestoEjercido(partida.id))],
    rpc: {
      nombre: "rafa_guardar_programacion_partida",
      args: {
        p_datos: {
          presupuesto_id: partida.id,
          proyecto_id: proyecto.id,
          empresa_id: partida.empresa_id,
          modo: "automatica",
          frecuencia: e.frecuencia,
          fecha_inicio: e.fecha_inicio,
          numero_pagos: e.numero_pagos,
          tiene_anticipo: anticipo > 0,
          anticipo_monto: anticipo,
          anticipo_fecha: anticipo > 0 ? e.anticipo_fecha : null,
        },
        p_pagos: pagos,
      },
    },
    requiere_confirmacion: true,
  };
}

export const proponerProgramacionFinancieraTool: Herramienta<EntradaProgramacionFinanciera> = {
  nombre: "proponer_programacion_financiera",
  modulo: "proyectos",
  tipo: "accion",
  descripcion:
    "Propone la programación financiera de una partida de PROYECTO (es_project): reparte lo que falta por pagar (presupuesto − ya pagado − anticipo) en pagos periódicos y reemplaza los pagos programados actuales. Requiere confirmación.",
  parametros: s.objeto(
    {
      presupuesto_id: s.uuid("Partida de proyecto"),
      frecuencia: s.enumerado(FRECUENCIAS, "Frecuencia de los pagos"),
      fecha_inicio: s.fecha("Fecha del primer pago"),
      numero_pagos: s.entero("Número de pagos (1 a 120)", 1, 120),
      anticipo_monto: s.numero("Anticipo (opcional)", 0),
      anticipo_fecha: s.fecha("Fecha del anticipo"),
    },
    ["presupuesto_id", "frecuencia", "fecha_inicio", "numero_pagos"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Partida activa de proyecto activo", "Permiso de editar programación financiera", "Anticipo + ya pagado ≤ presupuesto", "Al confirmar: guardar_programacion_partida (una transacción)"],
  devuelve: "Propuesta con los pagos resultantes; al confirmar reemplaza la programación de la partida.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_programacion_financiera", e),
};
registrarAccion({ herramienta: "proponer_programacion_financiera", preparar: prepararProgramacionFinanciera });

// ===========================================================================
// 3. Alta de terceros con RFC
// ===========================================================================
const PATRON_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
interface EntradaTercero {
  empresa_id?: string;
  razon_social: string;
  rfc: string;
  tipo: "cliente" | "proveedor" | "ambos";
  nombre_comercial?: string;
  email?: string;
  telefono?: string;
}

async function prepararTercero(ctx: any, e: EntradaTercero): Promise<Preparacion> {
  exigirContable(ctx, "dar de alta terceros");
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const rfc = (e.rfc || "").toUpperCase().replace(/\s+/g, "");
  const razon = (e.razon_social || "").trim();
  if (!razon) return fallo(["Indica la razón social."], ["razon_social"]);
  if (!PATRON_RFC.test(rfc)) return fallo([`El RFC "${e.rfc}" no tiene formato válido (12 caracteres persona moral, 13 persona física).`], ["rfc"]);
  const { data: mismoRfc } = await ctx.db.from("terceros").select("id, razon_social").eq("empresa_id", empresa.id).eq("rfc", rfc);
  if ((mismoRfc || []).length) return fallo([`Ya existe el tercero "${mismoRfc[0].razon_social}" con RFC ${rfc} en ${empresa.nombre}.`]);
  const { data: mismoNombre } = await ctx.db.from("terceros").select("id, rfc").eq("empresa_id", empresa.id).ilike("razon_social", razon);
  return {
    ok: true,
    descripcion: `Dar de alta a "${razon}" (${rfc}) como ${e.tipo} en ${empresa.nombre}`,
    vista_previa: {
      resumen: `Nuevo tercero en ${empresa.nombre}.`,
      tablas: [
        {
          titulo: "Tercero",
          columnas: [
            { clave: "razon_social", etiqueta: "Razón social" },
            { clave: "rfc", etiqueta: "RFC" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "nombre_comercial", etiqueta: "Nombre comercial" },
            { clave: "email", etiqueta: "Correo" },
            { clave: "telefono", etiqueta: "Teléfono" },
          ],
          filas: [{ razon_social: razon, rfc, tipo: e.tipo, nombre_comercial: e.nombre_comercial ?? null, email: e.email ?? null, telefono: e.telefono ?? null }],
        },
      ],
      advertencias: (mismoNombre || []).length ? [`Ya existe un tercero con la misma razón social (RFC ${mismoNombre[0].rfc}).`] : [],
      efectos: ["Queda disponible en asientos, programaciones y presupuestos de la empresa."],
    },
    huella_datos: { rfc, empresa: empresa.id, existentes: (mismoRfc || []).length },
    registros_afectados: [ref("empresa", empresa.id, empresa.nombre, enlaces.terceros())],
    rpc: {
      nombre: "rafa_crear_tercero",
      args: { p_tercero: { empresa_id: empresa.id, razon_social: razon, rfc, tipo: e.tipo, nombre_comercial: e.nombre_comercial ?? null, email: e.email ?? null, telefono: e.telefono ?? null } },
    },
    requiere_confirmacion: true,
  };
}

export const proponerTerceroTool: Herramienta<EntradaTercero> = {
  nombre: "proponer_tercero",
  modulo: "terceros",
  tipo: "accion",
  descripcion: "Propone dar de alta un tercero (cliente, proveedor o ambos) con su RFC en una empresa. Valida formato del RFC y que no exista ya en la empresa. Requiere confirmación.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      razon_social: s.texto("Razón social", 300),
      rfc: s.texto("RFC (12 o 13 caracteres)", 13),
      tipo: s.enumerado(["cliente", "proveedor", "ambos"], "Tipo de tercero"),
      nombre_comercial: s.texto("Nombre comercial", 300),
      email: s.texto("Correo", 200),
      telefono: s.texto("Teléfono", 40),
    },
    ["razon_social", "rfc", "tipo"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador", "RFC con formato válido", "RFC único en la empresa"],
  devuelve: "Propuesta del tercero; al confirmar, rafa_crear_tercero.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_tercero", e),
};
registrarAccion({ herramienta: "proponer_tercero", preparar: prepararTercero });

// ===========================================================================
// 4. Accesos de usuarios a proyectos (solo admin, igual que la pantalla)
// ===========================================================================
interface EntradaAcceso {
  proyecto_id: string;
  usuario?: string;
  user_id?: string;
  ver_programacion_financiera?: boolean;
  editar_cronograma?: boolean;
  editar_programacion_financiera?: boolean;
  quitar?: boolean;
}

async function prepararAcceso(ctx: any, e: EntradaAcceso): Promise<Preparacion> {
  if (!ctx.usuario.roles.includes("admin")) throw new ErrorPermiso("Solo un administrador puede asignar accesos a proyectos.");
  const proyecto = await leerProyecto(ctx, e.proyecto_id);
  let perfiles: any[] = [];
  if (e.user_id) {
    const { data } = await ctx.db.from("profiles").select("user_id, nombre_completo, nombre_usuario").eq("user_id", e.user_id);
    perfiles = data || [];
  } else if (e.usuario?.trim()) {
    const t = e.usuario.trim().replace(/[%,()]/g, " ");
    const { data } = await ctx.db.from("profiles").select("user_id, nombre_completo, nombre_usuario").or(`nombre_completo.ilike.%${t}%,nombre_usuario.ilike.%${t}%`).limit(10);
    perfiles = data || [];
  } else return fallo(["Indica el usuario (nombre o usuario)."], ["usuario"]);
  if (perfiles.length === 0) return fallo([`No encontré al usuario "${e.usuario ?? e.user_id}".`], ["usuario"]);
  if (perfiles.length > 1) {
    return fallo([`Hay ${perfiles.length} usuarios que coinciden: ${perfiles.map((p) => `${p.nombre_completo} (@${p.nombre_usuario}, user_id=${p.user_id})`).join("; ")}. Indica cuál.`], ["user_id"]);
  }
  const perfil = perfiles[0];
  const { data: actual } = await ctx.db
    .from("proyecto_usuarios")
    .select("id, ver_programacion_financiera, editar_cronograma, editar_programacion_financiera")
    .eq("proyecto_id", proyecto.id)
    .eq("user_id", perfil.user_id)
    .maybeSingle();
  if (e.quitar && !actual) return fallo([`${perfil.nombre_completo} no tiene acceso a ${proyecto.nombre}.`]);
  const nuevo = e.quitar
    ? null
    : {
        ver_programacion_financiera: e.ver_programacion_financiera ?? actual?.ver_programacion_financiera ?? false,
        editar_cronograma: e.editar_cronograma ?? actual?.editar_cronograma ?? false,
        editar_programacion_financiera: e.editar_programacion_financiera ?? actual?.editar_programacion_financiera ?? false,
      };
  const sn = (v: unknown) => (v === undefined || v === null ? "—" : v ? "Sí" : "No");
  return {
    ok: true,
    descripcion: e.quitar ? `Quitar el acceso de ${perfil.nombre_completo} a ${proyecto.nombre}` : `${actual ? "Actualizar" : "Dar"} acceso de ${perfil.nombre_completo} a ${proyecto.nombre}`,
    vista_previa: {
      resumen: `${perfil.nombre_completo} (@${perfil.nombre_usuario}) en ${proyecto.nombre}.`,
      tablas: [
        {
          titulo: "Acceso al proyecto",
          columnas: COLUMNAS_CAMBIO,
          filas: [
            { campo: "Ve el proyecto", antes: sn(Boolean(actual)), despues: sn(!e.quitar) },
            { campo: "Ve programación financiera", antes: sn(actual?.ver_programacion_financiera), despues: sn(nuevo?.ver_programacion_financiera) },
            { campo: "Edita cronograma", antes: sn(actual?.editar_cronograma), despues: sn(nuevo?.editar_cronograma) },
            { campo: "Edita programación financiera", antes: sn(actual?.editar_programacion_financiera), despues: sn(nuevo?.editar_programacion_financiera) },
          ],
        },
      ],
      advertencias: [],
      efectos: ["Cambia lo que ese usuario puede ver y editar del proyecto (también lo que Rafa le muestra)."],
    },
    huella_datos: { actual: actual ? [actual.ver_programacion_financiera, actual.editar_cronograma, actual.editar_programacion_financiera] : null },
    registros_afectados: [ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id))],
    rpc: { nombre: "rafa_asignar_acceso_proyecto", args: { p_acceso: { proyecto_id: proyecto.id, user_id: perfil.user_id, quitar: Boolean(e.quitar), ...(nuevo || {}) } } },
    requiere_confirmacion: true,
  };
}

export const proponerAccesoProyectoTool: Herramienta<EntradaAcceso> = {
  nombre: "proponer_acceso_proyecto",
  modulo: "proyectos",
  tipo: "accion",
  descripcion:
    "Propone dar, cambiar o quitar el acceso de un usuario a un proyecto (ver programación financiera, editar cronograma, editar programación financiera). Solo administradores. Busca al usuario por nombre o usuario. Requiere confirmación.",
  parametros: s.objeto(
    {
      proyecto_id: s.uuid("Proyecto"),
      usuario: s.texto("Nombre o usuario a buscar", 120),
      user_id: s.uuid("Id del usuario (si ya se conoce)"),
      ver_programacion_financiera: s.booleano("Puede ver la programación financiera"),
      editar_cronograma: s.booleano("Puede editar el cronograma"),
      editar_programacion_financiera: s.booleano("Puede editar la programación financiera"),
      quitar: s.booleano("Quitar el acceso al proyecto"),
    },
    ["proyecto_id"]
  ),
  roles: ["admin"],
  validaciones: ["Solo admin (RLS de proyecto_usuarios)", "Usuario único por nombre", "Al quitar, debe tener acceso"],
  devuelve: "Propuesta con antes/después del acceso; al confirmar, rafa_asignar_acceso_proyecto.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_acceso_proyecto", e),
};
registrarAccion({ herramienta: "proponer_acceso_proyecto", preparar: prepararAcceso });
