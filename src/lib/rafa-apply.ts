// Aplica el plan confirmado de Rafa: crea (si hace falta) centro de negocio y
// tercero, guarda las partidas de presupuesto y programa los flujos de efectivo.
// Si la sesión ya se había guardado antes, ACTUALIZA lo existente en vez de
// duplicarlo (usa propuesta.aplicado como rastro de lo ya creado).
// La escritura es UNA llamada a la RPC rafa_guardar_plan (una transacción):
// o se guarda todo o nada (migración 20261022000000_rafa_guardar_plan.sql).

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { calcularFechasPorFrecuencia, distribuirSaldoEntrePeriodos } from "@/lib/project-utils";
import {
  aplicarFormatoTexto,
  importePartida,
  normalizar,
  precioUnitarioFinal,
  type PropuestaEditable,
} from "@/lib/rafa-types";

export interface ResultadoAplicar {
  centroId: string;
  terceroId: string | null;
  partidasCreadas: number;
  partidasActualizadas: number;
  flujosCreados: number;
  partidasDadasDeBaja: number;
  /** Partidas de Proyecto cuyos flujos no se tocan (se programan en Proyectos). */
  omitidasProyecto: number;
  /** Propuesta con el rastro de lo guardado, para persistir en la sesión. */
  propuesta: PropuestaEditable;
}

