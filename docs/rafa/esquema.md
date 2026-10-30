# Esquema de la base (SQL local)

ARCHIVO GENERADO por `scripts/rafa-conocimiento.mjs` desde `docs/rafa/esquema-local.json` (versión de conocimiento k-25a6f1805a6b). Origen: Base aislada construida con supabase/migrations/*.sql (SQL local; no certifica la base real). Hash de migraciones: `73a576755300407a`.

El significado de negocio de cada tabla y campo está en `docs/rafa/modulos/`.

## empresas

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| tipo_persona | tipo_persona | Sí |  |
| rfc | text | Sí |  |
| razon_social | text | Sí |  |
| nombre_comercial | text | No |  |
| regimen_fiscal | text | No |  |
| uso_cfdi | text | No |  |
| calle | text | No |  |
| numero_exterior | text | No |  |
| numero_interior | text | No |  |
| colonia | text | No |  |
| codigo_postal | text | No |  |
| ciudad | text | No |  |
| estado | text | No |  |
| pais | text | No | `'México'::text` |
| telefono_principal | text | No |  |
| email_fiscal | text | No |  |
| representante_legal | text | No |  |
| banco | text | No |  |
| numero_cuenta | text | No |  |
| clabe | text | No |  |
| activa | boolean | Sí | `true` |
| created_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `empresas_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id)`
- PK `empresas_pkey`: `PRIMARY KEY (id)`
- UNIQUE `empresas_rfc_key`: `UNIQUE (rfc)`

Triggers:
- `update_empresas_updated_at`

Políticas:
- Admins and contadores can insert empresas (INSERT, authenticated) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update empresas (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete empresas (DELETE, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view empresas (SELECT, authenticated) USING `true` CHECK `—`

## profiles

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí |  |
| nombre_completo | text | Sí |  |
| nombre_usuario | text | Sí |  |
| avatar_url | text | No |  |
| telefono | text | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |
| codigo_acceso | text | No |  |
| puesto | text | No |  |

Restricciones e índices:
- FK `profiles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `profiles_pkey`: `PRIMARY KEY (id)`
- UNIQUE `profiles_nombre_usuario_key`: `UNIQUE (nombre_usuario)`
- UNIQUE `profiles_user_id_key`: `UNIQUE (user_id)`

Triggers:
- `update_profiles_updated_at`

Políticas:
- Admins can update all profiles (UPDATE, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Admins can view all profiles (SELECT, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Users can update their own profile (UPDATE, authenticated) USING `(auth.uid() = user_id)` CHECK `—`
- Users can view their own profile (SELECT, authenticated) USING `(auth.uid() = user_id)` CHECK `—`

## terceros

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| tipo | text | Sí |  |
| rfc | text | Sí |  |
| razon_social | text | Sí |  |
| nombre_comercial | text | No |  |
| calle | text | No |  |
| numero_exterior | text | No |  |
| numero_interior | text | No |  |
| colonia | text | No |  |
| codigo_postal | text | No |  |
| ciudad | text | No |  |
| estado | text | No |  |
| telefono | text | No |  |
| email | text | No |  |
| contacto_nombre | text | No |  |
| banco | text | No |  |
| numero_cuenta | text | No |  |
| clabe | text | No |  |
| activo | boolean | Sí | `true` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- CHECK `terceros_tipo_check`: `CHECK ((tipo = ANY (ARRAY['cliente'::text, 'proveedor'::text, 'ambos'::text])))`
- FK `terceros_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- PK `terceros_pkey`: `PRIMARY KEY (id)`
- UNIQUE `terceros_empresa_id_rfc_key`: `UNIQUE (empresa_id, rfc)`

Triggers:
- `update_terceros_updated_at`

Políticas:
- Admins and contadores can insert terceros (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update terceros (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete terceros (DELETE, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view terceros (SELECT, public) USING `true` CHECK `—`

## proyectos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| centro_negocio_id | uuid | Sí |  |
| nombre | text | Sí |  |
| activo | boolean | Sí | `true` |
| created_by | uuid | No |  |
| updated_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `proyectos_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE CASCADE`
- FK `proyectos_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- PK `proyectos_pkey`: `PRIMARY KEY (id)`
- UNIQUE `proyectos_centro_negocio_id_key`: `UNIQUE (centro_negocio_id)`
- INDICE `idx_proyectos_empresa`: `CREATE INDEX idx_proyectos_empresa ON public.proyectos USING btree (empresa_id)`

Triggers:
- `update_proyectos_updated_at`

Políticas:
- Admins pueden eliminar proyectos (DELETE, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Admins y contadores pueden actualizar proyectos (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins y contadores pueden crear proyectos (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins, contadores, arquitectos y usuarios asignados pueden ver (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR has_role(auth.uid(), 'arquitecto'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyectos.id) AND (pu.user_id = auth.uid())))))` CHECK `—`

## user_roles

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí |  |
| role | app_role | Sí | `'usuario'::app_role` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `user_roles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `user_roles_pkey`: `PRIMARY KEY (id)`
- UNIQUE `user_roles_user_id_role_key`: `UNIQUE (user_id, role)`

Triggers:
- ninguno

Políticas:
- Admins can manage roles (ALL, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Admins can view all roles (SELECT, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Users can view their own role (SELECT, authenticated) USING `(auth.uid() = user_id)` CHECK `—`

## rafa_avisos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| user_id | uuid | Sí |  |
| centro_negocio_id | uuid | Sí |  |
| semana | date | Sí |  |
| conversacion_id | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `rafa_avisos_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE CASCADE`
- FK `rafa_avisos_conversacion_id_fkey`: `FOREIGN KEY (conversacion_id) REFERENCES rafa_conversaciones(id) ON DELETE SET NULL`
- PK `rafa_avisos_pkey`: `PRIMARY KEY (user_id, centro_negocio_id, semana)`

Triggers:
- ninguno

Políticas:
- Leer avisos propios de Rafa (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`

## presupuestos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| cuenta_id | uuid | No |  |
| tercero_id | uuid | No |  |
| centro_negocio_id | uuid | No |  |
| unidad_medida_id | uuid | No |  |
| partida | text | Sí |  |
| cantidad | numeric(15,4) | Sí | `1` |
| precio_unitario | numeric(15,4) | Sí | `0` |
| notas | text | No |  |
| activo | boolean | Sí | `true` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |
| fecha_inicio | date | No |  |
| fecha_fin | date | No |  |
| frecuencia | frecuencia_presupuesto | No | `'mensual'::frecuencia_presupuesto` |
| orden | integer | No | `0` |
| es_project | boolean | Sí | `false` |
| responsable_tercero_id | uuid | No |  |
| avance_manual | numeric | No |  |
| tipo_movimiento | tipo_movimiento_flujo | No |  |

Restricciones e índices:
- CHECK `presupuestos_avance_manual_check`: `CHECK (((avance_manual IS NULL) OR ((avance_manual >= (0)::numeric) AND (avance_manual <= (100)::numeric))))`
- FK `presupuestos_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE SET NULL`
- FK `presupuestos_cuenta_id_fkey`: `FOREIGN KEY (cuenta_id) REFERENCES cuentas_contables(id) ON DELETE SET NULL`
- FK `presupuestos_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- FK `presupuestos_responsable_tercero_id_fkey`: `FOREIGN KEY (responsable_tercero_id) REFERENCES terceros(id) ON DELETE SET NULL`
- FK `presupuestos_tercero_id_fkey`: `FOREIGN KEY (tercero_id) REFERENCES terceros(id) ON DELETE SET NULL`
- FK `presupuestos_unidad_medida_id_fkey`: `FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE SET NULL`
- PK `presupuestos_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_presupuestos_es_project`: `CREATE INDEX idx_presupuestos_es_project ON public.presupuestos USING btree (centro_negocio_id) WHERE (es_project = true)`
- INDICE `idx_presupuestos_fechas`: `CREATE INDEX idx_presupuestos_fechas ON public.presupuestos USING btree (fecha_inicio, fecha_fin)`
- INDICE `idx_presupuestos_tipo_movimiento`: `CREATE INDEX idx_presupuestos_tipo_movimiento ON public.presupuestos USING btree (tipo_movimiento)`

Triggers:
- `trg_audit_presupuesto_change`
- `update_presupuestos_updated_at`

Políticas:
- Admins and contadores can update presupuestos (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete presupuestos (DELETE, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view presupuestos (SELECT, authenticated) USING `true` CHECK `—`
- Only admins can insert presupuestos (INSERT, public) USING `—` CHECK `has_role(auth.uid(), 'admin'::app_role)`

## rafa_acciones

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí |  |
| conversacion_id | uuid | No |  |
| herramienta | text | Sí |  |
| descripcion | text | Sí |  |
| estado | text | Sí | `'propuesta'::text` |
| requiere_confirmacion | boolean | Sí | `true` |
| entrada | jsonb | Sí | `'{}'::jsonb` |
| vista_previa | jsonb | Sí | `'{}'::jsonb` |
| huella | text | Sí |  |
| registros_afectados | jsonb | Sí | `'[]'::jsonb` |
| resultado | jsonb | No |  |
| error | text | No |  |
| version_conocimiento | text | No |  |
| reemplazada_por | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| expira_at | timestamp with time zone | Sí | `(now() + '00:30:00'::interval)` |
| confirmada_at | timestamp with time zone | No |  |
| finalizada_at | timestamp with time zone | No |  |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- CHECK `rafa_acciones_estado_check`: `CHECK ((estado = ANY (ARRAY['propuesta'::text, 'ejecutando'::text, 'ejecutada'::text, 'fallida'::text, 'parcial'::text, 'cancelada'::text, 'desactualizada'::text, 'expirada'::text])))`
- FK `rafa_acciones_conversacion_id_fkey`: `FOREIGN KEY (conversacion_id) REFERENCES rafa_conversaciones(id) ON DELETE SET NULL`
- FK `rafa_acciones_reemplazada_por_fkey`: `FOREIGN KEY (reemplazada_por) REFERENCES rafa_acciones(id) ON DELETE SET NULL`
- FK `rafa_acciones_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `rafa_acciones_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_rafa_acciones_conversacion`: `CREATE INDEX idx_rafa_acciones_conversacion ON public.rafa_acciones USING btree (conversacion_id, created_at DESC)`
- INDICE `idx_rafa_acciones_user`: `CREATE INDEX idx_rafa_acciones_user ON public.rafa_acciones USING btree (user_id, created_at DESC)`

Triggers:
- `update_rafa_acciones_updated_at`

Políticas:
- Cada usuario lee sus acciones de Rafa; admin audita todas (SELECT, authenticated) USING `((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))` CHECK `—`

## rafa_archivos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí | `auth.uid()` |
| conversacion_id | uuid | Sí |  |
| centro_negocio_id | uuid | No |  |
| empresa_id | uuid | No |  |
| nombre | text | Sí |  |
| mime | text | Sí |  |
| tamano | bigint | Sí | `0` |
| ruta | text | Sí |  |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `rafa_archivos_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE SET NULL`
- FK `rafa_archivos_conversacion_id_fkey`: `FOREIGN KEY (conversacion_id) REFERENCES rafa_conversaciones(id) ON DELETE CASCADE`
- FK `rafa_archivos_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL`
- PK `rafa_archivos_pkey`: `PRIMARY KEY (id)`
- UNIQUE `rafa_archivos_ruta_key`: `UNIQUE (ruta)`
- INDICE `idx_rafa_archivos_centro`: `CREATE INDEX idx_rafa_archivos_centro ON public.rafa_archivos USING btree (user_id, centro_negocio_id, created_at DESC)`
- INDICE `idx_rafa_archivos_conversacion`: `CREATE INDEX idx_rafa_archivos_conversacion ON public.rafa_archivos USING btree (conversacion_id, created_at)`

Triggers:
- ninguno

Políticas:
- Eliminar archivos propios de Rafa (DELETE, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Leer archivos propios de Rafa (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`

## rafa_mensajes

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| conversacion_id | uuid | Sí |  |
| user_id | uuid | Sí |  |
| rol | text | Sí |  |
| contenido | text | Sí | `''::text` |
| datos | jsonb | Sí | `'{}'::jsonb` |
| version_conocimiento | text | No |  |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- CHECK `rafa_mensajes_rol_check`: `CHECK ((rol = ANY (ARRAY['usuario'::text, 'asistente'::text])))`
- FK `rafa_mensajes_conversacion_id_fkey`: `FOREIGN KEY (conversacion_id) REFERENCES rafa_conversaciones(id) ON DELETE CASCADE`
- FK `rafa_mensajes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `rafa_mensajes_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_rafa_mensajes_conversacion`: `CREATE INDEX idx_rafa_mensajes_conversacion ON public.rafa_mensajes USING btree (conversacion_id, created_at)`

Triggers:
- ninguno

Políticas:
- Cada usuario lee sus mensajes con Rafa (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`

## rafa_sesiones

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí |  |
| titulo | text | Sí | `'Interpretación de Rafa'::text` |
| resumen | text | No |  |
| transcripcion | text | No |  |
| plan | jsonb | No |  |
| propuesta | jsonb | No |  |
| estado | text | Sí | `'borrador'::text` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `rafa_sesiones_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `rafa_sesiones_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_rafa_sesiones_user`: `CREATE INDEX idx_rafa_sesiones_user ON public.rafa_sesiones USING btree (user_id, updated_at DESC)`

Triggers:
- `update_rafa_sesiones_updated_at`

Políticas:
- Usuarios gestionan sus sesiones de Rafa (ALL, authenticated) USING `((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))` CHECK `(user_id = auth.uid())`

## programaciones

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| tipo | tipo_programacion | Sí |  |
| centro_negocio_id | uuid | No |  |
| fecha_programada | date | Sí |  |
| tercero_id | uuid | No |  |
| monto | numeric | Sí | `0` |
| observaciones | text | No |  |
| estado | estado_programacion | Sí | `'pendiente'::estado_programacion` |
| asiento_id | uuid | No |  |
| created_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |
| presupuesto_id | uuid | No |  |

Restricciones e índices:
- FK `programaciones_asiento_id_fkey`: `FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id)`
- FK `programaciones_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id)`
- FK `programaciones_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id)`
- FK `programaciones_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id)`
- FK `programaciones_tercero_id_fkey`: `FOREIGN KEY (tercero_id) REFERENCES terceros(id)`
- PK `programaciones_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_programaciones_presupuesto`: `CREATE INDEX idx_programaciones_presupuesto ON public.programaciones USING btree (presupuesto_id)`

Triggers:
- `update_programaciones_updated_at`

Políticas:
- Admins and contadores can insert programaciones (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update programaciones (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete programaciones (DELETE, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view programaciones (SELECT, public) USING `true` CHECK `—`

## centros_negocio

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| codigo | text | Sí |  |
| nombre | text | Sí |  |
| tipo_actividad | text | No |  |
| responsable | text | No |  |
| activo | boolean | Sí | `true` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `centros_negocio_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- PK `centros_negocio_pkey`: `PRIMARY KEY (id)`
- INDICE `centros_negocio_empresa_codigo_activo_idx`: `CREATE UNIQUE INDEX centros_negocio_empresa_codigo_activo_idx ON public.centros_negocio USING btree (empresa_id, codigo) WHERE (activo = true)`

Triggers:
- `update_centros_negocio_updated_at`

Políticas:
- Admins and contadores can insert centros_negocio (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update centros_negocio (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete centros_negocio (DELETE, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view centros_negocio (SELECT, public) USING `true` CHECK `—`

## proyecto_tareas

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| proyecto_id | uuid | Sí |  |
| empresa_id | uuid | Sí |  |
| titulo | text | Sí |  |
| notas | text | No |  |
| responsable_tercero_id | uuid | No |  |
| fecha_vencimiento | date | No |  |
| estado | tarea_estado | Sí | `'pendiente'::tarea_estado` |
| color | text | No |  |
| orden | integer | Sí | `0` |
| created_by | uuid | No |  |
| updated_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `proyecto_tareas_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- FK `proyecto_tareas_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- FK `proyecto_tareas_responsable_tercero_id_fkey`: `FOREIGN KEY (responsable_tercero_id) REFERENCES terceros(id) ON DELETE SET NULL`
- PK `proyecto_tareas_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_proyecto_tareas_estado`: `CREATE INDEX idx_proyecto_tareas_estado ON public.proyecto_tareas USING btree (proyecto_id, estado)`
- INDICE `idx_proyecto_tareas_proyecto`: `CREATE INDEX idx_proyecto_tareas_proyecto ON public.proyecto_tareas USING btree (proyecto_id)`

Triggers:
- `update_proyecto_tareas_updated_at`

Políticas:
- Admins y contadores pueden actualizar tareas (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins y contadores pueden crear tareas (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins y contadores pueden eliminar tareas (DELETE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins, contadores, arquitectos y usuarios asignados pueden ver (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR has_role(auth.uid(), 'arquitecto'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_tareas.proyecto_id) AND (pu.user_id = auth.uid())))))` CHECK `—`

## unidades_medida

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| codigo | text | Sí |  |
| nombre | text | Sí |  |
| activa | boolean | Sí | `true` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- PK `unidades_medida_pkey`: `PRIMARY KEY (id)`
- UNIQUE `unidades_medida_codigo_key`: `UNIQUE (codigo)`

Triggers:
- ninguno

Políticas:
- Admins and contadores can insert unidades_medida (INSERT, authenticated) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update unidades_medida (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Authenticated users can view unidades_medida (SELECT, authenticated) USING `true` CHECK `—`

## bajas_en_cascada

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| centro_negocio_id | uuid | Sí |  |
| entidad | text | Sí |  |
| registro_id | uuid | Sí |  |
| created_by | uuid | No | `auth.uid()` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- CHECK `bajas_en_cascada_entidad_check`: `CHECK ((entidad = ANY (ARRAY['presupuesto'::text, 'proyecto'::text])))`
- FK `bajas_en_cascada_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE CASCADE`
- PK `bajas_en_cascada_pkey`: `PRIMARY KEY (centro_negocio_id, entidad, registro_id)`

Triggers:
- ninguno

Políticas:
- Contables gestionan bajas en cascada (ALL, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`

## rafa_ejecuciones

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| accion_id | uuid | Sí |  |
| user_id | uuid | Sí | `auth.uid()` |
| resultado | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `rafa_ejecuciones_accion_id_fkey`: `FOREIGN KEY (accion_id) REFERENCES rafa_acciones(id) ON DELETE CASCADE`
- PK `rafa_ejecuciones_pkey`: `PRIMARY KEY (accion_id)`

Triggers:
- ninguno

Políticas:
- Leer ejecuciones propias (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Registrar ejecución de acción confirmada (INSERT, authenticated) USING `—` CHECK `((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM rafa_acciones a
  WHERE ((a.id = rafa_ejecuciones.accion_id) AND (a.user_id = auth.uid()) AND (a.estado = ANY (ARRAY['ejecutando'::text, 'ejecutada'::text]))))))`

## asiento_guardados

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| operacion_id | uuid | Sí |  |
| asiento_id | uuid | Sí |  |
| user_id | uuid | Sí | `auth.uid()` |
| resultado | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `asiento_guardados_asiento_id_fkey`: `FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id) ON DELETE CASCADE`
- PK `asiento_guardados_pkey`: `PRIMARY KEY (operacion_id)`

Triggers:
- ninguno

Políticas:
- Leer guardados de asiento propios (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Registrar guardados de asiento propios (INSERT, authenticated) USING `—` CHECK `(user_id = auth.uid())`

## cuentas_contables

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| codigo | text | Sí |  |
| nombre | text | Sí |  |
| naturaleza | naturaleza_cuenta | Sí |  |
| clasificacion | clasificacion_cuenta | Sí |  |
| cuenta_padre_id | uuid | No |  |
| nivel | integer | Sí | `1` |
| activa | boolean | Sí | `true` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `cuentas_contables_cuenta_padre_id_fkey`: `FOREIGN KEY (cuenta_padre_id) REFERENCES cuentas_contables(id)`
- FK `cuentas_contables_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- PK `cuentas_contables_pkey`: `PRIMARY KEY (id)`
- UNIQUE `cuentas_contables_empresa_id_codigo_key`: `UNIQUE (empresa_id, codigo)`

Triggers:
- `update_cuentas_updated_at`

Políticas:
- Admins and contadores can insert cuentas (INSERT, authenticated) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update cuentas (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete cuentas (DELETE, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view cuentas (SELECT, authenticated) USING `true` CHECK `—`

## proyecto_usuarios

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| proyecto_id | uuid | Sí |  |
| user_id | uuid | Sí |  |
| empresa_id | uuid | Sí |  |
| created_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| editar_cronograma | boolean | Sí | `false` |
| ver_programacion_financiera | boolean | Sí | `false` |
| editar_programacion_financiera | boolean | Sí | `false` |

Restricciones e índices:
- FK `proyecto_usuarios_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- FK `proyecto_usuarios_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- FK `proyecto_usuarios_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `proyecto_usuarios_pkey`: `PRIMARY KEY (id)`
- UNIQUE `proyecto_usuarios_proyecto_id_user_id_key`: `UNIQUE (proyecto_id, user_id)`
- INDICE `idx_proyecto_usuarios_proyecto`: `CREATE INDEX idx_proyecto_usuarios_proyecto ON public.proyecto_usuarios USING btree (proyecto_id)`
- INDICE `idx_proyecto_usuarios_user`: `CREATE INDEX idx_proyecto_usuarios_user ON public.proyecto_usuarios USING btree (user_id)`

Triggers:
- ninguno

Políticas:
- Admins ven todas las asignaciones, usuarios ven las propias (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (user_id = auth.uid()))` CHECK `—`
- Solo admins gestionan accesos a proyectos (ALL, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `has_role(auth.uid(), 'admin'::app_role)`

## asientos_contables

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| empresa_id | uuid | Sí |  |
| fecha | date | Sí | `CURRENT_DATE` |
| tipo | tipo_asiento | Sí | `'diario'::tipo_asiento` |
| tercero_id | uuid | No |  |
| centro_negocio_id | uuid | No |  |
| numero_asiento | integer | Sí | `nextval('asientos_contables_numero_asiento_seq'::regclass)` |
| observaciones | text | No |  |
| estado | estado_asiento | Sí | `'borrador'::estado_asiento` |
| total_debe | numeric(15,2) | Sí | `0` |
| total_haber | numeric(15,2) | Sí | `0` |
| created_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `asientos_contables_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE SET NULL`
- FK `asientos_contables_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES auth.users(id)`
- FK `asientos_contables_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- FK `asientos_contables_tercero_id_fkey`: `FOREIGN KEY (tercero_id) REFERENCES terceros(id) ON DELETE SET NULL`
- PK `asientos_contables_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_asientos_empresa`: `CREATE INDEX idx_asientos_empresa ON public.asientos_contables USING btree (empresa_id)`
- INDICE `idx_asientos_fecha`: `CREATE INDEX idx_asientos_fecha ON public.asientos_contables USING btree (fecha)`

Triggers:
- `sync_iva_flujos_trigger`
- `update_asientos_contables_updated_at`

Políticas:
- Admins and contadores can insert asientos (INSERT, authenticated) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update asientos (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete asientos (DELETE, authenticated) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view asientos (SELECT, authenticated) USING `true` CHECK `—`

## flujos_programados

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| presupuesto_id | uuid | No |  |
| fecha | date | Sí |  |
| monto | numeric | Sí | `0` |
| tipo | text | Sí |  |
| descripcion | text | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| auto_generado | boolean | Sí | `false` |
| asiento_movimiento_id | uuid | No |  |
| empresa_id | uuid | No |  |

Restricciones e índices:
- CHECK `flujos_programados_tipo_check`: `CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))`
- FK `flujos_programados_asiento_movimiento_id_fkey`: `FOREIGN KEY (asiento_movimiento_id) REFERENCES asiento_movimientos(id) ON DELETE CASCADE`
- FK `flujos_programados_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id)`
- FK `flujos_programados_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE`
- PK `flujos_programados_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_flujos_asiento_mov`: `CREATE INDEX idx_flujos_asiento_mov ON public.flujos_programados USING btree (asiento_movimiento_id)`
- INDICE `idx_flujos_auto_generado`: `CREATE INDEX idx_flujos_auto_generado ON public.flujos_programados USING btree (auto_generado) WHERE (auto_generado = true)`
- INDICE `idx_flujos_empresa_id`: `CREATE INDEX idx_flujos_empresa_id ON public.flujos_programados USING btree (empresa_id)`
- INDICE `idx_flujos_programados_fecha`: `CREATE INDEX idx_flujos_programados_fecha ON public.flujos_programados USING btree (fecha)`
- INDICE `idx_flujos_programados_presupuesto`: `CREATE INDEX idx_flujos_programados_presupuesto ON public.flujos_programados USING btree (presupuesto_id)`

Triggers:
- `trg_block_flujos_legacy_proyecto`

Políticas:
- Admins and contadores can insert flujos_programados (INSERT, public) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update flujos_programados (UPDATE, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins can delete flujos_programados (DELETE, public) USING `has_role(auth.uid(), 'admin'::app_role)` CHECK `—`
- Authenticated users can view flujos_programados (SELECT, public) USING `true` CHECK `—`

## proyecto_auditoria

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| proyecto_id | uuid | No |  |
| user_id | uuid | Sí |  |
| accion | text | Sí |  |
| entidad_id | uuid | No |  |
| valor_anterior | text | No |  |
| valor_nuevo | text | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| presupuesto_id | uuid | No |  |

Restricciones e índices:
- FK `proyecto_auditoria_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE`
- FK `proyecto_auditoria_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- PK `proyecto_auditoria_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_proyecto_auditoria_proyecto`: `CREATE INDEX idx_proyecto_auditoria_proyecto ON public.proyecto_auditoria USING btree (proyecto_id, created_at DESC)`

Triggers:
- ninguno

Políticas:
- Registrar auditoría del proyecto (INSERT, public) USING `—` CHECK `((user_id = auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_auditoria.proyecto_id) AND (pu.user_id = auth.uid()) AND (pu.editar_cronograma OR pu.editar_programacion_financiera))))))`
- Ver auditoría del proyecto (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_auditoria.proyecto_id) AND (pu.user_id = auth.uid())))))` CHECK `—`

## asiento_movimientos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| asiento_id | uuid | Sí |  |
| cuenta_id | uuid | Sí |  |
| partida | text | Sí |  |
| debe | numeric(15,2) | Sí | `0` |
| haber | numeric(15,2) | Sí | `0` |
| orden | integer | Sí | `0` |
| created_at | timestamp with time zone | Sí | `now()` |
| presupuesto_id | uuid | No |  |

Restricciones e índices:
- FK `asiento_movimientos_asiento_id_fkey`: `FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id) ON DELETE CASCADE`
- FK `asiento_movimientos_cuenta_id_fkey`: `FOREIGN KEY (cuenta_id) REFERENCES cuentas_contables(id) ON DELETE RESTRICT`
- FK `asiento_movimientos_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL`
- PK `asiento_movimientos_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_asiento_movimientos_presupuesto`: `CREATE INDEX idx_asiento_movimientos_presupuesto ON public.asiento_movimientos USING btree (presupuesto_id)`
- INDICE `idx_movimientos_asiento`: `CREATE INDEX idx_movimientos_asiento ON public.asiento_movimientos USING btree (asiento_id)`
- INDICE `idx_movimientos_cuenta`: `CREATE INDEX idx_movimientos_cuenta ON public.asiento_movimientos USING btree (cuenta_id)`

Triggers:
- ninguno

Políticas:
- Admins and contadores can delete movimientos (DELETE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Admins and contadores can insert movimientos (INSERT, authenticated) USING `—` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))`
- Admins and contadores can update movimientos (UPDATE, authenticated) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))` CHECK `—`
- Authenticated users can view movimientos (SELECT, authenticated) USING `true` CHECK `—`

## rafa_conversaciones

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| user_id | uuid | Sí |  |
| titulo | text | Sí | `'Conversación con Rafa'::text` |
| contexto | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |
| centro_negocio_id | uuid | No |  |
| empresa_id | uuid | No |  |

Restricciones e índices:
- FK `rafa_conversaciones_centro_negocio_id_fkey`: `FOREIGN KEY (centro_negocio_id) REFERENCES centros_negocio(id) ON DELETE SET NULL`
- FK `rafa_conversaciones_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL`
- FK `rafa_conversaciones_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- PK `rafa_conversaciones_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_rafa_conversaciones_centro`: `CREATE INDEX idx_rafa_conversaciones_centro ON public.rafa_conversaciones USING btree (user_id, centro_negocio_id, updated_at DESC)`
- INDICE `idx_rafa_conversaciones_user`: `CREATE INDEX idx_rafa_conversaciones_user ON public.rafa_conversaciones USING btree (user_id, updated_at DESC)`

Triggers:
- `trg_rafa_conversacion_empresa`
- `update_rafa_conversaciones_updated_at`

Políticas:
- Cada usuario gestiona sus conversaciones con Rafa (ALL, authenticated) USING `(user_id = auth.uid())` CHECK `(user_id = auth.uid())`

## rafa_plan_guardados

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| operacion_id | uuid | Sí |  |
| user_id | uuid | Sí | `auth.uid()` |
| resultado | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- PK `rafa_plan_guardados_pkey`: `PRIMARY KEY (operacion_id)`

Triggers:
- ninguno

Políticas:
- Leer guardados de plan propios (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Registrar guardados de plan propios (INSERT, authenticated) USING `—` CHECK `(user_id = auth.uid())`

## presupuesto_guardados

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| operacion_id | uuid | Sí |  |
| presupuesto_id | uuid | Sí |  |
| user_id | uuid | Sí | `auth.uid()` |
| resultado | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `presupuesto_guardados_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE`
- PK `presupuesto_guardados_pkey`: `PRIMARY KEY (operacion_id)`

Triggers:
- ninguno

Políticas:
- Leer guardados propios (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Registrar guardados propios (INSERT, authenticated) USING `—` CHECK `(user_id = auth.uid())`

## proyecto_cronograma_shares

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| proyecto_id | uuid | Sí |  |
| token | text | Sí |  |
| activo | boolean | Sí | `true` |
| created_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `proyecto_cronograma_shares_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- PK `proyecto_cronograma_shares_pkey`: `PRIMARY KEY (id)`
- UNIQUE `proyecto_cronograma_shares_token_key`: `UNIQUE (token)`
- INDICE `idx_proyecto_shares_proyecto`: `CREATE INDEX idx_proyecto_shares_proyecto ON public.proyecto_cronograma_shares USING btree (proyecto_id)`

Triggers:
- ninguno

Políticas:
- Gestionar links de cronograma (ALL, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_cronograma_shares.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_cronograma))))` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_cronograma_shares.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_cronograma))))`

## proyecto_programacion_pagos

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| programacion_id | uuid | Sí |  |
| proyecto_id | uuid | Sí |  |
| fecha | date | Sí |  |
| monto | numeric | Sí |  |
| concepto | text | No |  |
| es_anticipo | boolean | Sí | `false` |
| orden | integer | Sí | `0` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- CHECK `proyecto_programacion_pagos_monto_check`: `CHECK ((monto > (0)::numeric))`
- FK `proyecto_programacion_pagos_programacion_id_fkey`: `FOREIGN KEY (programacion_id) REFERENCES proyecto_programacion_financiera(id) ON DELETE CASCADE`
- FK `proyecto_programacion_pagos_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- PK `proyecto_programacion_pagos_pkey`: `PRIMARY KEY (id)`
- INDICE `idx_ppp_programacion`: `CREATE INDEX idx_ppp_programacion ON public.proyecto_programacion_pagos USING btree (programacion_id)`
- INDICE `idx_ppp_proyecto`: `CREATE INDEX idx_ppp_proyecto ON public.proyecto_programacion_pagos USING btree (proyecto_id)`

Triggers:
- `trg_cronograma_sigue_pagos_del`
- `trg_cronograma_sigue_pagos_ins`
- `trg_cronograma_sigue_pagos_upd`
- `trg_validar_pago_programacion_project`

Políticas:
- Editar pagos programados del proyecto (ALL, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_pagos.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_programacion_financiera))))` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_pagos.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_programacion_financiera))))`
- Ver pagos programados del proyecto (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR has_role(auth.uid(), 'arquitecto'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_pagos.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.ver_programacion_financiera))))` CHECK `—`

## programacion_partida_guardados

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| operacion_id | uuid | Sí |  |
| programacion_id | uuid | Sí |  |
| user_id | uuid | Sí | `auth.uid()` |
| resultado | jsonb | Sí | `'{}'::jsonb` |
| created_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `programacion_partida_guardados_programacion_id_fkey`: `FOREIGN KEY (programacion_id) REFERENCES proyecto_programacion_financiera(id) ON DELETE CASCADE`
- PK `programacion_partida_guardados_pkey`: `PRIMARY KEY (operacion_id)`

Triggers:
- ninguno

Políticas:
- Leer guardados de programación propios (SELECT, authenticated) USING `(user_id = auth.uid())` CHECK `—`
- Registrar guardados de programación propios (INSERT, authenticated) USING `—` CHECK `(user_id = auth.uid())`

## proyecto_programacion_financiera

RLS: activado.

| Columna | Tipo | Obligatorio | Predeterminado |
|---|---|---|---|
| id | uuid | Sí | `gen_random_uuid()` |
| presupuesto_id | uuid | Sí |  |
| proyecto_id | uuid | Sí |  |
| empresa_id | uuid | Sí |  |
| modo | programacion_proyecto_modo | Sí |  |
| tiene_anticipo | boolean | Sí | `false` |
| anticipo_monto | numeric | Sí | `0` |
| anticipo_fecha | date | No |  |
| frecuencia | programacion_proyecto_frecuencia | No |  |
| fecha_inicio | date | No |  |
| numero_pagos | integer | No |  |
| created_by | uuid | No |  |
| updated_by | uuid | No |  |
| created_at | timestamp with time zone | Sí | `now()` |
| updated_at | timestamp with time zone | Sí | `now()` |

Restricciones e índices:
- FK `proyecto_programacion_financiera_empresa_id_fkey`: `FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE`
- FK `proyecto_programacion_financiera_presupuesto_id_fkey`: `FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE`
- FK `proyecto_programacion_financiera_proyecto_id_fkey`: `FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE`
- PK `proyecto_programacion_financiera_pkey`: `PRIMARY KEY (id)`
- UNIQUE `proyecto_programacion_financiera_presupuesto_id_key`: `UNIQUE (presupuesto_id)`
- INDICE `idx_ppf_proyecto`: `CREATE INDEX idx_ppf_proyecto ON public.proyecto_programacion_financiera USING btree (proyecto_id)`

Triggers:
- `trg_cleanup_flujos_legacy`
- `trg_validar_programacion_partida_project`
- `update_proyecto_programacion_financiera_updated_at`

Políticas:
- Editar programación financiera del proyecto (ALL, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_financiera.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_programacion_financiera))))` CHECK `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_financiera.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.editar_programacion_financiera))))`
- Ver programación financiera del proyecto (SELECT, public) USING `(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role) OR has_role(auth.uid(), 'arquitecto'::app_role) OR (EXISTS ( SELECT 1
   FROM proyecto_usuarios pu
  WHERE ((pu.proyecto_id = proyecto_programacion_financiera.proyecto_id) AND (pu.user_id = auth.uid()) AND pu.ver_programacion_financiera))))` CHECK `—`

## Funciones

- `actualizar_cronograma_partida(_presupuesto_id uuid, _fecha_inicio date, _fecha_fin date, _avance_manual numeric)` — SECURITY DEFINER
- `alinear_cronograma_con_pagos(p_programaciones uuid[])` — SECURITY DEFINER
- `audit_presupuesto_change()` — SECURITY DEFINER
- `block_flujos_legacy_si_es_project_con_programacion_propia()` — SECURITY DEFINER
- `cambiar_activo(p_entidad text, p_id uuid, p_activo boolean, p_en_cascada boolean)` — SECURITY INVOKER
- `cleanup_flujos_legacy_al_crear_programacion_propia()` — SECURITY DEFINER
- `get_cronograma_publico(_token text)` — SECURITY DEFINER
- `get_user_role(_user_id uuid)` — SECURITY DEFINER
- `guardar_asiento(p_operacion uuid, p_id uuid, p_datos jsonb, p_movimientos jsonb, p_version timestamp with time zone)` — SECURITY INVOKER
- `guardar_presupuesto(p_operacion uuid, p_id uuid, p_datos jsonb, p_flujos jsonb, p_version timestamp with time zone)` — SECURITY INVOKER
- `guardar_programacion_partida(p_operacion uuid, p_datos jsonb, p_pagos jsonb)` — SECURITY INVOKER
- `handle_new_user()` — SECURITY DEFINER
- `has_role(_user_id uuid, _role app_role)` — SECURITY DEFINER
- `rafa_actualizar_cronograma(p_accion_id uuid, p_cambio jsonb)` — SECURITY INVOKER
- `rafa_ajustar_presupuestos(p_accion_id uuid, p_cambios jsonb)` — SECURITY INVOKER
- `rafa_aplicar_asientos(p_accion_id uuid, p_asientos jsonb)` — SECURITY INVOKER
- `rafa_asignar_acceso_proyecto(p_accion_id uuid, p_acceso jsonb)` — SECURITY INVOKER
- `rafa_cambiar_activo(p_accion_id uuid, p_cambio jsonb)` — SECURITY INVOKER
- `rafa_cambiar_estado_programaciones(p_accion_id uuid, p_cambios jsonb)` — SECURITY INVOKER
- `rafa_conversacion_empresa_del_centro()` — SECURITY INVOKER
- `rafa_crear_asientos_borrador(p_accion_id uuid, p_asientos jsonb)` — SECURITY INVOKER
- `rafa_crear_programaciones(p_accion_id uuid, p_items jsonb)` — SECURITY INVOKER
- `rafa_crear_tarea(p_accion_id uuid, p_tarea jsonb)` — SECURITY INVOKER
- `rafa_crear_tercero(p_accion_id uuid, p_tercero jsonb)` — SECURITY INVOKER
- `rafa_guardar_plan(p_operacion uuid, p_plan jsonb)` — SECURITY INVOKER
- `rafa_guardar_programacion_partida(p_accion_id uuid, p_datos jsonb, p_pagos jsonb)` — SECURITY INVOKER
- `rafa_registrar_ejecucion(p_accion_id uuid, p_resultado jsonb)` — SECURITY INVOKER
- `rafa_reprogramar_masiva(p_accion_id uuid, p_cambios jsonb)` — SECURITY INVOKER
- `sync_iva_flujos()` — SECURITY DEFINER
- `trg_cronograma_sigue_pagos_del()` — SECURITY DEFINER
- `trg_cronograma_sigue_pagos_ins()` — SECURITY DEFINER
- `trg_cronograma_sigue_pagos_upd()` — SECURITY DEFINER
- `update_updated_at_column()` — SECURITY INVOKER
- `validar_pago_programacion_project()` — SECURITY DEFINER
- `validar_programacion_partida_project()` — SECURITY DEFINER

## Enumeraciones

- `app_role`: admin, contador, usuario, arquitecto
- `tarea_estado`: pendiente, en_progreso, bloqueada, hecho
- `tipo_asiento`: ingreso, egreso, diario
- `tipo_persona`: fisica, moral
- `estado_asiento`: borrador, aplicado, cancelado
- `naturaleza_cuenta`: deudora, acreedora
- `tipo_programacion`: ingreso, egreso
- `estado_programacion`: pendiente, ejecutado, cancelado
- `clasificacion_cuenta`: titulo, saldo
- `tipo_movimiento_flujo`: ingreso, egreso, no_afecta
- `frecuencia_presupuesto`: semanal, mensual, bimestral, trimestral, semestral, anual
- `programacion_proyecto_modo`: automatica, manual
- `programacion_proyecto_frecuencia`: semanal, quincenal, mensual, trimestral, semestral, anual, personalizada
