/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { ROLES_CONTABLES, exigirContable } from "../permisos.ts";
import { consultar, resolverEmpresa } from "../datos.ts";
import { distribuirUnidades, numeroFinito } from "../../negocio/calculos.ts";
import { calcularFechasPorFrecuencia, fechaLocal, isoLocal, type FrecuenciaConCadencia } from "../../negocio/fechas.ts";
import { moneda, r2 } from "./util.ts";

interface EntradaUnidades {
  total_unidades: number;
  unidades_por_periodo: number;
  frecuencia: FrecuenciaConCadencia;
  fecha_inicio: string;
  precio_unitario?: number;
  presupuesto_id?: string;
  empresa_id?: string;
  unidad?: string;
}

export const simularProyeccionUnidadesTool: Herramienta<EntradaUnidades> = {
  nombre: "simular_proyeccion_unidades",
  modulo: "presupuestos",
  tipo: "simulacion",
  descripcion:
    "SIMULA (no guarda) una proyección por unidades: reparte un total en periodos de N unidades hasta completarlo (550 en lotes de 15 = 36 periodos de 15 y uno de 10), con fechas según la frecuencia. Si se da un precio unitario o una partida (toma su precio), calcula importes; si no, solo unidades. No contabiliza ingresos ni modifica presupuestos.",
  parametros: s.objeto(
    {
      total_unidades: s.numero("Total de unidades a completar", 0.0001),
      unidades_por_periodo: s.numero("Unidades por periodo", 0.0001),
      frecuencia: s.enumerado(["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"], "Frecuencia"),
      fecha_inicio: s.fecha("Fecha del primer periodo"),
      precio_unitario: s.numero("Precio por unidad (solo si el usuario lo indicó)", 0),
      presupuesto_id: s.uuid("Partida de la que se toma el precio unitario"),
      empresa_id: s.uuid("Empresa de la partida"),
      unidad: s.texto("Nombre de la unidad (lotes, piezas, m2…)", 40),
    },
    ["total_unidades", "unidades_por_periodo", "frecuencia", "fecha_inicio"]
  ),
  roles: ROLES_CONTABLES,
  validaciones: ["Máximo 600 periodos", "Precio solo del usuario o de la partida indicada (nunca supuesto)"],
  devuelve: "Periodos con fecha, unidades, acumulado e importe si hay precio.",
  confirmacion: "nunca",
  async ejecutar(ctx, e) {
    exigirContable(ctx);
    const periodos = distribuirUnidades(e.total_unidades, e.unidades_por_periodo);
    if (periodos.length > 600) return { ok: false, tipo: "error", resumen: "La simulación excede 600 periodos; ajusta las unidades por periodo.", error: "demasiados_periodos" };
    let precio: number | null = e.precio_unitario ?? null;
    let origenPrecio = e.precio_unitario !== undefined ? "indicado por el usuario" : null;
    let partida: any = null;
    if (e.presupuesto_id) {
      const empresa = await resolverEmpresa(ctx, e.empresa_id);
      partida = await consultar<any>(
        ctx.db.from("presupuestos").select("id, partida, cantidad, precio_unitario, unidades_medida:unidad_medida_id(nombre)").eq("id", e.presupuesto_id).eq("empresa_id", empresa.id).maybeSingle()
      );
      if (!partida) return { ok: false, tipo: "error", resumen: "No encontré esa partida en la empresa indicada.", error: "no_encontrado" };
      if (precio === null) {
        precio = numeroFinito(partida.precio_unitario);
        origenPrecio = `precio unitario de la partida "${partida.partida}"`;
      }
    }
    const fechas = calcularFechasPorFrecuencia(fechaLocal(e.fecha_inicio), e.frecuencia, periodos.length);
    let acumulado = 0;
    const filas = periodos.map((u, i) => {
      acumulado += u;
      return {
        periodo: i + 1,
        fecha: isoLocal(fechas[i]),
        unidades: u,
        acumulado: Math.round(acumulado * 1e6) / 1e6,
        importe: precio !== null ? r2(u * precio) : null,
      };
    });
    const completos = periodos.filter((u) => u === e.unidades_por_periodo).length;
    const resto = periodos.length > completos ? periodos[periodos.length - 1] : 0;
    const unidad = e.unidad || partida?.unidades_medida?.nombre || "unidades";
    const totalImporte = precio !== null ? r2(e.total_unidades * precio) : null;
    return {
      ok: true,
      tipo: "simulacion",
      resumen:
        `SIMULACIÓN (no se guardó nada): ${e.total_unidades} ${unidad} a ${e.unidades_por_periodo} por periodo ${e.frecuencia} = ${completos} periodos de ${e.unidades_por_periodo}${resto ? ` y uno de ${resto}` : ""} (${periodos.length} en total), del ${filas[0]?.fecha} al ${filas[filas.length - 1]?.fecha}.` +
        (totalImporte !== null ? ` Importe total ${moneda(totalImporte)} con ${origenPrecio}.` : " Sin precio unitario: indica el precio o la partida para calcular importes."),
      alcance: { registros: filas.length, total: filas.length, truncado: false, nota: "Cálculo determinista; no consulta ni modifica movimientos." },
      datos: { periodos: filas.length, completos, ultimo_periodo: resto || e.unidades_por_periodo, precio_unitario: precio, origen_precio: origenPrecio, total_importe: totalImporte, filas },
      tablas: [
        {
          titulo: `Proyección de ${unidad}`,
          columnas: [
            { clave: "periodo", etiqueta: "#" },
            { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
            { clave: "unidades", etiqueta: "Unidades", tipo: "numero" },
            { clave: "acumulado", etiqueta: "Acumulado", tipo: "numero" },
            ...(precio !== null ? [{ clave: "importe", etiqueta: "Importe", tipo: "moneda" as const }] : []),
          ],
          filas,
          totales: { unidades: e.total_unidades, ...(totalImporte !== null ? { importe: totalImporte } : {}) },
        },
      ],
    };
  },
};