export async function aplicarPlanRafa(p: PropuestaEditable, operacion: string = crypto.randomUUID()): Promise<ResultadoAplicar> {
  if (!p.empresaId) throw new Error("Selecciona la empresa.");
  if (p.partidas.length === 0) throw new Error("No hay partidas que guardar.");

  const formato = p.formatoTexto || "original";

  // 1. Centro de negocio
  const centroId = p.centro.modo === "existente" ? p.centro.id : p.aplicado?.centroId || "";
  if (p.centro.modo === "nuevo" && !p.centro.nombre.trim()) throw new Error("Escribe el nombre del centro de negocio.");
  if (p.centro.modo === "existente" && !centroId) throw new Error("Selecciona o crea un centro de negocio.");

  // 2. Tercero (contratista)
  if (p.tercero.modo === "nuevo" && !p.tercero.nombre.trim()) throw new Error("Escribe el nombre del tercero.");
  if (p.tercero.modo === "existente" && !p.tercero.id) throw new Error("Selecciona el tercero o elige uno nuevo.");

  // 3. Partidas de presupuesto: actualizar las que ya existen, insertar las nuevas
  const partidas = p.partidas.map((partida) => ({
    ...partida,
    descripcion: aplicarFormatoTexto(partida.descripcion, formato),
  }));

  // --- Blindaje anti-duplicados -------------------------------------------
  // Se relee de la base lo que esta sesión ya creó. Sólo se consideran vigentes
  // los ids que siguen existiendo y activos; el resto se trata como inexistente.
  const idsPrevios = Array.from(
    new Set([
      ...(p.aplicado?.presupuestoIds || []),
      ...p.partidas.map((x) => x.presupuestoId).filter(Boolean) as string[],
    ])
  );
  const existentes = new Map<string, { id: string; partida: string }>();
  if (idsPrevios.length > 0) {
    for (let i = 0; i < idsPrevios.length; i += 200) {
      const { data, error } = await supabase
        .from("presupuestos")
        .select("id, partida")
        .in("id", idsPrevios.slice(i, i + 200))
        .eq("activo", true);
      if (error) throw new Error(`No se pudieron leer las partidas guardadas: ${error.message}`);
      (data || []).forEach((r) => existentes.set(r.id, r));
    }
  }
  // Índice por texto normalizado para reasignar cuando el orden de las partidas
  // cambió tras reinterpretar (evita crear una copia de algo ya guardado).
  const porTexto = new Map<string, string>();
  existentes.forEach((r) => {
    const k = normalizar(r.partida);
    if (!porTexto.has(k)) porTexto.set(k, r.id);
  });
  const usados = new Set<string>();

  const fechas = calcularFechasPorFrecuencia(
    new Date(p.programacion.fechaInicio + "T00:00:00"),
    p.programacion.frecuencia,
    p.programacion.numeroPagos
  );
  if (fechas.some((f) => Number.isNaN(f.getTime()))) throw new Error("Indica la fecha del primer pago.");

  const filas = partidas.map((partida) => {
    // Id a reutilizar: el vinculado (si sigue vivo) o, si no, el de una partida
    // ya guardada con el mismo texto (reinterpretaciones que reordenan).
    let destino: string | undefined =
      partida.presupuestoId && existentes.has(partida.presupuestoId) && !usados.has(partida.presupuestoId)
        ? partida.presupuestoId
        : undefined;
    if (!destino) {
      const candidato = porTexto.get(normalizar(partida.descripcion));
      if (candidato && !usados.has(candidato)) destino = candidato;
    }
    if (destino) usados.add(destino);

    const total = importePartida(partida, p.ivaIncluir, p.ivaTasa);
    const montos = distribuirSaldoEntrePeriodos(total, fechas.length);
    return {
      id: destino ?? null,
      partida: partida.descripcion.trim().slice(0, 500),
      cuenta_id: partida.cuentaId || null,
      cantidad: partida.cantidad,
      precio_unitario: Number(precioUnitarioFinal(partida, p.ivaIncluir, p.ivaTasa).toFixed(4)),
      notas: partida.unidad ? `Unidad: ${partida.unidad}` : null,
      // Sin esto la partida queda "Pendiente de clasificar" y no aparece en Ingresos/Egresos.
      tipo_movimiento: p.programacion.tipo,
      flujos: fechas
        .map((fecha, j) => ({
          fecha: fecha.toISOString().slice(0, 10),
          monto: montos[j],
          tipo: p.programacion.tipo,
          descripcion: `Rafa · pago ${j + 1}/${fechas.length} · ${partida.descripcion.slice(0, 80)}`,
        }))
        .filter((f) => f.monto > 0),
    };
  });

  const plan = {
    empresa_id: p.empresaId,
    centro: {
      id: centroId || null,
      nombre: p.centro.nombre,
      tipo_actividad: p.centro.tipoActividad || null,
      // Solo se renombra el centro que creó esta misma interpretación.
      actualizar: p.centro.modo === "nuevo" && Boolean(p.aplicado?.centroId),
    },
    tercero: {
      modo: p.tercero.modo,
      // Nuevo: el servidor reutiliza uno de la empresa con el mismo nombre o lo crea
      // (nunca renombra un tercero existente).
      id: p.tercero.modo === "existente" ? p.tercero.id : null,
      nombre: p.tercero.nombre,
      rfc: p.tercero.rfc || null,
      tipo: p.programacion.tipo === "ingreso" ? "cliente" : "proveedor",
    },
    partidas: filas,
    previos: idsPrevios,
  };

  const { data, error } = await supabase.rpc("rafa_guardar_plan", { p_operacion: operacion, p_plan: plan as unknown as Json });
  if (error) {
    const m = error.message || "No se pudo guardar";
    throw new Error(/no se guardó ningún cambio/i.test(m) ? m : `${m}. No se guardó ningún cambio.`.replace("..", "."));
  }
  const r = data as unknown as {
    centro_id: string;
    tercero_id: string | null;
    presupuesto_ids: string[];
    creadas: number;
    actualizadas: number;
    bajas: number;
    flujos: number;
    omitidas_proyecto: number;
  };

  const propuesta: PropuestaEditable = {
    ...p,
    centro: { ...p.centro, id: r.centro_id },
    tercero: { ...p.tercero, id: r.tercero_id || "" },
    partidas: p.partidas.map((partida, i) => ({
      ...partida,
      descripcion: partidas[i].descripcion,
      presupuestoId: r.presupuesto_ids[i],
    })),
    aplicado: { centroId: r.centro_id, terceroId: r.tercero_id, presupuestoIds: r.presupuesto_ids },
  };

  return {
    centroId: r.centro_id,
    terceroId: r.tercero_id,
    partidasCreadas: r.creadas,
    partidasActualizadas: r.actualizadas,
    partidasDadasDeBaja: r.bajas,
    flujosCreados: r.flujos,
    omitidasProyecto: r.omitidas_proyecto,
    propuesta,
  };
}
