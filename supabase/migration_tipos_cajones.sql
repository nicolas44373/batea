-- ============================================================
--  MIGRACIÓN: Tipos de cajones + Calibres 5-12
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Nuevo ENUM para tipo de producto del cajón
CREATE TYPE tipo_cajon AS ENUM (
  'pollo_entero',
  'filet_fresco',
  'filet_congelado',
  'pata_muslo_fresca',
  'pata_muslo_congelada'
);

-- 2. Agregar columna tipo_producto a lotes_cajones
--    (default pollo_entero para no romper registros existentes)
ALTER TABLE lotes_cajones
  ADD COLUMN tipo_producto tipo_cajon NOT NULL DEFAULT 'pollo_entero';

-- 3. Calibre ahora es opcional (filet/pata_muslo no tienen calibre de ave)
ALTER TABLE lotes_cajones
  ALTER COLUMN calibre DROP NOT NULL;

-- 4. Agregar productos al catálogo para filet y pata/muslo directo
INSERT INTO productos (nombre, unidad, activo) VALUES
  ('filet_fresco',         'kg', TRUE),
  ('filet_congelado',      'kg', TRUE),
  ('pata_muslo_fresca',    'kg', TRUE),
  ('pata_muslo_congelada', 'kg', TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Inicializar su stock en 0
INSERT INTO stock_productos (producto_id, kilos)
SELECT id, 0 FROM productos
WHERE nombre IN ('filet_fresco','filet_congelado','pata_muslo_fresca','pata_muslo_congelada')
ON CONFLICT (producto_id) DO NOTHING;

-- 5. Actualizar configuracion_rendimiento: calibres 5-12 (cantidad de pollos por cajón)
--    Eliminar los calibres viejos por rango de peso
DELETE FROM configuracion_rendimiento;

INSERT INTO configuracion_rendimiento
  (calibre,
   rend_pata_muslo_min, rend_pata_muslo_max,
   rend_pechuga_min,    rend_pechuga_max,
   rend_alitas_min,     rend_alitas_max,
   rend_carcasa_min,    rend_carcasa_max,
   rend_merma_max)
VALUES
--  calibre | pata_muslo     | pechuga       | alitas        | carcasa       | merma
  ('5',       27.0, 32.0,      26.0, 30.0,     10.0, 13.0,     22.0, 27.0,    8.0),
  ('6',       27.0, 32.0,      25.0, 30.0,     10.0, 13.0,     22.0, 27.0,    8.0),
  ('7',       26.0, 31.0,      24.0, 29.0,     10.5, 13.5,     23.0, 28.0,    8.0),
  ('8',       26.0, 31.0,      23.0, 28.0,     10.5, 13.5,     23.0, 28.0,    8.5),
  ('9',       25.0, 30.0,      22.0, 27.0,     11.0, 14.0,     24.0, 29.0,    8.5),
  ('10',      24.0, 29.0,      21.0, 26.0,     11.0, 14.0,     24.0, 29.0,    9.0),
  ('11',      23.0, 28.0,      20.0, 25.0,     11.5, 14.5,     24.0, 29.0,    9.0),
  ('12',      22.0, 27.0,      19.0, 24.0,     11.5, 14.5,     25.0, 30.0,    9.5);

-- 6. Trigger: cuando se registra un cajón de filet o pata/muslo
--    → va directo al stock (no requiere desposte)
CREATE OR REPLACE FUNCTION public.ingresar_stock_directo_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_producto_nombre TEXT;
  v_producto_id     UUID;
  v_stock_anterior  NUMERIC;
BEGIN
  -- Solo actúa para productos que van directo al stock
  IF NEW.tipo_producto = 'pollo_entero' THEN
    RETURN NEW;
  END IF;

  -- Mapear tipo de cajón a nombre de producto
  v_producto_nombre := NEW.tipo_producto::TEXT;

  SELECT id INTO v_producto_id
  FROM public.productos
  WHERE nombre = v_producto_nombre AND activo = TRUE;

  IF v_producto_id IS NULL THEN
    RAISE WARNING 'Producto no encontrado para tipo_cajon: %', v_producto_nombre;
    RETURN NEW;
  END IF;

  SELECT kilos INTO v_stock_anterior
  FROM public.stock_productos
  WHERE producto_id = v_producto_id;

  -- Sumar el peso total del lote al stock
  UPDATE public.stock_productos
  SET kilos = kilos + NEW.peso_total, updated_at = NOW()
  WHERE producto_id = v_producto_id;

  -- Registrar movimiento
  INSERT INTO public.movimientos_stock
    (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo,
     referencia_tipo, referencia_id, notas, usuario_id)
  VALUES
    (v_producto_id, 'ingreso', NEW.peso_total,
     COALESCE(v_stock_anterior, 0),
     COALESCE(v_stock_anterior, 0) + NEW.peso_total,
     'lote_directo', NEW.id,
     'Ingreso directo: ' || NEW.tipo_producto::TEXT || ' — ' || NEW.cantidad_cajones || ' cajones',
     NEW.usuario_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;

CREATE TRIGGER trg_lote_stock_directo
  AFTER INSERT ON public.lotes_cajones
  FOR EACH ROW EXECUTE FUNCTION public.ingresar_stock_directo_lote();

-- 7. Agregar descripción del tipo de cajón en la vista del dashboard
--    (recrear v_dashboard_lotes para incluir tipo_producto)
DROP VIEW IF EXISTS v_dashboard_lotes;
CREATE VIEW v_dashboard_lotes AS
SELECT
  lc.id,
  lc.marca,
  lc.calibre,
  lc.tipo_producto,
  lc.fecha,
  lc.cantidad_cajones,
  lc.cajones_disponibles,
  lc.peso_total,
  lc.peso_promedio,
  u.nombre AS usuario_nombre,
  COUNT(od.id) AS ordenes_count,
  SUM(CASE WHEN od.estado = 'completada' THEN 1 ELSE 0 END) AS ordenes_completadas,
  MAX(pr.rendimiento_real) AS rendimiento_max,
  MIN(pr.rendimiento_real) AS rendimiento_min,
  AVG(pr.rendimiento_real) AS rendimiento_promedio
FROM lotes_cajones lc
JOIN usuarios u ON u.id = lc.usuario_id
LEFT JOIN ordenes_desposte od ON od.lote_id = lc.id
LEFT JOIN produccion pr ON pr.orden_id = od.id
GROUP BY lc.id, u.nombre;

-- Verificación
SELECT
  tipo_producto,
  COUNT(*) AS lotes,
  SUM(cantidad_cajones) AS total_cajones,
  SUM(peso_total) AS total_kilos
FROM lotes_cajones
GROUP BY tipo_producto;
