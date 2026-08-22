# Plan: Evitar duplicados al editar instrucciones de Rafa

## Objetivo
Garantizar que una interpretación ya aplicada actualice sus partidas y flujos existentes, incluso si la nueva instrucción cambia textos, cantidades, orden o número de partidas.

## Cambios

1. **Eliminar la carrera entre autoguardado y aplicación**
   - Cancelar cualquier autoguardado pendiente antes de confirmar.
   - Suspender el autoguardado mientras se crean o actualizan registros.
   - Persistir primero el resultado con sus IDs y reanudar después el autoguardado.

2. **Recuperar vínculos desde la sesión guardada**
   - Antes de aplicar, releer la propuesta vigente de la interpretación en la base de datos.
   - Unir sus IDs de presupuesto con los que existen en pantalla para no depender de una copia local potencialmente desactualizada.

3. **Conciliar partidas de forma estable**
   - Al reinterpretar, conservar el ID por coincidencia de descripción normalizada antes de recurrir a la posición.
   - No reutilizar un mismo ID para dos partidas.
   - Mantener los IDs previamente aplicados aunque la IA reordene los conceptos.

4. **Pruebas de regresión**
   - Probar reordenamiento, cambios de cantidad/texto, partidas agregadas y partidas eliminadas.
   - Verificar que una segunda confirmación reporte actualizaciones y no inserciones para las partidas existentes.

## Alcance de datos existentes
No se eliminarán registros históricos automáticamente. La corrección impedirá nuevas duplicaciones; cualquier limpieza de duplicados anteriores se hará por separado tras identificar cuáles deben conservarse.
