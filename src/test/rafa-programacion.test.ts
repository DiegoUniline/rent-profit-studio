import { describe, expect, it } from "vitest";
import {
  compararProgramacionContraPresupuesto,
  validarRespaldoPresupuestal,
  type PartidaComparable,
  type ProgramacionComparable,
} from "../../supabase/functions/_shared/negocio/programacion";
import { validarAsiento } from "../../supabase/functions/_shared/negocio/asientos";

const partida = (id: string, monto: number, extra: Partial<PartidaComparable> = {}): PartidaComparable => ({
  id,
  partida: id,
  empresa_id: "E1",
  centro_negocio_id: "C1",
  activo: true,
  es_project: false,
  tipo_movimiento: "egreso",
  cantidad: 1,
  precio_unitario: monto,
  ...extra,
});
const prog = (id: string, fecha: string, monto: number, extra: Partial<ProgramacionComparable> = {}): ProgramacionComparable => ({
  id,
  empresa_id: "E1",
  centro_negocio_id: "C1",
  presupuesto_id: "A",
  fecha_programada: fecha,
  monto,
  tipo: "egreso",
  estado: "pendiente",
  asiento_id: null,
  ...extra,
});
const ventana = { desde: "2026-10-12", hasta: "2026-10-18" };

describe("comparación programación vs presupuesto", () => {
  it("acumula ejercido, pendientes previos y la semana en orden de fecha", () => {
    const r = compararProgramacionContraPresupuesto(
      ventana,
      [prog("p0", "2026-10-01", 10), prog("p2", "2026-10-15", 30), prog("p1", "2026-10-13", 50), prog("p9", "2026-10-25", 999)],
      [partida("A", 100)],
      new Map([["A", 20]])
    );
    const a = r.partidas[0];
    expect([a.pendiente_previo, a.programado_ventana, a.consumido_final, a.disponible_final]).toEqual([10, 80, 110, -10]);
    expect(a.filas.map((f) => f.programacion_id)).toEqual(["p1", "p2"]);
    expect(a.primera_excedida).toBe("p2");
  });

  it("no cuenta dos veces: excluye pendientes con asiento aplicado, ejecutadas y canceladas", () => {
    const r = compararProgramacionContraPresupuesto(
      ventana,
      [
        prog("conAsiento", "2026-10-13", 50, { asiento_id: "x", asiento_estado: "aplicado" }),
        prog("borrador", "2026-10-13", 5, { asiento_id: "y", asiento_estado: "borrador" }),
        prog("ejec", "2026-10-14", 40, { estado: "ejecutado" }),
        prog("canc", "2026-10-14", 70, { estado: "cancelado" }),
      ],
      [partida("A", 100)],
      new Map([["A", 50]])
    );
    expect(r.partidas[0].consumido_final).toBe(55);
    expect(r.excluidas_por_asiento_aplicado.map((x) => x.programacion_id)).toEqual(["conAsiento"]);
    expect(r.ejecutadas_en_ventana.map((x) => x.programacion_id)).toEqual(["ejec"]);
    expect(r.totales.programaciones_en_ventana).toBe(3);
  });

  it("reporta excepciones en vez de compararlas", () => {
    const r = compararProgramacionContraPresupuesto(
      ventana,
      [
        prog("sin", "2026-10-13", 1, { presupuesto_id: null }),
        prog("inactiva", "2026-10-13", 2, { presupuesto_id: "I" }),
        prog("otraEmpresa", "2026-10-13", 3, { presupuesto_id: "O" }),
        prog("otroCentro", "2026-10-13", 4, { presupuesto_id: "C" }),
      ],
      [partida("I", 10, { activo: false }), partida("O", 10, { empresa_id: "E2" }), partida("C", 10, { centro_negocio_id: "C2" })],
      new Map()
    );
    expect(r.excepciones.map((x) => x.motivo)).toEqual(["sin_partida", "partida_inactiva", "partida_otra_empresa", "partida_otro_centro"]);
    expect(r.partidas).toHaveLength(0);
  });
});

describe("respaldo presupuestal de nuevas programaciones", () => {
  const nueva = (monto: number, presupuesto_id: string | null = "A") => ({
    presupuesto_id,
    empresa_id: "E1",
    centro_negocio_id: "C1",
    tipo: "egreso",
    fecha_programada: "2026-11-01",
    monto,
  });
  it("acepta dentro del disponible y rechaza sin partida o con exceso", () => {
    const existentes = [prog("p", "2026-10-01", 30)];
    expect(validarRespaldoPresupuestal([nueva(50)], existentes, [partida("A", 100)], new Map([["A", 20]])).ok).toBe(true);
    const exceso = validarRespaldoPresupuestal([nueva(60)], existentes, [partida("A", 100)], new Map([["A", 20]]));
    expect(exceso.ok).toBe(false);
    expect(exceso.detalle[0].disponible_tras).toBe(-10);
    expect(validarRespaldoPresupuestal([nueva(1, null)], [], [], new Map()).errores[0]).toMatch(/requiere partida/);
  });
});

describe("validación compartida de asientos", () => {
  const cab = { empresa_id: "E1", fecha: "2026-10-16", tipo: "egreso", centro_negocio_id: "C1" };
  it("aplica las mismas reglas que la captura manual", () => {
    expect(validarAsiento(cab, [], [])).toMatch(/al menos un movimiento/);
    expect(validarAsiento(cab, [{ cuenta_id: "x", debe: 100, haber: 0 }, { cuenta_id: "y", debe: 0, haber: 90 }], [])).toMatch(/no está cuadrado/);
    expect(validarAsiento({ ...cab, tipo: "diario" }, [{ cuenta_id: "x", debe: 1, haber: 0 }, { cuenta_id: "y", debe: 0, haber: 1 }], [])).toMatch(/diario/);
    const movs = [{ cuenta_id: "x", debe: 1, haber: 0, presupuesto_id: "P" }, { cuenta_id: "y", debe: 0, haber: 1 }];
    const otraCentro = [{ id: "P", empresa_id: "E1", centro_negocio_id: "C2" }];
    expect(validarAsiento(cab, movs, otraCentro)).toMatch(/no pertenecen al centro/);
    expect(validarAsiento(cab, movs, otraCentro, { validarAlcancePartidas: false })).toBeNull();
    expect(validarAsiento(cab, [{ cuenta_id: "x", debe: -1, haber: 0 }, { cuenta_id: "y", debe: 0, haber: -1 }], [], { rechazarNegativos: true })).toMatch(/negativos/);
  });
});
