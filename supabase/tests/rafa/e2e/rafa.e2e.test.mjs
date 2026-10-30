// Pruebas funcionales de punta a punta de Rafa (entorno aislado, datos sintéticos).
// El modelo de IA es un servidor simulado con guion: decide qué herramientas
// llamar, para comprobar lo que controla el servidor (permisos, datos, cálculos,
// confirmaciones, persistencia y contexto). No evalúa la calidad del modelo real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { USUARIOS, tokenDe } from "./jwt.mjs";

const RAFA = process.env.RAFA_URL || "http://127.0.0.1:8000";
const REST = process.env.REST_URL || "http://127.0.0.1:54321/rest/v1";
const SERVICIO = process.env.SERVICIO;
const ANON = process.env.ANON;

const E1 = "e1000000-0000-0000-0000-000000000001";
const E2 = "e2000000-0000-0000-0000-000000000002";
const P1 = "91000000-0000-0000-0000-000000000001";
const PA = "b1000000-0000-0000-0000-00000000000a"; // Cimentación (proyecto) 100,000
const PB = "b1000000-0000-0000-0000-00000000000b"; // Renta 12 × 10,000
const PC = "b1000000-0000-0000-0000-00000000000c"; // Venta de lotes 550 × 2,000 (ingreso)
const PE = "b2000000-0000-0000-0000-00000000000e"; // Empresa Dos
const BANCO = "c1000000-0000-0000-0000-000000000101";
const pr = (n) => `70000000-0000-0000-0000-00000000000${n}`;
const SEMANA = { desde: "2026-10-12", hasta: "2026-10-18" };

// ---------------------------------------------------------------- modelo simulado
const peticiones = [];
let cola = [];
let n = 0;
const servidorIA = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", async () => {
    const body = JSON.parse(cuerpo || "{}");
    peticiones.push(body);
    const paso = cola.shift();
    let r = paso ? (typeof paso === "function" ? await paso(body) : paso) : { content: "(sin guion)" };
    if (r.status) {
      res.writeHead(r.status, { "Content-Type": "text/plain" });
      return res.end("simulado");
    }
    const tool_calls = (r.tool_calls || []).map((t) => ({
      id: `call_${++n}`,
      type: "function",
      function: { name: t.nombre, arguments: typeof t.args === "string" ? t.args : JSON.stringify(t.args) },
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: r.content ?? null, tool_calls } }] }));
  });
});
const guion = (...pasos) => (cola = pasos);
const usar = (nombre, args) => ({ tool_calls: [{ nombre, args }] });
const llamada = (nombre, args) => ({ nombre, args });
const fin = (texto = "Respuesta de prueba.") => ({ content: texto });
const sistema = (body) => body.messages.find((m) => m.role === "system").content;

before(() => new Promise((ok) => servidorIA.listen(54322, "127.0.0.1", ok)));
after(() => servidorIA.close());

