/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { TODOS_LOS_ROLES, exigirVerProyecto } from "../permisos.ts";
import { consultar, enlaces, leerProyecto, ref } from "../datos.ts";
import { ejercidoPorPartidas, leerMovimientosDePartidas, leerPartidas, leerProgramacionPropia, proyectadoPorPartida } from "../finanzas.ts";
import {
  agregarFinanciero,
  calcularAvance,
  calcularMontoPresupuestado,
  programacionPendienteDeAjustar,
} from "../../negocio/calculos.ts";
import { moneda, r2 } from "./util.ts";

export const resumenProyectoTool: Herramienta<{ proyecto_id: string; fecha_corte?: string }> = {
  nombre: "resumen_proyecto",
  modulo: "proyectos",
  tipo: "consulta",
  descripcion:
    "Cifras del módulo Proyectos para un proyecto: por partida de proyecto, presupuesto, proyectado (programación propia; sin ella $0), proyectado acumulado a la fecha de corte, ejercido (debe + haber de asientos aplicados), disponible, avance, desviación y si la programación está pendiente de ajustar.",
  parametros: s.objeto({ proyecto_id: s.uuid("Proyecto"), fecha_corte: s.fecha("Fecha de corte para el proyectado acumulado (por defecto hoy)") }, ["proyecto_id"]),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Acceso al proyecto (admin/contador/arquitecto o asignado)", "Proyectado solo si puede ver la programación financiera"],
  devuelve: "Totales y detalle por partida con la misma fórmula de la pantalla del proyecto.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    const acceso = await exigirVerProyecto(ctx, e.proyecto_id);
    const proyecto = await leerProyecto(ctx, e.proyecto_id);
    const corte = e.fecha_corte ?? ctx.hoy;
    const { partidas } = await leerPartidas(ctx, { empresaId: proyecto.empresa_id, centroId: proyecto.centro_negocio_id, soloProject: true });
    const movs = await leerMovimientosDePartidas(ctx, partidas.map((p) => p.id));
    const ejercido = ejercidoPorPartidas(partidas, movs, "debe_haber");
    const propias = acceso.verProgramacionFinanciera ? await leerProgramacionPropia(ctx, partidas) : new Map();
    const proy = proyectadoPorPartida(partidas, [], propias);
    const proyCorte = proyectadoPorPartida(partidas, [], propias, { hasta: corte });
    const filas = partidas.map((p) => {
      const pres = calcularMontoPresupuestado(p.cantidad, p.precio_unitario);
      const ej = ejercido.get(p.id) || 0;
      const programado = proy.get(p.id)?.total || 0;
      return {
        id: p.id,
        partida: p.partida,
        cuenta: p.cuenta_codigo,
        presupuesto: r2(pres),
        proyectado: acceso.verProgramacionFinanciera ? r2(programado) : null,
        proyectado_acumulado: acceso.verProgramacionFinanciera ? r2(proyCorte.get(p.id)?.total || 0) : null,
        ejercido: r2(ej),
        disponible: r2(pres - ej),
        avance: r2(p.avance_manual ?? calcularAvance(ej, pres)),
        avance_es_manual: p.avance_manual !== null,
        pendiente_ajustar: acceso.verProgramacionFinanciera ? programacionPendienteDeAjustar(programado, pres) : null,
        tiene_programacion_propia: propias.has(p.id),
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
      };
    });
    const agregado = agregarFinanciero(
      filas.map((f) => ({ presupuesto: f.presupuesto, proyectado: f.proyectado_acumulado ?? 0, ejercido: f.ejercido }))
    );
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Proyecto ${proyecto.nombre}: presupuesto ${moneda(agregado.presupuesto)}, ejercido ${moneda(agregado.ejercido)} (${r2(agregado.avance)}%), disponible ${moneda(agregado.disponible)}${acceso.verProgramacionFinanciera ? `, proyectado acumulado al ${corte} ${moneda(agregado.proyectado)}, desviación ${moneda(agregado.desviacion)}` : ""}. ${filas.length} partidas de proyecto activas.`,
      alcance: {
        proyecto: { id: proyecto.id, nombre: proyecto.nombre },
        periodo: { desde: "", hasta: corte },
        registros: filas.length,
        total: filas.length,
        truncado: false,
        nota:
          "Ejercido = debe + haber de asientos aplicados (método del módulo Proyectos). Proyectado = programación propia de cada partida; sin programación = $0." +
          (acceso.verProgramacionFinanciera ? "" : " Tu acceso no incluye la programación financiera: no se muestra proyectado."),
      },
      datos: { agregado: Object.fromEntries(Object.entries(agregado).map(([k, v]) => [k, r2(v)])), partidas: filas, acceso },
      tablas: [
        {
          titulo: `Partidas del proyecto ${proyecto.nombre}`,
          columnas: [
            { clave: "partida", etiqueta: "Partida" },
            { clave: "presupuesto", etiqueta: "Presupuesto", tipo: "moneda" },
            { clave: "proyectado", etiqueta: "Proyectado", tipo: "moneda" },
            { clave: "ejercido", etiqueta: "Ejercido", tipo: "moneda" },
            { clave: "disponible", etiqueta: "Disponible", tipo: "moneda" },
            { clave: "avance", etiqueta: "Avance", tipo: "porcentaje" },
          ],
          filas: filas.map((f) => ({ ...f, _enlace: enlaces.proyecto(proyecto.id) })),
          totales: { presupuesto: r2(agregado.presupuesto), ejercido: r2(agregado.ejercido), disponible: r2(agregado.disponible) },
        },
      ],
      referencias: [ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id))],
    };
  },
};

export const consultarTareasTool: Herramienta<{ proyecto_id: string; estado?: string; solo_vencidas?: boolean }> = {
  nombre: "consultar_tareas",
  modulo: "proyectos",
  tipo: "consulta",
  descripcion: "Tareas de un proyecto con estado, responsable y vencimiento; puede filtrar por estado o solo vencidas (fecha anterior a hoy y no hechas).",
  parametros: s.objeto(
    {
      proyecto_id: s.uuid("Proyecto"),
      estado: s.enumerado(["pendiente", "en_progreso", "bloqueada", "hecho"], "Estado"),
      solo_vencidas: s.booleano("Solo vencidas"),
    },
    ["proyecto_id"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Acceso al proyecto"],
  devuelve: "Tareas y conteo por estado.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    await exigirVerProyecto(ctx, e.proyecto_id);
    const proyecto = await leerProyecto(ctx, e.proyecto_id);
    let q = ctx.db
      .from("proyecto_tareas")
      .select("id, titulo, estado, fecha_vencimiento, notas, terceros:responsable_tercero_id(razon_social)")
      .eq("proyecto_id", e.proyecto_id)
      .order("orden")
      .limit(500);
    if (e.estado) q = q.eq("estado", e.estado);
    const tareas = (await consultar<any[]>(q)) || [];
    const filas = tareas
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        estado: t.estado,
        vence: t.fecha_vencimiento,
        responsable: t.terceros?.razon_social ?? null,
        vencida: Boolean(t.fecha_vencimiento && t.fecha_vencimiento < ctx.hoy && t.estado !== "hecho"),
      }))
      .filter((t) => !e.solo_vencidas || t.vencida);
    const porEstado: Record<string, number> = {};
    filas.forEach((t) => (porEstado[t.estado] = (porEstado[t.estado] || 0) + 1));
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${filas.length} tareas en ${proyecto.nombre}${e.estado ? ` con estado ${e.estado}` : ""}${e.solo_vencidas ? " vencidas" : ""}.`,
      alcance: { proyecto: { id: proyecto.id, nombre: proyecto.nombre }, filtros: { estado: e.estado, solo_vencidas: e.solo_vencidas }, registros: filas.length, total: filas.length, truncado: tareas.length >= 500 },
      datos: { por_estado: porEstado, tareas: filas },
      tablas: [
        {
          titulo: `Tareas de ${proyecto.nombre}`,
          columnas: [
            { clave: "titulo", etiqueta: "Tarea" },
            { clave: "estado", etiqueta: "Estado" },
            { clave: "responsable", etiqueta: "Responsable" },
            { clave: "vence", etiqueta: "Vence", tipo: "fecha" },
          ],
          filas: filas.map((f) => ({ ...f, _enlace: enlaces.proyecto(proyecto.id) })),
        },
      ],
      referencias: [ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id))],
    };
  },
};

