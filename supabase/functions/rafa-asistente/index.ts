import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import type { Contexto, Rol } from "../_shared/rafa/tipos.ts";
import { VERSION_CONOCIMIENTO } from "../_shared/rafa/conocimiento.ts";
import { crearLlamadaGateway, ErrorModelo } from "../_shared/rafa/llm.ts";
import { procesarTurno } from "../_shared/rafa/motor.ts";
import { cancelarAccion, confirmarAccion } from "../_shared/rafa/acciones.ts";
import { PLAN_PARAMETROS, PROMPT_PLAN } from "../_shared/rafa/plan.ts";
import { esUuid } from "../_shared/rafa/validacion.ts";

const MODELO = Deno.env.get("RAFA_MODELO") || "google/gemini-3.6-flash";
const URL_IA = Deno.env.get("RAFA_AI_URL") || "https://ai.gateway.lovable.dev/v1/chat/completions";
const ZONA = Deno.env.get("RAFA_ZONA_HORARIA") || "America/Mexico_City";

interface ArchivoEntrada {
  filename: string;
  mime: string;
  data: string; // base64 sin prefijo
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ error: "Falta la configuración de la IA (LOVABLE_API_KEY)." }, 500);
    }

    const body = await req.json();
    const modo: string = body.modo || "plan";

    const ctx = await contextoDeUsuario(req);
    if (!ctx) return json({ error: "Sesión inválida. Vuelve a iniciar sesión." }, 401);

    if (modo === "chat") {
      const llamar = crearLlamadaGateway({ url: URL_IA, apiKey, modelo: MODELO });
      try {
        const salida = await procesarTurno(
          ctx,
          {
            conversacion_id: body.conversacion_id || undefined,
            mensaje: String(body.mensaje ?? ""),
            contexto_pantalla: body.contexto_pantalla || undefined,
            archivos: Array.isArray(body.archivos) ? body.archivos.slice(0, 5) : [],
            audio: body.audio || undefined,
          },
          llamar
        );
        return json(salida);
      } catch (e) {
        if (e instanceof ErrorModelo) return json({ error: e.message }, e.status === 429 || e.status === 402 ? e.status : 502);
        throw e;
      }
    }

    if (modo === "confirmar" || modo === "cancelar") {
      if (!esUuid(body.accion_id)) return json({ error: "Acción inválida." }, 400);
      const resultado =
        modo === "confirmar" ? await confirmarAccion(ctx, body.accion_id, String(body.huella || "")) : await cancelarAccion(ctx, body.accion_id);
      // Deja constancia en la conversación para que el historial refleje el estado real.
      const conversacionId = resultado.accion ? await conversacionDeAccion(ctx, resultado.accion.id) : null;
      if (conversacionId) {
        await ctx.servicio.from("rafa_mensajes").insert({
          conversacion_id: conversacionId,
          user_id: ctx.usuario.id,
          rol: "asistente",
          contenido: resultado.resumen,
          datos: {
            herramientas: [
              {
                nombre: modo === "confirmar" ? "confirmacion_usuario" : "cancelacion_usuario",
                argumentos: { accion_id: body.accion_id },
                ok: resultado.ok,
                tipo: resultado.tipo,
                resumen: resultado.resumen,
                tablas: resultado.tablas ?? [],
                referencias: resultado.referencias ?? [],
                accion: resultado.accion ?? null,
                advertencias: resultado.advertencias ?? [],
                error: resultado.error ?? null,
              },
            ],
            memoria: `${modo}(${body.accion_id}) → ${resultado.accion?.estado ?? "error"}: ${resultado.resumen}`,
          },
          version_conocimiento: VERSION_CONOCIMIENTO,
        });
      }
      return json(resultado);
    }

    if (ctx.usuario.roles.every((r) => r !== "admin" && r !== "contador")) {
      return json({ error: "Tu rol no permite preparar planes de presupuesto." }, 403);
    }
    return await interpretarPlan(body, apiKey);
  } catch (e) {
    console.error("rafa-asistente error", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

async function contextoDeUsuario(req: Request): Promise<Contexto | null> {
  const autorizacion = req.headers.get("Authorization") || "";
  if (!autorizacion.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(autorizacion.slice(7));
  if (error || !data?.user) return null;
  // Roles leídos en el servidor (RLS: cada usuario ve los suyos). Nunca del navegador.
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    db,
    servicio,
    usuario: { id: data.user.id, email: data.user.email ?? null, roles: (roles || []).map((r: { role: Rol }) => r.role) },
    hoy: new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date()),
    conversacionId: null,
    versionConocimiento: VERSION_CONOCIMIENTO,
  };
}

async function conversacionDeAccion(ctx: Contexto, accionId: string): Promise<string | null> {
  const { data } = await ctx.servicio.from("rafa_acciones").select("conversacion_id").eq("id", accionId).eq("user_id", ctx.usuario.id).maybeSingle();
  return data?.conversacion_id ?? null;
}

// Modo "plan" (comportamiento original): instrucción + archivos → plan editable.
async function interpretarPlan(body: Record<string, unknown>, apiKey: string) {
  const texto: string = String(body.texto ?? "").slice(0, 20000);
  const audio = body.audio as { data: string; format: string } | undefined;
  const archivos: ArchivoEntrada[] = Array.isArray(body.archivos) ? (body.archivos as ArchivoEntrada[]).slice(0, 5) : [];
  const cuentas: { codigo: string; nombre: string }[] = Array.isArray(body.cuentas) ? (body.cuentas as { codigo: string; nombre: string }[]).slice(0, 400) : [];
  const hoy: string = (body.hoy as string) || new Date().toISOString().slice(0, 10);

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

  const res = await fetch(URL_IA, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: "system", content: PROMPT_PLAN },
        { role: "user", content },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "proponer_plan",
            description: "Devuelve el plan estructurado que Rafa propone al usuario a partir de su instrucción y de los archivos adjuntos.",
            parameters: PLAN_PARAMETROS,
          },
        },
      ],
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
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
