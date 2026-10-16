// Genera la base de conocimiento versionada de Rafa:
//   supabase/functions/_shared/rafa/conocimiento.generado.ts  (lo usa la Edge Function)
//   docs/rafa/esquema.md                                      (referencia legible del esquema)
// Fuentes: docs/rafa/**/*.md, docs/DATABASE.md y docs/rafa/esquema-local.json.
// La versión es un hash de todas las fuentes: cualquier cambio de
// documentación, esquema o catálogo de herramientas produce otra versión, y la
// prueba src/test/rafa-conocimiento.test.ts falla hasta regenerar.
// Uso: npm run rafa:conocimiento
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ES_ARCHIVO = import.meta.url.startsWith("file:");
const RAIZ = ES_ARCHIVO ? dirname(dirname(fileURLToPath(import.meta.url))) : process.cwd();
const sha = (t) => createHash("sha256").update(t).digest("hex");

function listar(dir) {
  return readdirSync(dir)
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? listar(p) : [p];
    })
    .sort();
}

export function fuentesConocimiento() {
  const docs = listar(join(RAIZ, "docs/rafa")).filter((p) => p.endsWith(".md") && !p.endsWith("esquema.md"));
  return [...docs, join(RAIZ, "docs/DATABASE.md"), join(RAIZ, "docs/rafa/esquema-local.json")].map((p) => relative(RAIZ, p));
}

export function calcularVersion(fuentes) {
  const h = createHash("sha256");
  for (const f of fuentes) {
    h.update(f);
    h.update("\0");
    h.update(readFileSync(join(RAIZ, f), "utf8"));
    h.update("\0");
  }
  return "k-" + h.digest("hex").slice(0, 12);
}

const slug = (t) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function extraerFuentes(texto) {
  const re = /(src\/[\w/.-]+\.(?:tsx?|md)|supabase\/[\w/.*-]+\.(?:sql|ts)|docs\/[\w/.-]+\.md|\b\d{14}_[\w-]+\.sql)/g;
  return Array.from(new Set(texto.match(re) || [])).slice(0, 12);
}

