/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Contexto, Herramienta, Referencia } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, exigirContable, exigirVerProyecto } from "../permisos.ts";
import { ErrorFaltante, enlaces, exigirMismaEmpresa, leerPorIds, leerProyecto, ref, resolverEmpresa } from "../datos.ts";
import {
  type Partida,
  ejercidoPorPartidas,
  leerFlujosLegacy,
  leerMovimientosDePartidas,
  leerPartidas,
  leerProgramacionPropia,
  leerProgramaciones,
  proyectadoPorPartida,
} from "../finanzas.ts";
import { type Preparacion, proponerAccion, registrarAccion } from "../acciones.ts";
import { validarRespaldoPresupuestal } from "../../negocio/programacion.ts";
import { validarAsiento, totalesAsiento } from "../../negocio/asientos.ts";
import { calcularMontoPresupuestado, distribuirSaldoEntrePeriodos, numeroFinito, programacionPendienteDeAjustar } from "../../negocio/calculos.ts";
import { calcularFechasPorFrecuencia, fechaLocal, isoLocal, type FrecuenciaConCadencia } from "../../negocio/fechas.ts";
import { moneda, r2 } from "./util.ts";

const FRECUENCIAS = ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"];

function fallo(errores: string[], faltantes?: string[], extra: Partial<Preparacion> = {}): Preparacion {
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
    ...extra,
  };
}

// ===========================================================================
// 1. Programaciones de tesorería nuevas (respaldo presupuestal obligatorio)
// ===========================================================================
interface ItemProgramacion {
  tipo: "ingreso" | "egreso";
  fecha_programada: string;
  monto: number;
  presupuesto_id: string;
  centro_negocio_id?: string;
  tercero_id?: string;
  observaciones?: string;
}
interface EntradaProgramaciones {
  empresa_id?: string;
  items?: ItemProgramacion[];
  recurrencia?: {
    tipo: "ingreso" | "egreso";
    presupuesto_id: string;
    frecuencia: FrecuenciaConCadencia;
    fecha_inicio: string;
    numero_periodos: number;
    monto_por_periodo?: number;
    monto_total?: number;
    centro_negocio_id?: string;
    tercero_id?: string;
    observaciones?: string;
  };
  permitir_posibles_duplicados?: boolean;
}

const itemEsquema = s.objeto(
  {
    tipo: s.enumerado(["ingreso", "egreso"], "Tipo"),
    fecha_programada: s.fecha("Fecha"),
    monto: s.numero("Monto (> 0)", 0.01),
    presupuesto_id: s.uuid("Partida que la respalda (obligatoria)"),
    centro_negocio_id: s.uuid("Centro (por defecto el de la partida)"),
    tercero_id: s.uuid("Tercero"),
    observaciones: s.texto("Observaciones", 300),
  },
  ["tipo", "fecha_programada", "monto", "presupuesto_id"]
);

