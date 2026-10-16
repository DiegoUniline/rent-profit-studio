// Recuperación de conocimiento del sistema. La base se genera desde
// docs/rafa/**/*.md y el esquema local (scripts/rafa-conocimiento.mjs) en
// conocimiento.generado.ts, con una versión = hash del contenido.
// Para cada pregunta se recuperan solo los fragmentos relevantes.

import { CONOCIMIENTO } from "./conocimiento.generado.ts";

export interface Fragmento {
  id: string;
  modulo: string;
  titulo: string;
  texto: string;
  fuentes: string[];
}

export interface ColumnaEsquema {
  nombre: string;
  tipo: string;
  nulo: boolean;
  defecto: string | null;
}

export interface TablaEsquema {
  columnas: ColumnaEsquema[];
  restricciones: { nombre: string; tipo: string; definicion: string }[];
  triggers: { nombre: string; definicion: string }[];
  politicas: { nombre: string; comando: string; roles: string; using: string | null; check: string | null }[];
  rls: boolean;
}

export interface BaseConocimiento {
  version: string;
  generado_en: string;
  fuentes: { archivo: string; sha256: string }[];
  fragmentos: Fragmento[];
  esquema: {
    origen: string;
    migraciones_sha256: string;
    tablas: Record<string, TablaEsquema>;
    funciones: { nombre: string; argumentos: string; seguridad: string }[];
    enums: Record<string, string[]>;
  };
}

export const BASE: BaseConocimiento = CONOCIMIENTO as unknown as BaseConocimiento;
export const VERSION_CONOCIMIENTO = BASE.version;

const VACIAS = new Set(
  "a al algo como con cual cuales de del el ella ellos en es esa ese eso esta este esto estos fue ha hay la las le lo los mas me mi muy no nos o para pero por que se si sin sobre su sus te tu un una uno unos y ya cuanto cuanta cuantos donde cuando quien".split(" ")
);

export function tokenizar(texto: string): string[] {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !VACIAS.has(t))
    .map((t) => (t.length > 5 && t.endsWith("es") ? t.slice(0, -2) : t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

let indice: { frag: Fragmento; titulo: Map<string, number>; cuerpo: Map<string, number>; largo: number }[] | null = null;
let df: Map<string, number> | null = null;

function construirIndice() {
  if (indice) return;
  indice = BASE.fragmentos.map((frag) => {
    const contar = (toks: string[]) => toks.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map<string, number>());
    const cuerpo = tokenizar(frag.texto);
    return { frag, titulo: contar(tokenizar(`${frag.titulo} ${frag.modulo}`)), cuerpo: contar(cuerpo), largo: cuerpo.length };
  });
  df = new Map();
  indice.forEach((d) => new Set([...d.titulo.keys(), ...d.cuerpo.keys()]).forEach((t) => df!.set(t, (df!.get(t) || 0) + 1)));
}

/** Busca fragmentos relevantes (BM25 simplificado, título con mayor peso). */
export function buscarConocimiento(consulta: string, opciones: { modulo?: string; limite?: number } = {}): (Fragmento & { puntaje: number })[] {
  construirIndice();
  const n = indice!.length;
  const promedio = indice!.reduce((s, d) => s + d.largo, 0) / Math.max(1, n);
  const terminos = Array.from(new Set(tokenizar(consulta)));
  const resultados = indice!
    .filter((d) => !opciones.modulo || d.frag.modulo === opciones.modulo)
    .map((d) => {
      let puntaje = 0;
      terminos.forEach((t) => {
        const idf = Math.log(1 + (n - (df!.get(t) || 0) + 0.5) / ((df!.get(t) || 0) + 0.5));
        const tf = d.cuerpo.get(t) || 0;
        const bm25 = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.largo / promedio)));
        puntaje += idf * (bm25 + 3 * (d.titulo.get(t) || 0));
      });
      return { ...d.frag, puntaje };
    })
    .filter((r) => r.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje);
  return resultados.slice(0, opciones.limite ?? 4);
}

export function describirTabla(tabla: string): TablaEsquema | null {
  return BASE.esquema.tablas[tabla] || null;
}

export function listarModulos(): string[] {
  return Array.from(new Set(BASE.fragmentos.map((f) => f.modulo))).sort();
}