// ---------------------------------------------------------------- utilidades
async function llamar(usuario, cuerpo) {
  const r = await fetch(RAFA, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDe(USUARIOS[usuario])}` },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: await r.json() };
}
async function chat(usuario, mensaje, extra = {}) {
  const r = await llamar(usuario, { modo: "chat", mensaje, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
  return r.cuerpo;
}
const resultado = (salida, i = 0) => salida.herramientas[i].resultado;
async function rest(ruta, { metodo = "GET", cuerpo, token = SERVICIO } = {}) {
  const r = await fetch(`${REST}/${ruta}`, {
    method: metodo,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}
const contar = async (ruta) => (await rest(ruta)).length;

// ================================================================ CONSULTAS Y CONTINUIDAD
let conversacion;

test("pide la empresa en vez de elegir la primera", async () => {
  guion(usar("comparar_programacion_presupuesto", SEMANA), fin("¿De qué empresa?"));
  const s = await chat("contador", "¿Todos los pagos de esta semana están dentro del presupuesto?");
  conversacion = s.conversacion_id;
  const r = resultado(s);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ["empresa_id"]);
  assert.equal(r.datos.opciones.length, 2);
});

test("compara la programación semanal contra presupuesto con efecto acumulado y sin otras empresas", async () => {
  guion(
    (body) => {
      assert.ok(body.messages.some((m) => m.role === "assistant" && /comparar_programacion_presupuesto/.test(m.content)), "el historial incluye la memoria del turno anterior");
      return usar("comparar_programacion_presupuesto", { empresa_id: E1, ...SEMANA });
    },
    fin()
  );
  const s = await chat("contador", "Demo Uno", { conversacion_id: conversacion });
  const r = resultado(s);
  assert.equal(r.ok, true, r.resumen);
  assert.equal(r.alcance.empresa.id, E1);
  assert.deepEqual(r.alcance.periodo, SEMANA);
  const a = r.datos.partidas.find((p) => p.presupuesto_id === PA);
  assert.equal(a.presupuestado, 100000);
  assert.equal(a.ejercido, 30000);
  assert.equal(a.pendiente_previo, 0);
  assert.equal(a.programado_ventana, 80000);
  assert.equal(a.disponible_final, -10000);
  assert.equal(a.excede, true);
  assert.equal(a.primera_excedida, pr(2));
  assert.deepEqual(a.filas.map((f) => f.disponible_tras), [20000, -10000]);
  const b = r.datos.partidas.find((p) => p.presupuesto_id === PB);
  assert.deepEqual([b.presupuestado, b.ejercido, b.pendiente_previo, b.programado_ventana, b.disponible_final], [120000, 10000, 10000, 10000, 90000]);
  const c = r.datos.partidas.find((p) => p.presupuesto_id === PC);
  assert.deepEqual([c.ejercido, c.programado_ventana, c.disponible_final], [50000, 100000, 950000]);
  assert.deepEqual(r.datos.excepciones.map((x) => [x.programacion_id, x.motivo, x.monto]), [[pr(4), "sin_partida", 5000]]);
  assert.deepEqual(r.datos.ejecutadas_en_periodo.map((x) => x.programacion_id), [pr(7)]);
  assert.equal(r.datos.totales.programaciones_en_ventana, 6);
  assert.equal(r.datos.totales.monto_en_ventana, 205000);
  assert.equal(r.datos.totales.partidas_excedidas, 1);
  assert.ok(!JSON.stringify(r).includes(pr(8)), "no incluye programaciones de la Empresa Dos");
  assert.equal(s.contexto.empresa_id, E1);
  assert.deepEqual(s.contexto.periodo, SEMANA);
});

test("continúa la conversación con el proyecto de la pantalla y conserva empresa y periodo", async () => {
  guion(
    (body) => {
      const sys = sistema(body);
      assert.ok(sys.includes(E1) && sys.includes("2026-10-12"), "el contexto vigente viaja al modelo");
      assert.ok(sys.includes(P1), "el contexto de pantalla viaja al modelo");
      return usar("comparar_programacion_presupuesto", { empresa_id: E1, ...SEMANA, proyecto_id: P1 });
    },
    fin()
  );
  const s = await chat("contador", "Ahora solo la del proyecto seleccionado", {
    conversacion_id: conversacion,
    contexto_pantalla: { ruta: `/proyectos/${P1}`, proyecto_id: P1 },
  });
  const r = resultado(s);
  assert.deepEqual(r.datos.partidas.map((p) => p.presupuesto_id), [PA]);
  assert.equal(r.alcance.proyecto.nombre, "Obra Norte");
  assert.equal(r.datos.excepciones.length, 0);
  assert.equal(s.contexto.proyecto_id, P1);
});

test("reconstruye el origen de un total renglón por renglón", async () => {
  guion(usar("explicar_partida", { presupuesto_id: PA }), fin());
  const r = resultado(await chat("contador", "Muéstrame de dónde sale esa diferencia", { conversacion_id: conversacion }));
  assert.equal(r.datos.presupuestado.total, 100000);
  assert.equal(r.datos.ejercido.naturaleza, 30000);
  assert.equal(r.datos.ejercido.debe_haber, 30000);
  assert.equal(r.datos.proyectado.fuente, "proyecto_programacion_pagos");
  assert.equal(r.datos.proyectado.total, 100000);
  assert.equal(r.datos.programaciones_tesoreria.por_estado.pendiente, 80000);
  assert.ok(r.referencias.some((x) => x.enlace === "/asientos/a5000000-0000-0000-0000-000000000001"));
});

test("explica por qué difieren los dos métodos de ejercido", async () => {
  guion(usar("explicar_partida", { presupuesto_id: PC }), fin());
  const r = resultado(await chat("contador", "¿Por qué el ejercido de la venta de lotes no coincide entre Presupuestos y Proyectos?"));
  assert.equal(r.datos.ejercido.naturaleza, 50000);
  assert.equal(r.datos.ejercido.debe_haber, 100000);
  assert.equal(r.datos.ejercido.diferencia, 50000);
  assert.equal(r.datos.ejercido.lado_naturaleza, "haber");
});

test("resume ejercido con la regla de la pantalla Presupuestos", async () => {
  guion(usar("resumen_presupuesto", { empresa_id: E1 }), usar("resumen_presupuesto", { empresa_id: E1, metodo_ejercido: "debe_haber" }), fin());
  const s = await chat("contador", "¿Cuánto llevamos ejercido?");
  const t = resultado(s, 0).datos.totales;
  assert.deepEqual([t.egresos.presupuestado, t.egresos.ejercido, t.ingresos.presupuestado, t.ingresos.ejercido], [220000, 40000, 1100000, 50000]);
  assert.equal(resultado(s, 1).datos.totales.ingresos.ejercido, 100000);
  assert.equal(s.herramientas.filter((h) => h.resultado.tipo === "accion").length, 0, "una pregunta no se convierte en propuesta");
});

test("busca conocimiento versionado y registra la versión usada", async () => {
  guion(usar("buscar_conocimiento", { consulta: "diferencia entre flujos programados y programaciones" }), fin());
  const s = await chat("contador", "¿Qué diferencia hay entre flujos programados y programaciones?");
  const r = resultado(s);
  assert.ok(r.datos.fragmentos.length > 0);
  assert.equal(r.datos.version, s.version_conocimiento);
  const mensajes = await rest(`rafa_mensajes?conversacion_id=eq.${s.conversacion_id}&select=rol,version_conocimiento`);
  assert.ok(mensajes.every((m) => m.version_conocimiento === s.version_conocimiento));
});

test("resto de consultas: capas de flujo, asientos, balanza, detalle, búsqueda, excepciones, esquema y tareas", async () => {
  guion(
    { tool_calls: [
      llamada("flujo_proyectado", { empresa_id: E1, desde: "2026-10-01", hasta: "2026-11-30" }),
      llamada("consultar_asientos", { empresa_id: E1, desde: "2026-10-01", hasta: "2026-10-31" }),
      llamada("saldos_cuentas", { empresa_id: E1, hasta: "2026-10-31", codigo_prefijo: "100-001", solo_con_movimiento: true }),
      llamada("detalle_registro", { entidad: "asiento", id: "a5000000-0000-0000-0000-000000000002" }),
      llamada("detalle_registro", { entidad: "programacion", id: pr(7) }),
      llamada("buscar_registros", { entidad: "presupuestos", empresa_id: E1, texto: "renta" }),
      llamada("buscar_registros", { entidad: "cuentas_contables", empresa_id: E1, codigo_prefijo: "600" }),
      llamada("excepciones_respaldo_presupuestal", { empresa_id: E1 }),
      llamada("describir_entidad", { tabla: "programaciones" }),
      llamada("consultar_tareas", { proyecto_id: P1 }),
      llamada("consultar_programaciones", { empresa_id: E1, ...SEMANA }),
      llamada("listar_empresas", {}),
      llamada("auditoria_proyecto", { proyecto_id: P1 }),
      llamada("proponer_plan_presupuesto", { resumen: "Plan", centro_negocio: { nombre: "Obra Sur" }, tercero: { nombre: "" }, iva: { incluir: true, tasa: 16 }, partidas: [], programacion: { tipo: "egreso", frecuencia: "mensual", numero_pagos: 1, fecha_inicio: "2026-11-01" } }),
    ] },
    fin()
  );
  const s = await chat("contador", "Consultas varias");
  const [flujo, asientos, balanza, detAsiento, detProg, busq, cuentas, exc, ent, tareas, progs, emp, aud, plan] = s.herramientas.map((h) => h.resultado);
  for (const r of [flujo, asientos, balanza, detAsiento, detProg, busq, cuentas, exc, ent, tareas, progs, emp, aud, plan]) assert.equal(r.ok, true, r.resumen);
  const oct = flujo.datos.serie.find((m) => m.mes === "2026-10");
  const nov = flujo.datos.serie.find((m) => m.mes === "2026-11");
  assert.deepEqual([oct.proyectado_egresos, oct.iva_egresos, oct.tesoreria_egresos, oct.tesoreria_ingresos], [50000, 1600, 105000, 100000]);
  assert.equal(nov.proyectado_egresos, 70000);
  assert.deepEqual(asientos.datos.por_estado.aplicado, { cantidad: 3, total: 91600 });
  assert.equal(asientos.datos.por_estado.borrador.cantidad, 1);
  assert.equal(balanza.datos.cuentas.find((c) => c.codigo === "100-001-001-001").saldo_final, 8400);
  assert.equal(detAsiento.datos.renglones.length, 3);
  assert.equal(detAsiento.datos.flujos_iva_generados.length, 1);
  assert.match(detProg.datos.avisos.join(" "), /ejecutada pero no tiene asiento/);
  assert.equal(busq.alcance.total, 1);
  assert.equal(cuentas.alcance.total, 2);
  assert.deepEqual(exc.datos.por_motivo.sin_partida, { cantidad: 1, monto: 5000 });
  assert.ok(exc.datos.partidas_excedidas.some((p) => p.presupuesto_id === PA));
  assert.ok(ent.datos.columnas.some((c) => c.nombre === "presupuesto_id"));
  assert.equal(tareas.datos.tareas.length, 2);
  assert.deepEqual(progs.datos.kpi_pendientes, { ingresos: 100000, egresos: 95000, neto: 5000 });
  assert.equal(emp.datos.empresas.length, 2);
  assert.equal(plan.tipo, "plan");
});

// ================================================================ PERMISOS POR ROL Y PROYECTO
test("usuario de proyecto: no ve módulos contables y no recibe esas herramientas", async () => {
  guion(usar("comparar_programacion_presupuesto", { empresa_id: E1, ...SEMANA }), usar("buscar_registros", { entidad: "asientos", empresa_id: E1 }), fin());
  const s = await chat("usuario", "Compara la programación");
  assert.match(resultado(s, 0).resumen, /Permiso denegado/);
  assert.match(resultado(s, 1).resumen, /Permiso denegado/);
  const ofrecidas = peticiones.at(-1).tools.map((t) => t.function.name);
  assert.ok(!ofrecidas.includes("comparar_programacion_presupuesto"));
  assert.ok(ofrecidas.includes("resumen_proyecto"));
});

test("usuario asignado ve su proyecto sin programación financiera; otro usuario no lo ve", async () => {
  guion(usar("resumen_proyecto", { proyecto_id: P1 }), fin());
  const r = resultado(await chat("usuario", "¿Cómo va mi proyecto?"));
  assert.equal(r.ok, true, r.resumen);
  assert.equal(r.datos.partidas[0].ejercido, 30000);
  assert.equal(r.datos.partidas[0].proyectado, null);
  guion(usar("resumen_proyecto", { proyecto_id: P1 }), fin());
  const r2 = resultado(await chat("usuario2", "¿Cómo va Obra Norte?"));
  assert.equal(r2.ok, false);
  assert.match(r2.resumen, /No tienes acceso/);
});

test("arquitecto ve proyectado acumulado y desviación (fecha de corte)", async () => {
  guion(usar("resumen_proyecto", { proyecto_id: P1, fecha_corte: "2026-10-16" }), fin());
  const r = resultado(await chat("arquitecto", "Resumen de Obra Norte"));
  const p = r.datos.partidas[0];
  assert.deepEqual([p.presupuesto, p.proyectado, p.proyectado_acumulado, p.ejercido], [100000, 100000, 40000, 30000]);
  assert.equal(r.datos.agregado.desviacion, -10000);
});

// ================================================================ SIMULACIONES (sin escritura)
test("proyección por unidades: 550 en lotes de 15 = 36 de 15 y 1 de 10, sin guardar", async () => {
  guion(usar("simular_proyeccion_unidades", { total_unidades: 550, unidades_por_periodo: 15, frecuencia: "mensual", fecha_inicio: "2026-11-01", presupuesto_id: PC, empresa_id: E1, unidad: "lotes" }), fin());
  const r = resultado(await chat("contador", "Programa 15 lotes por mes hasta completar 550"));
  assert.equal(r.tipo, "simulacion");
  assert.deepEqual([r.datos.periodos, r.datos.completos, r.datos.ultimo_periodo, r.datos.total_importe], [37, 36, 10, 1100000]);
  assert.equal(r.datos.filas.at(-1).fecha, "2029-11-01");
  assert.equal(r.datos.filas.at(-1).importe, 20000);
});

test("simula +5% mostrando antes/después y proyección sin modificar el presupuesto", async () => {
  guion(
    usar("simular_incremento_presupuesto", { empresa_id: E1, proyecto_id: P1, porcentaje: 5 }),
    usar("simular_incremento_presupuesto", { empresa_id: E1, proyecto_id: P1, porcentaje: 5, aplicar_a: "precio_unitario" }),
    fin()
  );
  const s = await chat("contador", "Aumenta 5% este presupuesto y muéstrame cómo cambia la proyección");
  assert.match(resultado(s, 0).resumen, /aplicar_a: es obligatorio/, "no asume si es precio o cantidad");
  const r = resultado(s, 1);
  assert.deepEqual([r.datos.totales.presupuesto_antes, r.datos.totales.presupuesto_despues, r.datos.filas[0].por_programar_despues], [100000, 105000, 5000]);
  const [pa] = await rest(`presupuestos?id=eq.${PA}&select=precio_unitario`);
  assert.equal(Number(pa.precio_unitario), 100000);
});

test("sugiere la programación del periodo desde operaciones recurrentes de ambas fuentes", async () => {
  guion(usar("sugerir_programacion_periodo", { empresa_id: E1, desde: "2026-11-01", hasta: "2026-11-30" }), fin());
  const r = resultado(await chat("contador", "Prepara la programación de noviembre con las operaciones recurrentes"));
  const c = r.datos.candidatos.map((x) => [x.presupuesto_id, x.fecha_programada, x.monto, x.fuente]);
  assert.deepEqual(c.sort(), [[PA, "2026-11-01", 60000, "proyecto_programacion_pagos"], [PB, "2026-11-05", 10000, "flujos_programados"]].sort());
});

// ================================================================ ACCIONES CON CONFIRMACIÓN
let accion;

test("propone programaciones recurrentes con respaldo presupuestal y no escribe hasta confirmar", async () => {
  guion(
    usar("proponer_programaciones", { empresa_id: E1, recurrencia: { tipo: "egreso", presupuesto_id: PB, frecuencia: "mensual", fecha_inicio: "2026-11-05", numero_periodos: 3, monto_por_periodo: 10000, observaciones: "Renta Rafa" } }),
    fin("PROPUESTA lista para confirmar.")
  );
  const s = await chat("contador", "Programa las rentas de noviembre a enero");
  const r = resultado(s);
  assert.equal(r.tipo, "accion");
  assert.equal(r.accion.estado, "propuesta");
  assert.equal(r.accion.requiere_confirmacion, true);
  accion = r.accion;
  assert.equal(await contar("programaciones?observaciones=like.Renta%20Rafa*&select=id"), 0);
});

test("la confirmación debe corresponder a la versión presentada", async () => {
  const r = await llamar("contador", { modo: "confirmar", accion_id: accion.id, huella: "otra" });
  assert.equal(r.cuerpo.error, "huella_distinta");
  assert.equal(await contar("programaciones?observaciones=like.Renta%20Rafa*&select=id"), 0);
});

test("confirma, ejecuta en una transacción y un reintento no duplica", async () => {
  const r = await llamar("contador", { modo: "confirmar", accion_id: accion.id, huella: accion.huella });
  assert.equal(r.cuerpo.accion.estado, "ejecutada", r.cuerpo.resumen);
  assert.equal(await contar("programaciones?observaciones=like.Renta%20Rafa*&select=id"), 3);
  const otra = await llamar("contador", { modo: "confirmar", accion_id: accion.id, huella: accion.huella });
  assert.match(otra.cuerpo.resumen, /ya se había ejecutado/);
  assert.equal(await contar("programaciones?observaciones=like.Renta%20Rafa*&select=id"), 3);
  const [fila] = await rest(`rafa_acciones?id=eq.${accion.id}&select=estado,resultado,user_id`);
  assert.equal(fila.estado, "ejecutada");
  assert.equal(fila.resultado.programacion_ids.length, 3);
  const notas = await rest(`rafa_mensajes?conversacion_id=eq.${(await rest(`rafa_acciones?id=eq.${accion.id}&select=conversacion_id`))[0].conversacion_id}&rol=eq.asistente&select=contenido`);
  assert.ok(notas.some((m) => /EJECUTADA/.test(m.contenido)), "la conversación registra el resultado real");
});

test("dos confirmaciones simultáneas ejecutan una sola vez", async () => {
  guion(usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-12-20", monto: 1000, presupuesto_id: PB, observaciones: "Concurrente" }] }), fin());
  const a = resultado(await chat("contador", "Programa un pago de 1000")).accion;
  const [x, y] = await Promise.all([
    llamar("contador", { modo: "confirmar", accion_id: a.id, huella: a.huella }),
    llamar("contador", { modo: "confirmar", accion_id: a.id, huella: a.huella }),
  ]);
  assert.ok([x, y].some((r) => r.cuerpo.accion?.estado === "ejecutada"));
  assert.equal(await contar("programaciones?observaciones=eq.Concurrente&select=id"), 1);
});

test("rechaza duplicados, falta de respaldo, tipo incompatible y partida faltante", async () => {
  guion(
    usar("proponer_programaciones", { empresa_id: E1, recurrencia: { tipo: "egreso", presupuesto_id: PB, frecuencia: "mensual", fecha_inicio: "2026-11-05", numero_periodos: 3, monto_por_periodo: 10000, observaciones: "Renta Rafa" } }),
    usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-10-30", monto: 25000, presupuesto_id: PA }] }),
    usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-10-30", monto: 10, presupuesto_id: PC }] }),
    usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-10-30", monto: 10 }] }),
    fin()
  );
  const s = await chat("contador", "Intenta varias programaciones");
  assert.match(resultado(s, 0).resumen, /posible duplicado/);
  assert.match(resultado(s, 1).resumen, /no tiene respaldo suficiente/);
  assert.match(resultado(s, 2).resumen, /es de ingreso/);
  assert.match(resultado(s, 3).resumen, /presupuesto_id: es obligatorio/);
  assert.ok(s.herramientas.every((h) => !h.resultado.accion), "ninguna quedó como propuesta");
});

test("una propuesta con datos que cambiaron se marca desactualizada y se recalcula", async () => {
  guion(usar("proponer_ajuste_presupuesto", { empresa_id: E1, presupuesto_ids: [PB], porcentaje: 5, aplicar_a: "precio_unitario" }), fin());
  const a = resultado(await chat("contador", "Aplica el 5% al precio de la renta")).accion;
  assert.equal(a.vista_previa.tablas[0].filas[0].presupuesto_despues, 126000);
  await rest(`presupuestos?id=eq.${PB}`, { metodo: "PATCH", cuerpo: { precio_unitario: 11000 } });
  const r = await llamar("contador", { modo: "confirmar", accion_id: a.id, huella: a.huella });
  assert.match(r.cuerpo.resumen, /NO EJECUTADA: los datos cambiaron/);
  assert.equal(r.cuerpo.accion.estado, "propuesta");
  assert.equal(r.cuerpo.accion.vista_previa.tablas[0].filas[0].precio_despues, 11550);
  const [vieja] = await rest(`rafa_acciones?id=eq.${a.id}&select=estado,reemplazada_por`);
  assert.deepEqual([vieja.estado, vieja.reemplazada_por], ["desactualizada", r.cuerpo.accion.id]);
  const ok = await llamar("contador", { modo: "confirmar", accion_id: r.cuerpo.accion.id, huella: r.cuerpo.accion.huella });
  assert.equal(ok.cuerpo.accion.estado, "ejecutada");
  const [pb] = await rest(`presupuestos?id=eq.${PB}&select=precio_unitario`);
  assert.equal(Number(pb.precio_unitario), 11550);
  const audit = await rest(`proyecto_auditoria?presupuesto_id=eq.${PB}&accion=eq.presupuesto.monto&select=user_id,valor_nuevo`);
  assert.ok(audit.some((x) => x.user_id === USUARIOS.contador.id && /11550/.test(x.valor_nuevo)), "auditoría con el usuario responsable");
});

// ================================================================ PROGRAMACIÓN → ASIENTO SIN DOBLE CONTEO
let asientoBorrador;

test("prepara el asiento borrador de una programación sin contabilizarlo y la liga", async () => {
  guion(usar("proponer_asientos_borrador", { empresa_id: E1, desde_programaciones: { programacion_ids: [pr(1)], cuenta_banco_id: BANCO } }), fin());
  const r = resultado(await chat("contador", "Prepara el borrador contable de la estimación 1"));
  assert.equal(r.accion.estado, "ejecutada", r.resumen);
  asientoBorrador = r.accion.resultado.asientos[0].asiento_id;
  const [a] = await rest(`asientos_contables?id=eq.${asientoBorrador}&select=estado,total_debe`);
  assert.deepEqual([a.estado, Number(a.total_debe)], ["borrador", 50000]);
  const [p] = await rest(`programaciones?id=eq.${pr(1)}&select=asiento_id,estado`);
  assert.deepEqual([p.asiento_id, p.estado], [asientoBorrador, "pendiente"]);
  guion(usar("proponer_asientos_borrador", { empresa_id: E1, desde_programaciones: { programacion_ids: [pr(1)], cuenta_banco_id: BANCO } }), usar("proponer_asientos_borrador", { empresa_id: E1, desde_programaciones: { programacion_ids: [pr(2)] } }), fin());
  const s2 = await chat("contador", "Otra vez");
  assert.match(resultado(s2, 0).resumen, /ya tiene el asiento/);
  assert.match(resultado(s2, 1).resumen, /cuenta_banco_id: es obligatorio/, "no supone la cuenta de banco");
});

test("al aplicar el asiento la programación deja de contar como pendiente (sin doble conteo)", async () => {
  guion(usar("proponer_aplicar_asientos", { empresa_id: E1, asiento_ids: [asientoBorrador] }), fin());
  const a = resultado(await chat("contador", "Contabiliza ese asiento")).accion;
  assert.equal(a.estado, "propuesta");
  const r = await llamar("contador", { modo: "confirmar", accion_id: a.id, huella: a.huella });
  assert.equal(r.cuerpo.accion.estado, "ejecutada", r.cuerpo.resumen);
  guion(usar("comparar_programacion_presupuesto", { empresa_id: E1, ...SEMANA }), fin());
  const c = resultado(await chat("contador", "Vuelve a revisar la semana"));
  const pa = c.datos.partidas.find((p) => p.presupuesto_id === PA);
  assert.deepEqual([pa.ejercido, pa.programado_ventana, pa.consumido_final, pa.disponible_final], [80000, 30000, 110000, -10000]);
  assert.deepEqual(c.datos.excluidas_por_asiento_aplicado.map((x) => x.programacion_id), [pr(1)]);
});

// ================================================================ PERMISOS EN ACCIONES Y AISLAMIENTO
test("la confirmación no concede permisos: se revalida el rol al confirmar", async () => {
  guion(usar("proponer_cambio_estado_programaciones", { empresa_id: E1, programacion_ids: [pr(5)], estado_nuevo: "ejecutado" }), fin());
  const a = resultado(await chat("contador", "Marca el cobro de lotes como ejecutado")).accion;
  await rest(`user_roles?user_id=eq.${USUARIOS.contador.id}`, { metodo: "PATCH", cuerpo: { role: "usuario" } });
  try {
    const r = await llamar("contador", { modo: "confirmar", accion_id: a.id, huella: a.huella });
    assert.match(r.cuerpo.resumen, /NO EJECUTADA/);
  } finally {
    await rest(`user_roles?user_id=eq.${USUARIOS.contador.id}`, { metodo: "PATCH", cuerpo: { role: "contador" } });
  }
  const [p] = await rest(`programaciones?id=eq.${pr(5)}&select=estado`);
  assert.equal(p.estado, "pendiente");
  guion(usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-10-30", monto: 10, presupuesto_id: PB }] }), fin());
  assert.match(resultado(await chat("usuario", "Programa un pago")).resumen, /Permiso denegado/);
  guion(usar("proponer_tarea", { proyecto_id: P1, titulo: "Nueva tarea arquitecto" }), fin());
  assert.match(resultado(await chat("arquitecto", "Crea una tarea")).resumen, /Permiso denegado/);
});

test("aislamiento entre empresas y entre conversaciones", async () => {
  guion(
    usar("explicar_partida", { presupuesto_id: PE, empresa_id: E1 }),
    usar("proponer_programaciones", { empresa_id: E1, items: [{ tipo: "egreso", fecha_programada: "2026-10-30", monto: 10, presupuesto_id: PE }] }),
    usar("consultar_programaciones", { empresa_id: E1, ...SEMANA }),
    fin()
  );
  const s = await chat("contador", "Revisa la partida de la otra empresa");
  assert.match(resultado(s, 0).resumen, /no pertenece a la empresa/);
  assert.equal(resultado(s, 1).ok, false);
  assert.ok(!JSON.stringify(resultado(s, 2)).includes(pr(8)));
  const ajena = await llamar("usuario", { modo: "chat", mensaje: "hola", conversacion_id: s.conversacion_id });
  assert.notEqual(ajena.status, 200);
  assert.match(ajena.cuerpo.error, /no es tuya/);
  const visibles = await rest(`rafa_mensajes?select=user_id`, { token: tokenDe(USUARIOS.usuario) });
  assert.ok(visibles.every((m) => m.user_id === USUARIOS.usuario.id), "solo ve sus mensajes");
});

// ================================================================ FALLOS Y LÍMITES
test("informa fallos del proveedor, entradas inválidas, herramientas inexistentes y límite de pasos", async () => {
  guion({ status: 429 });
  const r429 = await llamar("contador", { modo: "chat", mensaje: "hola" });
  assert.equal(r429.status, 429);
  guion(usar("consultar_programaciones", { desde: "2026-13-01", hasta: "x" }), usar("borrar_todo", {}), fin());
  const s = await chat("contador", "Prueba de errores");
  assert.match(resultado(s, 0).resumen, /fecha inválida/);
  assert.match(resultado(s, 1).resumen, /no existe/);
  guion(...Array.from({ length: 9 }, () => usar("listar_empresas", {})));
  const largo = await chat("contador", "Bucle");
  assert.match(largo.contenido, /No terminé/);
});

test("tareas: crea sin duplicar títulos abiertos", async () => {
  guion(usar("proponer_tarea", { proyecto_id: P1, titulo: "Revisar planos" }), usar("proponer_tarea", { proyecto_id: P1, titulo: "Solicitar permisos", fecha_vencimiento: "2026-11-15" }), fin());
  const s = await chat("contador", "Agrega tareas al proyecto");
  assert.match(resultado(s, 0).resumen, /Ya existe una tarea abierta/);
  assert.equal(resultado(s, 1).accion.estado, "ejecutada");
  assert.equal(await contar(`proyecto_tareas?proyecto_id=eq.${P1}&titulo=eq.Solicitar%20permisos&select=id`), 1);
});

test("conserva el modo plan original (catálogo → plan editable)", async () => {
  guion((body) => {
    assert.equal(body.tool_choice.function.name, "proponer_plan");
    return usar("proponer_plan", { resumen: "Plan de prueba", centro_negocio: { nombre: "Obra Sur" }, tercero: { nombre: "" }, iva: { incluir: false, tasa: 16 }, partidas: [{ descripcion: "Excavación", cantidad: 10, precio_unitario: 100, importe: 1000 }], programacion: { tipo: "egreso", frecuencia: "mensual", numero_pagos: 2, fecha_inicio: "2026-11-01" } });
  });
  const r = await llamar("contador", { texto: "Carga este presupuesto", archivos: [], cuentas: [] });
  assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.plan.partidas[0].descripcion, "Excavación");
  const sinPermiso = await llamar("usuario", { texto: "Carga este presupuesto" });
  assert.equal(sinPermiso.status, 403);
});

test("rechaza peticiones sin sesión válida", async () => {
  const r = await fetch(RAFA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "chat", mensaje: "hola" }) });
  assert.equal(r.status, 401);
});

// ================================================================ CONVERSACIONES POR CENTRO
const CN_OFICINA = "a1000000-0000-0000-0000-000000000002"; // Oficina Central (Empresa Uno)
let archivoDelCentro = null;
const ultimoUsuario = (body) => [...body.messages].reverse().find((m) => m.role === "user").content;

test("conversación anclada a un centro: contexto automático, archivos guardados y reutilizados", async () => {
  // La conversación nace anclada (como al dar de alta el centro); la empresa la pone la base.
  const [conv] = await rest("rafa_conversaciones", {
    metodo: "POST",
    token: tokenDe(USUARIOS.contador),
    cuerpo: { user_id: USUARIOS.contador.id, titulo: "Centro Oficina Central", centro_negocio_id: CN_OFICINA, empresa_id: E2 },
  });
  assert.equal(conv.empresa_id, E1, "la empresa sale del centro, no del navegador");

  // Sin indicar empresa ni centro, la consulta usa el centro de la conversación.
  let sistemaVisto = "";
  let usuarioVisto = null;
  guion(
    (body) => {
      sistemaVisto = sistema(body);
      usuarioVisto = ultimoUsuario(body);
      return usar("resumen_presupuesto", {});
    },
    fin("Resumen del centro.")
  );
  const pdf = Buffer.from("%PDF-1.4 catalogo de prueba").toString("base64");
  const s = await chat("contador", "¿Cómo va el presupuesto?", {
    conversacion_id: conv.id,
    archivos: [{ filename: "catálogo manzana 7.pdf", mime: "application/pdf", data: pdf }],
  });
  assert.match(sistemaVisto, /CENTRO DE NEGOCIO DE ESTA CONVERSACIÓN: CN002 · Oficina Central/);
  assert.ok(Array.isArray(usuarioVisto) && usuarioVisto.some((p) => p.type === "file"), "el archivo llega al modelo");
  const h = s.herramientas[0];
  assert.equal(h.argumentos.centro_negocio_id, CN_OFICINA);
  assert.equal(h.argumentos.empresa_id, E1);
  assert.equal(h.resultado.ok, true, h.resultado.resumen);
  assert.ok(h.resultado.tablas[0].filas.every((f) => f.centro === "Oficina Central"));

  const archivos = await rest(`rafa_archivos?conversacion_id=eq.${conv.id}&select=*`);
  assert.equal(archivos.length, 1);
  archivoDelCentro = archivos[0];
  assert.equal(archivos[0].centro_negocio_id, CN_OFICINA);
  assert.equal(archivos[0].empresa_id, E1);
  assert.equal(archivos[0].nombre, "catálogo manzana 7.pdf");
  assert.match(archivos[0].ruta, new RegExp(`^${USUARIOS.contador.id}/${conv.id}/`));
  const [msgUsuario] = await rest(`rafa_mensajes?conversacion_id=eq.${conv.id}&rol=eq.usuario&select=datos`);
  assert.deepEqual(msgUsuario.datos.archivos, [{ id: archivos[0].id, nombre: "catálogo manzana 7.pdf" }]);

  // Turno siguiente: Rafa conoce el archivo y "Usar" lo reenvía sin volver a subirlo.
  guion((body) => {
    sistemaVisto = sistema(body);
    usuarioVisto = ultimoUsuario(body);
    return fin("Revisé el catálogo.");
  });
  await chat("contador", "Revisa otra vez el catálogo", { conversacion_id: conv.id, archivos_guardados: [archivos[0].id] });
  assert.match(sistemaVisto, /ARCHIVOS GUARDADOS \(de esta charla y de otras charlas del mismo centro\): "catálogo manzana 7.pdf" \(\d{4}-\d{2}-\d{2}; id=/);
  const parte = usuarioVisto.find((p) => p.type === "file");
  assert.equal(parte.file.filename, "catálogo manzana 7.pdf");
  assert.equal(parte.file.file_data, `data:application/pdf;base64,${pdf}`);
  assert.equal(await contar(`rafa_archivos?conversacion_id=eq.${conv.id}&select=id`), 1, "reusar no duplica el archivo");

  // Otro usuario no puede usar ni ver ese archivo.
  const ajeno = await llamar("admin", { modo: "chat", mensaje: "Usa ese archivo", archivos_guardados: [archivos[0].id] });
  assert.notEqual(ajeno.status, 200);
  assert.match(ajeno.cuerpo.error, /no existe o no es tuyo/);
  assert.equal((await rest(`rafa_archivos?id=eq.${archivos[0].id}&select=id`, { token: tokenDe(USUARIOS.admin) })).length, 0);
});

test("conversación nueva con centro elegido y consulta explícita de toda la empresa", async () => {
  guion(usar("resumen_presupuesto", { centro_negocio_id: null }), fin("Toda la empresa."));
  const s = await chat("contador", "Dame el resumen de toda la empresa", { centro_negocio_id: CN_OFICINA });
  const [conv] = await rest(`rafa_conversaciones?id=eq.${s.conversacion_id}&select=centro_negocio_id,empresa_id`);
  assert.equal(conv.centro_negocio_id, CN_OFICINA);
  assert.equal(conv.empresa_id, E1);
  const h = s.herramientas[0];
  assert.equal(h.argumentos.centro_negocio_id, null, "null explícito = toda la empresa");
  assert.equal(h.argumentos.empresa_id, E1);
  assert.ok(h.resultado.tablas[0].filas.some((f) => f.centro !== "Oficina Central"));
});

// ================================================================ RESUMEN Y AVISO SEMANAL POR CENTRO
test("resumen del centro: presupuesto, pagos de la semana, excesos y permisos", async () => {
  const r = await llamar("contador", { modo: "resumen_centro", centro_negocio_id: CN_OFICINA });
  assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
  const s = r.cuerpo;
  assert.equal(s.centro.centro_nombre, "Oficina Central");
  assert.match(s.semana.desde, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${s.semana.desde}T00:00:00Z`).getUTCDay(), 1, "la semana empieza en lunes");
  // Mismo total que la base (pruebas anteriores ajustan la Renta): partidas activas del centro.
  const suma = async (tipo) =>
    (await rest(`presupuestos?centro_negocio_id=eq.${CN_OFICINA}&activo=eq.true&tipo_movimiento=eq.${tipo}&select=cantidad,precio_unitario`)).reduce(
      (t, p) => t + Number(p.cantidad) * Number(p.precio_unitario),
      0
    );
  assert.equal(s.presupuesto.egresos.presupuestado, Math.round((await suma("egreso")) * 100) / 100);
  assert.equal(s.presupuesto.ingresos.presupuestado, Math.round((await suma("ingreso")) * 100) / 100);
  assert.ok(s.presupuesto.egresos.presupuestado > 0 && s.presupuesto.ingresos.presupuestado > 0);
  assert.ok(Array.isArray(s.pagos_semana.lista));
  assert.ok(s.pagos_semana.lista.every((p) => p.fecha >= s.semana.desde && p.fecha <= s.semana.hasta));
  assert.ok(Array.isArray(s.excesos_semana));
  assert.equal(s.tareas_vencidas, null, "Oficina Central no tiene proyecto");
  const sinRol = await llamar("usuario", { modo: "resumen_centro", centro_negocio_id: CN_OFICINA });
  assert.equal(sinRol.status, 403);
});

