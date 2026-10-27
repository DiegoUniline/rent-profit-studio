// Supabase (PostgREST) devuelve máximo 1000 filas por consulta y los filtros
// .in() con cientos de ids revientan el largo de la URL. Estos helpers paginan
// y parten en bloques para traer TODO.
// La consulta debe tener un orden determinístico (termina en .order("id")).

// Error de PostgREST (PostgrestError) o null.
type ErrorConsulta = { message: string } | null;
type Respuesta<T> = { data: T[] | null; error: ErrorConsulta };

const TAM_PAGINA = 1000;
const TAM_BLOQUE = 150;

export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
  tam = TAM_PAGINA
): Promise<{ data: T[]; error: ErrorConsulta }> {
  let todos: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await consulta(desde, desde + tam - 1);
    if (error) return { data: todos, error };
    todos = todos.concat(data || []);
    if (!data || data.length < tam) break;
  }
  return { data: todos, error: null };
}

/** Igual que traerTodo, pero parte una lista de ids en bloques para usarla en .in(). */
export async function traerPorBloques<T, I = string>(
  ids: readonly I[],
  consulta: (bloque: I[], desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
  tamBloque = TAM_BLOQUE
): Promise<{ data: T[]; error: ErrorConsulta }> {
  const unicos = Array.from(new Set(ids.filter((x) => x !== null && x !== undefined && (x as unknown) !== "")));
  let todos: T[] = [];
  for (let i = 0; i < unicos.length; i += tamBloque) {
    const bloque = unicos.slice(i, i + tamBloque);
    const r = await traerTodo<T>((d, h) => consulta(bloque, d, h));
    if (r.error) return { data: todos, error: r.error };
    todos = todos.concat(r.data);
  }
  return { data: todos, error: null };
}
