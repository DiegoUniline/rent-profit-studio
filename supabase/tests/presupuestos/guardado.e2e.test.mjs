// Pruebas funcionales del guardado de Presupuestos (RPC guardar_presupuesto)
// contra PostgREST real sobre la base AISLADA de pruebas (semilla sintética).
// Uso: ver ejecutar.sh en esta carpeta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tokenDe, USUARIOS } from "../rafa/e2e/jwt.mjs";

const REST = process.env.REST_URL || "http://127.0.0.1:54321/rest/v1";
const { SERVICIO, ANON } = process.env;
const RENTA = "b1000000-0000-0000-0000-00000000000b"; // 12 flujos legacy
const CIMENTACION = "b1000000-0000-0000-0000-00000000000a"; // es_project con programación propia
const OTRA_PARTIDA = "b2000000-0000-0000-0000-00000000000e";
const EMPRESA = "e1000000-0000-0000-0000-000000000001";

const cabeceras = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });
const TOK = Object.fromEntries(Object.entries(USUARIOS).map(([k, u]) => [k, tokenDe(u)]));

async function rpc(rol, args) {
  const r = await fetch(`${REST}/rpc/guardar_presupuesto`, { method: "POST", headers: cabeceras(TOK[rol]), body: JSON.stringify(args) });
  const cuerpo = await r.json();
  return r.ok ? { data: cuerpo, error: null } : { data: null, error: cuerpo.message || JSON.stringify(cuerpo) };
}

async function leer(ruta) {
  const r = await fetch(`${REST}/${ruta}`, { headers: cabeceras(SERVICIO) });
  if (!r.ok) throw new Error(`${ruta}: ${await r.text()}`);
  return r.json();
}

const partida = async (id) => (await leer(`presupuestos?id=eq.${id}&select=*`))[0];
const flujos = (id) => leer(`flujos_programados?presupuesto_id=eq.${id}&select=id,fecha,monto,tipo,descripcion,created_at&order=fecha,id`);
const totalPartidas = async () => (await leer("presupuestos?select=id")).length;

const datosDe = (p, cambios = {}) => ({
  empresa_id: p.empresa_id,
  cuenta_id: p.cuenta_id,
  centro_negocio_id: p.centro_negocio_id,
  unidad_medida_id: p.unidad_medida_id,
  partida: p.partida,
  cantidad: Number(p.cantidad),
  precio_unitario: Number(p.precio_unitario),
  notas: p.notas,
  tipo_movimiento: p.tipo_movimiento,
  ...cambios,
});
const comoEnviados = (fs) => fs.map((f) => ({ id: f.id, fecha: f.fecha, monto: Number(f.monto), tipo: f.tipo, descripcion: f.descripcion }));

/** Lo que envía el diálogo al guardar una edición: datos, flujos con id y versión leída al abrir. */
async function editar(rol, id, { cambios = {}, mapaFlujos = (fs) => fs, operacion = randomUUID(), version } = {}) {
  const p = await partida(id);
  const fs = comoEnviados(await flujos(id));
  return rpc(rol, { p_operacion: operacion, p_id: id, p_datos: datosDe(p, cambios), p_flujos: mapaFlujos(fs), p_version: version ?? p.updated_at });
}

test("editar sin cambios conserva el id de la partida, los ids y la cantidad de flujos", async () => {
  const antes = await flujos(RENTA);
  const nPartidas = await totalPartidas();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await editar("admin", RENTA);
    assert.equal(error, null);
    assert.equal(data.presupuesto_id, RENTA);
    assert.equal(data.creado, false);
    assert.deepEqual(data.flujos, { insertados: 0, actualizados: 0, eliminados: 0 });
  }
  const despues = await flujos(RENTA);
  assert.deepEqual(despues.map((f) => f.id), antes.map((f) => f.id));
  assert.equal(await totalPartidas(), nPartidas);
});

test("el contador edita la partida y un pago: se actualizan en sitio, sin duplicar (antes 12 → 24)", async () => {
  const antes = await flujos(RENTA);
  const objetivo = antes[3].id;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await editar("contador", RENTA, {
      cambios: { notas: `nota contador ${i}`, precio_unitario: 10500 },
      mapaFlujos: (fs) => fs.map((f) => (f.id === objetivo ? { ...f, monto: 10500 + i, descripcion: "Renta ajustada" } : f)),
    });
    assert.equal(error, null);
    assert.equal(data.flujos.insertados, 0);
    assert.equal(data.flujos.actualizados, 1);
  }
  const despues = await flujos(RENTA);
  assert.equal(despues.length, antes.length);
  assert.deepEqual(despues.map((f) => f.id).sort(), antes.map((f) => f.id).sort());
  const editado = despues.find((f) => f.id === objetivo);
  assert.equal(Number(editado.monto), 10502);
  assert.equal(editado.descripcion, "Renta ajustada");
  assert.equal(editado.created_at, antes[3].created_at);
  const p = await partida(RENTA);
  assert.equal(p.notas, "nota contador 2");
  assert.equal(Number(p.precio_unitario), 10500);
});

