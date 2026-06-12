import { createClient } from "./client";
import { candidatosCodigoBarrasParaPlu } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LoteCajones,
  OrdenDesposte,
  Produccion,
  VStockActual,
  MovimientoStock,
  Venta,
  Usuario,
  VAlertasProduccion,
  ElaboracionSupremas,
  OrdenElaboracionSupremas,
  Producto,
  MarcaConfiguracion,
  VRentabilidadLote,
  VVentasPorProducto,
  Proveedor,
  Remito,
} from "@/types";

/** Fila DB puede usar `pollo_entero` o la columna legacy `otros`. */
function normalizeProduccionRow(row: Record<string, unknown>): Produccion {
  const raw = row.pollo_entero ?? row.otros;
  const pollo_entero =
    typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
  const { otros: _legacy, ...rest } = row;
  return { ...rest, pollo_entero } as Produccion;
}

function normalizeNestedProduccion(raw: unknown): Produccion | undefined {
  if (raw == null) return undefined;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (row == null || typeof row !== "object") return undefined;
  return normalizeProduccionRow(row as Record<string, unknown>);
}

function isMissingPolloEnteroColumnError(err: { code?: string; message?: string | null }): boolean {
  const m = err.message ?? "";
  if (!m.includes("pollo_entero")) return false;
  if (err.code === "PGRST204") return true;
  const low = m.toLowerCase();
  return low.includes("column") && low.includes("produccion");
}

/**
 * El trigger SQL de producción suele mapear cortes por nombre de columna; la legacy `otros`
 * no alimenta el producto `pollo_entero`. Sumamos explícito en stock al registrar.
 */
async function ingresarStockPolloEnteroPorProduccion(
  supabase: SupabaseClient,
  kilos: number,
  produccionId: string,
  usuarioId: string
): Promise<void> {
  if (kilos <= 0 || !Number.isFinite(kilos)) return;

  const { data: producto, error: eProd } = await supabase
    .from("productos")
    .select("id")
    .eq("nombre", "pollo_entero")
    .eq("activo", true)
    .maybeSingle();
  if (eProd) throw eProd;
  if (!producto?.id) {
    throw new Error(
      'No existe un producto activo con nombre interno "pollo_entero". Agregalo en Configuración → Precios para poder sumar este stock.'
    );
  }

  const { data: stockPrev, error: eStock } = await supabase
    .from("stock_productos")
    .select("kilos")
    .eq("producto_id", producto.id)
    .maybeSingle();
  if (eStock) throw eStock;

  const kilosAnterior = Number(stockPrev?.kilos ?? 0);
  const kilosNuevo = kilosAnterior + kilos;

  const { error: eUpsert } = await supabase.from("stock_productos").upsert(
    {
      producto_id: producto.id,
      kilos: kilosNuevo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "producto_id" }
  );
  if (eUpsert) throw eUpsert;

  const { error: eMov } = await supabase.from("movimientos_stock").insert({
    producto_id: producto.id,
    tipo: "ingreso",
    kilos,
    kilos_anterior: kilosAnterior,
    kilos_nuevo: kilosNuevo,
    referencia_tipo: "produccion",
    referencia_id: produccionId,
    notas: "Producción desposte — pollo entero",
    usuario_id: usuarioId,
  });
  if (eMov) throw eMov;
}

