// Pruebas funcionales del guardado atómico de asientos (guardar_asiento) y de la
// programación financiera de partidas de proyecto (guardar_programacion_partida)
// contra PostgREST real sobre la base AISLADA de pruebas. Ver ejecutar.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tokenDe, USUARIOS } from "../rafa/e2e/jwt.mjs";

const REST = process.env.REST_URL || "http://127.0.0.1:54321/rest/v1";
const { SERVICIO, ANON } = process.env;
const E1 = "e1000000-0000-0000-0000-000000000001";
const BANCO = "c1000000-0000-0000-0000-000000000101";
const GASTO = "c1000000-0000-0000-0000-000000000601";
const RENTA = "b1000000-0000-0000-0000-00000000000b";
const CIMENTACION = "b1000000-0000-0000-0000-00000000000a"; // es_project, presupuesto 100,000
const P1 = "91000000-0000-0000-0000-000000000001";

const TOK = Object.fromEntries(Object.entries(USUARIOS).map(([k, u]) => [k, tokenDe(u)]));
const cab = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });
async function rpc(fn, rol, args) {
  const r = await fetch(`${REST}/rpc/${fn}`, { method: "POST", headers: cab(TOK[rol]), body: JSON.stringify(args) });
  const cuerpo = await r.json();
  return r.ok ? { data: cuerpo, error: null } : { data: null, error: cuerpo.message || JSON.stringify(cuerpo) };
}
async function leer(ruta) {
  const r = await fetch(`${REST}/${ruta}`, { headers: cab(SERVICIO) });
  if (!r.ok) throw new Error(`${ruta}: ${await r.text()}`);
  return r.json();
}
async function insertar(tabla, fila) {
  const r = await fetch(`${REST}/${tabla}`, { method: "POST", headers: { ...cab(SERVICIO), Prefer: "return=representation" }, body: JSON.stringify(fila) });
  if (!r.ok) throw new Error(`${tabla}: ${await r.text()}`);
  return (await r.json())[0];
}

const datos = (extra = {}) => ({ empresa_id: E1, fecha: "2026-10-20", tipo: "egreso", tercero_id: null, centro_negocio_id: null, observaciones: "Prueba atómica", ...extra });
const movs = (monto) => [
  { cuenta_id: GASTO, partida: "Renta", debe: monto, haber: 0, presupuesto_id: RENTA },
  { cuenta_id: BANCO, partida: "Banco", debe: 0, haber: monto },
];
const asiento = async (id) => (await leer(`asientos_contables?id=eq.${id}&select=*`))[0];
const movimientos = async (id) => leer(`asiento_movimientos?asiento_id=eq.${id}&select=id,debe,haber,orden&order=orden`);

let asientoId;

test("asiento: crear calcula totales en el servidor y un doble envío crea uno solo", async () => {
  const args = { p_operacion: randomUUID(), p_id: null, p_datos: datos(), p_movimientos: movs(1000) };
  const antes = (await leer(`asientos_contables?observaciones=eq.Prueba%20atómica&select=id`)).length;
  const [a, b] = await Promise.all([rpc("guardar_asiento", "contador", args), rpc("guardar_asiento", "contador", args)]);
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  assert.equal(a.data.asiento_id, b.data.asiento_id);
  asientoId = a.data.asiento_id;
  assert.equal((await leer(`asientos_contables?observaciones=eq.Prueba%20atómica&select=id`)).length, antes + 1);
  const cab1 = await asiento(asientoId);
  assert.equal(Number(cab1.total_debe), 1000);
  assert.equal(cab1.estado, "borrador");
  assert.equal((await movimientos(asientoId)).length, 2);
});

test("asiento: editar conserva los ids de renglones (y lo ligado a ellos), agrega y quita", async () => {
  const [m1, m2] = await movimientos(asientoId);
  // Flujo de IVA ligado a un renglón: no debe perderse al editar.
  await insertar("flujos_programados", { fecha: "2026-10-20", monto: 160, tipo: "egreso", descripcion: "IVA prueba", auto_generado: true, asiento_movimiento_id: m1.id, empresa_id: E1 });
  const version = (await asiento(asientoId)).updated_at;
  const r = await rpc("guardar_asiento", "contador", {
    p_operacion: randomUUID(),
    p_id: asientoId,
    p_version: version,
    p_datos: datos({ observaciones: "Prueba atómica editada" }),
    p_movimientos: [
      { id: m1.id, cuenta_id: GASTO, partida: "Renta", debe: 1200, haber: 0, presupuesto_id: RENTA },
      { cuenta_id: BANCO, partida: "Banco", debe: 0, haber: 1200 },
    ],
  });
  assert.equal(r.error, null);
  assert.deepEqual(r.data.movimientos, { insertados: 1, actualizados: 1, eliminados: 1 });
  const despues = await movimientos(asientoId);
  assert.equal(despues.length, 2);
  assert.equal(despues[0].id, m1.id);
  assert.ok(!despues.some((m) => m.id === m2.id));
  assert.equal((await leer(`flujos_programados?asiento_movimiento_id=eq.${m1.id}&select=id`)).length, 1);
  assert.equal(Number((await asiento(asientoId)).total_haber), 1200);
});