async function prepararProgramaciones(ctx: Contexto, e: EntradaProgramaciones): Promise<Preparacion> {
  exigirContable(ctx, "crear programaciones");
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const items: ItemProgramacion[] = [...(e.items || [])];
  if (e.recurrencia) {
    const rc = e.recurrencia;
    if (!rc.monto_por_periodo && !rc.monto_total) return fallo(["La recurrencia requiere monto_por_periodo o monto_total."], ["monto_por_periodo"]);
    if (rc.numero_periodos < 1 || rc.numero_periodos > 200) return fallo(["El número de periodos debe estar entre 1 y 200."]);
    const fechas = calcularFechasPorFrecuencia(fechaLocal(rc.fecha_inicio), rc.frecuencia, rc.numero_periodos);
    const montos = rc.monto_total ? distribuirSaldoEntrePeriodos(rc.monto_total, fechas.length) : fechas.map(() => rc.monto_por_periodo!);
    fechas.forEach((f, i) =>
      items.push({
        tipo: rc.tipo,
        fecha_programada: isoLocal(f),
        monto: r2(montos[i]),
        presupuesto_id: rc.presupuesto_id,
        centro_negocio_id: rc.centro_negocio_id,
        tercero_id: rc.tercero_id,
        observaciones: rc.observaciones ? `${rc.observaciones} (${i + 1}/${fechas.length})` : `Pago ${i + 1}/${fechas.length}`,
      })
    );
  }
  if (items.length === 0) return fallo(["Indica las programaciones (items) o una recurrencia."], ["items"]);
  if (items.length > 200) return fallo(["Máximo 200 programaciones por operación."]);

  const ids = Array.from(new Set(items.map((i) => i.presupuesto_id)));
  const { partidas } = await leerPartidas(ctx, { empresaId: empresa.id, ids });
  const partidaMap = new Map(partidas.map((p) => [p.id, p]));
  const centrosIds = items.map((i) => i.centro_negocio_id).filter(Boolean) as string[];
  const tercerosIds = items.map((i) => i.tercero_id).filter(Boolean) as string[];
  const centros = centrosIds.length ? await leerPorIds<any>(ctx, "centros_negocio", "id, empresa_id, nombre, activo", "id", centrosIds) : [];
  const terceros = tercerosIds.length ? await leerPorIds<any>(ctx, "terceros", "id, empresa_id, razon_social, activo", "id", tercerosIds) : [];
  const errores: string[] = [];
  centrosIds.forEach((c) => {
    const x = centros.find((y) => y.id === c);
    if (!x || x.empresa_id !== empresa.id) errores.push("Un centro de negocio indicado no pertenece a la empresa.");
  });
  tercerosIds.forEach((t) => {
    const x = terceros.find((y) => y.id === t);
    if (!x || x.empresa_id !== empresa.id) errores.push("Un tercero indicado no pertenece a la empresa.");
  });
  const nuevas = items.map((i) => ({
    ...i,
    empresa_id: empresa.id,
    centro_negocio_id: i.centro_negocio_id || partidaMap.get(i.presupuesto_id)?.centro_negocio_id || null,
    monto: r2(i.monto),
  }));
  nuevas.forEach((n) => {
    const p = partidaMap.get(n.presupuesto_id);
    if (p && (p.tipo_movimiento === "ingreso" || p.tipo_movimiento === "egreso") && p.tipo_movimiento !== n.tipo) {
      errores.push(`La partida "${p.partida}" es de ${p.tipo_movimiento}; no se puede programar un ${n.tipo}.`);
    }
  });

  const existentes = (await leerProgramaciones(ctx, { empresaId: empresa.id, presupuestoIds: ids })).programaciones;
  const movs = await leerMovimientosDePartidas(ctx, ids);
  const ejercido = ejercidoPorPartidas(partidas, movs, "naturaleza");
  const validacion = validarRespaldoPresupuestal(nuevas, existentes, partidas, ejercido);
  errores.push(...validacion.errores);

  const duplicados = nuevas.filter((n) =>
    existentes.some((x) => x.estado !== "cancelado" && x.presupuesto_id === n.presupuesto_id && x.fecha_programada === n.fecha_programada && Math.abs(x.monto - n.monto) < 0.005)
  );
  const advertencias: string[] = [];
  if (duplicados.length) {
    const msg = `${duplicados.length} programación(es) coinciden en partida, fecha y monto con programaciones existentes (posible duplicado).`;
    if (!e.permitir_posibles_duplicados) errores.push(`${msg} Si son intencionales, indícalo explícitamente.`);
    else advertencias.push(msg);
  }

  const tablaNuevas = {
    titulo: "Programaciones a crear (estado pendiente)",
    columnas: [
      { clave: "fecha_programada", etiqueta: "Fecha", tipo: "fecha" as const },
      { clave: "tipo", etiqueta: "Tipo" },
      { clave: "partida", etiqueta: "Partida" },
      { clave: "observaciones", etiqueta: "Observaciones" },
      { clave: "monto", etiqueta: "Monto", tipo: "moneda" as const },
    ],
    filas: nuevas.map((n) => ({ ...n, partida: partidaMap.get(n.presupuesto_id)?.partida ?? "(no encontrada)" })),
    totales: { monto: r2(nuevas.reduce((a, n) => a + n.monto, 0)) },
  };
  const tablaRespaldo = {
    titulo: "Respaldo presupuestal (ejercido por naturaleza + pendientes existentes)",
    columnas: [
      { clave: "partida", etiqueta: "Partida" },
      { clave: "presupuestado", etiqueta: "Presupuestado", tipo: "moneda" as const },
      { clave: "consumido_previo", etiqueta: "Ejercido + pendiente", tipo: "moneda" as const },
      { clave: "nuevo", etiqueta: "Nuevo", tipo: "moneda" as const },
      { clave: "disponible_tras", etiqueta: "Disponible después", tipo: "moneda" as const },
    ],
    filas: validacion.detalle.map((d) => ({ ...d, partida: partidaMap.get(d.presupuesto_id)?.partida, _enlace: enlaces.presupuestoEjercido(d.presupuesto_id) })),
  };
  if (errores.length) return fallo(errores, undefined, { vista_previa: { resumen: "", tablas: [tablaNuevas, tablaRespaldo], advertencias, efectos: [] } });

  const total = r2(nuevas.reduce((a, n) => a + n.monto, 0));
  return {
    ok: true,
    descripcion: `Crear ${nuevas.length} programación(es) pendiente(s) en ${empresa.nombre} por ${moneda(total)}`,
    vista_previa: {
      resumen: `Se crearán ${nuevas.length} programaciones en estado pendiente por ${moneda(total)}, todas con partida y respaldo suficiente.`,
      tablas: [tablaNuevas, tablaRespaldo],
      totales: { programaciones: nuevas.length, monto: total },
      advertencias,
      efectos: ["Aparecen en Programación y en sus KPIs de pendientes.", "No crean asientos ni afectan el ejercido."],
    },
    huella_datos: {
      partidas: partidas.map((p) => ({ id: p.id, cantidad: p.cantidad, precio: p.precio_unitario, activo: p.activo })),
      ejercido: Array.from(ejercido.entries()).sort(),
      existentes: existentes.map((x) => [x.id, x.estado, x.monto, x.fecha_programada]).sort(),
    },
    registros_afectados: partidas.map((p) => ref("presupuesto", p.id, p.partida, enlaces.presupuestoEjercido(p.id))),
    rpc: {
      nombre: "rafa_crear_programaciones",
      args: { p_items: nuevas.map(({ empresa_id, tipo, centro_negocio_id, fecha_programada, tercero_id, monto, observaciones, presupuesto_id }) => ({ empresa_id, tipo, centro_negocio_id, fecha_programada, tercero_id: tercero_id || null, monto, observaciones: observaciones || null, presupuesto_id })) },
    },
    requiere_confirmacion: true,
  };
}

