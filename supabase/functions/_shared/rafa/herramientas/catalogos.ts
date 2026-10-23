/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Contexto, Herramienta, Referencia, ResultadoHerramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ErrorPermiso, TODOS_LOS_ROLES, exigirContable, exigirVerProyecto } from "../permisos.ts";
import {
  consultar,
  empresasVisibles,
  enlaces,
  leerProyecto,
  ref,
  resolverEmpresa,
} from "../datos.ts";
import { calcularMontoPresupuestado, numeroFinito } from "../../negocio/calculos.ts";
import { moneda, r2, textoBusqueda } from "./util.ts";

export const listarEmpresasTool: Herramienta<Record<string, never>> = {
  nombre: "listar_empresas",
  modulo: "empresas",
  tipo: "consulta",
  descripcion: "Lista las empresas activas visibles para el usuario (id y nombre). Úsala para resolver a qué empresa se refiere el usuario.",
  parametros: s.objeto({}),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Solo empresas activas"],
  devuelve: "Lista de empresas con id y nombre.",
  confirmacion: "nunca",
  async ejecutar(ctx) {
    const empresas = await empresasVisibles(ctx);
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${empresas.length} empresas activas visibles.`,
      alcance: { registros: empresas.length, total: empresas.length, truncado: false },
      datos: { empresas },
      referencias: empresas.map((e) => ref("empresa", e.id, e.nombre, enlaces.empresas())),
    };
  },
};

type Entidad =
  | "centros_negocio"
  | "terceros"
  | "cuentas_contables"
  | "presupuestos"
  | "proyectos"
  | "unidades_medida"
  | "asientos"
  | "programaciones"
  | "tareas";

interface ConfigEntidad {
  tabla: string;
  columnas: string;
  texto: string[];
  porEmpresa: boolean;
  contable: boolean;
  orden: string;
  fecha?: string;
  etiqueta: (f: any) => string;
  enlace: (f: any) => string | undefined;
  fila: (f: any) => Record<string, unknown>;
}

const ENTIDADES: Record<Entidad, ConfigEntidad> = {
  centros_negocio: {
    tabla: "centros_negocio",
    columnas: "id, codigo, nombre, tipo_actividad, responsable, activo, empresa_id",
    texto: ["nombre", "codigo"],
    porEmpresa: true,
    contable: true,
    orden: "codigo",
    etiqueta: (f) => `${f.codigo} · ${f.nombre}`,
    enlace: () => enlaces.centros(),
    fila: (f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, tipo_actividad: f.tipo_actividad, activo: f.activo }),
  },
  terceros: {
    tabla: "terceros",
    columnas: "id, tipo, rfc, razon_social, nombre_comercial, activo, empresa_id",
    texto: ["razon_social", "nombre_comercial", "rfc"],
    porEmpresa: true,
    contable: true,
    orden: "razon_social",
    etiqueta: (f) => f.razon_social,
    enlace: () => enlaces.terceros(),
    fila: (f) => ({ id: f.id, tipo: f.tipo, rfc: f.rfc, razon_social: f.razon_social, activo: f.activo }),
  },
  cuentas_contables: {
    tabla: "cuentas_contables",
    columnas: "id, codigo, nombre, naturaleza, clasificacion, nivel, activa, empresa_id",
    texto: ["nombre", "codigo"],
    porEmpresa: true,
    contable: true,
    orden: "codigo",
    etiqueta: (f) => `${f.codigo} ${f.nombre}`,
    enlace: (f) => enlaces.cuenta(f.id),
    fila: (f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, naturaleza: f.naturaleza, clasificacion: f.clasificacion, activa: f.activa }),
  },
  presupuestos: {
    tabla: "presupuestos",
    columnas:
      "id, partida, cantidad, precio_unitario, activo, es_project, tipo_movimiento, empresa_id, centro_negocio_id, cuentas_contables:cuenta_id(codigo, nombre), centros_negocio:centro_negocio_id(nombre)",
    texto: ["partida"],
    porEmpresa: true,
    contable: true,
    orden: "orden",
    etiqueta: (f) => f.partida,
    enlace: (f) => enlaces.presupuestoEjercido(f.id),
    fila: (f) => ({
      id: f.id,
      partida: f.partida,
      centro: f.centros_negocio?.nombre ?? null,
      cuenta: f.cuentas_contables ? `${f.cuentas_contables.codigo} ${f.cuentas_contables.nombre}` : null,
      presupuestado: r2(calcularMontoPresupuestado(f.cantidad, f.precio_unitario)),
      tipo_movimiento: f.tipo_movimiento ?? "pendiente de clasificar",
      activo: f.activo,
      es_project: f.es_project,
    }),
  },
  proyectos: {
    tabla: "proyectos",
    columnas: "id, nombre, activo, empresa_id, centro_negocio_id, centros_negocio:centro_negocio_id(codigo, nombre)",
    texto: ["nombre"],
    porEmpresa: true,
    contable: false,
    orden: "nombre",
    etiqueta: (f) => f.nombre,
    enlace: (f) => enlaces.proyecto(f.id),
    fila: (f) => ({ id: f.id, nombre: f.nombre, centro: f.centros_negocio?.nombre ?? null, activo: f.activo }),
  },
  unidades_medida: {
    tabla: "unidades_medida",
    columnas: "id, codigo, nombre, activa",
    texto: ["codigo", "nombre"],
    porEmpresa: false,
    contable: true,
    orden: "codigo",
    etiqueta: (f) => `${f.codigo} ${f.nombre}`,
    enlace: () => undefined,
    fila: (f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, activa: f.activa }),
  },
  asientos: {
    tabla: "asientos_contables",
    columnas: "id, numero_asiento, fecha, tipo, estado, observaciones, total_debe, total_haber, empresa_id, centros_negocio:centro_negocio_id(nombre)",
    texto: ["observaciones"],
    porEmpresa: true,
    contable: true,
    orden: "fecha",
    fecha: "fecha",
    etiqueta: (f) => `Asiento #${f.numero_asiento}`,
    enlace: (f) => enlaces.asiento(f.id),
    fila: (f) => ({
      id: f.id,
      numero: f.numero_asiento,
      fecha: f.fecha,
      tipo: f.tipo,
      estado: f.estado,
      observaciones: f.observaciones,
      total: r2(numeroFinito(f.total_debe)),
      centro: f.centros_negocio?.nombre ?? null,
    }),
  },
  programaciones: {
    tabla: "programaciones",
    columnas: "id, fecha_programada, tipo, estado, monto, observaciones, empresa_id, presupuesto_id, presupuestos:presupuesto_id(partida)",
    texto: ["observaciones"],
    porEmpresa: true,
    contable: true,
    orden: "fecha_programada",
    fecha: "fecha_programada",
    etiqueta: (f) => `${f.tipo} ${f.fecha_programada} ${moneda(numeroFinito(f.monto))}`,
    enlace: () => enlaces.programacion(),
    fila: (f) => ({
      id: f.id,
      fecha: f.fecha_programada,
      tipo: f.tipo,
      estado: f.estado,
      monto: r2(numeroFinito(f.monto)),
      partida: f.presupuestos?.partida ?? null,
      observaciones: f.observaciones,
    }),
  },
  tareas: {
    tabla: "proyecto_tareas",
    columnas: "id, titulo, estado, fecha_vencimiento, proyecto_id, empresa_id, terceros:responsable_tercero_id(razon_social)",
    texto: ["titulo", "notas"],
    porEmpresa: true,
    contable: false,
    orden: "orden",
    fecha: "fecha_vencimiento",
    etiqueta: (f) => f.titulo,
    enlace: (f) => enlaces.proyecto(f.proyecto_id),
    fila: (f) => ({ id: f.id, titulo: f.titulo, estado: f.estado, vence: f.fecha_vencimiento, responsable: f.terceros?.razon_social ?? null }),
  },
};