test("aviso semanal: una vez por semana en la charla más reciente de cada centro", async () => {
  const r1 = await llamar("contador", { modo: "avisos_semana" });
  assert.equal(r1.status, 200, JSON.stringify(r1.cuerpo));
  assert.ok(r1.cuerpo.generados >= 1, JSON.stringify(r1.cuerpo));
  assert.deepEqual(r1.cuerpo.errores, []);
  const [simultaneo1, simultaneo2] = await Promise.all([llamar("contador", { modo: "avisos_semana" }), llamar("contador", { modo: "avisos_semana" })]);
  assert.equal(simultaneo1.cuerpo.generados + simultaneo2.cuerpo.generados, 0, "no se repite en la misma semana");
  const avisos = await rest(`rafa_mensajes?user_id=eq.${USUARIOS.contador.id}&datos->>aviso_semana=eq.${r1.cuerpo.semana}&select=conversacion_id,contenido,datos`);
  const deOficina = await rest(`rafa_conversaciones?user_id=eq.${USUARIOS.contador.id}&centro_negocio_id=eq.${CN_OFICINA}&select=id&order=updated_at.desc`);
  const enOficina = avisos.filter((a) => deOficina.some((c) => c.id === a.conversacion_id));
  assert.equal(enOficina.length, 1);
  assert.match(enOficina[0].contenido, /Aviso semanal · Oficina Central/);
  assert.equal(enOficina[0].datos.herramientas[0].nombre, "aviso_semanal");
  assert.equal(await contar(`rafa_avisos?user_id=eq.${USUARIOS.contador.id}&centro_negocio_id=eq.${CN_OFICINA}&select=semana`), 1);
  // Otro usuario sin conversaciones de centro: nada que avisar.
  const ajeno = await llamar("admin", { modo: "avisos_semana" });
  assert.equal(ajeno.status, 200);
});

