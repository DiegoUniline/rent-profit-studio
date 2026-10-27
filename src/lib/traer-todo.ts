// Supabase devuelve máximo 1000 filas por consulta: esto pagina hasta traer todo.
// La consulta debe tener un orden determinístico (incluye .order("id")).
export async function traerTodo<T = any>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>,
  tam = 1000
): Promise<{ data: T[]; error: any }> {
  let todos: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await consulta(desde, desde + tam - 1);
    if (error) return { data: todos, error };
    todos = todos.concat(data || []);
    if (!data || data.length < tam) break;
  }
  return { data: todos, error: null };
}
