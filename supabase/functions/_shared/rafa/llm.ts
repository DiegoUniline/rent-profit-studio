// Cliente del proveedor de IA. Reutiliza el gateway que Rafa ya usaba
// (Lovable AI Gateway, API compatible con OpenAI chat/completions + tools).

export interface MensajeModelo {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface RespuestaModelo {
  content: string | null;
  tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

export type LlamadaModelo = (peticion: { messages: MensajeModelo[]; tools: unknown[] }) => Promise<RespuestaModelo>;

export class ErrorModelo extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ErrorModelo";
    this.status = status;
  }
}

export function crearLlamadaGateway(opciones: { url: string; apiKey: string; modelo: string; fetchImpl?: typeof fetch }): LlamadaModelo {
  const f = opciones.fetchImpl ?? fetch;
  return async ({ messages, tools }) => {
    const res = await f(opciones.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opciones.apiKey}` },
      body: JSON.stringify({ model: opciones.modelo, messages, tools, tool_choice: "auto" }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      const mensaje =
        res.status === 429
          ? "Demasiadas solicitudes a la IA. Intenta de nuevo en unos segundos."
          : res.status === 402
          ? "Se agotaron los créditos de IA del espacio de trabajo."
          : `Error de la IA (${res.status}): ${detalle.slice(0, 300)}`;
      throw new ErrorModelo(mensaje, res.status);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message || {};
    return { content: msg.content ?? null, tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [] };
  };
}