test("Rafa abre por sí mismo un archivo guardado en otra charla del mismo centro", async () => {
  assert.ok(archivoDelCentro, "depende de la prueba de archivos guardados");
  let sistemaVisto = "";
  let usuarioTrasAbrir = null;
  guion(
    (body) => {
      sistemaVisto = sistema(body);
      return usar("abrir_archivos", { archivo_ids: [archivoDelCentro.id] });
    },
    (body) => {
      usuarioTrasAbrir = ultimoUsuario(body);
      return fin("Leí el catálogo.");
    }
  );
  const s = await chat("contador", "Revisa el catálogo que subí ayer", { centro_negocio_id: CN_OFICINA });
  assert.notEqual(s.conversacion_id, archivoDelCentro.conversacion_id, "es otra charla del mismo centro");
  assert.match(sistemaVisto, new RegExp(`"catálogo manzana 7.pdf" \\(\\d{4}-\\d{2}-\\d{2}, otra charla del centro; id=${archivoDelCentro.id}\\)`));
  assert.equal(s.herramientas[0].resultado.ok, true, s.herramientas[0].resultado.resumen);
  const parte = usuarioTrasAbrir.find((p) => p.type === "file");
  assert.equal(parte.file.filename, "catálogo manzana 7.pdf");

  // Otro usuario no puede abrirlo aunque conozca el id.
  guion(usar("abrir_archivos", { archivo_ids: [archivoDelCentro.id] }), fin("No pude."));
  const ajeno = await chat("admin", "Abre ese archivo", { centro_negocio_id: CN_OFICINA });
  assert.equal(ajeno.herramientas[0].resultado.ok, false);
  assert.match(ajeno.herramientas[0].resultado.resumen, /no es tuyo/);
});

