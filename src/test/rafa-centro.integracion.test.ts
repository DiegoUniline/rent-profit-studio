// Integración de las conversaciones por centro (cliente → PostgREST real, RLS)
// sobre la base AISLADA de pruebas. Solo corre con REST_URL definido:
// supabase/tests/presupuestos/ejecutar.sh.
import { describe, it, expect, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as jwt from "../../supabase/tests/rafa/e2e/jwt.mjs";

type Rol = "admin" | "contador" | "usuario";
const URL_BASE = (process.env.REST_URL || "").replace(/\/rest\/v1\/?$/, "");
let rol: Rol = "contador";
const clientes: Record<string, SupabaseClient> = {};
const cli = (r: Rol) =>
  (clientes[r] ||= createClient(URL_BASE, jwt.ANON, {
    global: { headers: { Authorization: `Bearer ${jwt.tokenDe(jwt.USUARIOS[r])}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, k) => {
        const c = cli(rol) as unknown as Record<string | symbol, unknown>;
        // getUser() sin argumentos lee la sesión; en pruebas se valida el JWT del usuario actual.
        if (k === "auth") return { getUser: () => (cli(rol).auth.getUser as (t: string) => unknown)(jwt.tokenDe(jwt.USUARIOS[rol])) };
        return c[k];
      },
    }
  ),
}));
import { asignarCentro, conversacionDeCentro, crearConversacionDeCentro, listarConversaciones } from "@/lib/rafa-chat";

const OFICINA = { id: "a1000000-0000-0000-0000-000000000002", nombre: "Oficina Central" };
const PLANTA = "a2000000-0000-0000-0000-000000000001"; // Empresa Dos
const E1 = "e1000000-0000-0000-0000-000000000001";
const E2 = "e2000000-0000-0000-0000-000000000002";

describe.skipIf(!process.env.REST_URL)("conversaciones de Rafa por centro de negocio", () => {
  it("crea la conversación del centro con su empresa y la reutiliza al abrir desde el centro", async () => {
    rol = "contador";
    const creada = await crearConversacionDeCentro(OFICINA);
    expect(creada.centro_negocio_id).toBe(OFICINA.id);
    expect(creada.empresa_id).toBe(E1);
    expect(creada.centros_negocio?.nombre).toBe("Oficina Central");
    expect(creada.titulo).toBe("Centro Oficina Central · Demo Uno");
    const abierta = await conversacionDeCentro(OFICINA);
    expect(abierta.id).toBe(creada.id);

    await asignarCentro(creada.id, PLANTA);
    const [movida] = (await listarConversaciones()).filter((c) => c.id === creada.id);
    expect(movida.centro_negocio_id).toBe(PLANTA);
    expect(movida.empresa_id).toBe(E2);
    await asignarCentro(creada.id, null);
    const [general] = (await listarConversaciones()).filter((c) => c.id === creada.id);
    expect(general.centro_negocio_id).toBeNull();
    expect(general.empresa_id).toBeNull();
  });

  it("cada usuario ve solo sus conversaciones del centro", async () => {
    rol = "contador";
    const propia = await conversacionDeCentro(OFICINA);
    rol = "admin";
    const delAdmin = await conversacionDeCentro(OFICINA);
    expect(delAdmin.id).not.toBe(propia.id);
    expect((await listarConversaciones()).some((c) => c.id === propia.id)).toBe(false);
  });
});
