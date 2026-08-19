// Tipos y utilidades del asistente "Rafa".
// Rafa interpreta una instrucción (audio o texto) + archivos y propone un plan
// que el usuario revisa y confirma antes de guardarse.

import type { FrecuenciaConCadencia } from "@/lib/project-utils";

export interface PlanPartida {
  clave?: string;
  descripcion: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  cuenta_codigo?: string;
}

export interface PlanRafa {
  transcripcion?: string;
  resumen: string;
  empresa_detectada?: string;
  centro_negocio: { nombre: string; tipo_actividad?: string };
  tercero: { nombre: string; rol?: string };
  iva: { incluir: boolean; tasa: number };
  total_objetivo?: number;
  partidas: PlanPartida[];
  programacion: {
    tipo: "ingreso" | "egreso";
    frecuencia: FrecuenciaConCadencia;
    numero_pagos: number;
    fecha_inicio: string;
    notas?: string;
  };
}

export interface PartidaEditable {
  key: string;
  /** Id del presupuesto ya guardado en la base (si la sesión ya se aplicó). */
  presupuestoId?: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  cuentaId: string;
}

export interface PropuestaEditable {
  empresaId: string;
  centro: { modo: "existente" | "nuevo"; id: string; nombre: string; tipoActividad: string };
  tercero: { modo: "existente" | "nuevo" | "ninguno"; id: string; nombre: string };
  ivaIncluir: boolean;
  ivaTasa: number;
  partidas: PartidaEditable[];
  formatoTexto?: FormatoTexto;
  programacion: {
    tipo: "ingreso" | "egreso";
    frecuencia: FrecuenciaConCadencia;
    fechaInicio: string;
    numeroPagos: number;
  };
  /** Rastro de lo ya guardado para que volver a guardar actualice, no duplique. */
  aplicado?: {
    centroId?: string;
    terceroId?: string | null;
    presupuestoIds?: string[];
  };
}

export interface CatalogoItem {
  id: string;
  nombre: string;
  empresa_id?: string;
  codigo?: string;
}

/** Normaliza texto para comparar: sin acentos, minúsculas, sin puntuación. */
export function normalizar(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Puntúa qué tanto se parecen dos textos (0 a 1) por coincidencia de palabras. */
export function similitud(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let comunes = 0;
  ta.forEach((t) => {
    if (t.length > 2 && tb.has(t)) comunes += 1;
  });
  return comunes / Math.max(ta.size, tb.size);
}

/** Devuelve el elemento más parecido del catálogo (o null si nada supera el umbral). */
export function mejorCoincidencia<T extends { id: string; nombre: string }>(
  nombre: string,
  catalogo: T[],
  umbral = 0.34
): T | null {
  let mejor: T | null = null;
  let mejorScore = 0;
  catalogo.forEach((item) => {
    const score = similitud(nombre, item.nombre);
    if (score > mejorScore) {
      mejorScore = score;
      mejor = item;
    }
  });
  return mejorScore >= umbral ? mejor : null;
}

/** Importe de una partida ya con IVA aplicado si corresponde. */
export function importePartida(p: PartidaEditable, ivaIncluir: boolean, ivaTasa: number): number {
  const base = p.cantidad * p.precioUnitario;
  return ivaIncluir ? base * (1 + ivaTasa / 100) : base;
}

/** Precio unitario final que se guardará en el presupuesto. */
export function precioUnitarioFinal(p: PartidaEditable, ivaIncluir: boolean, ivaTasa: number): number {
  return ivaIncluir ? p.precioUnitario * (1 + ivaTasa / 100) : p.precioUnitario;
}

/** Formato de texto aplicable a las descripciones de las partidas. */
export type FormatoTexto = "original" | "mayusculas" | "minusculas" | "oracion";

export const FORMATOS_TEXTO: { valor: FormatoTexto; etiqueta: string }[] = [
  { valor: "original", etiqueta: "Como viene" },
  { valor: "mayusculas", etiqueta: "MAYÚSCULAS" },
  { valor: "minusculas", etiqueta: "minúsculas" },
  { valor: "oracion", etiqueta: "Formato oración" },
];

/** Aplica el formato de texto elegido a un texto. */
export function aplicarFormatoTexto(texto: string, formato: FormatoTexto): string {
  const limpio = (texto || "").trim();
  if (!limpio) return limpio;
  switch (formato) {
    case "mayusculas":
      return limpio.toUpperCase();
    case "minusculas":
      return limpio.toLowerCase();
    case "oracion": {
      const bajo = limpio.toLowerCase();
      return bajo.charAt(0).toUpperCase() + bajo.slice(1);
    }
    default:
      return limpio;
  }
}
