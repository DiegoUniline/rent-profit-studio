-- Nuevo rol "arquitecto": ve todo el módulo de Proyectos (incluye montos de
-- presupuesto) pero solo puede editar fecha_inicio/fecha_fin de las partidas.
-- No puede ver ni modificar asientos contables ni programación (flujos_programados),
-- y no puede modificar los montos del presupuesto.
ALTER TYPE public.app_role ADD VALUE 'arquitecto';