// ================================================================ ACCIONES NUEVAS (con confirmación)
async function proponerYConfirmar(rol, herramienta, args) {
  guion(usar(herramienta, args), fin("Propuesta lista."));
  const s = await chat(rol, `Prueba ${herramienta}`);
  const r = resultado(s);
  assert.equal(r.ok, true, r.resumen);
  assert.equal(r.accion.estado, "propuesta", "no escribe hasta confirmar");
  const c = await llamar(rol, { modo: "confirmar", accion_id: r.accion.id, huella: r.accion.huella });
  assert.equal(c.status, 200, JSON.stringify(c.cuerpo));
  assert.equal(c.cuerpo.accion.estado, "ejecutada", c.cuerpo.resumen);
  return { propuesta: r, confirmacion: c.cuerpo };
}

test("acción: alta de tercero con RFC validado y sin duplicar", async () => {
  await proponerYConfirmar("contador", "proponer_tercero", { empresa_id: E1, razon_social: "Constructora Prueba SA", rfc: "cpr010101ab1", tipo: "proveedor", email: "c@prueba.test" });
  const [t] = await rest(`terceros?empresa_id=eq.${E1}&rfc=eq.CPR010101AB1&select=razon_social,tipo,email`);
  assert.deepEqual(t, { razon_social: "Constructora Prueba SA", tipo: "proveedor", email: "c@prueba.test" });
  guion(usar("proponer_tercero", { empresa_id: E1, razon_social: "Otra", rfc: "CPR010101AB1", tipo: "cliente" }), usar("proponer_tercero", { empresa_id: E1, razon_social: "Mal", rfc: "123", tipo: "cliente" }), fin());
  const s = await chat("contador", "Otra vez");
  assert.match(resultado(s, 0).resumen, /Ya existe el tercero "Constructora Prueba SA"/);
  assert.match(resultado(s, 1).resumen, /no tiene formato válido/);
  assert.equal(await contar(`terceros?empresa_id=eq.${E1}&rfc=eq.CPR010101AB1&select=id`), 1);
});

