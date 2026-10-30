/* eslint-disable @typescript-eslint/no-explicit-any */
// Esquema del plan de presupuesto que Rafa ya generaba (modo "plan") y que la
// interfaz convierte en una propuesta editable (src/pages/Rafa.tsx →
// RafaPropuesta → aplicarPlanRafa). Compartido por el modo plan y el chat.

import type { Contexto, EsquemaJson, Herramienta } from "./tipos.ts";
import { ROLES_CONTABLES, exigirContable } from "./permisos.ts";
import { leerTodo } from "./datos.ts";
import { nombreCanonico } from "./herramientas/reprogramacion.ts";

/** Misma comparación que usa el guardado del editor (src/lib/rafa-types.ts → normalizar). */
const textoGuardado = (t: string) =>
  (t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Partidas del plan que ya existen en su centro. Con el mismo texto el editor
 * las ACTUALIZA al guardar; con otro texto que es la misma partida ("Mza 1
 * Lote 5" vs "Mza 01 Lte 05 98 m2") se crearían DUPLICADAS: se avisan aparte.
 */
export async function partidasYaExistentes(ctx: Contexto, plan: Record<string, unknown>) {
  const nombreCentro = textoGuardado(String((plan.centro_negocio as any)?.nombre || ""));
  const conceptos = (Array.isArray(plan.partidas) ? plan.partidas : []).map((x: any) => String(x?.descripcion || "")).filter(Boolean);
  if (!nombreCentro || !conceptos.length) return null;
  const { data: centros } = await ctx.db.from("centros_negocio").select("id, codigo, nombre").eq("activo", true);
  const candidatos = ((centros || []) as any[]).filter(
    (c) => nombreCentro === textoGuardado(c.codigo) || nombreCentro.includes(textoGuardado(c.nombre))
  );
  if (candidatos.length !== 1) return null;
  const centro = candidatos[0];
  const { filas } = await leerTodo<{ partida: string }>(() =>
    ctx.db.from("presupuestos").select("id, partida").eq("centro_negocio_id", centro.id).eq("activo", true).order("id")
  );
  const mismoTexto = new Set(filas.map((f) => textoGuardado(f.partida)));
  const porCanonico = new Map(filas.map((f) => [nombreCanonico(f.partida), f.partida]));
  const actualizan: string[] = [];
  const duplicarian: string[] = [];
  conceptos.forEach((c) => {
    if (mismoTexto.has(textoGuardado(c))) actualizan.push(c);
    else if (porCanonico.has(nombreCanonico(c))) duplicarian.push(`${c} (ya existe como "${porCanonico.get(nombreCanonico(c))}")`);
  });
  return { centro: `${centro.codigo} · ${centro.nombre}`, actualizan, duplicarian };
}

export const PLAN_PARAMETROS: EsquemaJson = {
  type: "object",
  additionalProperties: true,
  properties: {
    transcripcion: { type: "string", description: "Transcripción literal del audio, vacío si no hubo audio." },
    resumen: { type: "string", description: "Resumen en español de lo que se va a hacer, en 1-3 frases." },
    empresa_detectada: { type: "string", description: "Nombre de la empresa mencionada; vacío si no se menciona." },
    centro_negocio: {
      type: "object",
      additionalProperties: true,
      properties: { nombre: { type: "string" }, tipo_actividad: { type: "string" } },
      required: ["nombre"],
    },
    tercero: {
      type: "object",
      additionalProperties: true,
      properties: {
        nombre: { type: "string", description: "Nombre del contratista/tercero; vacío si no se menciona." },
        rol: { type: "string" },
      },
      required: ["nombre"],
    },
    iva: {
      type: "object",
      additionalProperties: true,
      properties: {
        incluir: { type: "boolean", description: "true si el importe de cada partida debe incluir IVA." },
        tasa: { type: "number", description: "Tasa de IVA en porcentaje, normalmente 16." },
      },
      required: ["incluir", "tasa"],
    },
    total_objetivo: { type: "number", description: "Total del presupuesto mencionado por el usuario o del archivo. 0 si no aplica." },
    partidas: {
      type: "array",
      description: "Una entrada por concepto del archivo, en el mismo orden.",
      items: {
        type: "object",
        additionalProperties: true,
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
      additionalProperties: true,
      properties: {
        tipo: { type: "string", enum: ["ingreso", "egreso"] },
        frecuencia: { type: "string", enum: ["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"] },
        numero_pagos: { type: "number" },
        fecha_inicio: { type: "string", description: "Fecha ISO yyyy-mm-dd del primer pago." },
        notas: { type: "string" },
      },
      required: ["tipo", "frecuencia", "numero_pagos", "fecha_inicio"],
    },
  },
  required: ["resumen", "centro_negocio", "tercero", "iva", "partidas", "programacion"],
};

export const PROMPT_PLAN =
  "Eres Rafa, asistente contable de una empresa mexicana. Interpretas instrucciones habladas o escritas junto con catálogos de conceptos (presupuestos de obra) y devuelves SIEMPRE un plan estructurado con la herramienta proponer_plan. Nunca inventes partidas: usa exactamente las del archivo. Los precios unitarios van SIN IVA; si el usuario pide sumar IVA, marca iva.incluir = true con la tasa indicada (16 por defecto). Sugiere para cada partida la cuenta contable más parecida del catálogo recibido. Responde en español.";

export const proponerPlanPresupuestoTool: Herramienta<Record<string, unknown>> = {
  nombre: "proponer_plan_presupuesto",
  modulo: "presupuestos",
  tipo: "accion",
  descripcion:
    "Convierte un catálogo de conceptos adjunto (PDF/imagen/texto) en un PLAN de presupuesto editable (centro, tercero, IVA, partidas y flujo de pagos). No guarda nada: la interfaz abre el editor y el usuario guarda. Usa exactamente las partidas del archivo; no inventes conceptos, precios ni cuentas.",
  parametros: PLAN_PARAMETROS,
  roles: ROLES_CONTABLES,
  validaciones: ["admin/contador", "Al guardar, la interfaz aplica RLS (alta de partidas solo admin)"],
  devuelve: "Plan estructurado para el editor existente de propuestas de Rafa.",
  confirmacion: "siempre",
  async ejecutar(ctx, plan) {
    exigirContable(ctx, "preparar planes de presupuesto");
    const partidas = Array.isArray(plan.partidas) ? plan.partidas.length : 0;
    const existentes = await partidasYaExistentes(ctx, plan).catch(() => null);
    const lista = (xs: string[]) => `${xs.slice(0, 8).join(", ")}${xs.length > 8 ? ` y ${xs.length - 8} más` : ""}`;
    const advertencias = [
      ...(existentes?.duplicarian.length
        ? [`${existentes.duplicarian.length} partida(s) ya existen en ${existentes.centro} con otro nombre y se DUPLICARÍAN al guardar: ${lista(existentes.duplicarian)}. Quítalas del plan o usa el nombre exacto.`]
        : []),
      ...(existentes?.actualizan.length
        ? [`${existentes.actualizan.length} de ${partidas} partida(s) ya existen en ${existentes.centro}; al guardar se ACTUALIZAN, no se duplican: ${lista(existentes.actualizan)}.`]
        : []),
    ];
    return {
      ok: true,
      tipo: "plan",
      resumen: `PROPUESTA de plan con ${partidas} partidas lista para revisar en el editor; no se guardó nada.${advertencias.length ? ` AVISA AL USUARIO: ${advertencias.join(" ")}` : ""}`,
      advertencias,
      datos: { plan, existentes },
    };
  },
};