// ── LOTES ──────────────────────────────────────────────────────────────
export async function getLotes(): Promise<LoteCajones[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lotes_cajones")
    .select("*, usuario:usuarios(id,nombre,rol)")
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getLote(id: string): Promise<LoteCajones> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lotes_cajones")
    .select("*, usuario:usuarios(id,nombre,rol)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function insertLote(
  payload: Omit<LoteCajones, "id" | "cajones_disponibles" | "peso_promedio" | "created_at" | "updated_at" | "usuario">
): Promise<LoteCajones> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lotes_cajones")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── ORDENES ────────────────────────────────────────────────────────────
export async function getOrdenes(): Promise<OrdenDesposte[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_desposte")
    .select(`
      *,
      lote:lotes_cajones(id,marca,calibre,fecha),
      usuario:usuarios!ordenes_desposte_usuario_id_fkey(id,nombre),
      operario:usuarios!ordenes_desposte_operario_id_fkey(id,nombre),
      produccion(id,rendimiento_real,tiene_alerta)
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Solo lo necesario para calcular cajones ya asignados por lote */
export async function getOrdenesCajonesResumen(): Promise<
  Pick<OrdenDesposte, "lote_id" | "cantidad_cajones" | "estado">[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_desposte")
    .select("lote_id, cantidad_cajones, estado");
  if (error) throw error;
  return (data ?? []) as Pick<OrdenDesposte, "lote_id" | "cantidad_cajones" | "estado">[];
}

export async function getOrden(id: string): Promise<OrdenDesposte> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_desposte")
    .select(`
      *,
      lote:lotes_cajones(*),
      usuario:usuarios!ordenes_desposte_usuario_id_fkey(id,nombre),
      operario:usuarios!ordenes_desposte_operario_id_fkey(id,nombre),
      produccion(*)
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    ...data,
    produccion: normalizeNestedProduccion(
      (data as { produccion?: unknown }).produccion
    ),
  } as OrdenDesposte;
}

export async function insertOrden(
  payload: Omit<OrdenDesposte, "id" | "estado" | "fecha_proceso" | "created_at" | "updated_at">
): Promise<OrdenDesposte> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_desposte")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── PRODUCCIÓN ─────────────────────────────────────────────────────────
export async function getProduccion(): Promise<Produccion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("produccion")
    .select(`
      *,
      orden:ordenes_desposte(id,lote_id,cantidad_cajones,peso_estimado,lote:lotes_cajones(marca,calibre)),
      registrado_por_usuario:usuarios!produccion_registrado_por_fkey(id,nombre)
    `)
    .order("fecha_produccion", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) =>
    normalizeProduccionRow(row as Record<string, unknown>)
  );
}

export async function insertProduccion(
  payload: Omit<Produccion, "id" | "peso_total_producido" | "rendimiento_real" | "tiene_alerta" | "alerta_detalle" | "fecha_produccion" | "created_at" | "updated_at">
): Promise<Produccion> {
  const supabase = createClient();
  const { pollo_entero, ...rest } = payload;

  const insertNew = { ...rest, pollo_entero };
  const insertLegacy = { ...rest, otros: pollo_entero };

  let { data, error } = await supabase
    .from("produccion")
    .insert(insertNew as never)
    .select()
    .single();

  if (error && isMissingPolloEnteroColumnError(error)) {
    ({ data, error } = await supabase
      .from("produccion")
      .insert(insertLegacy as never)
      .select()
      .single());
  }

  if (error) throw error;

  const row = normalizeProduccionRow(data as Record<string, unknown>);
  await ingresarStockPolloEnteroPorProduccion(
    supabase,
    row.pollo_entero,
    row.id,
    payload.registrado_por
  );

  /* Respaldo: el trigger SQL debería marcar la orden como completada en la misma transacción */
  const { error: ordErr } = await supabase
    .from("ordenes_desposte")
    .update({
      estado: "completada",
      fecha_proceso: new Date().toISOString(),
    })
    .eq("id", data.orden_id);
  if (ordErr) {
    console.warn("[insertProduccion] Actualizar orden:", ordErr.message);
  }
  return row;
}

// ── STOCK ──────────────────────────────────────────────────────────────
export async function getStock(): Promise<VStockActual[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_stock_actual")
    .select("*");
  if (error) throw error;
  return data;
}

