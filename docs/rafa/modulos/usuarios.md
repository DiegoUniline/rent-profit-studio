# Usuarios, roles y acceso

Evidencia: código y SQL local. Fuentes: `src/contexts/AuthContext.tsx`, `src/App.tsx`, `src/pages/Usuarios.tsx`, `src/pages/Perfil.tsx`, `src/components/dialogs/NuevoUsuarioDialog.tsx`, `src/components/dialogs/EditUsuarioDialog.tsx`, `supabase/functions/admin-user-management/index.ts`, `src/lib/project-permissions.ts`.

## Identidad, perfiles y roles

- Autenticación por correo y contraseña (Supabase Auth). Al crear un usuario, el trigger `handle_new_user` inserta su `profiles` (nombre completo, nombre de usuario) y un rol `usuario`.
- `profiles`: 1:1 con `auth.users`; `nombre_completo`, `nombre_usuario` (único), `telefono`, `puesto`, `avatar_url` (sin bucket de storage) y `codigo_acceso` (código que un contador usa para borrar asientos con autorización de un admin).
- `user_roles`: rol de aplicación (enum `app_role`: `admin`, `contador`, `usuario`, `arquitecto`). UNIQUE por usuario y rol: técnicamente un usuario podría tener varios roles; la interfaz lee uno (`single()`) y, si hay error, asume `usuario`. Las políticas usan `has_role` (unión de roles). Rafa usa la unión de roles en el servidor.

## Matriz de acceso por rol

| Área | admin | contador | arquitecto | usuario |
|---|---|---|---|---|
| Empresas, cuentas, centros, terceros, presupuestos, asientos, programación, reportes, Rafa | Sí | Sí | No | No |
| Usuarios | Sí | No | No | No |
| Proyectos | Todos | Todos | Todos (solo edita cronograma) | Solo asignados, según banderas |
| Insertar partidas presupuestales | Sí | No (RLS) | No | No |
| Borrar asientos | Sí | Con código de admin | No | No |

Las rutas aplican la columna de la interfaz; RLS permite SELECT más amplio en tablas contables (cualquier autenticado). Rafa aplica la matriz de la interfaz en el servidor y además consulta con el JWT del usuario.

## Administración de usuarios

`/usuarios` (admin): alta con `supabase.auth.signUp` desde el cliente y ajuste de rol/perfil; la Edge Function `admin-user-management` verifica que el llamante sea admin y permite `reset_password`, `update_profile` y `update_role` con la llave de servicio. Rafa **no** administra usuarios, roles ni contraseñas.