export const proponerProgramacionesTool: Herramienta<EntradaProgramaciones> = {
  nombre: "proponer_programaciones",
  modulo: "programaciones",
  tipo: "accion",
  descripcion:
    "Prepara nuevas programaciones de tesorería (pendientes) — explícitas o recurrentes (frecuencia, número de periodos, monto por periodo o total) — con respaldo presupuestal obligatorio. NO las crea: registra una propuesta que el usuario debe confirmar en la interfaz. Rechaza posibles duplicados salvo indicación expresa.",
  parametros: s.objeto({
    empresa_id: s.uuid("Empresa"),
    items: s.lista(itemEsquema, "Programaciones explícitas", 200),
    recurrencia: s.objeto(
      {
        tipo: s.enumerado(["ingreso", "egreso"], "Tipo"),
        presupuesto_id: s.uuid("Partida"),
        frecuencia: s.enumerado(FRECUENCIAS, "Frecuencia"),
        fecha_inicio: s.fecha("Primera fecha"),
        numero_periodos: s.entero("Número de periodos (1-200)", 1, 200),
        monto_por_periodo: s.numero("Monto por periodo", 0.01),
        monto_total: s.numero("Monto total a repartir sin perder centavos", 0.01),
        centro_negocio_id: s.uuid("Centro"),
        tercero_id: s.uuid("Tercero"),
        observaciones: s.texto("Observaciones", 200),
      },
      ["tipo", "presupuesto_id", "frecuencia", "fecha_inicio", "numero_periodos"]
    ),
    permitir_posibles_duplicados: s.booleano("Solo si el usuario confirmó que las coincidencias son intencionales"),
  }),
  roles: ROLES_CONTABLES,
  validaciones: [
    "admin/contador (RLS de programaciones)",
    "Partida activa de la misma empresa y centro",
    "Tipo coincide con el tipo de movimiento de la partida",
    "Egresos: ejercido + pendientes + nuevas ≤ presupuestado",
    "Sin duplicados por partida/fecha/monto salvo autorización",
  ],
  devuelve: "Propuesta con vista previa y huella; se ejecuta solo al confirmar (rafa_crear_programaciones, transaccional).",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_programaciones", e),
};
registrarAccion({ herramienta: "proponer_programaciones", preparar: prepararProgramaciones });

// ===========================================================================
// 2. Asientos en borrador (explícitos o desde programaciones)
// ===========================================================================
interface RenglonEntrada {
  cuenta_id: string;
  debe?: number;
  haber?: number;
  presupuesto_id?: string;
  concepto?: string;
}
interface AsientoEntrada {
  fecha: string;
  tipo: "ingreso" | "egreso" | "diario";
  centro_negocio_id?: string;
  tercero_id?: string;
  observaciones?: string;
  movimientos: RenglonEntrada[];
}
interface EntradaAsientos {
  empresa_id?: string;
  asientos?: AsientoEntrada[];
  desde_programaciones?: { programacion_ids: string[]; cuenta_banco_id: string };
}

const MAX_SIN_CONFIRMAR = 3;

