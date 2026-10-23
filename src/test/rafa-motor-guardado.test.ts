import { describe, expect, it, vi } from "vitest";
import type { Contexto } from "../../supabase/functions/_shared/rafa/tipos";

vi.mock("../../supabase/functions/_shared/rafa/registro.ts", () => ({ definicionesParaModelo: () => [], ejecutarHerramienta: vi.fn(), herramientaPorNombre: () => undefined }));
vi.mock("../../supabase/functions/_shared/rafa/prompt.ts", () => ({ promptSistema: () => "Rafa" }));

import { procesarTurno } from "../../supabase/functions/_shared/rafa/motor";

function contextoConFallo(fallo: "usuario" | "contexto" | "asistente") {
  const modelo = vi.fn(async () => ({ content: "Recibido", tool_calls: [] }));
  const db = {
    from: () => {
      const q = {
        select: () => q, eq: () => q, order: () => q,
        maybeSingle: async () => ({ data: { id: "11111111-1111-1111-1111-111111111111", user_id: "usuario-1", contexto: {} } }),
        limit: async () => ({ data: [] }),
      };
      return q;
    },
  };
  const servicio = {
    from: () => ({
      insert: (fila: { rol: string }) => {
        const respuesta = { data: fallo === "asistente" ? null : { id: "respuesta-1" }, error: fallo === fila.rol ? { message: "Escritura rechazada" } : null };
        return { ...respuesta, select: () => ({ single: async () => respuesta }) };
      },
      update: () => {
        const q = { eq: () => q, then: (resolve: (r: unknown) => void) => resolve({ error: fallo === "contexto" ? { message: "Escritura rechazada" } : null }) };
        return q;
      },
    }),
  };
  return { ctx: { db, servicio, usuario: { id: "usuario-1", roles: ["admin"] }, hoy: "2026-10-22", versionConocimiento: "k" } as unknown as Contexto, modelo };
}

describe("guardado de mensajes de Rafa", () => {
  it.each(["usuario", "contexto", "asistente"] as const)("no confirma éxito cuando falla el guardado de %s", async (fallo) => {
    const { ctx, modelo } = contextoConFallo(fallo);
    await expect(procesarTurno(ctx, { conversacion_id: "11111111-1111-1111-1111-111111111111", mensaje: "Mi presupuesto" }, modelo)).rejects.toThrow(/no se pudo/i);
    if (fallo === "usuario") expect(modelo).not.toHaveBeenCalled();
  });
});