import { describe, expect, it } from "vitest";
import { conciliarVinculosPresupuesto, type PropuestaEditable } from "@/lib/rafa-types";

function propuesta(descripciones: string[], ids: string[] = []): PropuestaEditable {
  return {
    empresaId: "empresa-1",
    centro: { modo: "existente", id: "centro-1", nombre: "Centro", tipoActividad: "" },
    tercero: { modo: "ninguno", id: "", nombre: "" },
    ivaIncluir: false,
    ivaTasa: 16,
    partidas: descripciones.map((descripcion, indice) => ({
      key: `partida-${indice}`,
      presupuestoId: ids[indice],
      descripcion,
      unidad: "pz",
      cantidad: 1,
      precioUnitario: 100,
      cuentaId: "",
    })),
    programacion: { tipo: "egreso", frecuencia: "mensual", fechaInicio: "2026-08-22", numeroPagos: 1 },
    aplicado: ids.length > 0 ? { centroId: "centro-1", presupuestoIds: ids } : undefined,
  };
}

describe("conciliarVinculosPresupuesto", () => {
  it("conserva los IDs cuando la IA reordena las partidas", () => {
    const guardada = propuesta(["Excavación", "Trazo y nivelación"], ["id-excavacion", "id-trazo"]);
    const actual = propuesta(["Trazo y nivelacion", "Excavacion"]);

    const resultado = conciliarVinculosPresupuesto(actual, guardada);

    expect(resultado.partidas.map((partida) => partida.presupuestoId)).toEqual(["id-trazo", "id-excavacion"]);
  });

  it("conserva el vínculo por posición cuando se corrige por completo el texto", () => {
    const guardada = propuesta(["Concepto anterior"], ["id-existente"]);
    const actual = propuesta(["Concepto totalmente corregido"]);

    expect(conciliarVinculosPresupuesto(actual, guardada).partidas[0].presupuestoId).toBe("id-existente");
  });

  it("mantiene todos los IDs anteriores para dar de baja partidas eliminadas", () => {
    const guardada = propuesta(["Uno", "Dos", "Tres"], ["id-1", "id-2", "id-3"]);
    const actual = propuesta(["Uno", "Tres"]);

    const resultado = conciliarVinculosPresupuesto(actual, guardada);

    expect(resultado.partidas.map((partida) => partida.presupuestoId)).toEqual(["id-1", "id-3"]);
    expect(resultado.aplicado?.presupuestoIds).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("deja una partida adicional sin ID para que sea la única inserción", () => {
    const guardada = propuesta(["Uno", "Dos"], ["id-1", "id-2"]);
    const actual = propuesta(["Uno", "Dos", "Nueva"]);

    expect(conciliarVinculosPresupuesto(actual, guardada).partidas.map((partida) => partida.presupuestoId)).toEqual([
      "id-1",
      "id-2",
      undefined,
    ]);
  });
});