async function prepararAsientos(ctx: Contexto, e: EntradaAsientos): Promise<Preparacion> {
  exigirContable(ctx, "crear asientos");
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const asientos: (AsientoEntrada & { programacion_id?: string })[] = [...(e.asientos || [])];
  const advertencias: string[] = [];
  const huellaProg: unknown[] = [];

  if (e.desde_programaciones) {
    const { programacion_ids, cuenta_banco_id } = e.desde_programaciones;
    const banco = (await leerPorIds<any>(ctx, "cuentas_contables", "id, empresa_id, codigo, nombre, clasificacion, activa", "id", [cuenta_banco_id]))[0];
    if (!banco || banco.empresa_id !== empresa.id || banco.clasificacion !== "saldo" || !banco.activa) {
      return fallo(["La cuenta de banco debe ser una cuenta de saldo activa de la empresa."], ["cuenta_banco_id"]);
    }
    const { programaciones } = await leerProgramaciones(ctx, { empresaId: empresa.id, ids: programacion_ids });
    const errores: string[] = [];
    if (programaciones.length !== new Set(programacion_ids).size) errores.push("Alguna programación no existe, no es visible o es de otra empresa.");
    const pids = programaciones.map((p) => p.presupuesto_id).filter(Boolean) as string[];
    const partidas: Partida[] = pids.length ? (await leerPartidas(ctx, { empresaId: empresa.id, ids: pids })).partidas : [];
    const pm = new Map(partidas.map((p) => [p.id, p]));
    for (const p of programaciones) {
      huellaProg.push([p.id, p.estado, p.monto, p.fecha_programada, p.asiento_id, p.asiento_estado]);
      const etiqueta = `Programación ${p.fecha_programada} ${moneda(p.monto)}`;
      if (p.estado !== "pendiente") { errores.push(`${etiqueta}: está ${p.estado}.`); continue; }
      if (p.asiento_id && p.asiento_estado !== "cancelado") { errores.push(`${etiqueta}: ya tiene el asiento #${p.asiento_numero} (${p.asiento_estado}) ligado.`); continue; }
      const partida = p.presupuesto_id ? pm.get(p.presupuesto_id) : undefined;
      if (!partida) { errores.push(`${etiqueta}: no tiene partida presupuestal; indica la cuenta de contrapartida.`); continue; }
      if (!partida.cuenta_id) { errores.push(`${etiqueta}: la partida "${partida.partida}" no tiene cuenta contable; indica cuál usar.`); continue; }
      const renglonPartida: RenglonEntrada = { cuenta_id: partida.cuenta_id, presupuesto_id: partida.id, concepto: partida.partida };
      const renglonBanco: RenglonEntrada = { cuenta_id: banco.id, concepto: p.tercero_nombre || p.observaciones || "" };
      asientos.push({
        programacion_id: p.id,
        fecha: p.fecha_programada,
        tipo: p.tipo as "ingreso" | "egreso",
        centro_negocio_id: p.centro_negocio_id || partida.centro_negocio_id || undefined,
        tercero_id: p.tercero_id || undefined,
        observaciones: `Programación ${p.fecha_programada}${p.observaciones ? ` · ${p.observaciones}` : ""}`,
        movimientos:
          p.tipo === "egreso"
            ? [{ ...renglonPartida, debe: p.monto, haber: 0 }, { ...renglonBanco, debe: 0, haber: p.monto }]
            : [{ ...renglonBanco, debe: p.monto, haber: 0 }, { ...renglonPartida, debe: 0, haber: p.monto }],
      });
    }
    if (errores.length) return fallo(errores);
    advertencias.push("No se agregó IVA ni retenciones: si aplican, indícalo para incluir los renglones correspondientes.");
  }
  if (asientos.length === 0) return fallo(["Indica los asientos o las programaciones de origen."], ["asientos"]);
  if (asientos.length > 50) return fallo(["Máximo 50 asientos por operación."]);

  // Validación compartida + alcance de cuentas, partidas, centros y terceros.
  const cuentaIds = asientos.flatMap((a) => a.movimientos.map((m) => m.cuenta_id));
  const presIds = asientos.flatMap((a) => a.movimientos.map((m) => m.presupuesto_id).filter(Boolean) as string[]);
  const cuentas = await leerPorIds<any>(ctx, "cuentas_contables", "id, empresa_id, codigo, nombre, clasificacion, activa", "id", cuentaIds);
  const presupuestos = presIds.length ? await leerPorIds<any>(ctx, "presupuestos", "id, empresa_id, centro_negocio_id, partida, activo", "id", presIds) : [];
  const cm = new Map(cuentas.map((c) => [c.id, c]));
  const errores: string[] = [];
  asientos.forEach((a, i) => {
    const etiqueta = `Asiento ${i + 1} (${a.fecha})`;
    const err = validarAsiento(
      { empresa_id: empresa.id, fecha: a.fecha, tipo: a.tipo, centro_negocio_id: a.centro_negocio_id || null },
      a.movimientos.map((m) => ({ cuenta_id: m.cuenta_id, debe: numeroFinito(m.debe), haber: numeroFinito(m.haber), presupuesto_id: m.presupuesto_id || null })),
      presupuestos,
      { validarAlcancePartidas: true, rechazarNegativos: true }
    );
    if (err) errores.push(`${etiqueta}: ${err}`);
    a.movimientos.forEach((m) => {
      const c = cm.get(m.cuenta_id);
      if (!c || c.empresa_id !== empresa.id) errores.push(`${etiqueta}: una cuenta no pertenece a la empresa.`);
      else if (c.clasificacion !== "saldo" || !c.activa) errores.push(`${etiqueta}: la cuenta ${c.codigo} no es de saldo activa.`);
    });
  });
  if (errores.length) return fallo(errores);

  const filas = asientos.flatMap((a, i) =>
    a.movimientos.map((m) => ({
      asiento: i + 1,
      fecha: a.fecha,
      tipo: a.tipo,
      cuenta: `${cm.get(m.cuenta_id)?.codigo} ${cm.get(m.cuenta_id)?.nombre}`,
      partida: presupuestos.find((p) => p.id === m.presupuesto_id)?.partida ?? "",
      debe: r2(numeroFinito(m.debe)),
      haber: r2(numeroFinito(m.haber)),
    }))
  );
  const total = r2(asientos.reduce((acc, a) => acc + totalesAsiento(a.movimientos.map((m) => ({ debe: numeroFinito(m.debe), haber: numeroFinito(m.haber) }))).totalDebe, 0));
  const masivo = asientos.length > MAX_SIN_CONFIRMAR;
  return {
    ok: true,
    descripcion: `Crear ${asientos.length} asiento(s) en BORRADOR en ${empresa.nombre} por ${moneda(total)}`,
    vista_previa: {
      resumen: `Se crearán ${asientos.length} asientos en estado borrador (no contabilizados) por ${moneda(total)}.`,
      tablas: [
        {
          titulo: "Renglones de los asientos borrador",
          columnas: [
            { clave: "asiento", etiqueta: "Asiento" },
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "cuenta", etiqueta: "Cuenta" },
            { clave: "partida", etiqueta: "Partida" },
            { clave: "debe", etiqueta: "Debe", tipo: "moneda" },
            { clave: "haber", etiqueta: "Haber", tipo: "moneda" },
          ],
          filas,
        },
      ],
      totales: { asientos: asientos.length, total },
      advertencias,
      efectos: [
        "Quedan en borrador: no afectan ejercido, saldos ni reportes hasta que alguien los aplique.",
        ...(e.desde_programaciones ? ["Cada programación queda ligada a su asiento (asiento_id) para no duplicar; su estado sigue pendiente."] : []),
      ],
    },
    huella_datos: { cuentas: cuentas.map((c) => [c.id, c.activa, c.clasificacion]).sort(), presupuestos: presupuestos.map((p) => [p.id, p.activo, p.centro_negocio_id]).sort(), programaciones: huellaProg },
    registros_afectados: asientos
      .filter((a) => a.programacion_id)
      .map((a) => ref("programacion", a.programacion_id!, `Programación ${a.fecha}`, enlaces.programacion())) as Referencia[],
    rpc: {
      nombre: "rafa_crear_asientos_borrador",
      args: {
        p_asientos: asientos.map((a) => ({
          empresa_id: empresa.id,
          fecha: a.fecha,
          tipo: a.tipo,
          centro_negocio_id: a.centro_negocio_id || null,
          tercero_id: a.tercero_id || null,
          observaciones: a.observaciones || null,
          programacion_id: a.programacion_id || null,
          movimientos: a.movimientos.map((m) => ({ cuenta_id: m.cuenta_id, partida: m.concepto || "", debe: r2(numeroFinito(m.debe)), haber: r2(numeroFinito(m.haber)), presupuesto_id: m.presupuesto_id || null })),
        })),
      },
    },
    requiere_confirmacion: masivo,
  };
}

