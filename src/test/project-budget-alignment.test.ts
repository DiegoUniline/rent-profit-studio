import { describe, expect, it } from "vitest";
import {
  calcularMontoPresupuestado,
  calcularProyectadoPorPartida,
  resolverFlujosEfectivos,
} from "@/lib/project-utils";

const fecha = "2026-08-29";

function totalPorPartida(
  flujos: { presupuesto_id: string | null; fecha: string; monto: number }[],
  presupuestoId: string
) {
  return calcularProyectadoPorPartida(flujos).get(presupuestoId) || 0;
}

describe("alineación Proyectos / Presupuestos", () => {
  it("partida Project sin programación muestra $0 aunque exista un flujo legacy de $1", () => {
    const legacy = [{ presupuesto_id: "partida-1", fecha, monto: 1, tipo: "egreso" }];
    const idsProject = new Set(["partida-1"]);

    const efectivos = resolverFlujosEfectivos(legacy, new Map(), idsProject, idsProject);

    expect(totalPorPartida(efectivos, "partida-1")).toBe(0);
    expect(calcularMontoPresupuestado(null, undefined)).toBe(0);
  });

  it("partida con una única programación coincide con su presupuesto vigente", () => {
    const presupuesto = calcularMontoPresupuestado("2", "50");
    const idsProject = new Set(["partida-1"]);
    const propias = new Map([
      ["partida-1", { pagos: [{ fecha, monto: presupuesto }] }],
    ]);

    const efectivos = resolverFlujosEfectivos([], propias, idsProject, idsProject);

    expect(totalPorPartida(efectivos, "partida-1")).toBe(presupuesto);
  });

  it("ignora registros históricos legacy y toma solo la programación vigente", () => {
    const legacy = [
      { presupuesto_id: "partida-1", fecha: "2025-01-01", monto: 1, tipo: "egreso" },
      { presupuesto_id: "partida-1", fecha: "2025-02-01", monto: 99, tipo: "egreso" },
    ];
    const idsProject = new Set(["partida-1"]);
    const propias = new Map([
      ["partida-1", { pagos: [{ fecha, monto: 500 }] }],
    ]);

    const efectivos = resolverFlujosEfectivos(legacy, propias, idsProject, idsProject);

    expect(totalPorPartida(efectivos, "partida-1")).toBe(500);
  });

  it("no mezcla partidas con el mismo nombre en proyectos distintos", () => {
    const idsProject = new Set(["proyecto-a/siembra", "proyecto-b/siembra"]);
    const propias = new Map([
      ["proyecto-a/siembra", { pagos: [{ fecha, monto: 300 }] }],
      ["proyecto-b/siembra", { pagos: [{ fecha, monto: 700 }] }],
    ]);

    const efectivos = resolverFlujosEfectivos([], propias, idsProject, idsProject);

    expect(totalPorPartida(efectivos, "proyecto-a/siembra")).toBe(300);
    expect(totalPorPartida(efectivos, "proyecto-b/siembra")).toBe(700);
  });

  it("excluye presupuestos inactivos, cancelados o eliminados del alcance vigente", () => {
    const legacy = [
      { presupuesto_id: "activa", fecha, monto: 200, tipo: "egreso" },
      { presupuesto_id: "inactiva", fecha, monto: 900, tipo: "egreso" },
    ];
    const idsProject = new Set(["activa"]);
    const vigentes = new Set(["activa"]);
    const propias = new Map([
      ["inactiva", { pagos: [{ fecha, monto: 900 }] }],
    ]);

    const efectivos = resolverFlujosEfectivos(legacy, propias, idsProject, vigentes);

    expect(totalPorPartida(efectivos, "inactiva")).toBe(0);
    expect(totalPorPartida(efectivos, "activa")).toBe(0);
  });

  it("una actualización reemplaza el total anterior sin duplicarlo", () => {
    const legacyAnterior = [{ presupuesto_id: "partida-1", fecha, monto: 100, tipo: "egreso" }];
    const idsProject = new Set(["partida-1"]);
    const programacionActual = new Map([
      ["partida-1", { pagos: [{ fecha, monto: 120 }] }],
    ]);

    const efectivos = resolverFlujosEfectivos(legacyAnterior, programacionActual, idsProject, idsProject);

    expect(totalPorPartida(efectivos, "partida-1")).toBe(120);
  });
});