function fragmentarMarkdown(archivo, modulo) {
  const texto = readFileSync(join(RAIZ, archivo), "utf8");
  const lineas = texto.split("\n");
  const titulo = (lineas.find((l) => l.startsWith("# ")) || `# ${modulo}`).slice(2).trim();
  const fragmentos = [];
  let actual = { encabezado: "Introducción", cuerpo: [] };
  const cerrar = () => {
    const cuerpo = actual.cuerpo.join("\n").trim();
    if (!cuerpo) return;
    const partes = [];
    for (let i = 0; i < cuerpo.length; i += 2800) partes.push(cuerpo.slice(i, i + 2800));
    partes.forEach((p, i) =>
      fragmentos.push({
        id: `${modulo}#${slug(actual.encabezado)}${partes.length > 1 ? `-${i + 1}` : ""}`,
        modulo,
        titulo: `${titulo} › ${actual.encabezado}`,
        texto: p,
        fuentes: [archivo, ...extraerFuentes(p)],
      })
    );
  };
  for (const l of lineas) {
    if (/^#{2,4} /.test(l)) {
      cerrar();
      actual = { encabezado: l.replace(/^#+ /, "").trim(), cuerpo: [] };
    } else if (!l.startsWith("# ")) {
      actual.cuerpo.push(l);
    }
  }
  cerrar();
  // ids únicos
  const vistos = new Map();
  return fragmentos.map((f) => {
    const n = (vistos.get(f.id) || 0) + 1;
    vistos.set(f.id, n);
    return n > 1 ? { ...f, id: `${f.id}-${n}` } : f;
  });
}

function fragmentosEsquema(esquema) {
  return Object.entries(esquema.tablas).map(([tabla, def]) => {
    const cols = def.columnas
      .map((c) => `${c.nombre} ${c.tipo}${c.nulo ? "" : " obligatorio"}${c.defecto ? ` (por defecto ${c.defecto})` : ""}`)
      .join("; ");
    const restr = def.restricciones.map((r) => `${r.tipo} ${r.nombre}: ${r.definicion}`).join("; ");
    const trg = def.triggers.map((t) => t.nombre).join(", ") || "ninguno";
    const pol = def.politicas.map((p) => `${p.nombre} [${p.comando} ${p.roles}] using: ${p.using ?? "—"} check: ${p.check ?? "—"}`).join("; ") || "ninguna";
    return {
      id: `esquema#${tabla}`,
      modulo: "esquema",
      titulo: `Esquema › tabla ${tabla}`,
      texto: `Tabla ${tabla} (SQL local de migraciones; no certifica la base real). RLS ${def.rls ? "activado" : "desactivado"}. Columnas: ${cols}. Restricciones e índices: ${restr}. Triggers: ${trg}. Políticas: ${pol}.`,
      fuentes: ["docs/rafa/esquema-local.json"],
    };
  });
}

function esquemaMarkdown(esquema, version) {
  let md = `# Esquema de la base (SQL local)\n\nARCHIVO GENERADO por \`scripts/rafa-conocimiento.mjs\` desde \`docs/rafa/esquema-local.json\` (versión de conocimiento ${version}). Origen: ${esquema.origen}. Hash de migraciones: \`${esquema.migraciones_sha256.slice(0, 16)}\`.\n\nEl significado de negocio de cada tabla y campo está en \`docs/rafa/modulos/\`.\n`;
  for (const [tabla, def] of Object.entries(esquema.tablas)) {
    md += `\n## ${tabla}\n\nRLS: ${def.rls ? "activado" : "desactivado"}.\n\n| Columna | Tipo | Obligatorio | Predeterminado |\n|---|---|---|---|\n`;
    md += def.columnas.map((c) => `| ${c.nombre} | ${c.tipo} | ${c.nulo ? "No" : "Sí"} | ${c.defecto ? `\`${c.defecto}\`` : ""} |`).join("\n");
    md += `\n\nRestricciones e índices:\n${def.restricciones.map((r) => `- ${r.tipo} \`${r.nombre}\`: \`${r.definicion}\``).join("\n") || "- ninguna"}\n`;
    md += `\nTriggers:\n${def.triggers.map((t) => `- \`${t.nombre}\``).join("\n") || "- ninguno"}\n`;
    md += `\nPolíticas:\n${def.politicas.map((p) => `- ${p.nombre} (${p.comando}, ${p.roles}) USING \`${p.using ?? "—"}\` CHECK \`${p.check ?? "—"}\``).join("\n") || "- ninguna"}\n`;
  }
  md += `\n## Funciones\n\n${esquema.funciones.map((f) => `- \`${f.nombre}(${f.argumentos})\` — ${f.seguridad}`).join("\n")}\n\n## Enumeraciones\n\n${Object.entries(esquema.enums).map(([k, v]) => `- \`${k}\`: ${v.join(", ")}`).join("\n")}\n`;
  return md;
}

export function generar() {
  const fuentes = fuentesConocimiento();
  const version = calcularVersion(fuentes);
  const esquema = JSON.parse(readFileSync(join(RAIZ, "docs/rafa/esquema-local.json"), "utf8"));
  const fragmentos = [];
  for (const f of fuentes.filter((x) => x.endsWith(".md"))) {
    const modulo = f === "docs/DATABASE.md" ? "inventario-base-real" : f.replace(/^docs\/rafa\/(modulos\/)?/, "").replace(/\.md$/, "").toLowerCase();
    fragmentos.push(...fragmentarMarkdown(f, modulo === "readme" ? "indice" : modulo));
  }
  fragmentos.push(...fragmentosEsquema(esquema));
  const base = {
    version,
    generado_en: version,
    fuentes: fuentes.map((f) => ({ archivo: f, sha256: sha(readFileSync(join(RAIZ, f), "utf8")) })),
    fragmentos,
    esquema,
  };
  writeFileSync(
    join(RAIZ, "supabase/functions/_shared/rafa/conocimiento.generado.ts"),
    `// ARCHIVO GENERADO por scripts/rafa-conocimiento.mjs. No editar a mano.\n// Versión ${version}: ${fragmentos.length} fragmentos de ${fuentes.length} fuentes.\nexport const CONOCIMIENTO = ${JSON.stringify(base)};\n`
  );
  writeFileSync(join(RAIZ, "docs/rafa/esquema.md"), esquemaMarkdown(esquema, version));
  return { version, fragmentos: fragmentos.length, fuentes: fuentes.length };
}

if (ES_ARCHIVO && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = generar();
  console.log(`Conocimiento ${r.version}: ${r.fragmentos} fragmentos de ${r.fuentes} fuentes.`);
}
