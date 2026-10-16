// Genera docs/rafa/herramientas.md a partir del registro REAL de herramientas
// (supabase/functions/_shared/rafa/registro.ts). Ejecutar con Node ≥ 22.18.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HERRAMIENTAS } from "../supabase/functions/_shared/rafa/registro.ts";

const TIPOS = { conocimiento: "Conocimiento", consulta: "Consulta", simulacion: "Simulación", accion: "Acción" };
const CONF = { nunca: "No", siempre: "Sí, en la interfaz", si_masivo: "Solo si es masiva (> 3)" };

function parametros(esquema) {
  const props = esquema.properties || {};
  const req = new Set(esquema.required || []);
  const filas = Object.entries(props).map(([k, v]) => {
    const tipo = v.enum ? v.enum.join(" / ") : v.format ? `${v.type} (${v.format})` : v.type;
    return `\`${k}\`${req.has(k) ? " *" : ""} — ${tipo}${v.description ? `: ${v.description}` : ""}`;
  });
  return filas.length ? filas.map((f) => `- ${f}`).join("\n") : "- (sin parámetros)";
}

export function generarMarkdownHerramientas() {
let md = `# Catálogo de herramientas de Rafa

ARCHIVO GENERADO por \`scripts/rafa-herramientas.mjs\` desde \`supabase/functions/_shared/rafa/registro.ts\`. No editar a mano: ejecuta \`npm run rafa:conocimiento\`.

Cada herramienta valida su entrada contra el esquema (rechaza parámetros no declarados), verifica el rol en el servidor y consulta con el JWT del usuario (RLS). Las acciones escriben solo mediante RPC transaccionales (\`rafa_*\`) y quedan en \`rafa_acciones\`.

| Herramienta | Módulo | Tipo | Roles | Confirmación |
|---|---|---|---|---|
${HERRAMIENTAS.map((h) => `| \`${h.nombre}\` | ${h.modulo} | ${TIPOS[h.tipo]} | ${h.roles.join(", ")} | ${CONF[h.confirmacion]} |`).join("\n")}
`;

for (const h of HERRAMIENTAS) {
  md += `
## ${h.nombre}

${h.descripcion}

- Módulo: ${h.modulo}. Tipo: ${TIPOS[h.tipo]}. Roles: ${h.roles.join(", ")}. Confirmación: ${CONF[h.confirmacion]}.
- Validaciones: ${h.validaciones.join("; ")}.
- Devuelve: ${h.devuelve}

Parámetros (* obligatorio):
${parametros(h.parametros)}
`;
}
return md;
}

if (import.meta.url.startsWith("file:") && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(new URL("../docs/rafa/herramientas.md", import.meta.url), generarMarkdownHerramientas());
  console.log(`docs/rafa/herramientas.md: ${HERRAMIENTAS.length} herramientas`);
}
