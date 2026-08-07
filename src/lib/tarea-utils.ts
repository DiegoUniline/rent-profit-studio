export type TareaEstado = "pendiente" | "en_progreso" | "bloqueada" | "hecho";

export const ESTADOS: TareaEstado[] = ["pendiente", "en_progreso", "bloqueada", "hecho"];

export const ESTADO_LABELS: Record<TareaEstado, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  bloqueada: "Bloqueada",
  hecho: "Hecho",
};

export const ESTADO_BADGE_CLASS: Record<TareaEstado, string> = {
  pendiente: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
  en_progreso: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  bloqueada: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  hecho: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
};

export const PALETA_COLORES = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

export function isTareaVencida(fechaVencimiento: string | null, estado: TareaEstado): boolean {
  if (!fechaVencimiento || estado === "hecho") return false;
  return new Date(fechaVencimiento + "T00:00:00") < new Date(new Date().toDateString());
}
