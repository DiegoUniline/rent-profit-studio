// Integración del editor de planes de Rafa (aplicarPlanRafa → RPC rafa_guardar_plan)
// contra PostgREST real sobre la base AISLADA de pruebas (semilla sintética).
// Solo corre con REST_URL definido: supabase/tests/presupuestos/ejecutar.sh.
import { describe, it, expect, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as jwt from "../../supabase/tests/rafa/e2e/jwt.mjs";
import type { PropuestaEditable } from "@/lib/rafa-types";

type Rol = "admin" | "contador" | "usuario";
const URL_BASE = (process.env.REST_URL || "").replace(/\/rest\/v1\/?$/, "");
let rol: Rol = "admin";
const clientes: Record<string, SupabaseClient> = {};
const cli = (r: Rol) =>
  (clientes[r] ||= createClient(URL_BASE, jwt.ANON, {
    global: { headers: { Authorization: `Bearer ${jwt.tokenDe(jwt.USUARIOS[r])}` } },
    auth: { persistSession: false },
  }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => (cli(rol) as unknown as Record<string | symbol, unknown>)[k] }),
}));
import { aplicarPlanRafa } from "@/lib/rafa-apply";

const EMPRESA = "e1000000-0000-0000-0000-000000000001";
const svc = () => createClient(URL_BASE, jwt.ANON, { global: { headers: { Authorization: `Bearer ${jwt.SERVICIO}` } }, auth: { persistSession: false } });

const lotes = (manzana: number, desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => ({
    key: `${manzana}-${desde + i}`,
    descripcion: `Manzana ${manzana} Lote ${desde + i}`,
    unidad: "lote",
    cantidad: 1,
    precioUnitario: 550000,
    cuentaId: "",
  }));
const plan = (manzana: number, extra: Partial<PropuestaEditable> = {}): PropuestaEditable => ({
  empresaId: EMPRESA,
  centro: { modo: "nuevo", id: "", nombre: `Manzana ${manzana}`, tipoActividad: "" },
  tercero: { modo: "nuevo", id: "", nombre: "Comprador Uno" },
  ivaIncluir: false,
  ivaTasa: 16,
  partidas: lotes(manzana, 51, 66),
  formatoTexto: "original",
  programacion: { tipo: "ingreso", frecuencia: "mensual", fechaInicio: "2026-11-01", numeroPagos: 12 },
  ...extra,
});
const como = async <T,>(r: Rol, f: () => Promise<T>) => {
  rol = r;
  return f();
};
const partidasDe = async (manzana: number) =>
  (await svc().from("presupuestos").select("id, partida, activo, precio_unitario, es_project").ilike("partida", `Manzana ${manzana} %`).order("partida")).data || [];
const flujosDe = async (ids: string[]) =>
  (await svc().from("flujos_programados").select("id, presupuesto_id").in("presupuesto_id", ids)).data || [];
const centros = async (nombre: string) => (await svc().from("centros_negocio").select("id").eq("nombre", nombre)).data || [];
const terceros = async () => (await svc().from("terceros").select("id, razon_social, rfc").eq("empresa_id", EMPRESA)).data || [];

