// Garantiza que el conocimiento de Rafa está sincronizado con la
// documentación, el esquema, los tipos y el catálogo real de herramientas.
// Si falla: ejecuta `npm run rafa:conocimiento` (y, si cambiaron migraciones,
// extrae el esquema con supabase/tests/rafa/extraer_esquema.sh).
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { calcularVersion, fuentesConocimiento } from "../../scripts/rafa-conocimiento.mjs";
import { generarMarkdownHerramientas } from "../../scripts/rafa-herramientas.mjs";
import { CONOCIMIENTO } from "../../supabase/functions/_shared/rafa/conocimiento.generado";
import { HERRAMIENTAS } from "../../supabase/functions/_shared/rafa/registro";
import { buscarConocimiento } from "../../supabase/functions/_shared/rafa/conocimiento";

const RAIZ = join(__dirname, "../..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

describe("conocimiento versionado de Rafa", () => {
  it("la versión generada corresponde a las fuentes actuales", () => {
    expect(CONOCIMIENTO.version).toBe(calcularVersion(fuentesConocimiento()));
  });

  it("el esquema extraído corresponde a las migraciones actuales", () => {
    const dir = join(RAIZ, "supabase/migrations");
    const contenido = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("");
    const hash = createHash("sha256").update(contenido).digest("hex");
    expect((CONOCIMIENTO.esquema as { migraciones_sha256: string }).migraciones_sha256).toBe(hash);
  });

  it("cada tabla de los tipos generados existe en el esquema y está documentada", () => {
    const tipos = leer("src/integrations/supabase/types.ts");
    const bloque = tipos.slice(tipos.indexOf("Tables: {"), tipos.indexOf("Views: {"));
    const tablas = Array.from(bloque.matchAll(/^ {6}([a-z_]+): \{$/gm)).map((m) => m[1]);
    expect(tablas.length).toBeGreaterThan(10);
    const esquema = (CONOCIMIENTO.esquema as { tablas: Record<string, unknown> }).tablas;
    const docs = readdirSync(join(RAIZ, "docs/rafa/modulos")).map((f) => leer(`docs/rafa/modulos/${f}`)).join("\n");
    for (const t of tablas) {
      expect(esquema[t], `tabla ${t} en esquema-local.json`).toBeDefined();
      expect(docs.includes(`\`${t}\``), `tabla ${t} documentada en docs/rafa/modulos`).toBe(true);
    }
  });

  it("el catálogo de herramientas generado coincide con el registro real", () => {
    expect(leer("docs/rafa/herramientas.md")).toBe(generarMarkdownHerramientas());
    const nombres = HERRAMIENTAS.map((h) => h.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    const cobertura = leer("docs/rafa/cobertura.md");
    for (const n of nombres) expect(cobertura.includes(n), `herramienta ${n} en la matriz de cobertura`).toBe(true);
  });

  it("recupera los fragmentos pertinentes para preguntas típicas", () => {
    const primero = (q: string) => buscarConocimiento(q, { limite: 3 }).map((f) => f.modulo);
    expect(primero("¿cuánto llevamos ejercido de una partida?")).toEqual(expect.arrayContaining(["presupuestos"]));
    expect(primero("qué pasa al ejecutar una programación de tesorería")).toEqual(expect.arrayContaining(["acciones"]));
    expect(primero("diferencia entre flujos programados y programación financiera del proyecto")).toEqual(
      expect.arrayContaining(["flujos-programados"])
    );
  });
});