test("acción: cronograma de partida conserva lo no indicado y respeta permisos", async () => {
  const [antes] = await rest(`presupuestos?id=eq.${PA}&select=fecha_inicio,fecha_fin,avance_manual`);
  await proponerYConfirmar("contador", "proponer_cronograma_partida", { presupuesto_id: PA, avance_manual: 40, fecha_fin: "2027-03-31" });
  const [despues] = await rest(`presupuestos?id=eq.${PA}&select=fecha_inicio,fecha_fin,avance_manual`);
  assert.equal(Number(despues.avance_manual), 40);
  assert.equal(despues.fecha_fin, "2027-03-31");
  assert.equal(despues.fecha_inicio, antes.fecha_inicio);
  guion(usar("proponer_cronograma_partida", { presupuesto_id: PA, avance_manual: 99 }), fin());
  const sinPermiso = await chat("usuario", "Cambia el avance");
  assert.equal(resultado(sinPermiso).ok, false);
  assert.match(resultado(sinPermiso).resumen, /permiso/i);
});

test("acción: programación financiera de partida de proyecto (reparte lo que falta y reemplaza pagos)", async () => {
  const { propuesta } = await proponerYConfirmar("contador", "proponer_programacion_financiera", {
    presupuesto_id: PA, frecuencia: "mensual", fecha_inicio: "2026-12-01", numero_pagos: 4, anticipo_monto: 10000, anticipo_fecha: "2026-11-15",
  });
  const totalPropuesto = propuesta.accion.vista_previa.tablas[0].totales.monto;
  const [prog] = await rest(`proyecto_programacion_financiera?presupuesto_id=eq.${PA}&select=id,frecuencia,numero_pagos,anticipo_monto`);
  assert.equal(prog.frecuencia, "mensual");
  assert.equal(Number(prog.anticipo_monto), 10000);
  const pagos = await rest(`proyecto_programacion_pagos?programacion_id=eq.${prog.id}&select=fecha,monto,es_anticipo&order=orden`);
  assert.equal(pagos.length, 5);
  assert.equal(pagos[0].es_anticipo, true);
  assert.equal(Math.round(pagos.reduce((t, p) => t + Number(p.monto), 0) * 100) / 100, totalPropuesto);
  // Partida que no es de proyecto: se rechaza con explicación.
  guion(usar("proponer_programacion_financiera", { presupuesto_id: PB, frecuencia: "mensual", fecha_inicio: "2026-12-01", numero_pagos: 2 }), fin());
  const noProyecto = await chat("contador", "Programa la renta");
  assert.match(resultado(noProyecto).resumen, /no pertenece a un proyecto activo/);
});

