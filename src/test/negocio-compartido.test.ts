import { describe, expect, it } from "vitest";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import {
  calcularFechasPorFrecuencia,
  semanaDe,
  esFechaIso,
  isoLocal,
} from "../../supabase/functions/_shared/negocio/fechas";
import {
  calcularEjercidoPorNaturaleza,
  calcularEjercidoPorPartida,
  distribuirSaldoEntrePeriodos,
  distribuirUnidades,
} from "../../supabase/functions/_shared/negocio/calculos";

describe("fechas compartidas (equivalencia con date-fns)", () => {
  const inicios = ["2026-01-31", "2026-02-28", "2024-02-29", "2026-03-15", "2026-12-31", "2026-10-25"];
  const casos = [
    ["semanal", (d: Date, i: number) => addWeeks(d, i)],
    ["quincenal", (d: Date, i: number) => addDays(d, i * 15)],
    ["mensual", (d: Date, i: number) => addMonths(d, i)],
    ["trimestral", (d: Date, i: number) => addMonths(d, i * 3)],
    ["semestral", (d: Date, i: number) => addMonths(d, i * 6)],
    ["anual", (d: Date, i: number) => addYears(d, i)],
  ] as const;

  for (const inicio of inicios) {
    for (const [frecuencia, referencia] of casos) {
      it(`${frecuencia} desde ${inicio}`, () => {
        const base = new Date(inicio + "T00:00:00");
        const propias = calcularFechasPorFrecuencia(base, frecuencia, 30).map(isoLocal);
        const esperadas = Array.from({ length: 30 }, (_, i) => isoLocal(referencia(base, i)));
        expect(propias).toEqual(esperadas);
      });
    }
  }

  it("semana lunes a domingo y validación ISO", () => {
    expect(semanaDe("2026-10-15")).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(semanaDe("2026-10-18")).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(esFechaIso("2026-02-30")).toBe(false);
    expect(esFechaIso("2026-02-28")).toBe(true);
  });
});

describe("proyección por unidades", () => {
  it("550 en lotes de 15: 36 periodos de 15 y uno de 10", () => {
    const periodos = distribuirUnidades(550, 15);
    expect(periodos.length).toBe(37);
    expect(periodos.filter((p) => p === 15).length).toBe(36);
    expect(periodos[36]).toBe(10);
    expect(periodos.reduce((s, p) => s + p, 0)).toBe(550);
  });

  it("total múltiplo exacto no agrega periodo vacío", () => {
    expect(distribuirUnidades(30, 15)).toEqual([15, 15]);
    expect(distribuirUnidades(0, 15)).toEqual([]);
  });

  it("reparto de saldo conserva centavos", () => {
    const montos = distribuirSaldoEntrePeriodos(1000, 3);
    expect(montos).toEqual([333.33, 333.33, 333.34]);
  });
});

describe("dos métodos de ejercido documentados", () => {
  const movs = [
    { asiento_id: "a1", presupuesto_id: "p", debe: 1000, haber: 0, cuenta_codigo: "600-001", estado_asiento: "aplicado" },
    { asiento_id: "a1", presupuesto_id: "p", debe: 0, haber: 1000, cuenta_codigo: "100-001", estado_asiento: "aplicado" },
    { asiento_id: "a2", presupuesto_id: "p", debe: 500, haber: 0, cuenta_codigo: "600-001", estado_asiento: "borrador" },
  ];

  it("por naturaleza (Presupuestos) cuenta solo el lado de la cuenta de la partida", () => {
    expect(calcularEjercidoPorNaturaleza(movs, "600-001-001-001")).toBe(1000);
  });

  it("debe+haber (Proyectos) suma ambos lados de los renglones ligados", () => {
    const mapa = calcularEjercidoPorPartida(movs, [
      { id: "a1", estado: "aplicado" },
      { id: "a2", estado: "borrador" },
    ]);
    expect(mapa.get("p")).toBe(2000);
  });
});