export const proponerAsientosBorradorTool: Herramienta<EntradaAsientos> = {
  nombre: "proponer_asientos_borrador",
  modulo: "asientos",
  tipo: "accion",
  descripcion:
    `Prepara asientos contables en BORRADOR (nunca los contabiliza), explícitos o a partir de programaciones pendientes (cargo/abono entre la cuenta de la partida y la cuenta de banco indicada). Hasta ${MAX_SIN_CONFIRMAR} borradores se guardan directamente; más requieren confirmación. Requiere la cuenta de banco: no la supongas.`,
  parametros: s.objeto({
    empresa_id: s.uuid("Empresa"),
    asientos: s.lista(
      s.objeto(
        {
          fecha: s.fecha("Fecha"),
          tipo: s.enumerado(["ingreso", "egreso", "diario"], "Tipo"),
          centro_negocio_id: s.uuid("Centro"),
          tercero_id: s.uuid("Tercero"),
          observaciones: s.texto("Observaciones", 300),
          movimientos: s.lista(
            s.objeto(
              { cuenta_id: s.uuid("Cuenta de saldo"), debe: s.numero("Debe", 0), haber: s.numero("Haber", 0), presupuesto_id: s.uuid("Partida"), concepto: s.texto("Concepto", 200) },
              ["cuenta_id"]
            ),
            "Renglones",
            60
          ),
        },
        ["fecha", "tipo", "movimientos"]
      ),
      "Asientos explícitos",
      50
    ),
    desde_programaciones: s.objeto(
      { programacion_ids: s.lista(s.uuid("Programación"), "Programaciones pendientes", 50), cuenta_banco_id: s.uuid("Cuenta de banco (saldo) a usar") },
      ["programacion_ids", "cuenta_banco_id"]
    ),
  }),
  roles: ROLES_CONTABLES,
  validaciones: [
    "Validación compartida validarAsiento (cuadre, diario con partida, alcance de partidas) y sin importes negativos",
    "Cuentas de saldo activas de la empresa",
    "Programaciones pendientes, de la empresa, sin asiento vigente, con partida y cuenta",
  ],
  devuelve: "Borradores creados (o propuesta si son más de 3); nunca aplica asientos.",
  confirmacion: "si_masivo",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_asientos_borrador", e),
};
registrarAccion({ herramienta: "proponer_asientos_borrador", preparar: prepararAsientos });

// ===========================================================================
// 3. Ajuste porcentual de presupuesto (simulación y propuesta)
// ===========================================================================
interface EntradaAjuste {
  empresa_id?: string;
  presupuesto_ids?: string[];
  centro_negocio_id?: string;
  proyecto_id?: string;
  porcentaje: number;
  aplicar_a: "precio_unitario" | "cantidad";
}

export async function calcularAjuste(ctx: Contexto, e: EntradaAjuste) {
  exigirContable(ctx);
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  let centroId = e.centro_negocio_id || null;
  let proyecto: { id: string; nombre: string } | null = null;
  if (e.proyecto_id) {
    const p = await leerProyecto(ctx, e.proyecto_id);
    exigirMismaEmpresa(p.empresa_id, empresa.id, "El proyecto");
    centroId = p.centro_negocio_id;
    proyecto = { id: p.id, nombre: p.nombre };
  }
  if (!e.presupuesto_ids?.length && !centroId) {
    throw new ErrorFaltante("Indica las partidas, el centro o el proyecto a ajustar.", ["presupuesto_ids"]);
  }
  const { partidas } = e.presupuesto_ids?.length
    ? await leerPartidas(ctx, { empresaId: empresa.id, ids: e.presupuesto_ids })
    : await leerPartidas(ctx, { empresaId: empresa.id, centroId, soloProject: Boolean(e.proyecto_id) });
  const activas = partidas.filter((p) => p.activo);
  const flujos = await leerFlujosLegacy(ctx, activas.filter((p) => !p.es_project).map((p) => p.id));
  const propias = await leerProgramacionPropia(ctx, activas);
  const proy = proyectadoPorPartida(activas, flujos, propias);
  const movs = await leerMovimientosDePartidas(ctx, activas.map((p) => p.id));
  const ejercido = ejercidoPorPartidas(activas, movs, "naturaleza");
  const factor = 1 + e.porcentaje / 100;
  const filas = activas.map((p) => {
    const antes = calcularMontoPresupuestado(p.cantidad, p.precio_unitario);
    const precioNuevo = e.aplicar_a === "precio_unitario" ? Math.round(p.precio_unitario * factor * 10000) / 10000 : p.precio_unitario;
    const cantidadNueva = e.aplicar_a === "cantidad" ? Math.round(p.cantidad * factor * 10000) / 10000 : p.cantidad;
    const despues = calcularMontoPresupuestado(cantidadNueva, precioNuevo);
    const programado = proy.get(p.id)?.total || 0;
    const ej = ejercido.get(p.id) || 0;
    return {
      id: p.id,
      partida: p.partida,
      cantidad_antes: p.cantidad,
      cantidad_despues: cantidadNueva,
      precio_antes: p.precio_unitario,
      precio_despues: precioNuevo,
      presupuesto_antes: r2(antes),
      presupuesto_despues: r2(despues),
      diferencia: r2(despues - antes),
      ejercido: r2(ej),
      disponible_antes: r2(antes - ej),
      disponible_despues: r2(despues - ej),
      programado: r2(programado),
      fuente_programado: proy.get(p.id)?.fuente,
      por_programar_despues: r2(despues - programado),
      cuadraba_antes: !programacionPendienteDeAjustar(programado, antes),
      cuadra_despues: !programacionPendienteDeAjustar(programado, despues),
    };
  });
  const totales = {
    presupuesto_antes: r2(filas.reduce((a, f) => a + f.presupuesto_antes, 0)),
    presupuesto_despues: r2(filas.reduce((a, f) => a + f.presupuesto_despues, 0)),
    diferencia: r2(filas.reduce((a, f) => a + f.diferencia, 0)),
    programado: r2(filas.reduce((a, f) => a + f.programado, 0)),
  };
  return { empresa, proyecto, partidas: activas, inactivas: partidas.length - activas.length, filas, totales };
}

function tablasAjuste(filas: Awaited<ReturnType<typeof calcularAjuste>>["filas"]) {
  return [
    {
      titulo: "Antes y después",
      columnas: [
        { clave: "partida", etiqueta: "Partida" },
        { clave: "presupuesto_antes", etiqueta: "Antes", tipo: "moneda" as const },
        { clave: "presupuesto_despues", etiqueta: "Después", tipo: "moneda" as const },
        { clave: "diferencia", etiqueta: "Diferencia", tipo: "moneda" as const },
        { clave: "programado", etiqueta: "Proyectado actual", tipo: "moneda" as const },
        { clave: "por_programar_despues", etiqueta: "Por programar después", tipo: "moneda" as const },
      ],
      filas: filas.map((f) => ({ ...f, _enlace: enlaces.presupuestoEjercido(f.id) })),
    },
  ];
}

