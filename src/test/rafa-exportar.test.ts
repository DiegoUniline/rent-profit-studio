import { describe, expect, it } from "vitest";
import { datosParaExportar, nombreArchivo } from "@/lib/rafa-exportar";

const tabla = {
  titulo: "Presupuesto vs ejercido",
  columnas: [
    { clave: "partida", etiqueta: "Partida" },
    { clave: "presupuestado", etiqueta: "Presupuestado", tipo: "moneda" as const },
    { clave: "porcentaje", etiqueta: "%", tipo: "porcentaje" as const },
    { clave: "_enlace", etiqueta: "enlace" },
  ],
  filas: [
    { partida: "Cimentación", presupuestado: 100000, porcentaje: 40, _enlace: "/x" },
    { partida: "Renta", presupuestado: 120000, porcentaje: 12.5, _enlace: "/y" },
  ],
  totales: { presupuestado: 220000 },
};

describe("exportar tablas de Rafa", () => {
  it("quita columnas internas, conserva números para Excel y formatea para PDF", () => {
    const d = datosParaExportar(tabla);
    expect(d.encabezados).toEqual(["Partida", "Presupuestado", "%"]);
    expect(d.filas[0]).toEqual(["Cimentación", 100000, 40]);
    expect(d.filasTexto[1]).toEqual(["Renta", "$120,000.00", "12.50%"]);
    expect(d.totales).toEqual(["Total", 220000, ""]);
    expect(d.totalesTexto).toEqual(["Total", "$220,000.00", ""]);
  });

  it("nombre de archivo seguro con fecha", () => {
    expect(nombreArchivo("Presupuesto vs ejercido / Centro", "xlsx")).toMatch(/^Presupuesto_vs_ejercido_Centro_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
