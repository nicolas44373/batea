export type UserRole = "admin" | "encargado" | "operario" | "cajero";
export type MovimientoTipo = "ingreso" | "egreso" | "ajuste";
export type OrdenEstado = "pendiente" | "en_proceso" | "completada" | "cancelada";
export type TipoCajon =
  | "pollo_entero"
  | "filet_fresco"
  | "filet_congelado"
  | "pata_muslo_fresca"
  | "pata_muslo_congelada";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoteCajones {
  id: string;
  marca: string;
  tipo_producto: TipoCajon;
  calibre?: string;           // solo para pollo_entero (5-12)
  peso_total: number;
  cantidad_cajones: number;
  cajones_disponibles: number;
  peso_promedio: number;
  costo_por_cajon?: number;   // costo por cajón al momento de la compra
  fecha: string;
  notas?: string;
  usuario_id: string;
  created_at: string;
  updated_at: string;
  // joins opcionales
  usuario?: Usuario;
}

export interface MarcaConfiguracion {
  id: string;
  nombre: string;
  tipo_producto: string;
  costo_por_cajon: number;
  rendimiento_esperado?: number;
  activo: boolean;
  notas?: string;
  created_at: string;
  updated_at: string;
}

// Para la vista de rentabilidad por lote
export interface VRentabilidadLote {
  id: string;
  marca: string;
  tipo_producto: string;
  calibre?: string;
  fecha: string;
  cantidad_cajones: number;
  peso_total: number;
  costo_por_cajon: number;
  costo_total: number;
  kilos_producidos: number;
  rendimiento_promedio: number;
  costo_por_kg_prod: number;
}

// Para la vista de ventas por producto
export interface VVentasPorProducto {
  producto: string;
  kilos_vendidos: number;
  ingreso_total: number;
  precio_kg_promedio: number;
  transacciones: number;
  primera_venta: string;
  ultima_venta: string;
}

export interface OrdenDesposte {
  id: string;
  lote_id: string;
  cantidad_cajones: number;
  peso_estimado: number;
  estado: OrdenEstado;
  fecha_orden: string;
  fecha_proceso?: string;
  usuario_id: string;
  operario_id?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
  // joins
  lote?: LoteCajones;
  usuario?: Usuario;
  operario?: Usuario;
  produccion?: Produccion;
}

export interface Produccion {
  id: string;
  orden_id: string;
  pata_muslo: number;
  pechuga: number;
  alitas: number;
  carcasa: number;
  menudos: number;
  otros: number;
  peso_total_producido: number;
  rendimiento_real: number;
  tiene_alerta: boolean;
  alerta_detalle?: string;
  registrado_por: string;
  fecha_produccion: string;
  created_at: string;
  updated_at: string;
  // joins
  orden?: OrdenDesposte;
  registrado_por_usuario?: Usuario;
}

export interface Producto {
  id: string;
  nombre: string;
  unidad: string;
  activo: boolean;
  precio_venta?: number;
  codigo_plu?: string;
  stock_source_id?: string;   // para productos personalizados: de qué stock real se descuenta
  precio_fijo?: boolean;      // true = precio_venta es total fijo (promo), no por kg
  created_at: string;
}

export type TipoFilet = "pechuga" | "filet_fresco" | "filet_congelado";

export interface ElaboracionSupremas {
  id: string;
  tipo_filet: TipoFilet;
  kilos_filet: number;
  kilos_supremas: number;
  rendimiento_real: number;
  tiene_alerta: boolean;
  alerta_detalle?: string;
  registrado_por: string;
  operario_id?: string;
  notas?: string;
  fecha_elaboracion: string;
  created_at: string;
  // joins
  registrado_por_usuario?: Usuario;
  operario?: Usuario;
}

export interface StockProducto {
  id: string;
  producto_id: string;
  kilos: number;
  updated_at: string;
  // joins
  producto?: Producto;
}

export interface MovimientoStock {
  id: string;
  producto_id: string;
  tipo: MovimientoTipo;
  kilos: number;
  kilos_anterior: number;
  kilos_nuevo: number;
  referencia_tipo?: string;
  referencia_id?: string;
  notas?: string;
  usuario_id: string;
  created_at: string;
  // joins
  producto?: Producto;
  usuario?: Usuario;
}

export interface Venta {
  id: string;
  numero: number;
  cliente?: string;
  total_kilos?: number;
  total_monto?: number;
  notas?: string;
  usuario_id: string;
  created_at: string;
  // joins
  usuario?: Usuario;
  items?: VentaItem[];
}

export interface VentaItem {
  id: string;
  venta_id: string;
  producto_id: string;
  kilos: number;
  precio_kg?: number;
  subtotal?: number;
  created_at: string;
  // joins
  producto?: Producto;
}

export interface ConfiguracionRendimiento {
  id: string;
  calibre: string;
  rend_pata_muslo_min: number;
  rend_pata_muslo_max: number;
  rend_pechuga_min: number;
  rend_pechuga_max: number;
  rend_alitas_min: number;
  rend_alitas_max: number;
  rend_carcasa_min: number;
  rend_carcasa_max: number;
  rend_merma_max: number;
}

// Vistas
export interface VStockActual {
  producto_id: string;
  producto: string;
  kilos: number;
  updated_at: string;
}

export interface VAlertasProduccion {
  id: string;
  rendimiento_real: number;
  alerta_detalle: string;
  fecha_produccion: string;
  cantidad_cajones: number;
  peso_estimado: number;
  marca: string;
  calibre: string;
  operario: string;
}

export interface VDashboardLotes {
  id: string;
  marca: string;
  calibre: string;
  fecha: string;
  cantidad_cajones: number;
  cajones_disponibles: number;
  peso_total: number;
  peso_promedio: number;
  usuario_nombre: string;
  ordenes_count: number;
  ordenes_completadas: number;
  rendimiento_max: number;
  rendimiento_min: number;
  rendimiento_promedio: number;
}

// Formularios
export interface LoteCajonesForm {
  marca: string;
  tipo_producto: TipoCajon;
  calibre?: string;           // solo para pollo_entero
  peso_total: number;
  cantidad_cajones: number;
  fecha: string;
  notas?: string;
}

export interface OrdenDesposteForm {
  lote_id: string;
  cantidad_cajones: number;
  operario_id?: string;
  notas?: string;
}

export interface ProduccionForm {
  orden_id: string;
  pata_muslo: number;
  pechuga: number;
  alitas: number;
  carcasa: number;
  menudos: number;
  otros: number;
}

export interface VentaItemForm {
  producto_id: string;
  kilos: number;
  precio_kg?: number;
}

export interface VentaForm {
  cliente?: string;
  notas?: string;
  items: VentaItemForm[];
}
