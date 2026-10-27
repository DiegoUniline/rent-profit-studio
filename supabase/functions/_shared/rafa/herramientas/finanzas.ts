import type { Herramienta, ResultadoHerramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, exigirContable } from "../permisos.ts";
import { enlaces, leerProyecto, leerTodo, ref, resolverEmpresa, exigirMismaEmpresa } from "../datos.ts";
import {
  DESCRIPCION_METODO,
  type MetodoEjercido,
  ejercidoPorPartidas,
  leerFlujosLegacy,
  leerMovimientosDePartidas,
  leerPartidas,
  leerProgramacionPropia,
  leerProgramaciones,
  proyectadoPorPartida,
} from "../finanzas.ts";
import { compararProgramacionContraPresupuesto } from "../../negocio/programacion.ts";
import { calcularMontoPresupuestado, ladoEjercidoPorCodigo } from "../../negocio/calculos.ts";
import { moneda, r2 } from "./util.ts";

const metodoParam = s.enumerado(
  ["naturaleza", "debe_haber"],
  "Método de ejercido: naturaleza (pantalla Presupuestos, por defecto) o debe_haber (módulo Proyectos)"
);

interface FiltroBase {
  empresa_id?: string;
  desde: string;
  hasta: string;
  centro_negocio_id?: string;
  proyecto_id?: string;
}

async function centroDeFiltro(ctx: Parameters<Herramienta["ejecutar"]>[0], empresaId: string, e: { centro_negocio_id?: string; proyecto_id?: string }) {
  if (e.proyecto_id) {
    const p = await leerProyecto(ctx, e.proyecto_id);
    exigirMismaEmpresa(p.empresa_id, empresaId, "El proyecto");
    return { centroId: p.centro_negocio_id, proyecto: { id: p.id, nombre: p.nombre } };
  }
  return { centroId: e.centro_negocio_id, proyecto: null };
}

// ---------------------------------------------------------------------------
export const consultarProgramacionesTool: Herramienta<
  FiltroBase & { estados?: string[]; tipo?: string; presupuesto_id?: string; tercero_id?: string; sin_partida?: boolean }
> = {
  nombre: "consultar_programaciones",
  modulo: "programaciones",
  tipo: "consulta",
  descripcion:
    "Lista programaciones de tesorería (cobros/pagos agendados) de una empresa en un periodo, con totales por tipo y estado y los KPIs de la pantalla Programación (pendientes). Filtra por estado, tipo, centro, proyecto, partida o tercero.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      desde: s.fecha("Fecha inicial (incluida)"),
      hasta: s.fecha("Fecha final (incluida)"),
      estados: s.lista(s.enumerado(["pendiente", "ejecutado", "cancelado"], "Estado"), "Estados a incluir (por defecto todos)", 3),
      tipo: s.enumerado(["ingreso", "egreso"], "Tipo"),
      centro_negocio_id: s.uuid("Centro de negocio"),
      proyecto_id: s.uuid("Proyecto (usa su centro de negocio)"),
      presupuesto_id: s.uuid("Partida presupuestal"),
      tercero_id: s.uuid("Tercero"),
      sin_partida: s.booleano("Solo programaciones sin partida presupuestal"),
    },
    ["desde", "hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "desde ≤ hasta", "Proyecto de la misma empresa"],
  devuelve: "Programaciones con enlaces, totales y alcance.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    if (e.desde > e.hasta) return { ok: false, tipo: "error", resumen: "La fecha inicial es posterior a la final.", error: "periodo_invalido" };
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const { centroId, proyecto } = await centroDeFiltro(ctx, empresa.id, e);
    const { programaciones, truncado } = await leerProgramaciones(ctx, {
      empresaId: empresa.id,
      desde: e.desde,
      hasta: e.hasta,
      estados: e.estados,
      tipo: e.tipo,
      centroId: centroId || undefined,
      presupuestoIds: e.presupuesto_id ? [e.presupuesto_id] : undefined,
      terceroId: e.tercero_id,
      sinPartida: e.sin_partida,
    });
    const totales: Record<string, number> = {};
    programaciones.forEach((p) => {
      const k = `${p.tipo}_${p.estado}`;
      totales[k] = r2((totales[k] || 0) + p.monto);
    });
    const pendientesIngreso = totales["ingreso_pendiente"] || 0;
    const pendientesEgreso = totales["egreso_pendiente"] || 0;
    const filas = programaciones.slice(0, 200);
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${programaciones.length} programaciones de ${empresa.nombre} entre ${e.desde} y ${e.hasta}. Pendientes: ingresos ${moneda(pendientesIngreso)}, egresos ${moneda(pendientesEgreso)}.`,
      alcance: {
        empresa,
        proyecto,
        periodo: { desde: e.desde, hasta: e.hasta },
        filtros: { estados: e.estados ?? "todos", tipo: e.tipo, centro_negocio_id: centroId, presupuesto_id: e.presupuesto_id, tercero_id: e.tercero_id, sin_partida: e.sin_partida },
        registros: programaciones.length,
        total: programaciones.length,
        truncado,
        nota: filas.length < programaciones.length ? `Se muestran ${filas.length} filas; los totales consideran las ${programaciones.length}.` : undefined,
      },
      datos: {
        totales_por_tipo_estado: totales,
        kpi_pendientes: { ingresos: pendientesIngreso, egresos: pendientesEgreso, neto: r2(pendientesIngreso - pendientesEgreso) },
        programaciones: filas.map((p) => ({
          id: p.id,
          fecha: p.fecha_programada,
          tipo: p.tipo,
          estado: p.estado,
          monto: p.monto,
          partida: p.partida_nombre,
          presupuesto_id: p.presupuesto_id,
          centro: p.centro_nombre,
          tercero: p.tercero_nombre,
          observaciones: p.observaciones,
          asiento: p.asiento_numero ? `#${p.asiento_numero} (${p.asiento_estado})` : null,
        })),
      },
      tablas: [
        {
          titulo: `Programaciones ${e.desde} a ${e.hasta}`,
          columnas: [
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "estado", etiqueta: "Estado" },
            { clave: "partida", etiqueta: "Partida" },
            { clave: "tercero", etiqueta: "Tercero" },
            { clave: "observaciones", etiqueta: "Observaciones" },
            { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
          ],
          filas: filas.map((p) => ({
            fecha: p.fecha_programada,
            tipo: p.tipo,
            estado: p.estado,
            partida: p.partida_nombre ?? "Sin partida",
            tercero: p.tercero_nombre,
            observaciones: p.observaciones,
            monto: p.monto,
            _enlace: p.presupuesto_id ? enlaces.presupuestoEjercido(p.presupuesto_id) : enlaces.programacion(),
          })),
          totales: { monto: r2(programaciones.reduce((s2, p) => s2 + (p.estado === "cancelado" ? 0 : p.monto), 0)) },
        },
      ],
      referencias: filas.slice(0, 50).map((p) => ref("programacion", p.id, `${p.tipo} ${p.fecha_programada} ${moneda(p.monto)}`, enlaces.programacion())),
    };
  },
};