test("acción: accesos a proyecto solo por admin; dar y quitar", async () => {
  const U2 = USUARIOS.usuario2.id;
  await proponerYConfirmar("admin", "proponer_acceso_proyecto", { proyecto_id: P1, usuario: "usuario2", editar_cronograma: true });
  const [acc] = await rest(`proyecto_usuarios?proyecto_id=eq.${P1}&user_id=eq.${U2}&select=editar_cronograma,ver_programacion_financiera`);
  assert.deepEqual(acc, { editar_cronograma: true, ver_programacion_financiera: false });
  await proponerYConfirmar("admin", "proponer_acceso_proyecto", { proyecto_id: P1, user_id: U2, quitar: true });
  assert.equal(await contar(`proyecto_usuarios?proyecto_id=eq.${P1}&user_id=eq.${U2}&select=id`), 0);
  guion(usar("proponer_acceso_proyecto", { proyecto_id: P1, usuario: "usuario2", editar_cronograma: true }), fin());
  const contador = await chat("contador", "Dale acceso");
  assert.equal(resultado(contador).ok, false);
});

// ================================================================ BAJAS
test("baja de centro en cascada con confirmación: deja de aparecer en Rafa y al reactivar vuelve lo mismo", async () => {
  const CN_OBRA = "a1000000-0000-0000-0000-000000000001"; // Obra Norte: Cimentación (proyecto P1)
  const activasAntes = (await rest(`presupuestos?centro_negocio_id=eq.${CN_OBRA}&activo=eq.true&select=id`)).map((p) => p.id).sort();
  const { propuesta } = await proponerYConfirmar("contador", "proponer_baja", { entidad: "centro_negocio", id: CN_OBRA });
  assert.match(propuesta.accion.descripcion, /Dar de baja centro de negocio .*con sus partidas y proyecto/);
  assert.equal((await rest(`centros_negocio?id=eq.${CN_OBRA}&select=activo`))[0].activo, false);
  assert.equal(await contar(`presupuestos?centro_negocio_id=eq.${CN_OBRA}&activo=eq.true&select=id`), 0);
  assert.equal((await rest(`proyectos?id=eq.${P1}&select=activo`))[0].activo, false);

  // Rafa ya no lo encuentra salvo que se pida lo dado de baja.
  guion(usar("buscar_registros", { entidad: "centros_negocio", empresa_id: E1 }), usar("buscar_registros", { entidad: "centros_negocio", empresa_id: E1, activo: false }), fin());
  const s = await chat("contador", "¿Qué centros hay?");
  assert.ok(!resultado(s, 0).datos.filas.some((r) => r.id === CN_OBRA));
  assert.ok(resultado(s, 1).datos.filas.some((r) => r.id === CN_OBRA));

  // Reactivar: vuelven exactamente las partidas y el proyecto que se dieron de baja con él.
  await proponerYConfirmar("contador", "proponer_baja", { entidad: "centro_negocio", id: CN_OBRA, reactivar: true });
  assert.deepEqual((await rest(`presupuestos?centro_negocio_id=eq.${CN_OBRA}&activo=eq.true&select=id`)).map((p) => p.id).sort(), activasAntes);
  assert.equal((await rest(`proyectos?id=eq.${P1}&select=activo`))[0].activo, true);
  assert.equal(await contar(`bajas_en_cascada?centro_negocio_id=eq.${CN_OBRA}&select=registro_id`), 0);
});

test("baja de tercero y permisos: un usuario sin rol contable no puede dar de baja", async () => {
  const [t] = await rest(`terceros?rfc=eq.CPR010101AB1&select=id,activo`);
  await proponerYConfirmar("contador", "proponer_baja", { entidad: "tercero", id: t.id });
  assert.equal((await rest(`terceros?id=eq.${t.id}&select=activo`))[0].activo, false);
  guion(usar("proponer_baja", { entidad: "tercero", id: t.id }), fin());
  const repetida = await chat("contador", "Dalo de baja otra vez");
  assert.match(resultado(repetida).resumen, /ya está dado de baja/);
  guion(usar("proponer_baja", { entidad: "tercero", id: t.id, reactivar: true }), fin());
  const sinRol = await chat("usuario", "Reactívalo");
  assert.equal(resultado(sinRol).ok, false);
});

