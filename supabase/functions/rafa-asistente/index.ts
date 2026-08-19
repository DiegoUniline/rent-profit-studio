import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MODEL = "google/gemini-3.6-flash";

interface ArchivoEntrada {
  filename: string;
  mime: string;
  data: string; // base64 sin prefijo
}

const PLAN_TOOL = {
  type: "function",
  function: {
    name: "proponer_plan",
    description:
      "Devuelve el plan estructurado que Rafa propone al usuario a partir de su instrucción y de los archivos adjuntos.",
    parameters: {
      type: "object",
      properties: {
        transcripcion: { type: "string", description: "Transcripción literal del audio, vacío si no hubo audio." },
        resumen: { type: "string", description: "Resumen en español de lo que se va a hacer, en 1-3 frases." },
        empresa_detectada: { type: "string", description: "Nombre de la empresa mencionada; vacío si no se menciona." },
        centro_negocio: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            tipo_actividad: { type: "string" },
          },
          required: ["nombre"],
        },
        tercero: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre del contratista/tercero; vacío si no se menciona." },
            rol: { type: "string" },
          },
          required: ["nombre"],
        },
        iva: {
          type: "object",
          properties: {
            incluir: { type: "boolean", description: "true si el importe de cada partida debe incluir IVA." },
            tasa: { type: "number", description: "Tasa de IVA en porcentaje, normalmente 16." },
          },
          required: ["incluir", "tasa"],
        },
        total_objetivo: {
          type: "number",
          description: "Total del presupuesto mencionado por el usuario o del archivo. 0 si no aplica.",
        },
        partidas: {
          type: "array",
          description: "Una entrada por concepto del archivo, en el mismo orden.",
          items: {
            type: "object",
            properties: {
              clave: { type: "string" },
              descripcion: { type: "string" },
              unidad: { type: "string" },
              cantidad: { type: "number" },
              precio_unitario: { type: "number", description: "Precio unitario SIN IVA, tal como viene en el archivo." },
              importe: { type: "number", description: "Importe SIN IVA (cantidad x precio unitario)." },
              cuenta_codigo: {
                type: "string",
                description: "Código de la cuenta contable sugerida del catálogo proporcionado. Vacío si ninguna aplica.",
              },
            },
            required: ["descripcion", "cantidad", "precio_unitario", "importe"],
          },
        },
        programacion: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["ingreso", "egreso"] },
            frecuencia: {
              type: "string",
              enum: ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"],
            },
            numero_pagos: { type: "number" },
            fecha_inicio: { type: "string", description: "Fecha ISO yyyy-mm-dd del primer pago." },
            notas: { type: "string" },
          },
          required: ["tipo", "frecuencia", "numero_pagos", "fecha_inicio"],
        },
      },
      required: ["resumen", "centro_negocio", "tercero", "iva", "partidas", "programacion"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ error: "Falta la configuración de la IA (LOVABLE_API_KEY)." }, 500);
    }

    const body = await req.json();
    const texto: string = (body.texto ?? "").toString().slice(0, 20000);
    const audio = body.audio as { data: string; format: string } | undefined;
    const archivos: ArchivoEntrada[] = Array.isArray(body.archivos) ? body.archivos.slice(0, 5) : [];
    const cuentas: { codigo: string; nombre: string }[] = Array.isArray(body.cuentas) ? body.cuentas.slice(0, 400) : [];
    const hoy: string = body.hoy || new Date().toISOString().slice(0, 10);

    if (!texto && !audio && archivos.length === 0) {
      return json({ error: "Envía una instrucción por texto o audio." }, 400);
    }

    const content: unknown[] = [
      {
        type: "text",
        text:
          `Fecha de hoy: ${hoy}.\n` +
          (texto ? `Instrucción escrita del usuario:\n${texto}\n\n` : "") +
          (audio ? "El usuario adjunta un audio con la instrucción: transcríbelo y úsalo como instrucción principal.\n\n" : "") +
          (archivos.length
            ? "Se adjuntan archivos con el catálogo de conceptos: extrae TODAS las partidas con su clave, descripción, unidad, cantidad, precio unitario e importe.\n\n"
            : "") +
          "Catálogo de cuentas contables disponibles (código — nombre):\n" +
          cuentas.map((c) => `${c.codigo} — ${c.nombre}`).join("\n"),
      },
    ];

    if (audio) content.push({ type: "input_audio", input_audio: { data: audio.data, format: audio.format } });
    for (const a of archivos) {
      if (a.mime?.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}` } });
      } else {
        content.push({
          type: "file",
          file: { filename: a.filename, file_data: `data:${a.mime || "application/pdf"};base64,${a.data}` },
        });
      }
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Eres Rafa, asistente contable de una empresa mexicana. Interpretas instrucciones habladas o escritas junto con catálogos de conceptos (presupuestos de obra) y devuelves SIEMPRE un plan estructurado con la herramienta proponer_plan. Nunca inventes partidas: usa exactamente las del archivo. Los precios unitarios van SIN IVA; si el usuario pide sumar IVA, marca iva.incluir = true con la tasa indicada (16 por defecto). Sugiere para cada partida la cuenta contable más parecida del catálogo recibido. Responde en español.",
          },
          { role: "user", content },
        ],
        tools: [PLAN_TOOL],
        tool_choice: { type: "function", function: { name: "proponer_plan" } },
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      const msg =
        res.status === 429
          ? "Demasiadas solicitudes a la IA. Intenta de nuevo en unos segundos."
          : res.status === 402
          ? "Se agotaron los créditos de IA del espacio de trabajo."
          : `Error de la IA (${res.status}): ${detalle.slice(0, 300)}`;
      return json({ error: msg }, res.status === 429 || res.status === 402 ? res.status : 500);
    }

    const data = await res.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return json({ error: "La IA no pudo estructurar la instrucción. Intenta describirla con más detalle." }, 502);
    }

    return json({ plan: JSON.parse(call.function.arguments) });
  } catch (e) {
    console.error("rafa-asistente error", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
