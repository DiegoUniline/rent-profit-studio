import { describe, expect, it } from "vitest";
import { resolverFlujosEfectivos } from "@/lib/project-utils";
import {
  moverMovimientos,
  ordenarPartidas,
  programarMonto,
  ubicarPartida,
} from "../../supabase/functions/_shared/rafa/herramientas/reprogramacion";

describe("dirección del flujo según el tipo de la partida", () => {
  it("los pagos de una partida de proyecto de Ingreso salen como ingreso", () => {
    const ids = new Set(["ing", "egr"]);
    const propias = new Map([
      ["ing", { pagos: [{ fecha: "2026-11-01", monto: 100 }] }],
      ["egr", { pagos: [{ fecha: "2026-11-01", monto: 50 }] }],
    ]);
    const tipos = new Map([["ing", "ingreso"], ["egr", "egreso"]]);
    const r = resolverFlujosEfectivos([], propias, ids, ids, tipos);
    expect(r.find((f) => f.presupuesto_id === "ing")?.tipo).toBe("ingreso");
    expect(r.find((f) => f.presupuesto_id === "egr")?.tipo).toBe("egreso");
  });

  it("un flujo legacy capturado como egreso de una partida de Ingreso (cuenta 4xx) sale como ingreso", () => {
    const legacy = [{ presupuesto_id: "ventas", fecha: "2026-11-01", monto: 10, tipo: "egreso" }];
    const r = resolverFlujosEfectivos(legacy, new Map(), new Set(), new Set(["ventas"]), new Map([["ventas", "ingreso"]]));
    expect(r[0].tipo).toBe("ingreso");
  });

  it("sin tipo de la partida (pendiente / no afecta) conserva el del flujo; sin mapa, pagos de proyecto = egreso", () => {
    const legacy = [{ presupuesto_id: "x", fecha: "2026-11-01", monto: 10, tipo: "ingreso" }];
    expect(resolverFlujosEfectivos(legacy, new Map(), new Set(), undefined, new Map([["x", "no_afecta"]]))[0].tipo).toBe("ingreso");
    const ids = new Set(["p"]);
    expect(resolverFlujosEfectivos([], new Map([["p", { pagos: [{ fecha: "2026-11-01", monto: 1 }] }]]), ids)[0].tipo).toBe("egreso");
  });
});

describe("reprogramación masiva", () => {
  const partidas = ordenarPartidas([
    { id: "3", partida: "Manzana 7 lote 10", orden: null },
    { id: "2", partida: "Manzana 7 lote 9", orden: null },
    { id: "1", partida: "Preliminares", orden: 1 },
    { id: "4", partida: "Manzana 7 lote 51", orden: null },
  ]);

  it("ordena por orden y luego por nombre con números naturales", () => {
    expect(partidas.map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("ubica partidas por nombre exacto o parcial único y avisa ambigüedad", () => {
    expect(ubicarPartida(partidas, "manzana 7 LOTE 9")).toEqual({ indice: 1 });
    expect(ubicarPartida(partidas, "lote 51")).toEqual({ indice: 3 });
    expect(ubicarPartida(partidas, "lote 1")).toEqual({ error: expect.stringContaining("No encontré") });
    expect("error" in ubicarPartida(partidas, "manzana 7")).toBe(true);
    expect("error" in ubicarPartida(partidas, "cimentación")).toBe(true);
  });

  const actuales = [
    { fecha: "2026-01-15", monto: 100, concepto: "Pago 1", es_anticipo: false },
    { fecha: "2026-02-15", monto: 100, concepto: "Pago 2", es_anticipo: false },
    { fecha: "2026-03-15", monto: 100, concepto: "Pago 3", es_anticipo: false },
  ];

  it("mover conserva la separación desde la nueva fecha", () => {
    expect(moverMovimientos(actuales, { modo: "mover", fecha_inicio: "2026-06-15" }).map((m) => m.fecha)).toEqual([
      "2026-06-15",
      "2026-07-16",
      "2026-08-13",
    ]);
  });

  it("mover con fecha fin reparte proporcionalmente entre ambas fechas", () => {
    expect(moverMovimientos(actuales, { modo: "mover", fecha_inicio: "2026-06-01", fecha_fin: "2026-06-30" }).map((m) => m.fecha)).toEqual([
      "2026-06-01",
      "2026-06-16",
      "2026-06-30",
    ]);
  });

  it("recorrer corre cada pago N meses conservando el día", () => {
    expect(moverMovimientos(actuales, { modo: "recorrer", meses: 2 }).map((m) => m.fecha)).toEqual(["2026-03-15", "2026-04-15", "2026-05-15"]);
    expect(moverMovimientos(actuales, { modo: "recorrer", dias: -15 }).map((m) => m.fecha)).toEqual(["2025-12-31", "2026-01-31", "2026-02-28"]);
  });

  it("programa un monto sin perder centavos: por frecuencia, mensual hasta fecha fin o un solo pago", () => {
    const porFrecuencia = programarMonto(100, { fecha_inicio: "2026-01-31", frecuencia: "mensual", numero_pagos: 3 });
    expect(porFrecuencia.map((m) => m.fecha)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(porFrecuencia.reduce((t, m) => t + m.monto, 0)).toBeCloseTo(100, 2);
    expect(programarMonto(90, { fecha_inicio: "2026-01-10", fecha_fin: "2026-03-05" }).map((m) => m.fecha)).toEqual(["2026-01-10", "2026-02-10"]);
    expect(programarMonto(90, { fecha_inicio: "2026-01-10" })).toEqual([{ fecha: "2026-01-10", monto: 90, concepto: "Pago 1", es_anticipo: false }]);
    expect(programarMonto(0, { fecha_inicio: "2026-01-10" })).toEqual([]);
  });
});
