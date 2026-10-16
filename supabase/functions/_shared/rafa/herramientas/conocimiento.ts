import type { Herramienta } from "../tipos.ts";
import { s } from "../validacion.ts";
import { BASE, buscarConocimiento, describirTabla, listarModulos } from "../conocimiento.ts";
import { TODOS_LOS_ROLES } from "../permisos.ts";

export const buscarConocimientoTool: Herramienta<{ consulta: string; modulo?: string }> = {
  nombre: "buscar_conocimiento",
  modulo: "conocimiento",
  tipo: "conocimiento",
  descripcion:
    "Busca en la documentación versionada del sistema (módulos, tablas, reglas, fórmulas, estados, permisos, acciones y origen de cifras). Úsala para explicar CÓMO funciona algo; no devuelve datos actuales.",
  parametros: s.objeto(
    {
      consulta: s.texto("Pregunta o términos a buscar", 300),
      modulo: s.texto("Opcional: limita a un módulo (por ejemplo presupuestos, programaciones, proyectos, cifras, esquema)", 60),
    },
    ["consulta"]
  ),
  roles: TODOS_LOS_ROLES,
  validaciones: ["Consulta de texto obligatoria"],
  devuelve: "Fragmentos relevantes con sus fuentes y la versión del conocimiento.",
  confirmacion: "nunca",
  async ejecutar(ctx, entrada) {
    const resultados = buscarConocimiento(entrada.consulta, { modulo: entrada.modulo, limite: 5 });
    return {
      ok: true,
      tipo: "conocimiento",
      resumen: resultados.length
        ? `Encontré ${resultados.length} fragmentos de documentación (versión ${BASE.version}).`
        : `No encontré documentación para esa consulta. Módulos disponibles: ${listarModulos().join(", ")}.`,
      datos: {
        version: BASE.version,
        fragmentos: resultados.map((r) => ({ id: r.id, modulo: r.modulo, titulo: r.titulo, texto: r.texto, fuentes: r.fuentes })),
      },
      referencias: resultados.map((r) => ({ entidad: "documento", id: r.id, etiqueta: r.titulo })),
    };
  },
};

export const describirEntidadTool: Herramienta<{ tabla: string }> = {
  nombre: "describir_entidad",
  modulo: "conocimiento",
  tipo: "conocimiento",
  descripcion:
    "Describe una tabla del sistema según el esquema local versionado: columnas con tipo, obligatoriedad y valores predeterminados, llaves y relaciones físicas, triggers y políticas RLS. Complementa con buscar_conocimiento para el significado de negocio.",
  parametros: s.objeto({ tabla: s.texto("Nombre de la tabla, por ejemplo presupuestos o programaciones", 80) }, ["tabla"]),
  roles: TODOS_LOS_ROLES,
  validaciones: ["La tabla debe existir en el esquema versionado"],
  devuelve: "Definición de la tabla y advertencia de que es SQL local (no certifica la base real).",
  confirmacion: "nunca",
  async ejecutar(_ctx, entrada) {
    const nombre = entrada.tabla.trim().toLowerCase();
    const def = describirTabla(nombre);
    if (!def) {
      return {
        ok: false,
        tipo: "error",
        resumen: `La tabla ${nombre} no está en el esquema documentado.`,
        error: "tabla_desconocida",
        datos: { tablas: Object.keys(BASE.esquema.tablas) },
      };
    }
    return {
      ok: true,
      tipo: "conocimiento",
      resumen: `Tabla ${nombre}: ${def.columnas.length} columnas, ${def.restricciones.filter((r) => r.tipo === "FK").length} llaves foráneas, RLS ${def.rls ? "activado" : "desactivado"}.`,
      datos: { tabla: nombre, origen: BASE.esquema.origen, version: BASE.version, ...def },
      tablas: [
        {
          titulo: `Columnas de ${nombre}`,
          columnas: [
            { clave: "nombre", etiqueta: "Columna" },
            { clave: "tipo", etiqueta: "Tipo" },
            { clave: "nulo", etiqueta: "Admite nulo" },
            { clave: "defecto", etiqueta: "Valor predeterminado" },
          ],
          filas: def.columnas.map((c) => ({ ...c, nulo: c.nulo ? "Sí" : "No", defecto: c.defecto ?? "—" })),
        },
      ],
    };
  },
};