interface EntradaBuscar {
  entidad: Entidad;
  empresa_id?: string;
  texto?: string;
  activo?: boolean;
  estado?: string;
  tipo?: string;
  centro_negocio_id?: string;
  proyecto_id?: string;
  codigo_prefijo?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
  desplazamiento?: number;
}

export const buscarRegistrosTool: Herramienta<EntradaBuscar> = {
  nombre: "buscar_registros",
  modulo: "general",
  tipo: "consulta",
  descripcion:
    "Busca registros de un módulo con filtros y paginación (centros, terceros, cuentas, partidas de presupuesto, proyectos, unidades, asientos, programaciones, tareas). Devuelve el total que cumple el filtro y si la página está truncada. Para cifras agregadas usa las herramientas de análisis.",
  parametros: s.objeto(
    {
      entidad: s.enumerado(Object.keys(ENTIDADES), "Módulo a buscar"),
      empresa_id: s.uuid("Empresa (obligatoria salvo unidades_medida; si falta y hay varias, se pedirá)"),
      texto: s.texto("Texto a buscar (nombre, código, RFC, partida u observaciones)", 80),
      activo: s.booleano("Por defecto solo activos (lo dado de baja no aparece); false = solo los dados de baja"),
      estado: s.texto("Estado (asientos: borrador/aplicado/cancelado; programaciones: pendiente/ejecutado/cancelado; tareas)", 30),
      tipo: s.texto("Tipo (asientos: ingreso/egreso/diario; programaciones: ingreso/egreso; terceros: cliente/proveedor/ambos; partidas: tipo_movimiento)", 30),
      centro_negocio_id: s.uuid("Centro de negocio"),
      proyecto_id: s.uuid("Proyecto (para tareas)"),
      codigo_prefijo: s.texto("Prefijo de código de cuenta, por ejemplo 600", 20),
      desde: s.fecha("Fecha inicial (asientos, programaciones, tareas)"),
      hasta: s.fecha("Fecha final"),
      limite: s.entero("Máximo de filas (1-50, por defecto 20)", 1, 50),
      desplazamiento: s.entero("Filas a saltar para paginar", 0, 100000),
    },
    ["entidad"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: [
    "Catálogos contables, asientos y programaciones solo para admin/contador",
    "Proyectos y tareas filtrados por RLS y acceso al proyecto",
    "Texto saneado antes de construir el filtro",
  ],
  devuelve: "Página de registros con enlaces, total y bandera de truncado.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    const cfg = ENTIDADES[e.entidad];
    if (cfg.contable) exigirContable(ctx);
    if (e.entidad === "tareas") {
      if (!e.proyecto_id) {
        return { ok: false, tipo: "error", resumen: "Para buscar tareas indica el proyecto.", faltantes: ["proyecto_id"], error: "falta_proyecto" };
      }
      await exigirVerProyecto(ctx, e.proyecto_id);
    }
    const empresa = cfg.porEmpresa ? await resolverEmpresa(ctx, e.empresa_id) : null;
    const limite = e.limite ?? 20;
    const desde = e.desplazamiento ?? 0;

    let q = ctx.db.from(cfg.tabla).select(cfg.columnas, { count: "exact" });
    if (empresa) q = q.eq("empresa_id", empresa.id);
    const texto = textoBusqueda(e.texto);
    if (texto) q = q.or(cfg.texto.map((c) => `${c}.ilike.*${texto}*`).join(","));
    // Lo dado de baja no aparece salvo que se pida explícitamente (activo: false).
    if (e.entidad !== "asientos" && e.entidad !== "programaciones" && e.entidad !== "tareas") {
      const col = ["cuentas_contables", "unidades_medida"].includes(e.entidad) ? "activa" : "activo";
      q = q.eq(col, e.activo ?? true);
    }
    if (e.estado && ["asientos", "programaciones", "tareas"].includes(e.entidad)) q = q.eq("estado", e.estado);
    if (e.tipo) {
      if (e.entidad === "presupuestos") q = e.tipo === "pendiente" ? q.is("tipo_movimiento", null) : q.eq("tipo_movimiento", e.tipo);
      else if (["asientos", "programaciones", "terceros"].includes(e.entidad)) q = q.eq("tipo", e.tipo);
    }
    if (e.centro_negocio_id && ["presupuestos", "proyectos", "asientos", "programaciones"].includes(e.entidad)) q = q.eq("centro_negocio_id", e.centro_negocio_id);
    if (e.proyecto_id && e.entidad === "tareas") q = q.eq("proyecto_id", e.proyecto_id);
    if (e.codigo_prefijo && e.entidad === "cuentas_contables") q = q.like("codigo", `${e.codigo_prefijo.replace(/[^0-9-]/g, "")}%`);
    if (cfg.fecha && e.desde) q = q.gte(cfg.fecha, e.desde);
    if (cfg.fecha && e.hasta) q = q.lte(cfg.fecha, e.hasta);
    q = q.order(cfg.orden).order("id").range(desde, desde + limite - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(`Error al consultar ${cfg.tabla}: ${error.message}`);
    const filas = (data || []) as any[];
    const total = typeof count === "number" ? count : null;
    const truncado = total !== null ? desde + filas.length < total : filas.length === limite;
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${filas.length} de ${total ?? "?"} registros de ${e.entidad}${empresa ? ` en ${empresa.nombre}` : ""}${truncado ? " (hay más: usa desplazamiento para la siguiente página)" : ""}.`,
      alcance: {
        empresa,
        periodo: e.desde || e.hasta ? { desde: e.desde || "", hasta: e.hasta || "" } : null,
        filtros: { entidad: e.entidad, texto, activo: e.activo ?? true, estado: e.estado, tipo: e.tipo, centro_negocio_id: e.centro_negocio_id, desplazamiento: desde },
        registros: filas.length,
        total,
        truncado,
      },
      datos: { filas: filas.map(cfg.fila) },
      tablas: [
        {
          titulo: `Resultados: ${e.entidad}`,
          columnas: Object.keys(cfg.fila(filas[0] || {})).filter((k) => k !== "id").map((k) => ({ clave: k, etiqueta: k })),
          filas: filas.map((f) => ({ ...cfg.fila(f), _enlace: cfg.enlace(f) })),
        },
      ],
      referencias: filas.map((f) => ref(e.entidad, f.id, cfg.etiqueta(f), cfg.enlace(f))),
    };
  },
};

type EntidadDetalle = "presupuesto" | "asiento" | "programacion" | "proyecto" | "cuenta" | "tercero" | "centro_negocio" | "empresa" | "tarea";

export const detalleRegistroTool: Herramienta<{ entidad: EntidadDetalle; id: string }> = {
  nombre: "detalle_registro",
  modulo: "general",
  tipo: "consulta",
  descripcion:
    "Devuelve un registro y sus relaciones directas para seguir la cadena entre módulos: partida → cuenta/centro/proyecto/programaciones/asientos; asiento → renglones/partidas/programación ligada/flujos IVA; programación → partida/asiento; proyecto → centro/partidas/tareas.",
  parametros: s.objeto(
    {
      entidad: s.enumerado(["presupuesto", "asiento", "programacion", "proyecto", "cuenta", "tercero", "centro_negocio", "empresa", "tarea"], "Tipo de registro"),
      id: s.uuid("Id del registro"),
    },
    ["entidad", "id"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Registros contables solo admin/contador", "Proyectos y tareas según acceso al proyecto", "El registro debe ser visible por RLS"],
  devuelve: "Registro, relaciones y enlaces.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    return await detalle(ctx, e.entidad, e.id);
  },
};

async function detalle(ctx: Contexto, entidad: EntidadDetalle, id: string): Promise<ResultadoHerramienta> {
  const referencias: Referencia[] = [];
  const noEncontrado = (): ResultadoHerramienta => ({
    ok: false,
    tipo: "error",
    resumen: `No encontré ${entidad} con ese id, o no es visible para tu usuario.`,
    error: "no_encontrado",
  });

  if (entidad === "proyecto" || entidad === "tarea") {
    let proyectoId = id;
    let tarea: any = null;
    if (entidad === "tarea") {
      tarea = await consultar<any>(ctx.db.from("proyecto_tareas").select("*, terceros:responsable_tercero_id(razon_social)").eq("id", id).maybeSingle());
      if (!tarea) return noEncontrado();
      proyectoId = tarea.proyecto_id;
    }
    const acceso = await exigirVerProyecto(ctx, proyectoId);
    const proyecto = await leerProyecto(ctx, proyectoId);
    referencias.push(ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id)));
    if (tarea) {
      return { ok: true, tipo: "consulta", resumen: `Tarea "${tarea.titulo}" (${tarea.estado}) del proyecto ${proyecto.nombre}.`, datos: { tarea, proyecto }, referencias };
    }
    const centro = await consultar<any>(ctx.db.from("centros_negocio").select("id, codigo, nombre").eq("id", proyecto.centro_negocio_id).maybeSingle());
    const partidas = await consultar<any[]>(
      ctx.db.from("presupuestos").select("id, partida, es_project, activo").eq("empresa_id", proyecto.empresa_id).eq("centro_negocio_id", proyecto.centro_negocio_id)
    );
    const tareas = await consultar<any[]>(ctx.db.from("proyecto_tareas").select("id, estado").eq("proyecto_id", proyecto.id));
    const porEstado: Record<string, number> = {};
    (tareas || []).forEach((t) => (porEstado[t.estado] = (porEstado[t.estado] || 0) + 1));
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Proyecto ${proyecto.nombre}: centro ${centro?.codigo ?? ""} ${centro?.nombre ?? ""}, ${(partidas || []).filter((p) => p.es_project && p.activo).length} partidas de proyecto activas, ${(tareas || []).length} tareas.`,
      datos: {
        proyecto,
        centro,
        acceso,
        partidas_proyecto_activas: (partidas || []).filter((p) => p.es_project && p.activo).map((p) => ({ id: p.id, partida: p.partida })),
        partidas_del_centro_no_proyecto: (partidas || []).filter((p) => !p.es_project && p.activo).length,
        tareas_por_estado: porEstado,
        nota: "Las partidas del proyecto se relacionan por empresa + centro de negocio (no hay FK directa a proyectos).",
      },
      referencias,
    };
  }

  exigirContable(ctx);

  if (entidad === "presupuesto") {
    const p = await consultar<any>(
      ctx.db
        .from("presupuestos")
        .select(
          "*, cuentas_contables:cuenta_id(id, codigo, nombre), centros_negocio:centro_negocio_id(id, codigo, nombre), terceros!presupuestos_tercero_id_fkey(id, razon_social), unidades_medida:unidad_medida_id(codigo, nombre)"
        )
        .eq("id", id)
        .maybeSingle()
    );
    if (!p) return noEncontrado();
    const proyecto = p.centro_negocio_id
      ? await consultar<any>(ctx.db.from("proyectos").select("id, nombre, activo").eq("empresa_id", p.empresa_id).eq("centro_negocio_id", p.centro_negocio_id).maybeSingle())
      : null;
    const programaciones = await consultar<any[]>(ctx.db.from("programaciones").select("id, estado, monto, fecha_programada").eq("presupuesto_id", id).eq("empresa_id", p.empresa_id));
    const { count: renglones } = await ctx.db.from("asiento_movimientos").select("id", { count: "exact", head: true }).eq("presupuesto_id", id);
    const { count: flujos } = await ctx.db.from("flujos_programados").select("id", { count: "exact", head: true }).eq("presupuesto_id", id);
    const resumenProg: Record<string, { cantidad: number; monto: number }> = {};
    (programaciones || []).forEach((x) => {
      const k = x.estado;
      resumenProg[k] = resumenProg[k] || { cantidad: 0, monto: 0 };
      resumenProg[k].cantidad++;
      resumenProg[k].monto = r2(resumenProg[k].monto + numeroFinito(x.monto));
    });
    referencias.push(ref("presupuesto", p.id, p.partida, enlaces.presupuestoEjercido(p.id)));
    if (p.cuentas_contables) referencias.push(ref("cuenta", p.cuentas_contables.id, `${p.cuentas_contables.codigo} ${p.cuentas_contables.nombre}`, enlaces.cuenta(p.cuentas_contables.id)));
    if (proyecto) referencias.push(ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id)));
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Partida "${p.partida}": presupuestado ${moneda(calcularMontoPresupuestado(p.cantidad, p.precio_unitario))} (${p.cantidad} × ${p.precio_unitario}), ${p.activo ? "activa" : "inactiva"}, ${p.es_project ? "de proyecto" : "no es de proyecto"}.`,
      datos: {
        partida: {
          id: p.id,
          empresa_id: p.empresa_id,
          partida: p.partida,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          presupuestado: r2(calcularMontoPresupuestado(p.cantidad, p.precio_unitario)),
          tipo_movimiento: p.tipo_movimiento ?? "pendiente de clasificar",
          activo: p.activo,
          es_project: p.es_project,
          fecha_inicio: p.fecha_inicio,
          fecha_fin: p.fecha_fin,
          avance_manual: p.avance_manual,
          notas: p.notas,
        },
        cuenta: p.cuentas_contables,
        centro: p.centros_negocio,
        tercero: p.terceros,
        unidad: p.unidades_medida,
        proyecto,
        fuente_proyectado: p.es_project ? "proyecto_programacion_pagos (programación propia del proyecto)" : "flujos_programados",
        flujos_programados_legacy: flujos ?? 0,
        renglones_de_asiento_ligados: renglones ?? 0,
        programaciones_por_estado: resumenProg,
      },
      referencias,
    };
  }

  if (entidad === "asiento") {
    const a = await consultar<any>(
      ctx.db
        .from("asientos_contables")
        .select("*, terceros:tercero_id(razon_social), centros_negocio:centro_negocio_id(codigo, nombre)")
        .eq("id", id)
        .maybeSingle()
    );
    if (!a) return noEncontrado();
    const movs = await consultar<any[]>(
      ctx.db
        .from("asiento_movimientos")
        .select("id, partida, debe, haber, orden, presupuesto_id, cuentas_contables:cuenta_id(id, codigo, nombre), presupuestos:presupuesto_id(partida)")
        .eq("asiento_id", id)
        .order("orden")
    );
    const programaciones = await consultar<any[]>(ctx.db.from("programaciones").select("id, estado, monto, fecha_programada").eq("asiento_id", id));
    const movIds = (movs || []).map((m) => m.id);
    const iva = movIds.length
      ? await consultar<any[]>(ctx.db.from("flujos_programados").select("id, fecha, monto, tipo, descripcion").in("asiento_movimiento_id", movIds))
      : [];
    referencias.push(ref("asiento", a.id, `Asiento #${a.numero_asiento}`, enlaces.asiento(a.id)));
    (movs || []).forEach((m) => {
      if (m.presupuesto_id) referencias.push(ref("presupuesto", m.presupuesto_id, m.presupuestos?.partida || "Partida", enlaces.presupuestoEjercido(m.presupuesto_id)));
    });
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Asiento #${a.numero_asiento} (${a.tipo}, ${a.estado}) del ${a.fecha}: ${movs?.length ?? 0} renglones, debe ${moneda(numeroFinito(a.total_debe))}, haber ${moneda(numeroFinito(a.total_haber))}.`,
      datos: {
        asiento: { id: a.id, empresa_id: a.empresa_id, numero: a.numero_asiento, fecha: a.fecha, tipo: a.tipo, estado: a.estado, observaciones: a.observaciones, total_debe: a.total_debe, total_haber: a.total_haber, tercero: a.terceros?.razon_social, centro: a.centros_negocio },
        renglones: (movs || []).map((m) => ({
          cuenta: m.cuentas_contables ? `${m.cuentas_contables.codigo} ${m.cuentas_contables.nombre}` : null,
          partida_presupuestal: m.presupuestos?.partida ?? null,
          presupuesto_id: m.presupuesto_id,
          concepto: m.partida,
          debe: numeroFinito(m.debe),
          haber: numeroFinito(m.haber),
        })),
        programaciones_ligadas: programaciones,
        flujos_iva_generados: iva,
        efecto: a.estado === "aplicado" ? "Cuenta en ejercido, saldos y reportes." : "No afecta ejercido ni saldos mientras no esté aplicado.",
      },
      referencias,
    };
  }

  if (entidad === "programacion") {
    const p = await consultar<any>(
      ctx.db
        .from("programaciones")
        .select("*, presupuestos:presupuesto_id(id, partida, activo, empresa_id), asientos_contables:asiento_id(id, numero_asiento, estado), terceros:tercero_id(razon_social), centros_negocio:centro_negocio_id(nombre)")
        .eq("id", id)
        .maybeSingle()
    );
    if (!p) return noEncontrado();
    if (p.presupuestos) referencias.push(ref("presupuesto", p.presupuestos.id, p.presupuestos.partida, enlaces.presupuestoEjercido(p.presupuestos.id)));
    if (p.asientos_contables) referencias.push(ref("asiento", p.asientos_contables.id, `Asiento #${p.asientos_contables.numero_asiento}`, enlaces.asiento(p.asientos_contables.id)));
    const avisos: string[] = [];
    if (!p.presupuesto_id) avisos.push("No tiene partida presupuestal: no puede compararse contra presupuesto.");
    if (p.estado === "ejecutado" && !p.asiento_id) avisos.push("Está marcada como ejecutada pero no tiene asiento ligado (la aplicación no lo liga al ejecutar).");
    if (p.estado === "pendiente" && p.asientos_contables?.estado === "aplicado") avisos.push("Su asiento ligado ya está aplicado: el importe ya cuenta como ejercido; conviene marcarla como ejecutada.");
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Programación ${p.tipo} ${p.estado} del ${p.fecha_programada} por ${moneda(numeroFinito(p.monto))}.`,
      datos: { programacion: p, avisos },
      referencias,
      advertencias: avisos,
    };
  }

  const tablas: Record<string, { tabla: string; columnas: string; etiqueta: (f: any) => string; enlace: (f: any) => string }> = {
    cuenta: { tabla: "cuentas_contables", columnas: "*, padre:cuenta_padre_id(codigo, nombre)", etiqueta: (f) => `${f.codigo} ${f.nombre}`, enlace: (f) => enlaces.cuenta(f.id) },
    tercero: { tabla: "terceros", columnas: "id, empresa_id, tipo, rfc, razon_social, nombre_comercial, ciudad, estado, telefono, email, contacto_nombre, activo", etiqueta: (f) => f.razon_social, enlace: () => enlaces.terceros() },
    centro_negocio: { tabla: "centros_negocio", columnas: "*", etiqueta: (f) => `${f.codigo} ${f.nombre}`, enlace: () => enlaces.centros() },
    empresa: { tabla: "empresas", columnas: "id, tipo_persona, rfc, razon_social, nombre_comercial, regimen_fiscal, ciudad, estado, activa", etiqueta: (f) => f.nombre_comercial || f.razon_social, enlace: () => enlaces.empresas() },
  };
  const cfg = tablas[entidad];
  if (!cfg) throw new ErrorPermiso("Entidad no soportada.");
  const f = await consultar<any>(ctx.db.from(cfg.tabla).select(cfg.columnas).eq("id", id).maybeSingle());
  if (!f) return noEncontrado();
  referencias.push(ref(entidad, f.id, cfg.etiqueta(f), cfg.enlace(f)));
  return { ok: true, tipo: "consulta", resumen: `${entidad}: ${cfg.etiqueta(f)}.`, datos: { registro: f }, referencias };
}

