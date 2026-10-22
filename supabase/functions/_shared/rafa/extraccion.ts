// Extracción COMPLETA de partidas de los archivos adjuntos, sin límite de tamaño.
// Un solo llamado al modelo se corta con catálogos grandes (p. ej. 560 lotes),
// así que cada PDF se divide en bloques de pocas páginas, se extraen en paralelo
// y se unen en el mismo orden del archivo.

import { PDFDocument } from "npm:pdf-lib@1.17.1";

export interface ArchivoAdjunto {
  filename: string;
  mime: string;
  data: string; // base64 sin prefijo
}

export interface PartidaExtraida {
  clave?: string;
  descripcion: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  cuenta_codigo?: string;
}

type Cuentas = { codigo: string; nombre: string }[];
/** Recibe el plan del modelo y lo devuelve con TODAS las partidas del archivo. */
export type Extractor = (plan: Record<string, unknown>, instruccion: string, cuentas?: Cuentas) => Promise<Record<string, unknown>>;

const PAGINAS_POR_BLOQUE = 1;
const PARALELO = 6;
const REINTENTOS = 2;

const PARAMETROS = {
  type: "object",
  properties: {
    partidas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clave: { type: "string" },
          descripcion: { type: "string" },
          unidad: { type: "string" },
          cantidad: { type: "number" },
          precio_unitario: { type: "number", description: "SIN IVA" },
          importe: { type: "number", description: "SIN IVA" },
          cuenta_codigo: { type: "string" },
        },
        required: ["descripcion", "cantidad", "precio_unitario", "importe"],
      },
    },
  },
  required: ["partidas"],
};

function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function deBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Divide cada PDF en bloques de pocas páginas; imágenes quedan como un bloque. */
export async function dividirArchivos(archivos: ArchivoAdjunto[]): Promise<ArchivoAdjunto[]> {
  const bloques: ArchivoAdjunto[] = [];
  for (const a of archivos) {
    const esPdf = (a.mime || "application/pdf").includes("pdf");
    if (!esPdf) {
      bloques.push(a);
      continue;
    }
    try {
      const doc = await PDFDocument.load(deBase64(a.data), { ignoreEncryption: true });
      const total = doc.getPageCount();
      if (total <= PAGINAS_POR_BLOQUE) {
        bloques.push(a);
        continue;
      }
      for (let ini = 0; ini < total; ini += PAGINAS_POR_BLOQUE) {
        const parte = await PDFDocument.create();
        const idx = Array.from({ length: Math.min(PAGINAS_POR_BLOQUE, total - ini) }, (_, k) => ini + k);
        (await parte.copyPages(doc, idx)).forEach((p) => parte.addPage(p));
        bloques.push({ filename: `${a.filename} (págs ${ini + 1}-${ini + idx.length})`, mime: "application/pdf", data: aBase64(await parte.save()) });
      }
    } catch {
      bloques.push(a); // PDF que no se puede dividir: se envía completo.
    }
  }
  return bloques;
}

export function crearExtractor(opts: { url: string; apiKey: string; modelo: string; archivos: ArchivoAdjunto[] }): Extractor | null {
  const adjuntos = opts.archivos.filter((a) => !(a.mime || "").startsWith("audio/"));
  if (!adjuntos.length) return null;

  const extraerBloque = async (b: ArchivoAdjunto, instruccion: string, cuentas: string): Promise<PartidaExtraida[]> => {
    const parte = b.mime?.startsWith("image/")
      ? { type: "image_url", image_url: { url: `data:${b.mime};base64,${b.data}` } }
      : { type: "file", file: { filename: b.filename, file_data: `data:application/pdf;base64,${b.data}` } };
    let ultimoError = "";
    for (let intento = 0; intento <= REINTENTOS; intento++) {
      const res = await fetch(opts.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.modelo,
          messages: [
            {
              role: "system",
              content:
                "Extraes partidas de un FRAGMENTO de un catálogo de conceptos. Devuelve TODAS las filas de este fragmento, sin omitir ninguna, exactamente como vienen (clave, descripción, unidad, cantidad, precio unitario SIN IVA, importe SIN IVA). Si la instrucción del usuario pide solo una parte (por ejemplo una manzana o etapa), devuelve solo las filas que correspondan; si este fragmento no tiene ninguna, devuelve una lista vacía. No inventes filas. Ignora títulos y totales.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Instrucción del usuario: ${instruccion || "(extraer todo)"}${cuentas ? `\n\nCatálogo de cuentas (código — nombre), sugiere cuenta_codigo:\n${cuentas}` : ""}` },
                parte,
              ],
            },
          ],
          tools: [{ type: "function", function: { name: "extraer_partidas", description: "Devuelve las partidas del fragmento.", parameters: PARAMETROS } }],
          tool_choice: { type: "function", function: { name: "extraer_partidas" } },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        try {
          const p = JSON.parse(args || "{}").partidas;
          if (Array.isArray(p)) return p as PartidaExtraida[];
        } catch {
          ultimoError = "respuesta incompleta";
        }
      } else {
        ultimoError = `IA ${res.status}`;
        if (res.status === 402) break;
      }
      await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
    }
    throw new Error(`No pude leer ${b.filename} (${ultimoError}). Intenta de nuevo.`);
  };

  const extraerTodo = async (instruccion: string, cuentas?: Cuentas): Promise<PartidaExtraida[]> => {
    const bloques = await dividirArchivos(adjuntos);
    const textoCuentas = (cuentas || []).slice(0, 400).map((c) => `${c.codigo} — ${c.nombre}`).join("\n");
    const resultados: PartidaExtraida[][] = new Array(bloques.length);
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < bloques.length) {
        const i = siguiente++;
        resultados[i] = await extraerBloque(bloques[i], instruccion, textoCuentas);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALELO, bloques.length) }, trabajador));
    return resultados.flat();
  };
  return (plan, instruccion, cuentas) => completarPartidas(plan, extraerTodo, instruccion, cuentas);
}

/** Sustituye las partidas del plan por la extracción completa, conservando la cuenta sugerida por el modelo como respaldo. */
async function completarPartidas(plan: Record<string, unknown>, extractor: (i: string, c?: Cuentas) => Promise<PartidaExtraida[]>, instruccion: string, cuentas?: Cuentas): Promise<Record<string, unknown>> {
  const previas = Array.isArray(plan.partidas) ? (plan.partidas as PartidaExtraida[]) : [];
  const completas = await extractor(instruccion, cuentas);
  if (!completas || !completas.length) return plan;
  const cuentaComun = previas.find((p) => p.cuenta_codigo)?.cuenta_codigo;
  return {
    ...plan,
    partidas: completas.map((p) => ({ ...p, cuenta_codigo: p.cuenta_codigo || cuentaComun || "" })),
  };
}
