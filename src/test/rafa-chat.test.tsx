import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const invoke = vi.fn();
const tablas: Record<string, unknown[]> = {};
const errores: Record<string, { message: string }> = {};

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data: tablas[tabla] || [], error: errores[tabla] || null }),
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
    for (const k of Object.keys(errores)) delete errores[k];
  });

  it("reabre la última charla guardada al volver a Rafa", async () => {
    tablas.rafa_conversaciones = [{ id: "c-guardada", titulo: "Presupuesto guardado", updated_at: "2026-10-22T19:00:00Z", contexto: {} }];
    tablas.rafa_mensajes = [{ id: "m-guardado", rol: "usuario", contenido: "Presupuesto de los lotes 52 al 66", datos: {}, version_conocimiento: "k", created_at: "2026-10-22T19:00:00Z" }];
    render(<MemoryRouter><RafaChat /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Presupuesto de los lotes 52 al 66")).toBeInTheDocument());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("conserva el mensaje y la conversación si falla la lectura después de enviar", async () => {
    invoke.mockImplementation(async () => {
      errores.rafa_mensajes = { message: "Lectura no disponible" };
      return { data: { conversacion_id: "c-confirmada", mensaje_id: "m-confirmado", contenido: "Recibido", version_conocimiento: "k" }, error: null };
    });
    render(<MemoryRouter><RafaChat compacto /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/Escribe a Rafa/), { target: { value: "Mi presupuesto guardado" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/Escribe a Rafa/)).toHaveValue(""));
    expect(screen.getByText("Mi presupuesto guardado")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Escribe a Rafa/), { target: { value: "Continuar" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("rafa-asistente", { body: expect.objectContaining({ conversacion_id: "c-confirmada", mensaje: "Continuar" }) }));
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

describe("respuestas rápidas e hipervínculos", () => {
  beforeEach(() => {
    invoke.mockReset();
    for (const k of Object.keys(tablas)) delete tablas[k];
    for (const k of Object.keys(errores)) delete errores[k];
  });

  it("convierte la elección de empresa en botones que envían el id y muestra enlaces internos", async () => {
    const empresa = "e1000000-0000-0000-0000-000000000001";
    let llamada = 0;
    invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) => {
      llamada++;
      tablas.rafa_mensajes = [
        { id: "u1", rol: "usuario", contenido: body.mensaje, datos: {}, version_conocimiento: "k", created_at: "2026-10-16T00:00:00Z" },
        {
          id: "a1",
          rol: "asistente",
          contenido: "¿De qué empresa? Revisa [Cimentación](/presupuestos/p1/ejercido).\n[[opciones: Maq Rentable | Concretec]]",
          datos: {
            herramientas: [
              {
                nombre: "comparar_programacion_presupuesto",
                argumentos: {},
                ok: false,
                tipo: "error",
                resumen: "Falta indicar la empresa",
                alcance: null,
                tablas: [],
                referencias: [],
                accion: null,
                advertencias: [],
                faltantes: ["empresa_id"],
                opciones: [
                  { id: empresa, nombre: "Maq Rentable" },
                  { id: "e2000000-0000-0000-0000-000000000002", nombre: "Concretec" },
                ],
                error: "falta",
              },
            ],
          },
          version_conocimiento: "k",
          created_at: "2026-10-16T00:00:01Z",
        },
      ];
      return { data: { conversacion_id: "c1", mensaje_id: `m${llamada}`, contenido: "", version_conocimiento: "k" }, error: null };
    });

    render(
      <MemoryRouter>
        <RafaChat compacto />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText(/Escribe a Rafa/), { target: { value: "¿Pagos de la semana?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Maq Rentable" })).toBeInTheDocument());
    expect(screen.queryByText(/\[\[opciones/)).toBeNull();
    expect(screen.getByRole("link", { name: "Cimentación" })).toHaveAttribute("href", "/presupuestos/p1/ejercido");
    expect(screen.queryByText("Falta indicar la empresa")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Maq Rentable" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("rafa-asistente", {
        body: expect.objectContaining({ modo: "chat", mensaje: "Maq Rentable", contexto_pantalla: { empresa_id: empresa } }),
      })
    );
  });
});

