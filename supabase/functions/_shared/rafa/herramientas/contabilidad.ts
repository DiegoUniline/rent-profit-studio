/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, exigirContable } from "../permisos.ts";
import { enlaces, leerPorIds, leerTodo, ref, resolverEmpresa } from "../datos.ts";
import { calcularSaldosCuentas } from "../../negocio/contabilidad.ts";
import { numeroFinito } from "../../negocio/calculos.ts";
import { moneda, r2, textoBusqueda } from "./util.ts";

export const consultarAsientosTool: Herramienta<{
  empresa_id?: string;
  desde: string;
  hasta: string;
  estado?: string;
  tipo?: string;
  centro_negocio_id?: string;
  tercero_id?: string;
  presupuesto_id?: string;
  texto?: string;
}> = {
  nombre: "consultar_asientos",
  modulo: "asientos",
  tipo: "consulta",
  descripcion:
    "Lista asientos contables (pólizas) de una empresa en un periodo con totales por estado; filtra por estado, tipo, centro, tercero, partida ligada u observaciones.",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      desde: s.fecha("Desde"),
      hasta: s.fecha("Hasta"),
      estado: s.enumerado(["borrador", "aplicado", "cancelado"], "Estado"),
      tipo: s.enumerado(["ingreso", "egreso", "diario"], "Tipo"),
      centro_negocio_id: s.uuid("Centro"),
      tercero_id: s.uuid("Tercero"),
      presupuesto_id: s.uuid("Solo asientos con renglones ligados a esta partida"),
      texto: s.texto("Texto en observaciones", 80),
    },
    ["desde", "hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única"],
  devuelve: "Asientos con enlaces, totales y alcance.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    let idsPartida: string[] | null = null;
    if (e.presupuesto_id) {
      const movs = await leerPorIds<any>(ctx, "asiento_movimientos", "asiento_id", "presupuesto_id", [e.presupuesto_id]);
      idsPartida = Array.from(new Set(movs.map((m) => m.asiento_id)));
    }
    const texto = textoBusqueda(e.texto);
    const { filas, truncado } = await leerTodo<any>(() => {
      let q = ctx.db
        .from("asientos_contables")
        .select("id, numero_asiento, fecha, tipo, estado, observaciones, total_debe, total_haber, terceros:tercero_id(razon_social), centros_negocio:centro_negocio_id(nombre)")
        .eq("empresa_id", empresa.id)
        .gte("fecha", e.desde)
        .lte("fecha", e.hasta)
        .order("fecha")
        .order("numero_asiento");
      if (e.estado) q = q.eq("estado", e.estado);
      if (e.tipo) q = q.eq("tipo", e.tipo);
      if (e.centro_negocio_id) q = q.eq("centro_negocio_id", e.centro_negocio_id);
      if (e.tercero_id) q = q.eq("tercero_id", e.tercero_id);
      if (texto) q = q.ilike("observaciones", `%${texto}%`);
      if (idsPartida) q = q.in("id", idsPartida.length ? idsPartida.slice(0, 300) : ["00000000-0000-0000-0000-000000000000"]);
      return q;
    }, 5000);
    const porEstado: Record<string, { cantidad: number; total: number }> = {};
    filas.forEach((a) => {
      porEstado[a.estado] = porEstado[a.estado] || { cantidad: 0, total: 0 };
      porEstado[a.estado].cantidad++;
      porEstado[a.estado].total = r2(porEstado[a.estado].total + numeroFinito(a.total_debe));
    });
    const muestra = filas.slice(0, 150);
    return {
      ok: true,
      tipo: "consulta",
      resumen: `${filas.length} asientos de ${empresa.nombre} entre ${e.desde} y ${e.hasta}${e.estado ? ` en estado ${e.estado}` : ""}.`,
      alcance: {
        empresa,
        periodo: { desde: e.desde, hasta: e.hasta },
        filtros: { estado: e.estado, tipo: e.tipo, centro_negocio_id: e.centro_negocio_id, tercero_id: e.tercero_id, presupuesto_id: e.presupuesto_id, texto },
        registros: filas.length,
        total: filas.length,
        truncado: truncado || (idsPartida !== null && idsPartida.length > 300),
        nota: muestra.length < filas.length ? `Se listan ${muestra.length}; los totales cubren los ${filas.length}.` : undefined,
      },
      datos: {
        por_estado: porEstado,
        asientos: muestra.map((a) => ({ id: a.id, numero: a.numero_asiento, fecha: a.fecha, tipo: a.tipo, estado: a.estado, observaciones: a.observaciones, total: numeroFinito(a.total_debe), tercero: a.terceros?.razon_social, centro: a.centros_negocio?.nombre })),
      },
      tablas: [
        {
          titulo: `Asientos ${e.desde} a ${e.hasta}`,
          columnas: [
            { clave: "numero", etiqueta: "#" },
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "estado", etiqueta: "Estado" },
            { clave: "observaciones", etiqueta: "Observaciones" },
            { clave: "total", etiqueta: "Total", tipo: "moneda" },
          ],
          filas: muestra.map((a) => ({ numero: a.numero_asiento, fecha: a.fecha, tipo: a.tipo, estado: a.estado, observaciones: a.observaciones, total: numeroFinito(a.total_debe), _enlace: enlaces.asiento(a.id) })),
        },
      ],
      referencias: muestra.slice(0, 50).map((a) => ref("asiento", a.id, `Asiento #${a.numero_asiento}`, enlaces.asiento(a.id))),
    };
  },
};

