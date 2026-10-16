/* eslint-disable @typescript-eslint/no-explicit-any */
// Tipos del asistente Rafa (servidor). Sin dependencias de runtime: se usan en
// la Edge Function (Deno) y en las pruebas (Vitest).

export type Rol = "admin" | "contador" | "usuario" | "arquitecto";

/** Cliente Supabase (supabase-js v2). Se tipa de forma mínima para no acoplar runtimes. */
export interface ClienteDb {
  from(tabla: string): any;
  rpc(fn: string, args?: Record<string, unknown>): any;
}

export interface UsuarioRafa {
  id: string;
  email: string | null;
  roles: Rol[];
}

export interface ContextoPantalla {
  ruta?: string;
  empresa_id?: string;
  proyecto_id?: string;
  registro?: { entidad: string; id: string };
}

export interface ContextoConversacion {
  empresa_id?: string;
  empresa_nombre?: string;
  proyecto_id?: string;
  proyecto_nombre?: string;
  periodo?: { desde: string; hasta: string };
  ultimas_referencias?: Referencia[];
}

export interface Contexto {
  /** Cliente con el JWT del usuario: toda lectura/escritura de negocio pasa por RLS. */
  db: ClienteDb;
  /** Cliente de servicio: SOLO para la bitácora de Rafa (mensajes y acciones). */
  servicio: ClienteDb;
  usuario: UsuarioRafa;
  hoy: string;
  conversacionId: string | null;
  versionConocimiento: string;
}

export type TipoHerramienta = "conocimiento" | "consulta" | "simulacion" | "accion";

export interface ColumnaTabla {
  clave: string;
  etiqueta: string;
  tipo?: "texto" | "moneda" | "numero" | "fecha" | "porcentaje" | "enlace";
}

export interface Tabla {
  titulo: string;
  columnas: ColumnaTabla[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
}

export interface Referencia {
  entidad: string;
  id: string;
  etiqueta: string;
  enlace?: string;
}

export interface Alcance {
  empresa?: { id: string; nombre: string } | null;
  proyecto?: { id: string; nombre: string } | null;
  periodo?: { desde: string; hasta: string } | null;
  filtros?: Record<string, unknown>;
  /** Registros considerados en el cálculo o devueltos. */
  registros: number;
  /** Total de registros que cumplen el filtro, si se conoce. */
  total?: number | null;
  /** true si se llegó a un límite y la respuesta NO cubre todos los registros. */
  truncado: boolean;
  nota?: string;
}

export interface AccionResumen {
  id: string;
  estado: string;
  herramienta: string;
  descripcion: string;
  requiere_confirmacion: boolean;
  huella: string;
  vista_previa: unknown;
  expira_at?: string;
  resultado?: unknown;
  error?: string | null;
}

export interface ResultadoHerramienta {
  ok: boolean;
  tipo: TipoHerramienta | "error" | "plan";
  resumen: string;
  alcance?: Alcance;
  datos?: unknown;
  tablas?: Tabla[];
  referencias?: Referencia[];
  accion?: AccionResumen;
  /** Decisiones o datos indispensables que faltan para continuar. */
  faltantes?: string[];
  advertencias?: string[];
  error?: string;
}

export type EsquemaJson = {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, EsquemaJson>;
  required?: string[];
  items?: EsquemaJson;
  enum?: (string | number)[];
  format?: "uuid" | "date";
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  minItems?: number;
  maxLength?: number;
  additionalProperties?: boolean;
};

export interface Herramienta<E = any> {
  nombre: string;
  modulo: string;
  tipo: TipoHerramienta;
  descripcion: string;
  parametros: EsquemaJson;
  /** Roles que pueden usarla (se verifica en el servidor antes de ejecutar). */
  roles: Rol[];
  /** Qué valida y qué devuelve (documentación para el catálogo). */
  validaciones: string[];
  devuelve: string;
  confirmacion: "nunca" | "siempre" | "si_masivo";
  ejecutar(ctx: Contexto, entrada: E): Promise<ResultadoHerramienta>;
}