describe("conversaciones por centro de negocio", () => {
  beforeEach(() => {
    invoke.mockReset();
    for (const k of Object.keys(tablas)) delete tablas[k];
    for (const k of Object.keys(errores)) delete errores[k];
  });

  const CENTRO = "a1000000-0000-0000-0000-000000000002";

  it("agrupa las conversaciones por centro y muestra el centro de la conversación abierta", async () => {
    const empresa = { razon_social: "Empresa Uno SA de CV", nombre_comercial: "Empresa Uno" };
    tablas.centros_negocio = [
      { id: CENTRO, codigo: "CN002", nombre: "Oficina Central", empresa_id: "e1", empresas: empresa },
      { id: "a2", codigo: "CN010", nombre: "Oficina Central", empresa_id: "e2", empresas: { razon_social: "Empresa Dos SA", nombre_comercial: null } },
    ];
    tablas.rafa_conversaciones = [
      { id: "c1", titulo: "Pagos de la oficina", updated_at: "2026-10-23T10:00:00Z", contexto: {}, centro_negocio_id: CENTRO, empresa_id: "e1", centros_negocio: { codigo: "CN002", nombre: "Oficina Central", empresas: empresa } },
      { id: "c2", titulo: "Dudas generales", updated_at: "2026-10-22T10:00:00Z", contexto: {}, centro_negocio_id: null, empresa_id: null, centros_negocio: null },
    ];
    tablas.rafa_mensajes = [];
    render(<MemoryRouter><RafaChat /></MemoryRouter>);
    // Centros con el mismo nombre se distinguen por la empresa.
    await waitFor(() => expect(screen.getAllByText("CN002 · Oficina Central — Empresa Uno").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Sin centro").length).toBeGreaterThan(0);
    expect(screen.getByText(/Todo lo que preguntes aquí se refiere al centro CN002 · Oficina Central — Empresa Uno/)).toBeInTheDocument();
  });

  it("«Usar» vuelve a enviar un archivo guardado de la conversación sin subirlo otra vez", async () => {
    tablas.centros_negocio = [{ id: CENTRO, codigo: "CN002", nombre: "Oficina Central", empresa_id: "e1" }];
    tablas.rafa_conversaciones = [
      { id: "c1", titulo: "Manzana 7", updated_at: "2026-10-23T10:00:00Z", contexto: {}, centro_negocio_id: CENTRO, empresa_id: "e1", centros_negocio: { codigo: "CN002", nombre: "Oficina Central" } },
    ];
    tablas.rafa_mensajes = [];
    tablas.rafa_archivos = [{ id: "f1", conversacion_id: "c1", nombre: "catalogo.pdf", mime: "application/pdf", tamano: 10, ruta: "u/c1/f1-catalogo.pdf", created_at: "2026-10-23T10:00:00Z" }];
    invoke.mockResolvedValue({ data: { conversacion_id: "c1", mensaje_id: "m1", contenido: "", version_conocimiento: "k" }, error: null });
    render(<MemoryRouter><RafaChat /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: /Archivos de la conversación/ })).toHaveTextContent("Archivos (1)"));
    fireEvent.click(screen.getByRole("button", { name: /Archivos de la conversación/ }));
    fireEvent.click(screen.getByRole("button", { name: "Usar catalogo.pdf" }));
    fireEvent.change(screen.getByPlaceholderText(/Escribe a Rafa/), { target: { value: "Revisa el catálogo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rafa-asistente", {
        body: expect.objectContaining({ conversacion_id: "c1", mensaje: "Revisa el catálogo", archivos: [], archivos_guardados: ["f1"] }),
      })
    );
  });
});