// ---------------------------------------------------------------------------
export const compararProgramacionPresupuestoTool: Herramienta<FiltroBase & { metodo_ejercido?: MetodoEjercido }> = {
  nombre: "comparar_programacion_presupuesto",
  modulo: "programaciones",
  tipo: "consulta",
  descripcion:
    "Compara las programaciones de tesorería de un periodo contra el presupuesto de cada partida con EFECTO ACUMULADO: ejercido + pendientes anteriores + programaciones del periodo en orden de fecha. Indica qué partidas exceden, desde qué programación, y las excepciones (sin partida, partida inactiva o de otro centro). No duplica: excluye pendientes cuyo asiento ligado ya está aplicado y no suma ejecutadas.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      desde: s.fecha("Inicio del periodo"),
      hasta: s.fecha("Fin del periodo"),
      centro_negocio_id: s.uuid("Centro de negocio"),
      proyecto_id: s.uuid("Proyecto (usa su centro)"),
      metodo_ejercido: metodoParam,
    },
    ["desde", "hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "Lee todas las programaciones no canceladas hasta el fin del periodo de las partidas involucradas"],
  devuelve: "Por partida: presupuestado, ejercido, pendiente previo, programado en el periodo, disponible final y filas con disponible tras cada programación; excepciones y avisos.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    if (e.desde > e.hasta) return { ok: false, tipo: "error", resumen: "La fecha inicial es posterior a la final.", error: "periodo_invalido" };
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const { centroId, proyecto } = await centroDeFiltro(ctx, empresa.id, e);
    const metodo = e.metodo_ejercido ?? "naturaleza";

    // 1. Programaciones del periodo (para saber qué partidas intervienen).
    const enPeriodo = await leerProgramaciones(ctx, { empresaId: empresa.id, desde: e.desde, hasta: e.hasta, centroId: centroId || undefined });
    const idsPartidas = Array.from(new Set(enPeriodo.programaciones.map((p) => p.presupuesto_id).filter(Boolean) as string[]));
    // 2. Todas las programaciones de esas partidas hasta el fin del periodo (efecto acumulado).
    const previas = idsPartidas.length
      ? await leerProgramaciones(ctx, { empresaId: empresa.id, hasta: e.hasta, presupuestoIds: idsPartidas })
      : { programaciones: [], truncado: false };
    const porId = new Map([...previas.programaciones, ...enPeriodo.programaciones].map((p) => [p.id, p]));
    const todas = Array.from(porId.values());
    // 3. Partidas (incluye inactivas para poder reportarlas como excepción) y ejercido.
    const { partidas } = idsPartidas.length ? await leerPartidas(ctx, { empresaId: empresa.id, ids: idsPartidas }) : { partidas: [] };
    const movimientos = idsPartidas.length ? await leerMovimientosDePartidas(ctx, idsPartidas) : [];
    const ejercido = ejercidoPorPartidas(partidas, movimientos, metodo);

    const r = compararProgramacionContraPresupuesto(
      { desde: e.desde, hasta: e.hasta },
      todas.map((p) => ({ ...p })),
      partidas.map((p) => ({ ...p })),
      ejercido
    );
    const progMap = new Map(todas.map((p) => [p.id, p]));
    const truncado = enPeriodo.truncado || previas.truncado;
    const excedidas = r.partidas.filter((p) => p.excede);

    return {
      ok: true,
      tipo: "consulta",
      resumen:
        `${r.totales.programaciones_en_ventana} programaciones no canceladas en ${empresa.nombre} del ${e.desde} al ${e.hasta} (${moneda(r.totales.monto_en_ventana)}). ` +
        `${r.partidas.length} partidas comparadas; ${excedidas.length} exceden su presupuesto con el efecto acumulado. ` +
        `${r.excepciones.length} programaciones pendientes no se pudieron comparar (${moneda(r.totales.monto_excepciones)}).`,
      alcance: {
        empresa,
        proyecto,
        periodo: { desde: e.desde, hasta: e.hasta },
        filtros: { centro_negocio_id: centroId, metodo_ejercido: metodo },
        registros: todas.length,
        total: todas.length,
        truncado,
        nota: `${DESCRIPCION_METODO[metodo]} Consumido = ejercido + programaciones pendientes con fecha ≤ ${e.hasta}.`,
      },
      datos: {
        metodo_ejercido: metodo,
        partidas: r.partidas.map((p) => ({
          ...p,
          filas: p.filas.map((f) => ({ ...f, observaciones: progMap.get(f.programacion_id)?.observaciones ?? null })),
        })),
        excepciones: r.excepciones.map((x) => ({ ...x, observaciones: progMap.get(x.programacion_id)?.observaciones ?? null })),
        excluidas_por_asiento_aplicado: r.excluidas_por_asiento_aplicado,
        ejecutadas_en_periodo: r.ejecutadas_en_ventana,
        totales: r.totales,
      },
      tablas: [
        {
          titulo: "Programación vs presupuesto (acumulado)",
          columnas: [
            { clave: "partida", etiqueta: "Partida" },
            { clave: "presupuestado", etiqueta: "Presupuestado", tipo: "moneda" },
            { clave: "ejercido", etiqueta: "Ejercido", tipo: "moneda" },
            { clave: "pendiente_previo", etiqueta: "Pendiente previo", tipo: "moneda" },
            { clave: "programado_ventana", etiqueta: "Programado periodo", tipo: "moneda" },
            { clave: "disponible_final", etiqueta: "Disponible final", tipo: "moneda" },
            { clave: "estado", etiqueta: "Resultado" },
          ],
          filas: r.partidas.map((p) => ({
            partida: p.partida,
            presupuestado: p.presupuestado,
            ejercido: p.ejercido,
            pendiente_previo: p.pendiente_previo,
            programado_ventana: p.programado_ventana,
            disponible_final: p.disponible_final,
            estado: p.excede ? `Excede por ${moneda(-p.disponible_final)}` : "Dentro de presupuesto",
            _enlace: enlaces.presupuestoEjercido(p.presupuesto_id),
          })),
        },
        ...(r.excepciones.length
          ? [
              {
                titulo: "Programaciones sin respaldo comparable",
                columnas: [
                  { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" as const },
                  { clave: "monto", etiqueta: "Monto", tipo: "moneda" as const },
                  { clave: "motivo", etiqueta: "Motivo" },
                  { clave: "observaciones", etiqueta: "Observaciones" },
                ],
                filas: r.excepciones.map((x) => ({ ...x, observaciones: progMap.get(x.programacion_id)?.observaciones ?? null, _enlace: enlaces.programacion() })),
              },
            ]
          : []),
      ],
      referencias: r.partidas.map((p) => ref("presupuesto", p.presupuesto_id, p.partida, enlaces.presupuestoEjercido(p.presupuesto_id))),
      advertencias: [
        ...(r.ejecutadas_en_ventana.length
          ? [`${r.ejecutadas_en_ventana.length} programaciones del periodo están marcadas como ejecutadas; no se suman (su efecto real se mide en asientos aplicados).`]
          : []),
        ...(r.excluidas_por_asiento_aplicado.length
          ? [`${r.excluidas_por_asiento_aplicado.length} programaciones pendientes ya tienen asiento aplicado: se excluyeron para no contar dos veces.`]
          : []),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
export const excepcionesRespaldoTool: Herramienta<{ empresa_id?: string; desde?: string; hasta?: string }> = {
  nombre: "excepciones_respaldo_presupuestal",
  modulo: "programaciones",
  tipo: "consulta",
  descripcion:
    "Identifica programaciones PENDIENTES existentes que no cumplirían la regla de respaldo presupuestal: sin partida, con partida inactiva, de otra empresa/centro, o cuyas partidas de egreso ya exceden su presupuesto con lo pendiente. Úsala antes de proponer exigir respaldo en la captura.",
  parametros: s.objeto({ empresa_id: s.uuid("Empresa"), desde: s.fecha("Desde (opcional)"), hasta: s.fecha("Hasta (opcional)") }),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única"],
  devuelve: "Listado de excepciones por motivo con totales.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const desde = e.desde ?? "1900-01-01";
    const hasta = e.hasta ?? "2999-12-31";
    const resultado = await compararProgramacionPresupuestoTool.ejecutar(ctx, { empresa_id: empresa.id, desde, hasta });
    if (!resultado.ok) return resultado;
    const d = resultado.datos as { excepciones: { motivo: string; monto: number }[]; partidas: { excede: boolean; partida: string; presupuesto_id: string; tipo_movimiento: string | null; disponible_final: number }[] };
    const porMotivo: Record<string, { cantidad: number; monto: number }> = {};
    d.excepciones.forEach((x) => {
      porMotivo[x.motivo] = porMotivo[x.motivo] || { cantidad: 0, monto: 0 };
      porMotivo[x.motivo].cantidad++;
      porMotivo[x.motivo].monto = r2(porMotivo[x.motivo].monto + x.monto);
    });
    const excedidas = d.partidas.filter((p) => p.excede && p.tipo_movimiento !== "ingreso");
    return {
      ...resultado,
      resumen: `Excepciones de respaldo presupuestal en ${empresa.nombre}${e.desde || e.hasta ? ` (${desde} a ${hasta})` : " (todas las fechas)"}: ${d.excepciones.length} programaciones pendientes sin partida válida y ${excedidas.length} partidas de egreso que exceden su presupuesto con lo pendiente.`,
      datos: { por_motivo: porMotivo, excepciones: d.excepciones, partidas_excedidas: excedidas },
      tablas: (resultado.tablas || []).slice().reverse(),
    } as ResultadoHerramienta;
  },
};

// ---------------------------------------------------------------------------
export const resumenPresupuestoTool: Herramienta<{
  empresa_id?: string;
  centro_negocio_id?: string;
  proyecto_id?: string;
  tipo_movimiento?: string;
  incluir_inactivas?: boolean;
  metodo_ejercido?: MetodoEjercido;
}> = {
  nombre: "resumen_presupuesto",
  modulo: "presupuestos",
  tipo: "consulta",
  descripcion:
    "Presupuestado, ejercido, por ejercer y % por partida y totales por tipo de movimiento, con la misma regla de la pantalla Presupuestos (totales solo de partidas activas con tipo ingreso/egreso). Responde '¿cuánto llevamos ejercido?'.",
  parametros: s.objeto({
    empresa_id: s.uuid("Empresa"),
    centro_negocio_id: s.uuid("Centro de negocio"),
    proyecto_id: s.uuid("Proyecto (usa su centro)"),
    tipo_movimiento: s.enumerado(["ingreso", "egreso", "no_afecta", "pendiente"], "Filtrar por tipo de movimiento"),
    incluir_inactivas: s.booleano("Incluir partidas inactivas en el detalle (nunca en totales)"),
    metodo_ejercido: metodoParam,
  }),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "Proyecto de la misma empresa"],
  devuelve: "Totales por tipo y detalle por partida con enlaces al ejercido.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const { centroId, proyecto } = await centroDeFiltro(ctx, empresa.id, e);
    const metodo = e.metodo_ejercido ?? "naturaleza";
    const { partidas, truncado } = await leerPartidas(ctx, {
      empresaId: empresa.id,
      centroId: centroId || null,
      incluirInactivas: e.incluir_inactivas,
      tipoMovimiento: e.tipo_movimiento ?? null,
    });
    const movimientos = await leerMovimientosDePartidas(ctx, partidas.map((p) => p.id));
    const ejercido = ejercidoPorPartidas(partidas, movimientos, metodo);
    const filas = partidas.map((p) => {
      const pres = calcularMontoPresupuestado(p.cantidad, p.precio_unitario);
      const ej = ejercido.get(p.id) || 0;
      return {
        id: p.id,
        partida: p.partida,
        centro: p.centro_nombre,
        cuenta: p.cuenta_codigo,
        tipo_movimiento: p.tipo_movimiento ?? "pendiente",
        activo: p.activo,
        presupuestado: r2(pres),
        ejercido: r2(ej),
        por_ejercer: r2(pres - ej),
        porcentaje: pres > 0 ? r2((ej / pres) * 100) : 0,
      };
    });
    const tot = { ingreso: { presupuestado: 0, ejercido: 0 }, egreso: { presupuestado: 0, ejercido: 0 } };
    let pendientes = 0;
    let noAfecta = 0;
    filas.forEach((f) => {
      if (!f.activo) return;
      if (f.tipo_movimiento === "ingreso" || f.tipo_movimiento === "egreso") {
        tot[f.tipo_movimiento].presupuestado += f.presupuestado;
        tot[f.tipo_movimiento].ejercido += f.ejercido;
      } else if (f.tipo_movimiento === "pendiente") pendientes++;
      else noAfecta++;
    });
    const totales = {
      ingresos: { presupuestado: r2(tot.ingreso.presupuestado), ejercido: r2(tot.ingreso.ejercido), por_ejercer: r2(tot.ingreso.presupuestado - tot.ingreso.ejercido) },
      egresos: { presupuestado: r2(tot.egreso.presupuestado), ejercido: r2(tot.egreso.ejercido), por_ejercer: r2(tot.egreso.presupuestado - tot.egreso.ejercido) },
      total_presupuestado: r2(tot.ingreso.presupuestado + tot.egreso.presupuestado),
      total_ejercido: r2(tot.ingreso.ejercido + tot.egreso.ejercido),
      partidas_pendientes_de_clasificar: pendientes,
      partidas_no_afecta: noAfecta,
    };
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${empresa.nombre}${proyecto ? ` · ${proyecto.nombre}` : ""}: egresos ejercidos ${moneda(totales.egresos.ejercido)} de ${moneda(totales.egresos.presupuestado)}; ingresos ejercidos ${moneda(totales.ingresos.ejercido)} de ${moneda(totales.ingresos.presupuestado)} (${filas.length} partidas consideradas).`,
      alcance: {
        empresa,
        proyecto,
        filtros: { centro_negocio_id: centroId, tipo_movimiento: e.tipo_movimiento, incluir_inactivas: Boolean(e.incluir_inactivas), metodo_ejercido: metodo },
        registros: filas.length,
        total: filas.length,
        truncado,
        nota: `${DESCRIPCION_METODO[metodo]} Totales: solo partidas activas con tipo ingreso/egreso. Sin periodo: acumulado histórico.`,
      },
      datos: { totales, partidas: filas.slice(0, 150) },
      tablas: [
        {
          titulo: "Presupuesto vs ejercido",
          columnas: [
            { clave: "partida", etiqueta: "Partida" },
            { clave: "tipo_movimiento", etiqueta: "Tipo" },
            { clave: "presupuestado", etiqueta: "Presupuestado", tipo: "moneda" },
            { clave: "ejercido", etiqueta: "Ejercido", tipo: "moneda" },
            { clave: "por_ejercer", etiqueta: "Por ejercer", tipo: "moneda" },
            { clave: "porcentaje", etiqueta: "%", tipo: "porcentaje" },
          ],
          filas: filas.slice(0, 150).map((f) => ({ ...f, _enlace: enlaces.presupuestoEjercido(f.id) })),
          totales: { presupuestado: totales.total_presupuestado, ejercido: totales.total_ejercido },
        },
      ],
      referencias: filas.slice(0, 50).map((f) => ref("presupuesto", f.id, f.partida, enlaces.presupuestoEjercido(f.id))),
    };
  },
};

// ---------------------------------------------------------------------------
export const explicarPartidaTool: Herramienta<{ presupuesto_id: string; empresa_id?: string }> = {
  nombre: "explicar_partida",
  modulo: "presupuestos",
  tipo: "consulta",
  descripcion:
    "Reconstruye de dónde sale cada cifra de UNA partida: presupuestado (cantidad × precio), ejercido renglón por renglón con ambos métodos y la diferencia entre ellos, proyectado con su fuente (flujos o programación del proyecto) y programaciones de tesorería por estado. Úsala para 'explícame de dónde sale este total' o 'por qué no coincide'.",
  parametros: s.objeto({ presupuesto_id: s.uuid("Partida"), empresa_id: s.uuid("Empresa (opcional; se valida)") }, ["presupuesto_id"]),
  roles: ROLES_CONTABLES,
  validaciones: ["La partida debe ser visible y, si se indica, de la empresa"],
  devuelve: "Cálculo reproducible con cada renglón, asiento y enlace.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const { data: base, error } = await ctx.db.from("presupuestos").select("empresa_id").eq("id", e.presupuesto_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!base) return { ok: false, tipo: "error", resumen: "No encontré esa partida o no es visible.", error: "no_encontrado" };
    if (e.empresa_id) exigirMismaEmpresa(base.empresa_id, e.empresa_id, "La partida");
    const empresa = await resolverEmpresa(ctx, base.empresa_id);
    const { partidas } = await leerPartidas(ctx, { empresaId: empresa.id, ids: [e.presupuesto_id] });
    const p = partidas[0];
    const movs = await leerMovimientosDePartidas(ctx, [p.id]);
    const ejNat = ejercidoPorPartidas([p], movs, "naturaleza").get(p.id) || 0;
    const ejDH = ejercidoPorPartidas([p], movs, "debe_haber").get(p.id) || 0;
    const lado = ladoEjercidoPorCodigo(p.cuenta_codigo || movs.find((m) => m.estado_asiento === "aplicado")?.cuenta_codigo || "");
    const flujos = p.es_project ? [] : await leerFlujosLegacy(ctx, [p.id]);
    const propias = await leerProgramacionPropia(ctx, [p]);
    const proy = proyectadoPorPartida([p], flujos, propias).get(p.id)!;
    const { programaciones } = await leerProgramaciones(ctx, { empresaId: empresa.id, presupuestoIds: [p.id] });
    const presupuestado = calcularMontoPresupuestado(p.cantidad, p.precio_unitario);
    const porEstado: Record<string, number> = {};
    programaciones.forEach((x) => (porEstado[x.estado] = r2((porEstado[x.estado] || 0) + x.monto)));
    const renglones = movs
      .filter((m) => m.empresa_id === p.empresa_id)
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || (a.numero_asiento || 0) - (b.numero_asiento || 0))
      .map((m) => ({
        asiento: m.numero_asiento,
        asiento_id: m.asiento_id,
        fecha: m.fecha,
        estado: m.estado_asiento,
        cuenta: `${m.cuenta_codigo ?? ""} ${m.cuenta_nombre ?? ""}`.trim(),
        debe: m.debe,
        haber: m.haber,
        cuenta_en_naturaleza: m.estado_asiento === "aplicado" ? (lado === "debe" ? m.debe : m.haber) : 0,
        cuenta_en_debe_haber: m.estado_asiento === "aplicado" ? m.debe + m.haber : 0,
      }));
    const diferencia = r2(ejDH - ejNat);
    const nota =
      Math.abs(diferencia) < 0.01
        ? "Ambos métodos de ejercido coinciden para esta partida."
        : `Los métodos difieren por ${moneda(diferencia)}: debe+haber suma ambos lados de cada renglón ligado; por naturaleza solo el lado ${lado} (cuenta ${p.cuenta_codigo ?? "del primer movimiento"}). Revisa los renglones donde la partida está ligada en el lado contrario.`;
    return {
      ok: true,
      tipo: "consulta",
      resumen: `"${p.partida}": presupuestado ${moneda(presupuestado)} = ${p.cantidad} × ${moneda(p.precio_unitario)}; ejercido ${moneda(ejNat)} (naturaleza) / ${moneda(ejDH)} (debe+haber); proyectado ${moneda(proy.total)} desde ${proy.fuente}. ${nota}`,
      alcance: {
        empresa,
        filtros: { presupuesto_id: p.id },
        registros: renglones.length + programaciones.length + proy.filas.length,
        total: renglones.length + programaciones.length + proy.filas.length,
        truncado: false,
        nota: "Todos los renglones de asiento, flujos/pagos de proyecto y programaciones de la partida.",
      },
      datos: {
        partida: { id: p.id, nombre: p.partida, cuenta: p.cuenta_codigo, tipo_movimiento: p.tipo_movimiento, es_project: p.es_project, activo: p.activo },
        presupuestado: { formula: "cantidad × precio_unitario", cantidad: p.cantidad, precio_unitario: p.precio_unitario, total: r2(presupuestado) },
        ejercido: { naturaleza: r2(ejNat), debe_haber: r2(ejDH), lado_naturaleza: lado, diferencia, nota, renglones },
        proyectado: { fuente: proy.fuente, total: r2(proy.total), filas: proy.filas },
        programaciones_tesoreria: { por_estado: porEstado, filas: programaciones.map((x) => ({ id: x.id, fecha: x.fecha_programada, estado: x.estado, monto: x.monto, asiento: x.asiento_numero })) },
        por_ejercer: { naturaleza: r2(presupuestado - ejNat), debe_haber: r2(presupuestado - ejDH) },
      },
      tablas: [
        {
          titulo: `Renglones ligados a "${p.partida}"`,
          columnas: [
            { clave: "asiento", etiqueta: "Asiento" },
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "estado", etiqueta: "Estado" },
            { clave: "cuenta", etiqueta: "Cuenta" },
            { clave: "debe", etiqueta: "Debe", tipo: "moneda" },
            { clave: "haber", etiqueta: "Haber", tipo: "moneda" },
            { clave: "cuenta_en_naturaleza", etiqueta: "Cuenta (naturaleza)", tipo: "moneda" },
            { clave: "cuenta_en_debe_haber", etiqueta: "Cuenta (debe+haber)", tipo: "moneda" },
          ],
          filas: renglones.map((rg) => ({ ...rg, asiento: `#${rg.asiento}`, _enlace: enlaces.asiento(rg.asiento_id) })),
          totales: { cuenta_en_naturaleza: r2(ejNat), cuenta_en_debe_haber: r2(ejDH) },
        },
      ],
      referencias: [
        ref("presupuesto", p.id, p.partida, enlaces.presupuestoEjercido(p.id)),
        ...Array.from(new Map(renglones.map((rg) => [rg.asiento_id, rg])).values()).map((rg) => ref("asiento", rg.asiento_id, `Asiento #${rg.asiento}`, enlaces.asiento(rg.asiento_id))),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
export const flujoProyectadoTool: Herramienta<FiltroBase & { tipo_movimiento?: string }> = {
  nombre: "flujo_proyectado",
  modulo: "flujos_programados",
  tipo: "consulta",
  descripcion:
    "Proyectado por mes de las partidas de una empresa en un periodo, aplicando la regla de fuente única (partidas de proyecto: programación del proyecto; resto: flujos programados). Muestra APARTE el IVA automático (real) y la programación de tesorería pendiente; no los suma al proyectado.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      desde: s.fecha("Inicio"),
      hasta: s.fecha("Fin"),
      centro_negocio_id: s.uuid("Centro"),
      proyecto_id: s.uuid("Proyecto"),
      tipo_movimiento: s.enumerado(["ingreso", "egreso"], "Solo partidas de este tipo"),
    },
    ["desde", "hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "Rango válido"],
  devuelve: "Serie mensual por capa (proyectado, IVA automático, programación pendiente) y detalle por partida.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    if (e.desde > e.hasta) return { ok: false, tipo: "error", resumen: "Periodo inválido.", error: "periodo_invalido" };
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const { centroId, proyecto } = await centroDeFiltro(ctx, empresa.id, e);
    const { partidas, truncado } = await leerPartidas(ctx, { empresaId: empresa.id, centroId: centroId || null, tipoMovimiento: e.tipo_movimiento ?? null });
    const noProject = partidas.filter((p) => !p.es_project).map((p) => p.id);
    const flujos = await leerFlujosLegacy(ctx, noProject);
    const propias = await leerProgramacionPropia(ctx, partidas);
    const proy = proyectadoPorPartida(partidas, flujos, propias, { desde: e.desde, hasta: e.hasta });
    // .limit(5000) no sirve: PostgREST corta en 1000 filas. Se pagina.
    const { filas: iva } = await leerTodo<any>(() =>
      ctx.db
        .from("flujos_programados")
        .select("fecha, monto, tipo")
        .eq("empresa_id", empresa.id)
        .eq("auto_generado", true)
        .gte("fecha", e.desde)
        .lte("fecha", e.hasta)
        .order("id")
    );
    const { programaciones } = await leerProgramaciones(ctx, { empresaId: empresa.id, desde: e.desde, hasta: e.hasta, estados: ["pendiente"], centroId: centroId || undefined });

    const meses = new Map<string, { mes: string; proyectado_ingresos: number; proyectado_egresos: number; iva_ingresos: number; iva_egresos: number; tesoreria_ingresos: number; tesoreria_egresos: number }>();
    const mes = (f: string) => {
      const k = f.slice(0, 7);
      if (!meses.has(k)) meses.set(k, { mes: k, proyectado_ingresos: 0, proyectado_egresos: 0, iva_ingresos: 0, iva_egresos: 0, tesoreria_ingresos: 0, tesoreria_egresos: 0 });
      return meses.get(k)!;
    };
    const tipoDe = new Map(partidas.map((p) => [p.id, p.tipo_movimiento]));
    let sinTipo = 0;
    proy.forEach((v, pid) =>
      v.filas.forEach((f) => {
        const t = tipoDe.get(pid);
        if (t === "ingreso") mes(f.fecha).proyectado_ingresos += f.monto;
        else if (t === "egreso") mes(f.fecha).proyectado_egresos += f.monto;
        else sinTipo += f.monto;
      })
    );
    (iva || []).forEach((f: { fecha: string; monto: number; tipo: string }) => {
      if (f.tipo === "ingreso") mes(f.fecha).iva_ingresos += Number(f.monto);
      else mes(f.fecha).iva_egresos += Number(f.monto);
    });
    programaciones.forEach((p) => {
      if (p.tipo === "ingreso") mes(p.fecha_programada).tesoreria_ingresos += p.monto;
      else mes(p.fecha_programada).tesoreria_egresos += p.monto;
    });
    const serie = Array.from(meses.values())
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])));
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Proyección de ${empresa.nombre}${proyecto ? ` · ${proyecto.nombre}` : ""} del ${e.desde} al ${e.hasta}: ${serie.length} meses con movimiento. Proyectado, IVA automático y tesorería se muestran en columnas separadas (no se suman).`,
      alcance: {
        empresa,
        proyecto,
        periodo: { desde: e.desde, hasta: e.hasta },
        filtros: { centro_negocio_id: centroId, tipo_movimiento: e.tipo_movimiento },
        registros: partidas.length,
        total: partidas.length,
        truncado,
        nota: sinTipo > 0 ? `${moneda(sinTipo)} proyectados en partidas sin tipo de movimiento (pendientes o no afecta) quedaron fuera de ingresos/egresos.` : undefined,
      },
      datos: {
        serie,
        por_partida: partidas
          .map((p) => ({ id: p.id, partida: p.partida, tipo: p.tipo_movimiento, fuente: proy.get(p.id)?.fuente, proyectado: r2(proy.get(p.id)?.total || 0) }))
          .filter((x) => x.proyectado > 0),
      },
      tablas: [
        {
          titulo: "Flujo por mes (capas separadas)",
          columnas: [
            { clave: "mes", etiqueta: "Mes" },
            { clave: "proyectado_ingresos", etiqueta: "Proyectado ingresos", tipo: "moneda" },
            { clave: "proyectado_egresos", etiqueta: "Proyectado egresos", tipo: "moneda" },
            { clave: "iva_ingresos", etiqueta: "IVA aut. ingresos", tipo: "moneda" },
            { clave: "iva_egresos", etiqueta: "IVA aut. egresos", tipo: "moneda" },
            { clave: "tesoreria_ingresos", etiqueta: "Tesorería pendiente ingresos", tipo: "moneda" },
            { clave: "tesoreria_egresos", etiqueta: "Tesorería pendiente egresos", tipo: "moneda" },
          ],
          filas: serie,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
export const sugerirProgramacionTool: Herramienta<FiltroBase> = {
  nombre: "sugerir_programacion_periodo",
  modulo: "programaciones",
  tipo: "consulta",
  descripcion:
    "Prepara candidatos para la programación de tesorería de un periodo a partir de las operaciones recurrentes ya proyectadas (flujos programados y pagos de programación de proyecto) que aún no tienen una programación de tesorería de la misma partida en el periodo. No escribe nada: sirve de base para proponer_programaciones.",
  parametros: s.objeto(
    { empresa_id: s.uuid("Empresa"), desde: s.fecha("Inicio"), hasta: s.fecha("Fin"), centro_negocio_id: s.uuid("Centro"), proyecto_id: s.uuid("Proyecto") },
    ["desde", "hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "Solo partidas activas con tipo ingreso/egreso"],
  devuelve: "Candidatos (partida, fecha, monto, tipo, fuente) y los ya programados que se omitieron.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const { centroId, proyecto } = await centroDeFiltro(ctx, empresa.id, e);
    const { partidas } = await leerPartidas(ctx, { empresaId: empresa.id, centroId: centroId || null });
    const flujos = await leerFlujosLegacy(ctx, partidas.filter((p) => !p.es_project).map((p) => p.id));
    const propias = await leerProgramacionPropia(ctx, partidas);
    const proy = proyectadoPorPartida(partidas, flujos, propias, { desde: e.desde, hasta: e.hasta });
    const { programaciones } = await leerProgramaciones(ctx, { empresaId: empresa.id, desde: e.desde, hasta: e.hasta, estados: ["pendiente", "ejecutado"] });
    const yaProgramadas = new Set(programaciones.map((p) => p.presupuesto_id).filter(Boolean));
    const candidatos: Record<string, unknown>[] = [];
    const omitidos: Record<string, unknown>[] = [];
    partidas.forEach((p) => {
      const v = proy.get(p.id);
      if (!v || v.filas.length === 0) return;
      if (p.tipo_movimiento !== "ingreso" && p.tipo_movimiento !== "egreso") {
        omitidos.push({ partida: p.partida, motivo: "Partida sin tipo ingreso/egreso" });
        return;
      }
      if (yaProgramadas.has(p.id)) {
        omitidos.push({ partida: p.partida, motivo: "Ya tiene programación de tesorería en el periodo" });
        return;
      }
      v.filas.forEach((f) =>
        candidatos.push({
          presupuesto_id: p.id,
          partida: p.partida,
          centro_negocio_id: p.centro_negocio_id,
          tercero_id: p.tercero_id,
          tipo: p.tipo_movimiento,
          fecha_programada: f.fecha,
          monto: r2(f.monto),
          fuente: v.fuente,
          descripcion: f.descripcion,
        })
      );
    });
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${candidatos.length} operaciones recurrentes proyectadas entre ${e.desde} y ${e.hasta} aún no programadas en tesorería (${moneda(candidatos.reduce((s2, c) => s2 + (c.monto as number), 0))}). ${omitidos.length} omitidas.`,
      alcance: { empresa, proyecto, periodo: { desde: e.desde, hasta: e.hasta }, registros: partidas.length, total: partidas.length, truncado: false },
      datos: { candidatos, omitidos },
      tablas: [
        {
          titulo: "Candidatos a programar",
          columnas: [
            { clave: "fecha_programada", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "partida", etiqueta: "Partida" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "fuente", etiqueta: "Origen" },
            { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
          ],
          filas: candidatos,
        },
      ],
    };
  },
};
