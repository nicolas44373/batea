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
  MarcaConfiguracion,
  VRentabilidadLote,
  VVentasPorProducto,
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
  codigo_plu: string | null,
  stock_source_id?: string | null,
  precio_fijo?: boolean
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { precio_venta, codigo_plu };
  if (stock_source_id !== undefined) payload.stock_source_id = stock_source_id;
  if (precio_fijo !== undefined) payload.precio_fijo = precio_fijo;
  const { error } = await supabase
    .from("productos")
    .update(payload)
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
    const nombre = (item.producto as { nombre: string } | null)?.nombre ?? "desconocido";
    if (!map[nombre]) map[nombre] = { kilos: 0, ingreso: 0, precios: [], count: 0, fechas: [] };
    map[nombre].kilos   += item.kilos ?? 0;
    map[nombre].ingreso += item.subtotal ?? ((item.kilos ?? 0) * (item.precio_kg ?? 0));
    if (item.precio_kg) map[nombre].precios.push(item.precio_kg);
    map[nombre].count++;
    const fecha = (item.venta as { created_at: string } | null)?.created_at;
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