const ajusteParametros = s.objeto(
  {
    empresa_id: s.uuid("Empresa"),
    presupuesto_ids: s.lista(s.uuid("Partida"), "Partidas a ajustar", 200),
    centro_negocio_id: s.uuid("Todas las partidas activas del centro"),
    proyecto_id: s.uuid("Todas las partidas de proyecto activas"),
    porcentaje: s.numero("Porcentaje (5 = +5%, -10 = -10%)", -99, 1000),
    aplicar_a: s.enumerado(["precio_unitario", "cantidad"], "Qué se incrementa: precio unitario o cantidad (decisión del usuario; no asumir)"),
  },
  ["porcentaje", "aplicar_a"]
);

export const simularIncrementoTool: Herramienta<EntradaAjuste> = {
  nombre: "simular_incremento_presupuesto",
  modulo: "presupuestos",
  tipo: "simulacion",
  descripcion:
    "SIMULA (no guarda) un incremento o reducción porcentual de partidas: presupuesto antes/después, disponible, y cómo cambia la proyección (proyectado actual vs nuevo presupuesto: lo que quedaría por programar). Requiere que el usuario diga si se ajusta el precio unitario o la cantidad.",
  parametros: ajusteParametros,
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador", "Partidas de la empresa", "aplicar_a obligatorio"],
  devuelve: "Tabla antes/después y efecto en la proyección; no modifica nada.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    const r = await calcularAjuste(ctx, e);
    return {
      ok: true,
      tipo: "simulacion",
      resumen: `SIMULACIÓN (no se guardó nada): ${e.porcentaje > 0 ? "+" : ""}${e.porcentaje}% sobre ${e.aplicar_a === "precio_unitario" ? "el precio unitario" : "la cantidad"} de ${r.filas.length} partidas: ${moneda(r.totales.presupuesto_antes)} → ${moneda(r.totales.presupuesto_despues)} (${moneda(r.totales.diferencia)}). Proyectado actual ${moneda(r.totales.programado)}.`,
      alcance: { empresa: r.empresa, proyecto: r.proyecto, registros: r.filas.length, total: r.filas.length, truncado: false, nota: r.inactivas ? `${r.inactivas} partidas inactivas excluidas.` : undefined },
      datos: { filas: r.filas, totales: r.totales },
      tablas: tablasAjuste(r.filas),
      advertencias: ["Los flujos y la programación financiera de proyecto no se modifican: la diferencia queda por programar."],
    };
  },
};

async function prepararAjuste(ctx: Contexto, e: EntradaAjuste): Promise<Preparacion> {
  const r = await calcularAjuste(ctx, e);
  if (r.filas.length === 0) return fallo(["No hay partidas activas que ajustar con ese filtro."]);
  if (r.filas.length > 200) return fallo(["Máximo 200 partidas por operación."]);
  const cambios = r.filas.filter((f) => f.diferencia !== 0 || f.precio_antes !== f.precio_despues || f.cantidad_antes !== f.cantidad_despues);
  if (cambios.length === 0) return fallo(["El ajuste no cambia ningún importe."]);
  return {
    ok: true,
    descripcion: `Ajustar ${e.porcentaje > 0 ? "+" : ""}${e.porcentaje}% el ${e.aplicar_a === "precio_unitario" ? "precio unitario" : "la cantidad"} de ${cambios.length} partida(s) en ${r.empresa.nombre}: ${moneda(r.totales.presupuesto_antes)} → ${moneda(r.totales.presupuesto_despues)}`,
    vista_previa: {
      resumen: `Presupuesto total ${moneda(r.totales.presupuesto_antes)} → ${moneda(r.totales.presupuesto_despues)} (${moneda(r.totales.diferencia)}).`,
      tablas: tablasAjuste(r.filas),
      totales: r.totales,
      advertencias: ["No se modifican flujos ni programación de proyecto: las partidas cuya programación deje de cuadrar quedarán 'pendientes de ajustar'."],
      efectos: ["Cambia presupuestado, por ejercer y avance.", "Cada cambio queda en la auditoría del proyecto (trigger existente)."],
    },
    huella_datos: cambios.map((f) => [f.id, f.cantidad_antes, f.precio_antes]),
    registros_afectados: cambios.map((f) => ref("presupuesto", f.id, f.partida, enlaces.presupuestoEjercido(f.id))),
    rpc: {
      nombre: "rafa_ajustar_presupuestos",
      args: {
        p_cambios: cambios.map((f) => ({
          id: f.id,
          cantidad_anterior: String(f.cantidad_antes),
          precio_unitario_anterior: String(f.precio_antes),
          cantidad_nueva: String(f.cantidad_despues),
          precio_unitario_nuevo: String(f.precio_despues),
        })),
      },
    },
    requiere_confirmacion: true,
  };
}

export const proponerAjustePresupuestoTool: Herramienta<EntradaAjuste> = {
  nombre: "proponer_ajuste_presupuesto",
  modulo: "presupuestos",
  tipo: "accion",
  descripcion:
    "Prepara la modificación REAL de partidas por un porcentaje (después de que el usuario vio la simulación y lo pidió). Requiere confirmación en la interfaz y falla si alguna partida cambió desde la propuesta.",
  parametros: ajusteParametros,
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador (RLS de UPDATE)", "Control optimista de cantidad y precio", "Máximo 200 partidas"],
  devuelve: "Propuesta con antes/después; ejecuta rafa_ajustar_presupuestos al confirmar.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_ajuste_presupuesto", e),
};
registrarAccion({ herramienta: "proponer_ajuste_presupuesto", preparar: prepararAjuste });