export const auditoriaProyectoTool: Herramienta<{ proyecto_id: string; limite?: number }> = {
  nombre: "auditoria_proyecto",
  modulo: "proyectos",
  tipo: "consulta",
  descripcion: "Bitácora de cambios de un proyecto (presupuesto autorizado, marca de proyecto, cronograma y programación financiera) con usuario, fecha y valores anterior/nuevo.",
  parametros: s.objeto({ proyecto_id: s.uuid("Proyecto"), limite: s.entero("Máximo de eventos (1-100)", 1, 100) }, ["proyecto_id"]),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Acceso al proyecto"],
  devuelve: "Eventos de auditoría ordenados del más reciente al más antiguo.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    await exigirVerProyecto(ctx, e.proyecto_id);
    const proyecto = await leerProyecto(ctx, e.proyecto_id);
    const limite = e.limite ?? 30;
    const eventos =
      (await consultar<any[]>(
        ctx.db
          .from("proyecto_auditoria")
          .select("accion, entidad_id, presupuesto_id, valor_anterior, valor_nuevo, user_id, created_at")
          .eq("proyecto_id", e.proyecto_id)
          .order("created_at", { ascending: false })
          .limit(limite)
      )) || [];
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${eventos.length} eventos de auditoría de ${proyecto.nombre}${eventos.length === limite ? " (hay más)" : ""}.`,
      alcance: { proyecto: { id: proyecto.id, nombre: proyecto.nombre }, registros: eventos.length, total: null, truncado: eventos.length === limite },
      datos: { eventos },
      tablas: [
        {
          titulo: "Auditoría",
          columnas: [
            { clave: "created_at", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "accion", etiqueta: "Acción" },
            { clave: "valor_anterior", etiqueta: "Antes" },
            { clave: "valor_nuevo", etiqueta: "Después" },
          ],
          filas: eventos,
        },
      ],
    };
  },
};