test("agregar pagos inserta solo los nuevos y conserva dos legítimos con mismos datos", async () => {
  const antes = await flujos(RENTA);
  const nuevo = { fecha: "2027-01-05", monto: 777, tipo: "egreso", descripcion: "Extra" };
  const { data, error } = await editar("contador", RENTA, { mapaFlujos: (fs) => [...fs, nuevo, { ...nuevo }] });
  assert.equal(error, null);
  assert.equal(data.flujos.insertados, 2);
  const despues = await flujos(RENTA);
  assert.equal(despues.length, antes.length + 2);
  assert.equal(despues.filter((f) => f.descripcion === "Extra").length, 2);
  for (const f of antes) assert.ok(despues.some((d) => d.id === f.id));
  // Guardar otra vez sin cambios no crece.
  assert.equal((await editar("contador", RENTA)).error, null);
  assert.equal((await flujos(RENTA)).length, antes.length + 2);
});

test("reintento con la misma operación (secuencial y simultáneo) no repite efectos", async () => {
  const antes = await flujos(RENTA);
  const p = await partida(RENTA);
  const args = {
    p_operacion: randomUUID(),
    p_id: RENTA,
    p_datos: datosDe(p, { notas: "reintento" }),
    p_flujos: [...comoEnviados(antes), { fecha: "2027-02-05", monto: 1, tipo: "egreso", descripcion: "Reintento" }],
    p_version: p.updated_at,
  };
  const [a, b] = await Promise.all([rpc("admin", args), rpc("admin", args)]);
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  assert.equal([a.data.repetido, b.data.repetido].filter(Boolean).length, 1);
  const tercero = await rpc("admin", args);
  assert.equal(tercero.data.repetido, true);
  assert.equal(tercero.data.presupuesto_id, RENTA);
  const despues = await flujos(RENTA);
  assert.equal(despues.length, antes.length + 1);
  assert.equal(despues.filter((f) => f.descripcion === "Reintento").length, 1);
});

test("dos guardados simultáneos distintos: uno gana, el otro se rechaza sin duplicar ni perder", async () => {
  const antes = await flujos(RENTA);
  const p = await partida(RENTA);
  const base = { p_id: RENTA, p_flujos: comoEnviados(antes), p_version: p.updated_at };
  const r = await Promise.all([
    rpc("admin", { ...base, p_operacion: randomUUID(), p_datos: datosDe(p, { notas: "pestaña A" }) }),
    rpc("contador", { ...base, p_operacion: randomUUID(), p_datos: datosDe(p, { notas: "pestaña B" }) }),
  ]);
  const ok = r.filter((x) => !x.error);
  const rechazados = r.filter((x) => x.error);
  assert.equal(ok.length, 1);
  assert.equal(rechazados.length, 1);
  assert.match(rechazados[0].error, /PRESUPUESTO_DESACTUALIZADO/);
  assert.deepEqual((await flujos(RENTA)).map((f) => f.id), antes.map((f) => f.id));
});

test("versión vieja: se rechaza sin tocar nada", async () => {
  const antes = await partida(RENTA);
  const { error } = await editar("admin", RENTA, { cambios: { notas: "no debe quedar" }, version: "2000-01-01T00:00:00Z" });
  assert.match(error, /PRESUPUESTO_DESACTUALIZADO/);
  assert.equal((await partida(RENTA)).notas, antes.notas);
});

test("contador que quita un pago: error explícito y ningún cambio parcial", async () => {
  const antes = await flujos(RENTA);
  const pAntes = await partida(RENTA);
  const { error } = await editar("contador", RENTA, {
    cambios: { notas: "no debe quedar" },
    mapaFlujos: (fs) => fs.slice(1).map((f, i) => (i === 0 ? { ...f, monto: 1 } : f)),
  });
  assert.match(error, /solo administradores/);
  assert.deepEqual(await flujos(RENTA), antes);
  assert.equal((await partida(RENTA)).notas, pAntes.notas);
});

test("pago inválido o ajeno a la partida: error y ningún cambio parcial", async () => {
  const antes = await flujos(RENTA);
  const pAntes = await partida(RENTA);
  const invalido = await editar("admin", RENTA, {
    cambios: { notas: "no debe quedar" },
    mapaFlujos: (fs) => [{ ...fs[0], monto: 5 }, { fecha: "2027-03-01", monto: 0, tipo: "egreso", descripcion: "cero" }, ...fs.slice(1)],
  });
  assert.match(invalido.error, /monto mayor a cero/);
  const [ajeno] = await leer(`flujos_programados?presupuesto_id=eq.${CIMENTACION}&select=id&limit=1`).then((x) => (x.length ? x : [{ id: randomUUID() }]));
  const cruzado = await editar("admin", RENTA, { mapaFlujos: (fs) => [...fs, { id: ajeno.id, fecha: "2027-03-01", monto: 1, tipo: "egreso", descripcion: "" }] });
  assert.match(cruzado.error, /no pertenece/);
  const repetido = await editar("admin", RENTA, { mapaFlujos: (fs) => [...fs, fs[0]] });
  assert.match(repetido.error, /repetido/);
  assert.deepEqual(await flujos(RENTA), antes);
  assert.equal((await partida(RENTA)).notas, pAntes.notas);
});