// ===========================================================================
// 4. Estado de programaciones
// ===========================================================================
interface EntradaEstado {
  empresa_id?: string;
  programacion_ids: string[];
  estado_nuevo: "ejecutado" | "cancelado";
}

async function prepararEstado(ctx: Contexto, e: EntradaEstado): Promise<Preparacion> {
  exigirContable(ctx, "cambiar el estado de programaciones");
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const { programaciones } = await leerProgramaciones(ctx, { empresaId: empresa.id, ids: e.programacion_ids });
  const errores: string[] = [];
  if (programaciones.length !== new Set(e.programacion_ids).size) errores.push("Alguna programación no existe, no es visible o es de otra empresa.");
  programaciones.forEach((p) => {
    if (p.estado !== "pendiente") errores.push(`La programación del ${p.fecha_programada} por ${moneda(p.monto)} está ${p.estado}.`);
  });
  if (errores.length) return fallo(errores);
  const sinAsiento = programaciones.filter((p) => !p.asiento_id || p.asiento_estado !== "aplicado");
  const total = r2(programaciones.reduce((a, p) => a + p.monto, 0));
  return {
    ok: true,
    descripcion: `Marcar ${programaciones.length} programación(es) como ${e.estado_nuevo} (${moneda(total)})`,
    vista_previa: {
      resumen: `${programaciones.length} programaciones pasarán de pendiente a ${e.estado_nuevo}.`,
      tablas: [
        {
          titulo: `Programaciones a marcar como ${e.estado_nuevo}`,
          columnas: [
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "partida", etiqueta: "Partida" },
            { clave: "monto", etiqueta: "Monto", tipo: "moneda" },
            { clave: "asiento", etiqueta: "Asiento ligado" },
          ],
          filas: programaciones.map((p) => ({ fecha: p.fecha_programada, tipo: p.tipo, partida: p.partida_nombre, monto: p.monto, asiento: p.asiento_numero ? `#${p.asiento_numero} (${p.asiento_estado})` : "—" })),
        },
      ],
      totales: { monto: total },
      advertencias:
        e.estado_nuevo === "ejecutado" && sinAsiento.length
          ? [`${sinAsiento.length} no tienen asiento aplicado: marcarlas como ejecutadas NO registra el pago en contabilidad.`]
          : [],
      efectos: ["Dejan de contar como pendientes en los KPIs de Programación y en la comparación contra presupuesto."],
    },
    huella_datos: programaciones.map((p) => [p.id, p.estado, p.monto, p.fecha_programada, p.updated_at]),
    registros_afectados: programaciones.map((p) => ref("programacion", p.id, `${p.fecha_programada} ${moneda(p.monto)}`, enlaces.programacion())),
    rpc: {
      nombre: "rafa_cambiar_estado_programaciones",
      args: { p_cambios: programaciones.map((p) => ({ id: p.id, estado_nuevo: e.estado_nuevo, monto_anterior: String(p.monto), fecha_anterior: p.fecha_programada })) },
    },
    requiere_confirmacion: true,
  };
}

export const proponerCambioEstadoTool: Herramienta<EntradaEstado> = {
  nombre: "proponer_cambio_estado_programaciones",
  modulo: "programaciones",
  tipo: "accion",
  descripcion: "Prepara marcar programaciones pendientes como ejecutadas o canceladas. Requiere confirmación; advierte si no tienen asiento aplicado.",
  parametros: s.objeto(
    { empresa_id: s.uuid("Empresa"), programacion_ids: s.lista(s.uuid("Programación"), "Programaciones", 200), estado_nuevo: s.enumerado(["ejecutado", "cancelado"], "Nuevo estado") },
    ["programacion_ids", "estado_nuevo"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Solo desde pendiente", "Control optimista de monto y fecha"],
  devuelve: "Propuesta; ejecuta rafa_cambiar_estado_programaciones al confirmar.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_cambio_estado_programaciones", e),
};
registrarAccion({ herramienta: "proponer_cambio_estado_programaciones", preparar: prepararEstado });

// ===========================================================================
// 5. Contabilizar asientos en borrador (solo a petición expresa)
// ===========================================================================
async function prepararAplicar(ctx: Contexto, e: { empresa_id?: string; asiento_ids: string[] }): Promise<Preparacion> {
  exigirContable(ctx, "aplicar asientos");
  const empresa = await resolverEmpresa(ctx, e.empresa_id);
  const asientos = await leerPorIds<any>(ctx, "asientos_contables", "id, empresa_id, numero_asiento, fecha, estado, total_debe, total_haber, updated_at", "id", e.asiento_ids);
  const movs = await leerPorIds<any>(ctx, "asiento_movimientos", "asiento_id, debe, haber, presupuesto_id, cuentas_contables:cuenta_id(nombre)", "asiento_id", e.asiento_ids);
  const errores: string[] = [];
  if (asientos.length !== new Set(e.asiento_ids).size) errores.push("Algún asiento no existe o no es visible.");
  asientos.forEach((a) => {
    if (a.empresa_id !== empresa.id) errores.push(`El asiento #${a.numero_asiento} es de otra empresa.`);
    if (a.estado !== "borrador") errores.push(`El asiento #${a.numero_asiento} está ${a.estado}.`);
    const t = totalesAsiento(movs.filter((m) => m.asiento_id === a.id).map((m) => ({ debe: numeroFinito(m.debe), haber: numeroFinito(m.haber) })));
    if (!t.balanced || t.totalDebe === 0) errores.push(`El asiento #${a.numero_asiento} no está cuadrado o no tiene renglones.`);
  });
  if (errores.length) return fallo(errores);
  const conIva = movs.filter((m) => /iva/i.test(m.cuentas_contables?.nombre || "")).length;
  return {
    ok: true,
    descripcion: `CONTABILIZAR (aplicar) ${asientos.length} asiento(s): ${asientos.map((a) => `#${a.numero_asiento}`).join(", ")}`,
    vista_previa: {
      resumen: `${asientos.length} asientos pasarán de borrador a aplicado.`,
      tablas: [
        {
          titulo: "Asientos a aplicar",
          columnas: [
            { clave: "numero", etiqueta: "#" },
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "total", etiqueta: "Total", tipo: "moneda" },
          ],
          filas: asientos.map((a) => ({ numero: a.numero_asiento, fecha: a.fecha, total: numeroFinito(a.total_debe), _enlace: enlaces.asiento(a.id) })),
        },
      ],
      advertencias: conIva ? ["Hay renglones en cuentas de IVA: al aplicar se generarán flujos de IVA automáticos."] : [],
      efectos: ["Cuentan en ejercido de sus partidas, saldos de cuentas y reportes.", "Para revertir habrá que cancelarlos en la pantalla de Asientos."],
    },
    huella_datos: asientos.map((a) => [a.id, a.estado, a.updated_at, a.total_debe]).sort(),
    registros_afectados: asientos.map((a) => ref("asiento", a.id, `Asiento #${a.numero_asiento}`, enlaces.asiento(a.id))),
    rpc: { nombre: "rafa_aplicar_asientos", args: { p_asientos: asientos.map((a) => ({ id: a.id, updated_at: a.updated_at })) } },
    requiere_confirmacion: true,
  };
}

