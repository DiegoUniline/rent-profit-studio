import { describe, expect, it } from "vitest";
import { aplicarAncla, type AnclaConversacion } from "../../supabase/functions/_shared/rafa/ancla";
import { promptSistema } from "../../supabase/functions/_shared/rafa/prompt";
import { nombreSeguro, rutaArchivo } from "../../supabase/functions/_shared/rafa/archivos";
import type { Contexto, Herramienta } from "../../supabase/functions/_shared/rafa/tipos";

const ANCLA: AnclaConversacion = {
  centro_id: "a1000000-0000-0000-0000-000000000002",
  centro_codigo: "CN002",
  centro_nombre: "Oficina Central",
  empresa_id: "e1000000-0000-0000-0000-000000000001",
  empresa_nombre: "Empresa Uno",
  proyecto_id: "91000000-0000-0000-0000-000000000001",
  proyecto_nombre: "Obra Norte",
};
const props = (...claves: string[]) => ({ type: "object" as const, properties: Object.fromEntries(claves.map((k) => [k, { type: "string" as const }])) });
const h = (tipo: Herramienta["tipo"], ...claves: string[]) => ({ tipo, parametros: props(...claves) });

describe("ancla de la conversación (centro de negocio)", () => {
  it("completa empresa y centro en consultas cuando el modelo no los indica", () => {
    expect(aplicarAncla(h("consulta", "empresa_id", "centro_negocio_id", "proyecto_id"), {}, ANCLA)).toEqual({
      empresa_id: ANCLA.empresa_id,
      centro_negocio_id: ANCLA.centro_id,
    });
  });

  it("nunca reemplaza valores explícitos; null en el centro = toda la empresa", () => {
    expect(aplicarAncla(h("consulta", "empresa_id", "centro_negocio_id"), { centro_negocio_id: null }, ANCLA)).toEqual({
      centro_negocio_id: null,
      empresa_id: ANCLA.empresa_id,
    });
    const otro = { centro_negocio_id: "a2000000-0000-0000-0000-000000000001" };
    expect(aplicarAncla(h("consulta", "empresa_id", "centro_negocio_id"), otro, ANCLA)).toEqual(otro);
    const otraEmpresa = { empresa_id: "e2000000-0000-0000-0000-000000000002" };
    expect(aplicarAncla(h("consulta", "empresa_id", "centro_negocio_id"), otraEmpresa, ANCLA)).toEqual(otraEmpresa);
  });

  it("usa el proyecto del centro en herramientas que solo aceptan proyecto, y no toca el alcance de las propuestas", () => {
    expect(aplicarAncla(h("consulta", "proyecto_id"), {}, ANCLA)).toEqual({ proyecto_id: ANCLA.proyecto_id });
    expect(aplicarAncla(h("accion", "empresa_id", "centro_negocio_id"), {}, ANCLA)).toEqual({ empresa_id: ANCLA.empresa_id });
    expect(aplicarAncla(h("consulta", "texto"), { texto: "x" }, ANCLA)).toEqual({ texto: "x" });
  });

  it("sin ancla no cambia nada", () => {
    expect(aplicarAncla(h("consulta", "empresa_id", "centro_negocio_id"), {}, null)).toEqual({});
  });

  it("el prompt dice el centro de la conversación y sus archivos", () => {
    const ctx = { usuario: { roles: ["admin"] }, hoy: "2026-10-23" } as unknown as Contexto;
    const p = promptSistema(ctx, {}, undefined, "¿cómo vamos?", { ancla: ANCLA, archivos: [{ id: "x", nombre: "catalogo.pdf", fecha: "2026-10-22" }] });
    expect(p).toContain("CENTRO DE NEGOCIO DE ESTA CONVERSACIÓN: CN002 · Oficina Central");
    expect(p).toContain(`proyecto_id=${ANCLA.proyecto_id}`);
    expect(p).toContain('"catalogo.pdf" (2026-10-22; id=x)');
    expect(promptSistema(ctx, {}, undefined, "hola")).toContain("CENTRO DE NEGOCIO DE ESTA CONVERSACIÓN: ninguno");
  });

  it("guarda archivos en una ruta por usuario y conversación, con nombre seguro", () => {
    expect(nombreSeguro("catálogo manzana 7 (final).pdf")).toBe("catalogo_manzana_7_final_.pdf");
    expect(rutaArchivo("u1", "c1", "a1", "../x.pdf")).toBe("u1/c1/a1-.._x.pdf");
  });
});