// ================================================================ REPROGRAMACIÓN MASIVA
test("reprogramación masiva: 400 partidas de proyecto con una confirmación, el Gantt sigue a los pagos", async () => {
  const CN_OBRA = "a1000000-0000-0000-0000-000000000001";
  const id = (i) => `b9000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
  const pid = (i) => `99000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
  const lotes = Array.from({ length: 400 }, (_, k) => k + 1);
  await rest("presupuestos", {
    metodo: "POST",
    cuerpo: lotes.map((i) => ({
      id: id(i), empresa_id: E1, centro_negocio_id: CN_OBRA, partida: `Lote ${i}`, cantidad: 1, precio_unitario: 1000,
      activo: true, es_project: true, tipo_movimiento: "egreso", orden: 100 + i,
    })),
  });
  // Todas menos la última ya programadas (2 pagos) con fechas distintas.
  await rest("proyecto_programacion_financiera", {
    metodo: "POST",
    cuerpo: lotes.slice(0, -1).map((i) => ({ id: pid(i), presupuesto_id: id(i), proyecto_id: P1, empresa_id: E1, modo: "automatica", frecuencia: "mensual", fecha_inicio: "2026-11-10", numero_pagos: 2 })),
  });
  await rest("proyecto_programacion_pagos", {
    metodo: "POST",
    cuerpo: lotes.slice(0, -1).flatMap((i) => [
      { programacion_id: pid(i), proyecto_id: P1, fecha: `2026-${i % 2 ? "11" : "12"}-10`, monto: 400, concepto: "Pago 1", orden: 0 },
      { programacion_id: pid(i), proyecto_id: P1, fecha: `2027-${i % 2 ? "01" : "02"}-10`, monto: 600, concepto: "Pago 2", orden: 1 },
    ]),
  });

  // El usuario dice "de la partida Lote 1 a la Lote 400, muévelas al 1 de mayo": una sola llamada.
  const inicio = Date.now();
  const { propuesta } = await proponerYConfirmar("contador", "proponer_reprogramacion_masiva", {
    empresa_id: E1, centro_negocio_id: CN_OBRA, desde_partida: "Lote 1", hasta_partida: "Lote 400", modo: "mover", fecha_inicio: "2027-05-01",
  });
  assert.ok(Date.now() - inicio < 20000, "400 partidas en una sola operación");
  assert.equal(propuesta.accion.vista_previa.tablas[0].filas.length, 400);
  const pagos = await rest(`proyecto_programacion_pagos?programacion_id=in.(${lotes.slice(0, -1).map(pid).join(",")})&select=programacion_id,fecha,monto&order=fecha`);
  assert.equal(pagos.length, 399 * 2);
  assert.equal(pagos[0].fecha, "2027-05-01");
  // Conserva la separación de cada partida (Lote 1: 61 días).
  const deLote1 = pagos.filter((p) => p.programacion_id === pid(1)).map((p) => p.fecha);
  assert.deepEqual(deLote1, ["2027-05-01", "2027-07-01"]);
  // La que no tenía programación se programó completa en esa fecha.
  const [prog400] = await rest(`proyecto_programacion_financiera?presupuesto_id=eq.${id(400)}&select=id`);
  const pagos400 = await rest(`proyecto_programacion_pagos?programacion_id=eq.${prog400.id}&select=fecha,monto`);
  assert.deepEqual(pagos400.map((p) => [p.fecha, Number(p.monto)]), [["2027-05-01", 1000]]);
  // Gantt alineado a los pagos.
  const [gantt] = await rest(`presupuestos?id=eq.${id(1)}&select=fecha_inicio,fecha_fin`);
  assert.deepEqual(gantt, { fecha_inicio: "2027-05-01", fecha_fin: "2027-07-01" });

  // Última instrucción manda: ahora recórrelas un mes (por texto).
  await proponerYConfirmar("contador", "proponer_reprogramacion_masiva", { empresa_id: E1, centro_negocio_id: CN_OBRA, texto: "Lote", modo: "recorrer", meses: 1 });
  const [gantt2] = await rest(`presupuestos?id=eq.${id(1)}&select=fecha_inicio,fecha_fin`);
  assert.deepEqual(gantt2, { fecha_inicio: "2027-06-01", fecha_fin: "2027-08-01" });

  // Rango ambiguo: Rafa debe preguntar; usuario sin permiso de programación: rechazado.
  guion(usar("proponer_reprogramacion_masiva", { empresa_id: E1, centro_negocio_id: CN_OBRA, desde_partida: "Lote 1", hasta_partida: "Lote", modo: "recorrer", dias: 3 }), fin());
  assert.match(resultado(await chat("contador", "Córrelas")).resumen, /coincide con \d+ partidas/);
  guion(usar("proponer_reprogramacion_masiva", { empresa_id: E1, centro_negocio_id: CN_OBRA, texto: "Lote", modo: "recorrer", dias: 3 }), fin());
  const sinPermiso = resultado(await chat("usuario", "Córrelas"));
  assert.equal(sinPermiso.ok, false);
  assert.match(sinPermiso.resumen, /permiso/i);
});

test("reprogramación masiva: flujos de partidas sin proyecto respetan Ingreso/Egreso y detectan cambios", async () => {
  // Contador: puede mover flujos, pero quitar sobrantes (12 → 4) requiere admin; esa partida se omite y lo avisa.
  guion(usar("proponer_reprogramacion_masiva", { empresa_id: E1, presupuesto_ids: [PB, PC], modo: "reprogramar", fecha_inicio: "2027-01-05", frecuencia: "mensual", numero_pagos: 4 }), fin());
  const contador = resultado(await chat("contador", "Reprográmalas"));
  assert.equal(contador.accion.vista_previa.tablas[0].filas.length, 1);
  assert.match(contador.accion.vista_previa.advertencias.join(" "), /Renta de oficina .*requiere admin/);

  const { propuesta } = await proponerYConfirmar("admin", "proponer_reprogramacion_masiva", {
    empresa_id: E1, presupuesto_ids: [PB, PC], modo: "reprogramar", fecha_inicio: "2027-01-05", frecuencia: "mensual", numero_pagos: 4,
  });
  assert.equal(propuesta.accion.vista_previa.tablas[0].filas.length, 2);
  const venta = await rest(`flujos_programados?presupuesto_id=eq.${PC}&select=fecha,monto,tipo&order=fecha`);
  assert.equal(venta.length, 4);
  assert.ok(venta.every((f) => f.tipo === "ingreso"), "partida de Ingreso (cuenta 4xx) → flujos de ingreso");
  assert.equal(venta.reduce((t, f) => t + Number(f.monto), 0), 1100000);
  const renta = await rest(`flujos_programados?presupuesto_id=eq.${PB}&auto_generado=eq.false&select=fecha,tipo&order=fecha`);
  assert.deepEqual(renta.map((f) => f.fecha), ["2027-01-05", "2027-02-05", "2027-03-05", "2027-04-05"]);
  assert.ok(renta.every((f) => f.tipo === "egreso"));

  // El contador sí puede correr fechas (actualiza en su lugar).
  await proponerYConfirmar("contador", "proponer_reprogramacion_masiva", { empresa_id: E1, presupuesto_ids: [PB], modo: "recorrer", dias: 10 });
  assert.equal((await rest(`flujos_programados?presupuesto_id=eq.${PB}&auto_generado=eq.false&select=fecha&order=fecha&limit=1`))[0].fecha, "2027-01-15");

  // Si alguien cambia los flujos entre la propuesta y la confirmación, no se aplica nada.
  guion(usar("proponer_reprogramacion_masiva", { empresa_id: E1, presupuesto_ids: [PB, PC], modo: "recorrer", meses: 1 }), fin());
  const r = resultado(await chat("contador", "Córrelas un mes"));
  assert.equal(r.ok, true, r.resumen);
  await rest("flujos_programados", { metodo: "POST", cuerpo: { presupuesto_id: PB, empresa_id: E1, fecha: "2027-09-05", monto: 1, tipo: "egreso" } });
  const c = await llamar("contador", { modo: "confirmar", accion_id: r.accion.id, huella: r.accion.huella });
  assert.notEqual(c.cuerpo.accion.estado, "ejecutada");
  const ventaDespues = await rest(`flujos_programados?presupuesto_id=eq.${PC}&select=fecha&order=fecha`);
  assert.equal(ventaDespues[0].fecha, "2027-01-05");
});
