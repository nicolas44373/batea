-- ============================================================
--  MIGRACIÓN: Supremas + Precios + PLU/Código de barras
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columnas a productos: precio_venta y codigo_plu
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS codigo_plu   TEXT UNIQUE;  -- código corto para pistola / PLU

-- 2. Producto "supremas"
INSERT INTO productos (nombre, unidad, activo) VALUES
  ('supremas', 'kg', TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Stock inicial en 0
INSERT INTO stock_productos (producto_id, kilos)
SELECT id, 0 FROM productos WHERE nombre = 'supremas'
ON CONFLICT (producto_id) DO NOTHING;

-- 3. PLU y precios de ejemplo (ajustar en la página de configuración)
UPDATE productos SET codigo_plu = '01', precio_venta = NULL WHERE nombre = 'pata_muslo';
UPDATE productos SET codigo_plu = '02', precio_venta = NULL WHERE nombre = 'pechuga';
UPDATE productos SET codigo_plu = '03', precio_venta = NULL WHERE nombre = 'alitas';
UPDATE productos SET codigo_plu = '04', precio_venta = NULL WHERE nombre = 'carcasa';
UPDATE productos SET codigo_plu = '05', precio_venta = NULL WHERE nombre = 'menudos';
UPDATE productos SET codigo_plu = '06', precio_venta = NULL WHERE nombre = 'supremas';
UPDATE productos SET codigo_plu = '07', precio_venta = NULL WHERE nombre = 'filet_fresco';
UPDATE productos SET codigo_plu = '08', precio_venta = NULL WHERE nombre = 'filet_congelado';
UPDATE productos SET codigo_plu = '09', precio_venta = NULL WHERE nombre = 'pata_muslo_fresca';
UPDATE productos SET codigo_plu = '10', precio_venta = NULL WHERE nombre = 'pata_muslo_congelada';

-- 4. Tabla: elaboracion_supremas
--    Registra la transformación filet/pechuga → supremas
CREATE TABLE elaboracion_supremas (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- materia prima: origen del filet
  tipo_filet           TEXT NOT NULL CHECK (tipo_filet IN ('pechuga', 'filet_fresco', 'filet_congelado')),
  kilos_filet          NUMERIC(10,3) NOT NULL CHECK (kilos_filet > 0),
  -- producción
  kilos_supremas       NUMERIC(10,3) NOT NULL CHECK (kilos_supremas > 0),
  -- rendimiento calculado: supremas / filet * 100
  rendimiento_real     NUMERIC(5,2) GENERATED ALWAYS AS
                         (ROUND((kilos_supremas / kilos_filet) * 100, 2)) STORED,
  -- alertas automáticas
  tiene_alerta         BOOLEAN NOT NULL DEFAULT FALSE,
  alerta_detalle       TEXT,
  -- personas
  registrado_por       UUID NOT NULL REFERENCES usuarios(id),
  operario_id          UUID REFERENCES usuarios(id),
  notas                TEXT,
  fecha_elaboracion    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE elaboracion_supremas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elab_sup_select" ON elaboracion_supremas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "elab_sup_insert" ON elaboracion_supremas FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado', 'operario'));

CREATE INDEX idx_elab_sup_fecha ON elaboracion_supremas (fecha_elaboracion DESC);

-- 5. Trigger: al registrar elaboracion_supremas
--    → descuenta filet del stock, suma supremas, crea movimientos, alerta si rendimiento raro
CREATE OR REPLACE FUNCTION public.procesar_elaboracion_supremas()
RETURNS TRIGGER AS $$
DECLARE
  v_filet_producto_id   UUID;
  v_supremas_id         UUID;
  v_stock_filet         NUMERIC;
  v_stock_supremas      NUMERIC;
  v_rend                NUMERIC;
  v_alerta              BOOLEAN := FALSE;
  v_alerta_det          TEXT := '';
BEGIN
  -- Rendimiento real (calculado)
  v_rend := ROUND((NEW.kilos_supremas / NEW.kilos_filet) * 100, 2);

  -- Alertas de rendimiento (esperado: 65–85%)
  IF v_rend < 60 THEN
    v_alerta := TRUE;
    v_alerta_det := 'Rendimiento muy bajo (' || v_rend || '%). ';
  END IF;
  IF v_rend > 90 THEN
    v_alerta := TRUE;
    v_alerta_det := v_alerta_det || 'Rendimiento anormalmente alto (' || v_rend || '%). ';
  END IF;

  NEW.tiene_alerta   := v_alerta;
  NEW.alerta_detalle := NULLIF(TRIM(v_alerta_det), '');

  -- Obtener IDs de productos
  SELECT id INTO v_filet_producto_id FROM public.productos WHERE nombre = NEW.tipo_filet;
  SELECT id INTO v_supremas_id       FROM public.productos WHERE nombre = 'supremas';

  IF v_filet_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto filet no encontrado: %', NEW.tipo_filet;
  END IF;

  -- Validar stock de filet disponible
  SELECT kilos INTO v_stock_filet
  FROM public.stock_productos WHERE producto_id = v_filet_producto_id;

  IF COALESCE(v_stock_filet, 0) < NEW.kilos_filet THEN
    RAISE EXCEPTION 'Stock insuficiente de %. Disponible: % kg, requerido: % kg',
      NEW.tipo_filet, COALESCE(v_stock_filet, 0), NEW.kilos_filet;
  END IF;

  -- Stock actual de supremas
  SELECT kilos INTO v_stock_supremas
  FROM public.stock_productos WHERE producto_id = v_supremas_id;

  -- 1) Descontar filet
  UPDATE public.stock_productos
  SET kilos = kilos - NEW.kilos_filet, updated_at = NOW()
  WHERE producto_id = v_filet_producto_id;

  INSERT INTO public.movimientos_stock
    (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo,
     referencia_tipo, referencia_id, notas, usuario_id)
  VALUES
    (v_filet_producto_id, 'egreso', NEW.kilos_filet,
     v_stock_filet, v_stock_filet - NEW.kilos_filet,
     'elaboracion_supremas', NEW.id,
     'Materia prima para supremas',
     NEW.registrado_por);

  -- 2) Sumar supremas
  UPDATE public.stock_productos
  SET kilos = kilos + NEW.kilos_supremas, updated_at = NOW()
  WHERE producto_id = v_supremas_id;

  INSERT INTO public.movimientos_stock
    (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo,
     referencia_tipo, referencia_id, notas, usuario_id)
  VALUES
    (v_supremas_id, 'ingreso', NEW.kilos_supremas,
     COALESCE(v_stock_supremas, 0),
     COALESCE(v_stock_supremas, 0) + NEW.kilos_supremas,
     'elaboracion_supremas', NEW.id,
     'Supremas producidas (rend. ' || v_rend || '%)',
     NEW.registrado_por);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_elaboracion_supremas
  BEFORE INSERT ON elaboracion_supremas
  FOR EACH ROW EXECUTE FUNCTION public.procesar_elaboracion_supremas();

-- Verificación final
SELECT nombre, codigo_plu, precio_venta, activo FROM productos ORDER BY nombre;