export async function getMovimientos(
  productoId?: string,
  limit = 50
): Promise<MovimientoStock[]> {
  const supabase = createClient();
  let query = supabase
    .from("movimientos_stock")
    .select(`
      *,
      producto:productos(id,nombre),
      usuario:usuarios(id,nombre)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (productoId) query = query.eq("producto_id", productoId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── VENTAS ─────────────────────────────────────────────────────────────
export async function getVentas(): Promise<Venta[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ventas")
    .select(`
      *,
      usuario:usuarios(id,nombre),
      items:venta_items(*, producto:productos(id,nombre))
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertVenta(
  ventaPayload: { cliente?: string; notas?: string; usuario_id: string },
  items: { producto_id: string; kilos: number; precio_kg?: number }[]
): Promise<Venta> {
  const supabase = createClient();

  const totalKilos = items.reduce((s, i) => s + i.kilos, 0);
  const totalMonto = items.reduce((s, i) => s + (i.kilos * (i.precio_kg ?? 0)), 0);

  const { data: venta, error: eVenta } = await supabase
    .from("ventas")
    .insert({ ...ventaPayload, total_kilos: totalKilos, total_monto: totalMonto })
    .select()
    .single();
  if (eVenta) throw eVenta;

  const itemsPayload = items.map((i) => ({ ...i, venta_id: venta.id }));
  const { error: eItems } = await supabase.from("venta_items").insert(itemsPayload);
  if (eItems) {
    // Intentar revertir la cabecera de venta para no dejar registros huérfanos
    await supabase.from("ventas").delete().eq("id", venta.id);
    const detail = (eItems as { message?: string; details?: string; hint?: string });
    throw new Error(
      detail.message ?? "Error al guardar los ítems de la venta"
    );
  }

  return venta;
}

// ── USUARIOS ───────────────────────────────────────────────────────────
export async function getUsuarios(): Promise<Usuario[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function updateLote(
  id: string,
  payload: Partial<Pick<LoteCajones, "marca" | "calibre" | "peso_total" | "cantidad_cajones" | "fecha" | "tipo_producto" | "costo_por_cajon">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("lotes_cajones").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteLote(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("lotes_cajones").delete().eq("id", id);
  if (error) throw error;
}

export async function updateOrden(
  id: string,
  payload: Partial<Pick<OrdenDesposte, "cantidad_cajones" | "peso_estimado" | "operario_id" | "estado" | "notas">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ordenes_desposte")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOrden(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("ordenes_desposte").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProduccion(
  id: string,
  payload: Partial<Pick<Produccion, "pata_muslo" | "pechuga" | "pechuga_con_piel" | "alitas" | "carcasa" | "menudos" | "pollo_entero">>
): Promise<void> {
  const supabase = createClient();
  const { pollo_entero, ...rest } = payload;

  const updateNew: Record<string, unknown> = { ...rest };
  if (pollo_entero !== undefined) updateNew.pollo_entero = pollo_entero;

  let { error } = await supabase.from("produccion").update(updateNew).eq("id", id);

  // Fallback a la columna legacy `otros` si la DB no tiene `pollo_entero`
  if (error && isMissingPolloEnteroColumnError(error)) {
    const updateLegacy: Record<string, unknown> = { ...rest };
    if (pollo_entero !== undefined) updateLegacy.otros = pollo_entero;
    ({ error } = await supabase.from("produccion").update(updateLegacy).eq("id", id));
  }
  if (error) throw error;
}

export async function deleteProduccion(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("produccion").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteVenta(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("ventas").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Edición admin de una venta: cliente, notas y precio por kg de cada ítem.
 * Los kilos no se tocan para no desincronizar el stock ya descontado.
 */
export async function updateVentaConPrecios(
  ventaId: string,
  cabecera: { cliente?: string | null; notas?: string | null },
  items: { id: string; kilos: number; precio_kg: number }[]
): Promise<void> {
  const supabase = createClient();

  for (const item of items) {
    // `subtotal` puede ser columna generada en algunas instalaciones: reintentar sin ella
    let { error } = await supabase
      .from("venta_items")
      .update({ precio_kg: item.precio_kg, subtotal: item.kilos * item.precio_kg })
      .eq("id", item.id);
    if (error) {
      ({ error } = await supabase
        .from("venta_items")
        .update({ precio_kg: item.precio_kg })
        .eq("id", item.id));
    }
    if (error) throw error;
  }

  const totalMonto = items.reduce((s, i) => s + i.kilos * i.precio_kg, 0);
  const { error: eVenta } = await supabase
    .from("ventas")
    .update({ cliente: cabecera.cliente ?? null, notas: cabecera.notas ?? null, total_monto: totalMonto })
    .eq("id", ventaId);
  if (eVenta) throw eVenta;
}

export async function getUsuariosAll(): Promise<Usuario[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function updateUsuario(
  id: string,
  payload: Partial<Pick<Usuario, "nombre" | "rol" | "activo">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("usuarios").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteUsuario(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("usuarios").delete().eq("id", id);
  if (error) throw error;
}

// ── ALERTAS ────────────────────────────────────────────────────────────
export async function getAlertas(): Promise<VAlertasProduccion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_alertas_produccion")
    .select("*")
    .limit(20);
  if (error) throw error;
  return data;
}

// ── ELABORACIÓN SUPREMAS ───────────────────────────────────────────────
export async function getElaboracionSupremas(): Promise<ElaboracionSupremas[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("elaboracion_supremas")
    .select(`
      *,
      registrado_por_usuario:usuarios!elaboracion_supremas_registrado_por_fkey(id,nombre),
      operario:usuarios!elaboracion_supremas_operario_id_fkey(id,nombre)
    `)
    .order("fecha_elaboracion", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertElaboracionSupremas(
  payload: Omit<ElaboracionSupremas, "id" | "rendimiento_real" | "tiene_alerta" | "alerta_detalle" | "fecha_elaboracion" | "created_at" | "registrado_por_usuario" | "operario">
): Promise<ElaboracionSupremas> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("elaboracion_supremas")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteElaboracionSupremas(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("elaboracion_supremas").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteOrdenElaboracionSupremas(id: string): Promise<void> {
  const supabase = createClient();
  // Desvincular pesadas asociadas para no perder el historial de elaboraciones
  const { error: eUnlink } = await supabase
    .from("elaboracion_supremas")
    .update({ orden_elaboracion_id: null })
    .eq("orden_elaboracion_id", id);
  if (eUnlink) throw eUnlink;
  const { error } = await supabase.from("ordenes_elaboracion_supremas").delete().eq("id", id);
  if (error) throw error;
}

export async function getOrdenesElaboracionSupremas(): Promise<OrdenElaboracionSupremas[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_elaboracion_supremas")
    .select(`
      *,
      registrado_por_usuario:usuarios!ordenes_elaboracion_supremas_registrado_por_fkey(id,nombre),
      operario:usuarios!ordenes_elaboracion_supremas_operario_id_fkey(id,nombre)
    `)
    .order("fecha_inicio", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertOrdenElaboracionSupremas(
  payload: Omit<OrdenElaboracionSupremas, "id" | "kilos_procesados" | "kilos_supremas" | "kilos_devueltos" | "estado" | "fecha_inicio" | "fecha_fin" | "created_at" | "registrado_por_usuario" | "operario">
): Promise<OrdenElaboracionSupremas> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ordenes_elaboracion_supremas")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizarOrdenElaboracionSupremas(
  id: string,
  kilosDevueltos: number,
  notas?: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ordenes_elaboracion_supremas")
    .update({
      estado: "completada",
      kilos_devueltos: kilosDevueltos,
      notas: notas || null,
      fecha_fin: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

// ── PRODUCTOS (con precio y PLU) ───────────────────────────────────────
export async function getProductos(): Promise<Producto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function updateProductoPrecio(
  id: string,
  precio_venta: number | null,
  codigo_plu: string | null,
  stock_source_id?: string | null,
  precio_fijo?: boolean,
  nombre?: string
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { precio_venta, codigo_plu };
  if (stock_source_id !== undefined) payload.stock_source_id = stock_source_id;
  if (precio_fijo !== undefined) payload.precio_fijo = precio_fijo;
  if (nombre !== undefined) payload.nombre = nombre;
  const { error } = await supabase
    .from("productos")
    .update(payload)
    .eq("id", id);
  if (error) {
    if (isUniqueConflict(error)) {
      throw new Error(
        "Ya existe un producto con el mismo nombre o código PLU."
      );
    }
    throw error;
  }
}

export async function deleteProducto(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("productos")
    .delete()
    .eq("id", id);
  if (error) {
    // Si falla por restricción de clave foránea (ej: tiene ventas o remitos), hacer soft delete
    if (error.code === "23503") {
      const { error: errUpdate } = await supabase
        .from("productos")
        .update({ activo: false })
        .eq("id", id);
      if (errUpdate) throw errUpdate;
      return;
    }
    throw error;
  }
}

export async function getProductoPorPlu(pluRaw: string): Promise<Producto | null> {
  const supabase = createClient();
  const candidates = candidatosCodigoBarrasParaPlu(pluRaw);
  if (!candidates.length) return null;

  const { data: rows, error } = await supabase
    .from("productos")
    .select("*")
    .in("codigo_plu", candidates)
    .eq("activo", true);
  if (error) throw error;
  if (!rows?.length) return null;

  for (const code of candidates) {
    const hit = rows.find((p) => p.codigo_plu === code);
    if (hit) return hit as Producto;
  }
  return null;
}

// ── MARCAS CONFIGURACIÓN ───────────────────────────────────────────────
export async function getMarcas(): Promise<MarcaConfiguracion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("marcas_configuracion")
    .select("*")
    .order("tipo_producto")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function getMarcasByTipo(tipo: string): Promise<MarcaConfiguracion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("marcas_configuracion")
    .select("*")
    .eq("tipo_producto", tipo)
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function insertMarca(
  payload: Omit<MarcaConfiguracion, "id" | "created_at" | "updated_at">
): Promise<MarcaConfiguracion> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("marcas_configuracion")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMarca(
  id: string,
  payload: Partial<Omit<MarcaConfiguracion, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("marcas_configuracion")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMarca(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("marcas_configuracion")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── RENTABILIDAD ────────────────────────────────────────────────────────
// Lotes con su producción anidada para calcular rendimiento/costo en el cliente
export async function getRentabilidadLotes(): Promise<VRentabilidadLote[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lotes_cajones")
    .select(`
      id, marca, tipo_producto, calibre, fecha,
      cantidad_cajones, peso_total, costo_por_cajon,
      ordenes_desposte (
        produccion ( peso_total_producido, rendimiento_real )
      )
    `)
    .order("fecha", { ascending: false });
  if (error) throw error;

  // Calcular totales en el cliente
  return (data ?? []).map((l) => {
    const prods = (l.ordenes_desposte ?? []).flatMap(
      (od: { produccion: { peso_total_producido: number; rendimiento_real: number }[] }) =>
        od.produccion ?? []
    );
    const costo_por_cajon  = l.costo_por_cajon ?? 0;
    const costo_total      = costo_por_cajon * l.cantidad_cajones;
    const kilos_producidos = prods.reduce((s: number, p: { peso_total_producido: number }) => s + (p.peso_total_producido ?? 0), 0);
    const rends            = prods.filter((p: { rendimiento_real: number }) => (p.rendimiento_real ?? 0) > 0).map((p: { rendimiento_real: number }) => p.rendimiento_real);
    const rendimiento_promedio = rends.length > 0
      ? rends.reduce((s: number, r: number) => s + r, 0) / rends.length
      : 0;
    const costo_por_kg_prod = kilos_producidos > 0 ? costo_total / kilos_producidos : 0;
    return {
      id:                  l.id,
      marca:               l.marca,
      tipo_producto:       l.tipo_producto,
      calibre:             l.calibre,
      fecha:               l.fecha,
      cantidad_cajones:    l.cantidad_cajones,
      peso_total:          l.peso_total,
      costo_por_cajon,
      costo_total,
      kilos_producidos,
      rendimiento_promedio,
      costo_por_kg_prod,
    } as VRentabilidadLote;
  });
}

// Ventas agrupadas por producto calculadas en el cliente
export async function getVentasPorProducto(): Promise<VVentasPorProducto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("venta_items")
    .select(`
      kilos, precio_kg, subtotal,
      producto:productos ( nombre ),
      venta:ventas ( created_at )
    `)
    .not("precio_kg", "is", null);
  if (error) throw error;

  // Agrupar por producto en el cliente
  const map: Record<string, {
    kilos: number; ingreso: number; precios: number[];
    count: number; fechas: string[];
  }> = {};

  for (const item of data ?? []) {
    const productoRaw = Array.isArray(item.producto) ? item.producto[0] : item.producto;
const nombre = (productoRaw as { nombre: string } | null)?.nombre ?? "desconocido";
    if (!map[nombre]) map[nombre] = { kilos: 0, ingreso: 0, precios: [], count: 0, fechas: [] };
    map[nombre].kilos   += item.kilos ?? 0;
    map[nombre].ingreso += item.subtotal ?? ((item.kilos ?? 0) * (item.precio_kg ?? 0));
    if (item.precio_kg) map[nombre].precios.push(item.precio_kg);
    map[nombre].count++;
    const ventaRaw = Array.isArray(item.venta) ? item.venta[0] : item.venta;
const fecha = (ventaRaw as { created_at: string } | null)?.created_at;
    if (fecha) map[nombre].fechas.push(fecha);
  }

  return Object.entries(map)
    .map(([producto, v]) => ({
      producto,
      kilos_vendidos:    v.kilos,
      ingreso_total:     v.ingreso,
      precio_kg_promedio: v.precios.length > 0
        ? v.precios.reduce((s, p) => s + p, 0) / v.precios.length
        : 0,
      transacciones:     v.count,
      primera_venta:     v.fechas.length > 0 ? v.fechas.sort()[0] : "",
      ultima_venta:      v.fechas.length > 0 ? v.fechas.sort().at(-1)! : "",
    } as VVentasPorProducto))
    .sort((a, b) => b.ingreso_total - a.ingreso_total);
}

// ── PRODUCTOS ───────────────────────────────────────────────────────────
function isUniqueConflict(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = err.message?.toLowerCase() ?? "";
  return m.includes("duplicate") || m.includes("unique");
}

export async function insertProducto(payload: {
  nombre: string;          // slug interno (único en DB)
  codigo_plu?: string;
  precio_venta?: number;
}): Promise<Producto> {
  const supabase = createClient();

  const { data: prod, error: eProd } = await supabase
    .from("productos")
    .insert({ nombre: payload.nombre, unidad: "kg", activo: true,
              codigo_plu: payload.codigo_plu || null,
              precio_venta: payload.precio_venta || null })
    .select()
    .single();
  if (eProd) {
    if (isUniqueConflict(eProd)) {
      throw new Error(
        "Ya existe un producto con el mismo nombre interno o el mismo PLU. Cambiá el nombre, el PLU, o usá otro código en la balanza."
      );
    }
    throw eProd;
  }

  const { error: eStock } = await supabase.from("stock_productos").upsert(
    { producto_id: prod.id, kilos: 0 },
    { onConflict: "producto_id", ignoreDuplicates: true }
  );
  if (eStock && !isUniqueConflict(eStock)) throw eStock;

  return prod;
}

// ── PROVEEDORES ─────────────────────────────────────────────────────────
export async function getProveedores(): Promise<Proveedor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function getProveedoresAll(): Promise<Proveedor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function insertProveedor(
  payload: Omit<Proveedor, "id" | "activo" | "created_at" | "updated_at">
): Promise<Proveedor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .insert({ ...payload, activo: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProveedor(
  id: string,
  payload: Partial<Omit<Proveedor, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("proveedores")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProveedor(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("proveedores")
    .delete()
    .eq("id", id);
  if (error) {
    // Si falla por restricción de clave foránea, hacer soft delete (desactivar)
    if (error.code === "23503") {
      const { error: errUpdate } = await supabase
        .from("proveedores")
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (errUpdate) throw errUpdate;
      return;
    }
    throw error;
  }
}

// ── REMITOS ─────────────────────────────────────────────────────────────
export async function getRemitos(): Promise<Remito[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("remitos")
    .select(`
      *,
      proveedor:proveedores(id,nombre),
      usuario:usuarios(id,nombre),
      items:remito_items(
        *,
        producto:productos(id,nombre)
      )
    `)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data as unknown as Remito[];
}

export async function insertRemito(
  remitoPayload: { proveedor_id: string; numero_remito: string; fecha?: string; registrado_por: string; notas?: string },
  items: { producto_id: string; kilos: number; precio_costo?: number; costo_total?: number }[]
): Promise<Remito> {
  const supabase = createClient();

  // 1. Insertar cabecera de remito
  const { data: remito, error: eRemito } = await supabase
    .from("remitos")
    .insert(remitoPayload)
    .select()
    .single();
  if (eRemito) throw eRemito;

  // 2. Insertar ítems del remito
  const itemsPayload = items.map((i) => ({ ...i, remito_id: remito.id }));
  const { error: eItems } = await supabase
    .from("remito_items")
    .insert(itemsPayload);

  if (eItems) {
    // Revertir cabecera para no dejar huérfanos
    await supabase.from("remitos").delete().eq("id", remito.id);
    throw eItems;
  }

  return remito;
}

export async function updateRemito(
  id: string,
  payload: Partial<Pick<Remito, "proveedor_id" | "numero_remito" | "fecha" | "notas">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("remitos")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateRemitoItem(
  id: string,
  payload: { kilos: number; precio_costo?: number | null; costo_total?: number | null }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("remito_items")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRemito(id: string): Promise<void> {
  const supabase = createClient();
  const { error: eItems } = await supabase.from("remito_items").delete().eq("remito_id", id);
  if (eItems) throw eItems;
  const { error } = await supabase.from("remitos").delete().eq("id", id);
  if (error) throw error;
}