test("el administrador puede quitar un pago: se elimina solo ese", async () => {
  const antes = await flujos(RENTA);
  const quitado = antes.find((f) => f.descripcion === "Extra");
  const { data, error } = await editar("admin", RENTA, { mapaFlujos: (fs) => fs.filter((f) => f.id !== quitado.id) });
  assert.equal(error, null);
  assert.equal(data.flujos.eliminados, 1);
  const despues = await flujos(RENTA);
  assert.deepEqual(despues.map((f) => f.id), antes.filter((f) => f.id !== quitado.id).map((f) => f.id));
});

test("usuario sin rol no puede modificar; la partida no cambia", async () => {
  const antes = await partida(RENTA);
  const { error } = await editar("usuario", RENTA, { cambios: { notas: "intruso" } });
  assert.match(error, /permiso/);
  assert.equal((await partida(RENTA)).notas, antes.notas);
});

test("partida de Proyecto: con flujos se revierte todo; sin flujos (p_flujos null) solo actualiza la partida", async () => {
  const antes = await partida(CIMENTACION);
  const fAntes = await flujos(CIMENTACION);
  const conFlujos = await rpc("admin", {
    p_operacion: randomUUID(), p_id: CIMENTACION, p_version: antes.updated_at,
    p_datos: datosDe(antes, { notas: "no debe quedar" }),
    p_flujos: [{ fecha: "2026-12-01", monto: 1, tipo: "egreso", descripcion: "legacy" }],
  });
  assert.ok(conFlujos.error);
  assert.equal((await partida(CIMENTACION)).notas, antes.notas);
  assert.deepEqual(await flujos(CIMENTACION), fAntes);
  const soloPartida = await rpc("admin", {
    p_operacion: randomUUID(), p_id: CIMENTACION, p_version: antes.updated_at,
    p_datos: datosDe(antes, { notas: "editada desde Presupuestos" }), p_flujos: null,
  });
  assert.equal(soloPartida.error, null);
  const despues = await partida(CIMENTACION);
  assert.equal(despues.notas, "editada desde Presupuestos");
  assert.equal(despues.es_project, true);
  assert.equal(despues.orden, antes.orden);
  assert.deepEqual(await flujos(CIMENTACION), fAntes);
});

test("crear genera un solo registro con sus pagos; reintentar no crea otro", async () => {
  const n = await totalPartidas();
  const args = {
    p_operacion: randomUUID(), p_id: null, p_version: null,
    p_datos: { empresa_id: EMPRESA, partida: "Partida nueva", cantidad: 2, precio_unitario: 300, tipo_movimiento: "egreso", notas: "", cuenta_id: "", centro_negocio_id: null, unidad_medida_id: null },
    p_flujos: [{ fecha: "2026-11-01", monto: 300, tipo: "egreso", descripcion: "" }, { fecha: "2026-11-01", monto: 300, tipo: "egreso", descripcion: "" }],
  };
  const [a, b] = await Promise.all([rpc("admin", args), rpc("admin", args)]);
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  assert.equal(a.data.presupuesto_id, b.data.presupuesto_id);
  assert.equal(a.data.creado, true);
  assert.equal(await totalPartidas(), n + 1);
  const nueva = await partida(a.data.presupuesto_id);
  assert.equal(nueva.partida, "Partida nueva");
  assert.ok(nueva.orden > 0);
  assert.equal((await flujos(nueva.id)).length, 2);
  const otra = await rpc("contador", { ...args, p_operacion: randomUUID() });
  assert.ok(otra.error, "el contador no crea partidas (política existente)");
  assert.equal(await totalPartidas(), n + 1);
});

test("sin clave de operación o con datos inválidos no guarda", async () => {
  const p = await partida(OTRA_PARTIDA);
  assert.match((await rpc("admin", { p_operacion: null, p_id: OTRA_PARTIDA, p_datos: datosDe(p), p_flujos: null })).error, /clave de operación/);
  assert.match((await rpc("admin", { p_operacion: randomUUID(), p_id: OTRA_PARTIDA, p_datos: datosDe(p, { cantidad: 0 }), p_flujos: null })).error, /cantidad/);
  assert.equal(Number((await partida(OTRA_PARTIDA)).cantidad), Number(p.cantidad));
});
