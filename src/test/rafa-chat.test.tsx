import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const invoke = vi.fn();
const tablas: Record<string, unknown[]> = {};

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data: tablas[tabla] || [], error: null }),
      delete: () => q,
      then: (ok: (v: unknown) => void) => ok({ data: tablas[tabla] || [], error: null }),
    };
    return q;
  };
  return { supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, from: consulta } };
});

import { contextoDeRuta } from "@/lib/rafa-chat";
import { RafaChat } from "@/components/rafa/RafaChat";
import { TarjetaAccion } from "@/components/rafa/RafaResultados";

const accionPropuesta = {
  id: "11111111-1111-1111-1111-111111111111",
  estado: "propuesta",
  herramienta: "proponer_programaciones",
  descripcion: "Crear 3 programaciones",
  requiere_confirmacion: true,
  huella: "huella-presentada",
  vista_previa: { resumen: "Se crearán 3 programaciones", tablas: [], advertencias: ["Aviso de prueba"], efectos: ["No crean asientos"] },
};

describe("contexto de pantalla", () => {
  it("identifica proyecto, asiento, partida y empresa filtrada", () => {
    const id = "91000000-0000-0000-0000-000000000001";
    expect(contextoDeRuta(`/proyectos/${id}`, () => null)).toEqual({ ruta: `/proyectos/${id}`, proyecto_id: id, registro: { entidad: "proyecto", id } });
    expect(contextoDeRuta(`/asientos/${id}`, () => null).registro).toEqual({ entidad: "asiento", id });
    expect(contextoDeRuta(`/presupuestos/${id}/ejercido`, () => null).registro).toEqual({ entidad: "presupuesto", id });
    const empresa = "e1000000-0000-0000-0000-000000000001";
    expect(contextoDeRuta("/programacion", (k) => (k === "programacion_filter_empresa" ? empresa : null)).empresa_id).toBe(empresa);
    expect(contextoDeRuta("/programacion", () => "all").empresa_id).toBeUndefined();
  });
});

describe("tarjeta de acción", () => {
  it("solo ofrece confirmar una propuesta pendiente y entrega la acción con su huella", () => {
    const onConfirmar = vi.fn();
    render(<TarjetaAccion accion={accionPropuesta} procesando={false} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
    expect(screen.getByText(/Propuesta · pendiente de confirmar/)).toBeInTheDocument();
    expect(screen.getByText("Aviso de prueba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar y ejecutar/ }));
    expect(onConfirmar).toHaveBeenCalledWith(accionPropuesta);
  });

  it("no ofrece confirmar acciones ejecutadas, fallidas o desactualizadas", () => {
    for (const estado of ["ejecutada", "fallida", "desactualizada", "cancelada"]) {
      const { unmount } = render(
        <TarjetaAccion accion={{ ...accionPropuesta, estado }} procesando={false} onConfirmar={vi.fn()} onCancelar={vi.fn()} />
      );
      expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
      unmount();
    }
  });
});

describe("chat de Rafa", () => {
  beforeEach(() => {
    invoke.mockReset();
    for (const k of Object.keys(tablas)) delete tablas[k];
  });

  it("envía el mensaje con el contexto de pantalla, muestra la respuesta y confirma con la huella presentada", async () => {
    const conv = "c0000000-0000-0000-0000-000000000001";
    invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.modo === "chat") {
        tablas.rafa_mensajes = [
          { id: "m1", rol: "usuario", contenido: body.mensaje, datos: {}, version_conocimiento: "k-1", created_at: "2026-10-16T00:00:00Z" },
          {
            id: "m2",
            rol: "asistente",
            contenido: "**PROPUESTA** lista: confirma abajo.",
            datos: {
              herramientas: [
                {
                  nombre: "proponer_programaciones",
                  argumentos: {},
                  ok: true,
                  tipo: "accion",
                  resumen: "PROPUESTA",
                  alcance: null,
                  tablas: [],
                  referencias: [],
                  accion: accionPropuesta,
                  advertencias: [],
                  error: null,
                },
              ],
            },
            version_conocimiento: "k-1",
            created_at: "2026-10-16T00:00:01Z",
          },
        ];
        tablas.rafa_acciones = [accionPropuesta];
        return { data: { conversacion_id: conv, mensaje_id: "m2", contenido: "", version_conocimiento: "k-1" }, error: null };
      }
      return { data: { ok: true, resumen: "EJECUTADA", accion: { ...accionPropuesta, estado: "ejecutada" } }, error: null };
    });

    const contexto = { ruta: "/proyectos/x", proyecto_id: "91000000-0000-0000-0000-000000000001" };
    render(
      <MemoryRouter>
        <RafaChat compacto contextoPantalla={contexto} />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText(/Escribe a Rafa/), { target: { value: "Programa las rentas" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("PROPUESTA")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("rafa-asistente", {
      body: expect.objectContaining({ modo: "chat", mensaje: "Programa las rentas", contexto_pantalla: contexto }),
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar y ejecutar/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rafa-asistente", {
        body: { modo: "confirmar", accion_id: accionPropuesta.id, huella: "huella-presentada" },
      })
    );
  });
});