export const saldosCuentasTool: Herramienta<{ empresa_id?: string; desde?: string; hasta: string; codigo_prefijo?: string; solo_con_movimiento?: boolean }> = {
  nombre: "saldos_cuentas",
  modulo: "cuentas",
  tipo: "consulta",
  descripcion:
    "Balanza de comprobación de una empresa (saldo inicial, debe, haber, saldo final por cuenta) con la misma fórmula de los reportes: solo asientos aplicados; saldo según naturaleza. Puede filtrar por prefijo de código (por ejemplo 100-001 para bancos).",
  parametros: s.objeto(
    {
      empresa_id: s.uuid("Empresa"),
      desde: s.fecha("Inicio del periodo (sin él, todo es periodo)"),
      hasta: s.fecha("Fecha de corte"),
      codigo_prefijo: s.texto("Prefijo de código de cuenta", 20),
      solo_con_movimiento: s.booleano("Omitir cuentas sin saldo ni movimiento"),
    },
    ["hasta"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Empresa explícita o única", "Lectura paginada de todos los movimientos aplicados de la empresa hasta la fecha de corte"],
  devuelve: "Saldos por cuenta y totales por rubro.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const empresa = await resolverEmpresa(ctx, e.empresa_id);
    const prefijo = (e.codigo_prefijo || "").replace(/[^0-9-]/g, "");
    const cuentas = await leerTodo<any>(() => {
      let q = ctx.db.from("cuentas_contables").select("id, codigo, nombre, naturaleza, clasificacion, nivel, cuenta_padre_id, activa").eq("empresa_id", empresa.id).order("codigo");
      if (prefijo) q = q.like("codigo", `${prefijo}%`);
      return q;
    });
    const asientos = await leerTodo<any>(() =>
      ctx.db.from("asientos_contables").select("id, fecha, tipo, estado, empresa_id").eq("empresa_id", empresa.id).eq("estado", "aplicado").lte("fecha", e.hasta).order("id")
    );
    const idsCuentas = cuentas.filas.map((c) => c.id);
    const movimientos = idsCuentas.length
      ? await leerPorIds<any>(ctx, "asiento_movimientos", "id, asiento_id, cuenta_id, debe, haber, partida, orden", "cuenta_id", idsCuentas)
      : [];
    const saldos = calcularSaldosCuentas(
      cuentas.filas,
      movimientos.map((m) => ({ ...m, debe: numeroFinito(m.debe), haber: numeroFinito(m.haber) })),
      asientos.filas,
      e.desde ? new Date(e.desde + "T00:00:00") : null,
      new Date(e.hasta + "T00:00:00")
    ).filter((x) => !e.solo_con_movimiento || x.saldo_inicial !== 0 || x.debe !== 0 || x.haber !== 0 || x.saldo_final !== 0);
    const filas = saldos.map((x) => ({ ...x, saldo_inicial: r2(x.saldo_inicial), debe: r2(x.debe), haber: r2(x.haber), saldo_final: r2(x.saldo_final) }));
    const totalSaldo = filas.filter((f) => f.clasificacion === "saldo").reduce((acc, f) => acc + f.saldo_final, 0);
    return {
      ok: true,
      tipo: "consulta",
      resumen: `Balanza de ${empresa.nombre} al ${e.hasta}${prefijo ? ` (cuentas ${prefijo}*)` : ""}: ${filas.length} cuentas; suma de saldos finales de cuentas de saldo ${moneda(totalSaldo)}.`,
      alcance: {
        empresa,
        periodo: { desde: e.desde ?? "", hasta: e.hasta },
        filtros: { codigo_prefijo: prefijo || null },
        registros: movimientos.length,
        total: movimientos.length,
        truncado: cuentas.truncado || asientos.truncado,
        nota: "Solo asientos aplicados. Saldo según naturaleza de la cuenta.",
      },
      datos: { cuentas: filas.slice(0, 200) },
      tablas: [
        {
          titulo: "Balanza de comprobación",
          columnas: [
            { clave: "codigo", etiqueta: "Código" },
            { clave: "nombre", etiqueta: "Cuenta" },
            { clave: "saldo_inicial", etiqueta: "Saldo inicial", tipo: "moneda" },
            { clave: "debe", etiqueta: "Debe", tipo: "moneda" },
            { clave: "haber", etiqueta: "Haber", tipo: "moneda" },
            { clave: "saldo_final", etiqueta: "Saldo final", tipo: "moneda" },
          ],
          filas: filas.slice(0, 200).map((f) => ({ ...f, _enlace: enlaces.cuenta(f.cuenta_id) })),
        },
      ],
    };
  },
};
