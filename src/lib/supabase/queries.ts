import { createClient } from "./client";
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
  Producto,
} from "@/types";

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
  return data;
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
  return data;
}

export async function insertProduccion(
  payload: Omit<Produccion, "id" | "peso_total_producido" | "rendimiento_real" | "tiene_alerta" | "alerta_detalle" | "fecha_produccion" | "created_at" | "updated_at">
): Promise<Produccion> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("produccion")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
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
  if (eItems) throw eItems;

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
  payload: Partial<Pick<LoteCajones, "marca" | "calibre" | "peso_total" | "cantidad_cajones" | "fecha" | "tipo_producto">>
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

export async function deleteOrden(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("ordenes_desposte").delete().eq("id", id);
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
  codigo_plu: string | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("productos")
    .update({ precio_venta, codigo_plu })
    .eq("id", id);
  if (error) throw error;
}

export async function getProductoPorPlu(plu: string): Promise<Producto | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("codigo_plu", plu.trim())
    .eq("activo", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertProducto(payload: {
  nombre: string;          // slug interno (único en DB)
  codigo_plu?: string;
  precio_venta?: number;
}): Promise<Producto> {
  const supabase = createClient();

  // 1. Crear el producto
  const { data: prod, error: eProd } = await supabase
    .from("productos")
    .insert({ nombre: payload.nombre, unidad: "kg", activo: true,
              codigo_plu: payload.codigo_plu || null,
              precio_venta: payload.precio_venta || null })
    .select()
    .single();
  if (eProd) throw eProd;

  // 2. Inicializar stock en 0
  const { error: eStock } = await supabase
    .from("stock_productos")
    .insert({ producto_id: prod.id, kilos: 0 });
  if (eStock) throw eStock;

  return prod;
}