describe.skipIf(!process.env.REST_URL)("editor de planes de Rafa → presupuestos", () => {
  it("guarda 51–66, quitar el 51 lo da de baja y 52–66 se actualizan sin duplicar", async () => {
    const r1 = await como("admin", () => aplicarPlanRafa(plan(7)));
    expect(r1.partidasCreadas).toBe(16);
    expect(r1.flujosCreados).toBe(16 * 12);

    const sin51 = { ...r1.propuesta, partidas: r1.propuesta.partidas.filter((p) => !p.descripcion.endsWith("Lote 51")) };
    const r2 = await como("admin", () => aplicarPlanRafa(sin51));
    expect(r2.partidasCreadas).toBe(0);
    expect(r2.partidasActualizadas).toBe(15);
    expect(r2.partidasDadasDeBaja).toBe(1);

    const r3 = await como("admin", () => aplicarPlanRafa(r2.propuesta));
    expect(r3.partidasCreadas).toBe(0);
    expect(r3.partidasDadasDeBaja).toBe(0);

    const ps = await partidasDe(7);
    expect(ps).toHaveLength(16);
    expect(ps.filter((p) => p.activo).map((p) => p.partida)).toEqual(lotes(7, 52, 66).map((l) => l.descripcion).sort());
    const lote51 = ps.find((p) => p.partida === "Manzana 7 Lote 51")!;
    expect(lote51.activo).toBe(false);
    const flujos = await flujosDe(ps.map((p) => p.id));
    expect(flujos.filter((f) => f.presupuesto_id === lote51.id)).toHaveLength(0);
    expect(flujos).toHaveLength(15 * 12);
    expect(await centros("Manzana 7")).toHaveLength(1);
    expect((await terceros()).filter((t) => t.razon_social === "Comprador Uno")).toHaveLength(1);
  });

  it("reintento con la misma clave no repite el guardado", async () => {
    const p = plan(9, { tercero: { modo: "ninguno", id: "", nombre: "" } });
    const clave = crypto.randomUUID();
    const [a, b] = await como("admin", () => Promise.all([aplicarPlanRafa(p, clave), aplicarPlanRafa(p, clave)]));
    expect(a.propuesta.aplicado?.presupuestoIds).toEqual(b.propuesta.aplicado?.presupuestoIds);
    expect(await partidasDe(9)).toHaveLength(16);
    expect(await centros("Manzana 9")).toHaveLength(1);
  });

  it("tercero nuevo con RFC genérico ya usado: error claro y no queda nada a medias", async () => {
    const antes = (await terceros()).length;
    await expect(como("admin", () => aplicarPlanRafa(plan(8, { tercero: { modo: "nuevo", id: "", nombre: "Comprador Dos" } })))).rejects.toThrow(
      /RFC XAXX010101000.*No se guardó ningún cambio/
    );
    expect(await partidasDe(8)).toHaveLength(0);
    expect(await centros("Manzana 8")).toHaveLength(0);
    expect((await terceros()).length).toBe(antes);

    // Con RFC propio se guarda; con el mismo nombre de uno existente se reutiliza.
    const conRfc = await como("admin", () =>
      aplicarPlanRafa(plan(8, { tercero: { modo: "nuevo", id: "", nombre: "Comprador Dos", rfc: "CODO800101AB1" } }))
    );
    expect(conRfc.partidasCreadas).toBe(16);
    const reutiliza = await como("admin", () => aplicarPlanRafa(plan(10, { tercero: { modo: "nuevo", id: "", nombre: "comprador dos" } })));
    expect(reutiliza.terceroId).toBe(conRfc.terceroId);
    expect((await terceros()).length).toBe(antes + 1);
  });

  it("contador: no puede crear partidas ni reemplazar pagos; no queda nada a medias", async () => {
    await expect(como("contador", () => aplicarPlanRafa(plan(11, { tercero: { modo: "ninguno", id: "", nombre: "" } })))).rejects.toThrow(
      /Solo un administrador puede crear partidas/
    );
    expect(await centros("Manzana 11")).toHaveLength(0);

    const guardado = await como("admin", () => aplicarPlanRafa(plan(12, { tercero: { modo: "ninguno", id: "", nombre: "" } })));
    const cambio = { ...guardado.propuesta, partidas: guardado.propuesta.partidas.map((p) => ({ ...p, precioUnitario: 1 })) };
    await expect(como("contador", () => aplicarPlanRafa(cambio))).rejects.toThrow(/solo administradores/);
    const ps = await partidasDe(12);
    expect(ps.every((p) => Number(p.precio_unitario) === 550000)).toBe(true);
    expect(await flujosDe(ps.map((p) => p.id))).toHaveLength(16 * 12);
  });

  it("partida que ya es de Proyecto: se actualiza sin tocar sus pagos y no falla", async () => {
    const guardado = await como("admin", () => aplicarPlanRafa(plan(13, { tercero: { modo: "ninguno", id: "", nombre: "" } })));
    const id = guardado.propuesta.partidas[0].presupuestoId!;
    await svc().from("flujos_programados").delete().eq("presupuesto_id", id);
    await svc().from("presupuestos").update({ es_project: true }).eq("id", id);
    const r = await como("admin", () => aplicarPlanRafa(guardado.propuesta));
    expect(r.omitidasProyecto).toBe(1);
    expect(r.partidasActualizadas).toBe(16);
    expect(await flujosDe([id])).toHaveLength(0);
  });
});
