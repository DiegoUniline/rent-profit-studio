// Validación de entradas de herramientas contra el mismo esquema JSON que se
// envía al modelo. Rechaza propiedades no declaradas y tipos incorrectos: el
// modelo no puede colar parámetros que la herramienta no espera.

import type { EsquemaJson } from "./tipos.ts";
import { esFechaIso } from "../negocio/fechas.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function validarEntrada(esquema: EsquemaJson, valor: unknown, ruta = "entrada"): string[] {
  const errores: string[] = [];

  const tipoDe = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

  switch (esquema.type) {
    case "object": {
      if (tipoDe(valor) !== "object") return [`${ruta}: se esperaba un objeto`];
      const obj = valor as Record<string, unknown>;
      const props = esquema.properties || {};
      for (const req of esquema.required || []) {
        if (obj[req] === undefined || obj[req] === null) errores.push(`${ruta}.${req}: es obligatorio`);
      }
      for (const [k, v] of Object.entries(obj)) {
        if (!props[k]) {
          if (esquema.additionalProperties !== true) errores.push(`${ruta}.${k}: parámetro no permitido`);
          continue;
        }
        if (v === undefined || v === null) continue;
        errores.push(...validarEntrada(props[k], v, `${ruta}.${k}`));
      }
      break;
    }
    case "array": {
      if (!Array.isArray(valor)) return [`${ruta}: se esperaba una lista`];
      if (esquema.minItems !== undefined && valor.length < esquema.minItems) errores.push(`${ruta}: mínimo ${esquema.minItems} elementos`);
      if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) errores.push(`${ruta}: máximo ${esquema.maxItems} elementos`);
      if (esquema.items) valor.forEach((v, i) => errores.push(...validarEntrada(esquema.items!, v, `${ruta}[${i}]`)));
      break;
    }
    case "string": {
      if (typeof valor !== "string") return [`${ruta}: se esperaba texto`];
      if (esquema.enum && !esquema.enum.includes(valor)) errores.push(`${ruta}: valor no permitido (${esquema.enum.join(", ")})`);
      if (esquema.format === "uuid" && !esUuid(valor)) errores.push(`${ruta}: identificador inválido`);
      if (esquema.format === "date" && !esFechaIso(valor)) errores.push(`${ruta}: fecha inválida (formato yyyy-mm-dd)`);
      if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) errores.push(`${ruta}: máximo ${esquema.maxLength} caracteres`);
      break;
    }
    case "number":
    case "integer": {
      if (typeof valor !== "number" || !Number.isFinite(valor)) return [`${ruta}: se esperaba un número`];
      if (esquema.type === "integer" && !Number.isInteger(valor)) errores.push(`${ruta}: se esperaba un entero`);
      if (esquema.minimum !== undefined && valor < esquema.minimum) errores.push(`${ruta}: mínimo ${esquema.minimum}`);
      if (esquema.maximum !== undefined && valor > esquema.maximum) errores.push(`${ruta}: máximo ${esquema.maximum}`);
      if (esquema.enum && !esquema.enum.includes(valor)) errores.push(`${ruta}: valor no permitido`);
      break;
    }
    case "boolean":
      if (typeof valor !== "boolean") errores.push(`${ruta}: se esperaba verdadero/falso`);
      break;
  }
  return errores;
}

// Atajos para declarar esquemas legibles.
export const s = {
  uuid: (description: string): EsquemaJson => ({ type: "string", format: "uuid", description }),
  fecha: (description: string): EsquemaJson => ({ type: "string", format: "date", description }),
  texto: (description: string, maxLength = 500): EsquemaJson => ({ type: "string", description, maxLength }),
  enumerado: (valores: string[], description: string): EsquemaJson => ({ type: "string", enum: valores, description }),
  numero: (description: string, minimum?: number, maximum?: number): EsquemaJson => ({ type: "number", description, minimum, maximum }),
  entero: (description: string, minimum?: number, maximum?: number): EsquemaJson => ({ type: "integer", description, minimum, maximum }),
  booleano: (description: string): EsquemaJson => ({ type: "boolean", description }),
  lista: (items: EsquemaJson, description: string, maxItems = 200): EsquemaJson => ({ type: "array", items, description, maxItems }),
  objeto: (properties: Record<string, EsquemaJson>, required: string[] = [], description?: string): EsquemaJson => ({
    type: "object",
    properties,
    required,
    description,
  }),
};
