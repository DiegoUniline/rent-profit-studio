import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const rpc = vi.fn();
const escrituras: string[] = [];
const toast = vi.fn();
const tablas: Record<string, unknown[]> = {};

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (...a: unknown[]) => toast(...a) }), toast: (...a: unknown[]) => toast(...a) }));
// Diálogos anidados de alta rápida: fuera del alcance de estas pruebas.
vi.mock("@/components/dialogs/EmpresaDialog", () => ({ EmpresaDialog: () => null }));
vi.mock("@/components/dialogs/CuentaDialog", () => ({ CuentaDialog: () => null }));
vi.mock("@/components/dialogs/CentroNegocioDialog", () => ({ CentroNegocioDialog: () => null }));
vi.mock("@/components/dialogs/UnidadMedidaDialog", () => ({ UnidadMedidaDialog: () => null }));
vi.mock("@/components/dialogs/ProgramacionPartidaDialog", () => ({ ProgramacionPartidaDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const resultado = () => Promise.resolve({ data: tablas[tabla] || [], error: null });
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      range: () => q,
      limit: resultado,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => (escrituras.push(`insert:${tabla}`), q),
      update: () => (escrituras.push(`update:${tabla}`), q),
      delete: () => (escrituras.push(`delete:${tabla}`), q),
      then: (ok: (v: unknown) => void) => resultado().then(ok),
    };
    return q;
  };
  return { supabase: { from: consulta, rpc: (...a: unknown[]) => rpc(...a) } };
});

import { flujosParaGuardar, firmaSolicitud, mensajeErrorGuardado } from "@/lib/presupuesto-guardado";
import { PresupuestoDialog } from "@/components/dialogs/PresupuestoDialog";

const PRESUPUESTO = {
  id: "b1000000-0000-0000-0000-00000000000b",
  empresa_id: "e1000000-0000-0000-0000-000000000001",
  cuenta_id: null,
  tercero_id: null,
  centro_negocio_id: null,
  unidad_medida_id: null,
  partida: "Renta de oficina",
  cantidad: 12,
  precio_unitario: 10000,
  notas: null,
  activo: true,
  fecha_inicio: null,
  fecha_fin: null,
  frecuencia: null,
  es_project: false,
  tipo_movimiento: "egreso" as const,
  updated_at: "2026-10-16T10:00:00+00:00",
};

const FLUJOS = [
  { id: "f0000000-0000-0000-0000-000000000001", fecha: "2026-01-05", monto: 10000, tipo: "egreso", descripcion: "Renta 1" },
  { id: "f0000000-0000-0000-0000-000000000002", fecha: "2026-02-05", monto: 10000, tipo: "egreso", descripcion: "Renta 1" },
];

describe("armado del guardado", () => {
  it("conserva ids de pagos existentes, deja sin id los nuevos y no fusiona pagos iguales", () => {
    const fecha = new Date("2026-03-05T00:00:00");
    const r = flujosParaGuardar([
      { id: "x1", fecha, monto: "100", tipo: "egreso", descripcion: "A" },
      { fecha, monto: "100", tipo: "egreso", descripcion: "A" },
      { fecha, monto: "100", tipo: "egreso", descripcion: "A" },
      { fecha: undefined, monto: "5", tipo: "egreso", descripcion: "" },
      { id: "x2", fecha, monto: "0", tipo: "ingreso", descripcion: "" },
    ]);
    expect(r).toEqual([
      { id: "x1", fecha: "2026-03-05", monto: 100, tipo: "egreso", descripcion: "A" },
      { id: null, fecha: "2026-03-05", monto: 100, tipo: "egreso", descripcion: "A" },
      { id: null, fecha: "2026-03-05", monto: 100, tipo: "egreso", descripcion: "A" },
    ]);
  });

  it("la firma cambia si cambian los datos y los mensajes de error indican que no se guardó nada", () => {
    const base = { id: "p", datos: { partida: "a" } as never, flujos: [], version: "v" };
    expect(firmaSolicitud(base)).toBe(firmaSolicitud({ ...base }));
    expect(firmaSolicitud(base)).not.toBe(firmaSolicitud({ ...base, flujos: null }));
    expect(mensajeErrorGuardado("PRESUPUESTO_DESACTUALIZADO: x")).toMatch(/vuelve a abrirlo; no se guardó/);
    expect(mensajeErrorGuardado("new row violates row-level security policy")).toMatch(/permiso/);
    expect(mensajeErrorGuardado("La cantidad debe ser mayor a 0")).toBe("La cantidad debe ser mayor a 0. No se guardó ningún cambio.");
  });
});

describe("diálogo de presupuesto", () => {
  beforeEach(() => {
    rpc.mockReset();
    toast.mockReset();
    escrituras.length = 0;
    tablas.flujos_programados = FLUJOS;
  });

  const abrir = (presupuesto: typeof PRESUPUESTO | null, onSuccess = vi.fn(), onOpenChange = vi.fn()) => {
    render(
      <MemoryRouter>
        <PresupuestoDialog open presupuesto={presupuesto as never} empresas={[]} onSuccess={onSuccess} onOpenChange={onOpenChange} />
      </MemoryRouter>
    );
    return { onSuccess, onOpenChange };
  };

  it("editar: una sola llamada atómica con el id, los ids de pagos y la versión, aunque se haga doble clic", async () => {
    let resolver: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => (resolver = r)));
    const { onSuccess, onOpenChange } = abrir(PRESUPUESTO);
    await waitFor(() => expect(screen.getAllByDisplayValue("Renta 1")).toHaveLength(2));

    const guardar = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(guardar);
    fireEvent.click(guardar);
    fireEvent.click(guardar);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("guardar_presupuesto");
    expect(args.p_id).toBe(PRESUPUESTO.id);
    expect(args.p_version).toBe(PRESUPUESTO.updated_at);
    expect(args.p_flujos.map((f: { id: string }) => f.id)).toEqual(FLUJOS.map((f) => f.id));
    expect(args.p_operacion).toMatch(/^[0-9a-f-]{36}$/);
    // Nada se escribe tabla por tabla: ni update, ni delete, ni insert.
    expect(escrituras).toEqual([]);

    resolver({ data: { presupuesto_id: PRESUPUESTO.id, creado: false, flujos: { insertados: 0, actualizados: 0, eliminados: 0 } }, error: null });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast).toHaveBeenCalledWith({ title: "Presupuesto actualizado" });
  });

  it("si falla no muestra éxito ni cierra; el reintento idéntico reutiliza la misma clave de operación", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    const { onSuccess, onOpenChange } = abrir(PRESUPUESTO);
    await waitFor(() => expect(screen.getAllByDisplayValue("Renta 1")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Error", variant: "destructive" })));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    rpc.mockResolvedValueOnce({ data: { presupuesto_id: PRESUPUESTO.id, creado: false, repetido: true, flujos: {} }, error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[1][1].p_operacion).toBe(rpc.mock.calls[0][1].p_operacion);
  });

  it("crear (o copiar): llamada sin id ni versión", async () => {
    rpc.mockResolvedValue({ data: { presupuesto_id: "nuevo", creado: true, flujos: {} }, error: null });
    const { onSuccess } = abrir({ ...PRESUPUESTO, id: undefined as never, partida: "Copia de Renta de oficina" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const args = rpc.mock.calls[0][1];
    expect(args.p_id).toBeNull();
    expect(args.p_version).toBeUndefined();
    expect(args.p_flujos).toEqual([]);
    expect(toast).toHaveBeenCalledWith({ title: "Presupuesto creado" });
  });
});