export const proponerAplicarAsientosTool: Herramienta<{ empresa_id?: string; asiento_ids: string[] }> = {
  nombre: "proponer_aplicar_asientos",
  modulo: "asientos",
  tipo: "accion",
  descripcion:
    "Prepara CONTABILIZAR asientos en borrador (borrador → aplicado). Úsala SOLO si el usuario pide expresamente aplicar/contabilizar; nunca para borradores recién solicitados. Requiere confirmación.",
  parametros: s.objeto({ empresa_id: s.uuid("Empresa"), asiento_ids: s.lista(s.uuid("Asiento"), "Asientos en borrador", 50) }, ["asiento_ids"]),
  roles: ROLES_CONTABLES,
  validaciones: ["Solo borradores cuadrados de la empresa", "Control optimista por updated_at"],
  devuelve: "Propuesta; ejecuta rafa_aplicar_asientos al confirmar.",
  confirmacion: "siempre",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_aplicar_asientos", e),
};
registrarAccion({ herramienta: "proponer_aplicar_asientos", preparar: prepararAplicar });

// ===========================================================================
// 6. Tarea de proyecto
// ===========================================================================
interface EntradaTarea {
  proyecto_id: string;
  titulo: string;
  notas?: string;
  fecha_vencimiento?: string;
  responsable_tercero_id?: string;
  permitir_duplicado?: boolean;
}

async function prepararTarea(ctx: Contexto, e: EntradaTarea): Promise<Preparacion> {
  exigirContable(ctx, "crear tareas de proyecto");
  await exigirVerProyecto(ctx, e.proyecto_id);
  const proyecto = await leerProyecto(ctx, e.proyecto_id);
  if (!proyecto.activo) return fallo(["El proyecto está inactivo."]);
  const { data: iguales } = await ctx.db.from("proyecto_tareas").select("id, estado").eq("proyecto_id", e.proyecto_id).ilike("titulo", e.titulo.trim());
  if ((iguales || []).some((t: any) => t.estado !== "hecho") && !e.permitir_duplicado) {
    return fallo([`Ya existe una tarea abierta llamada "${e.titulo}" en ${proyecto.nombre}.`]);
  }
  return {
    ok: true,
    descripcion: `Crear la tarea "${e.titulo.trim()}" en ${proyecto.nombre}`,
    vista_previa: {
      resumen: `Nueva tarea pendiente en ${proyecto.nombre}.`,
      tablas: [
        {
          titulo: "Tarea",
          columnas: [{ clave: "titulo", etiqueta: "Título" }, { clave: "fecha_vencimiento", etiqueta: "Vence", tipo: "fecha" }, { clave: "notas", etiqueta: "Notas" }],
          filas: [{ titulo: e.titulo.trim(), fecha_vencimiento: e.fecha_vencimiento ?? null, notas: e.notas ?? null }],
        },
      ],
      advertencias: [],
      efectos: ["Aparece en el tablero de tareas del proyecto."],
    },
    huella_datos: { proyecto: proyecto.id, iguales: (iguales || []).length },
    registros_afectados: [ref("proyecto", proyecto.id, proyecto.nombre, enlaces.proyecto(proyecto.id))],
    rpc: { nombre: "rafa_crear_tarea", args: { p_tarea: { proyecto_id: e.proyecto_id, titulo: e.titulo.trim(), notas: e.notas ?? null, fecha_vencimiento: e.fecha_vencimiento ?? null, responsable_tercero_id: e.responsable_tercero_id ?? null } } },
    requiere_confirmacion: false,
  };
}

export const proponerTareaTool: Herramienta<EntradaTarea> = {
  nombre: "proponer_tarea",
  modulo: "proyectos",
  tipo: "accion",
  descripcion: "Crea una tarea pendiente en un proyecto (operación no financiera: se ejecuta sin confirmación adicional y queda registrada). Evita duplicar títulos abiertos.",
  parametros: s.objeto(
    {
      proyecto_id: s.uuid("Proyecto"),
      titulo: s.texto("Título", 200),
      notas: s.texto("Notas", 1000),
      fecha_vencimiento: s.fecha("Vencimiento"),
      responsable_tercero_id: s.uuid("Responsable (tercero de la empresa)"),
      permitir_duplicado: s.booleano("Permitir aunque exista una tarea abierta con el mismo título"),
    },
    ["proyecto_id", "titulo"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador (RLS de tareas)", "Proyecto activo", "Responsable de la empresa"],
  devuelve: "Tarea creada (rafa_crear_tarea).",
  confirmacion: "nunca",
  ejecutar: (ctx, e) => proponerAccion(ctx, "proponer_tarea", e),
};
registrarAccion({ herramienta: "proponer_tarea", preparar: prepararTarea });