test("asiento: descuadre, versión vieja o sin permiso → error y nada cambia", async () => {
  const antes = await asiento(asientoId);
  const movsAntes = await movimientos(asientoId);
  const descuadre = await rpc("guardar_asiento", "contador", { p_operacion: randomUUID(), p_id: asientoId, p_datos: datos({ observaciones: "x" }), p_movimientos: [{ ...movs(5)[0] }, { ...movs(4)[1] }] });
  assert.match(descuadre.error, /no cuadra/);
  const vieja = await rpc("guardar_asiento", "contador", { p_operacion: randomUUID(), p_id: asientoId, p_version: "2000-01-01T00:00:00Z", p_datos: datos({ observaciones: "x" }), p_movimientos: movs(10) });
  assert.match(vieja.error, /cambió desde que lo abriste/);
  const sinRol = await rpc("guardar_asiento", "usuario", { p_operacion: randomUUID(), p_id: asientoId, p_datos: datos({ observaciones: "x" }), p_movimientos: movs(10) });
  assert.ok(sinRol.error);
  const despues = await asiento(asientoId);
  assert.equal(despues.observaciones, antes.observaciones);
  assert.equal(despues.updated_at, antes.updated_at);
  assert.deepEqual(await movimientos(asientoId), movsAntes);
});

const pagosDe = async () => {
  const [prog] = await leer(`proyecto_programacion_financiera?presupuesto_id=eq.${CIMENTACION}&select=id,tiene_anticipo,anticipo_monto`);
  return { prog, pagos: await leer(`proyecto_programacion_pagos?programacion_id=eq.${prog.id}&select=fecha,monto,concepto,es_anticipo&order=orden`) };
};
const datosProg = (extra = {}) => ({
  presupuesto_id: CIMENTACION, proyecto_id: P1, empresa_id: E1, modo: "automatica", frecuencia: "mensual",
  fecha_inicio: "2026-11-01", numero_pagos: 3, tiene_anticipo: true, anticipo_monto: 10000, anticipo_fecha: "2026-10-25", ...extra,
});
const pagos3 = [
  { fecha: "2026-11-01", monto: 30000, concepto: "Pago 1" },
  { fecha: "2026-12-01", monto: 30000, concepto: "Pago 2" },
  { fecha: "2027-01-01", monto: 30000, concepto: "Pago 3" },
];

test("programación de proyecto: reemplaza pagos en una transacción y un reintento no repite", async () => {
  const args = { p_operacion: randomUUID(), p_datos: datosProg(), p_pagos: pagos3 };
  const r = await rpc("guardar_programacion_partida", "contador", args);
  assert.equal(r.error, null);
  assert.equal(r.data.pagos, 4);
  assert.equal(r.data.total, 100000);
  const { prog, pagos } = await pagosDe();
  assert.equal(prog.tiene_anticipo, true);
  assert.deepEqual(pagos.map((p) => [p.concepto, Number(p.monto), p.es_anticipo]), [["Anticipo", 10000, true], ["Pago 1", 30000, false], ["Pago 2", 30000, false], ["Pago 3", 30000, false]]);
  const otra = await rpc("guardar_programacion_partida", "contador", args);
  assert.equal(otra.data.repetido, true);
  assert.equal((await pagosDe()).pagos.length, 4);
});

test("programación de proyecto: si supera el presupuesto o no hay permiso, nada cambia", async () => {
  const antes = await pagosDe();
  const excede = await rpc("guardar_programacion_partida", "contador", { p_operacion: randomUUID(), p_datos: datosProg(), p_pagos: [...pagos3, { fecha: "2027-02-01", monto: 1, concepto: "extra" }] });
  assert.match(excede.error, /supera el presupuesto/);
  const sinFecha = await rpc("guardar_programacion_partida", "contador", { p_operacion: randomUUID(), p_datos: datosProg(), p_pagos: [{ fecha: "", monto: 5, concepto: "x" }] });
  assert.match(sinFecha.error, /fecha/);
  const sinPermiso = await rpc("guardar_programacion_partida", "usuario", { p_operacion: randomUUID(), p_datos: datosProg({ tiene_anticipo: false, anticipo_monto: 0, anticipo_fecha: null }), p_pagos: pagos3.slice(0, 1) });
  assert.ok(sinPermiso.error);
  assert.deepEqual(await pagosDe(), antes);
});
