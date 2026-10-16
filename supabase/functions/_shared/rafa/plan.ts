// Esquema del plan de presupuesto que Rafa ya generaba (modo "plan") y que la
// interfaz convierte en una propuesta editable (src/pages/Rafa.tsx →
// RafaPropuesta → aplicarPlanRafa). Compartido por el modo plan y el chat.

import type { EsquemaJson, Herramienta } from "./tipos.ts";
import { ROLES_CONTABLES, exigirContable } from "./permisos.ts";

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
    return {
      ok: true,
      tipo: "plan",
      resumen: `PROPUESTA de plan con ${partidas} partidas lista para revisar en el editor; no se guardó nada.`,
      datos: { plan },
    };
  },
};
