// Acceso temporal restringido por correo para módulos en pruebas.
export const PROYECTOS_ALLOWED_EMAILS = ["diego.leon@uniline.mx", "eduardo@gmail.com"];

export function canAccessProyectos(email?: string | null) {
  if (!email) return false;
  return PROYECTOS_ALLOWED_EMAILS.includes(email.toLowerCase());
}
