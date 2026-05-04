-- ============================================================
--  BATEA — Sistema de Distribuidora Avícola
--  Supabase PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'encargado', 'operario', 'cajero');
CREATE TYPE movimiento_tipo AS ENUM ('ingreso', 'egreso', 'ajuste');
CREATE TYPE orden_estado AS ENUM ('pendiente', 'en_proceso', 'completada', 'cancelada');

-- ============================================================
-- TABLA: usuarios (extends auth.users via trigger)
-- ============================================================

CREATE TABLE usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  rol         user_role NOT NULL DEFAULT 'operario',
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: lotes_cajones (ingreso de stock mayorista)
-- ============================================================

CREATE TABLE lotes_cajones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marca             TEXT NOT NULL,
  calibre           TEXT NOT NULL,                  -- ej: "2.5-3kg", "3-3.5kg"
  peso_total        NUMERIC(10,3) NOT NULL CHECK (peso_total > 0),
  cantidad_cajones  INTEGER NOT NULL CHECK (cantidad_cajones > 0),
  peso_promedio     NUMERIC(10,3) GENERATED ALWAYS AS (peso_total / cantidad_cajones) STORED,
  cajones_disponibles INTEGER NOT NULL,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  notas             TEXT,
  usuario_id        UUID NOT NULL REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: ordenes_desposte
-- ============================================================

CREATE TABLE ordenes_desposte (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_id           UUID NOT NULL REFERENCES lotes_cajones(id),
  cantidad_cajones  INTEGER NOT NULL CHECK (cantidad_cajones > 0),
  peso_estimado     NUMERIC(10,3),                  -- calculado en trigger
  estado            orden_estado NOT NULL DEFAULT 'pendiente',
  fecha_orden       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_proceso     TIMESTAMPTZ,
  usuario_id        UUID NOT NULL REFERENCES usuarios(id),  -- quien crea la orden
  operario_id       UUID REFERENCES usuarios(id),           -- quien ejecuta
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: produccion (resultado del desposte)
-- ============================================================

CREATE TABLE produccion (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id         UUID NOT NULL UNIQUE REFERENCES ordenes_desposte(id),
  -- kilos por corte
  pata_muslo       NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (pata_muslo >= 0),
  pechuga          NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (pechuga >= 0),
  alitas           NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (alitas >= 0),
  carcasa          NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (carcasa >= 0),
  menudos          NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (menudos >= 0),
  otros            NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (otros >= 0),
  -- totales calculados
  peso_total_producido NUMERIC(10,3) GENERATED ALWAYS AS (
    pata_muslo + pechuga + alitas + carcasa + menudos + otros
  ) STORED,
  rendimiento_real NUMERIC(5,2),                   -- % calculado en trigger vs peso_estimado
  -- alertas
  tiene_alerta     BOOLEAN NOT NULL DEFAULT FALSE,
  alerta_detalle   TEXT,
  -- auditoría
  registrado_por   UUID NOT NULL REFERENCES usuarios(id),
  fecha_produccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: configuracion_rendimiento
-- ============================================================

CREATE TABLE configuracion_rendimiento (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calibre              TEXT NOT NULL UNIQUE,
  rend_pata_muslo_min  NUMERIC(5,2) NOT NULL DEFAULT 25.0,
  rend_pata_muslo_max  NUMERIC(5,2) NOT NULL DEFAULT 32.0,
  rend_pechuga_min     NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  rend_pechuga_max     NUMERIC(5,2) NOT NULL DEFAULT 28.0,
  rend_alitas_min      NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  rend_alitas_max      NUMERIC(5,2) NOT NULL DEFAULT 14.0,
  rend_carcasa_min     NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  rend_carcasa_max     NUMERIC(5,2) NOT NULL DEFAULT 28.0,
  rend_merma_max       NUMERIC(5,2) NOT NULL DEFAULT 8.0,   -- pérdida aceptable
  actualizado_por      UUID REFERENCES usuarios(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: productos (catálogo de cortes)
-- ============================================================

CREATE TABLE productos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL UNIQUE,
  unidad      TEXT NOT NULL DEFAULT 'kg',
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datos iniciales de productos
INSERT INTO productos (nombre) VALUES
  ('pata_muslo'), ('pechuga'), ('alitas'), ('carcasa'), ('menudos'), ('pollo_entero');

-- ============================================================
-- TABLA: stock_productos
-- ============================================================

CREATE TABLE stock_productos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL UNIQUE REFERENCES productos(id),
  kilos       NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (kilos >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inicializar stock en 0 para cada producto
INSERT INTO stock_productos (producto_id, kilos)
SELECT id, 0 FROM productos;

-- ============================================================
-- TABLA: movimientos_stock (auditoría completa)
-- ============================================================

CREATE TABLE movimientos_stock (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id     UUID NOT NULL REFERENCES productos(id),
  tipo            movimiento_tipo NOT NULL,
  kilos           NUMERIC(12,3) NOT NULL,
  kilos_anterior  NUMERIC(12,3) NOT NULL,
  kilos_nuevo     NUMERIC(12,3) NOT NULL,
  referencia_tipo TEXT,                    -- 'produccion', 'venta', 'ajuste'
  referencia_id   UUID,                    -- id del registro origen
  notas           TEXT,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: ventas
-- ============================================================

CREATE TABLE ventas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero       SERIAL UNIQUE,
  cliente      TEXT,
  total_kilos  NUMERIC(12,3),
  total_monto  NUMERIC(12,2),
  notas        TEXT,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: venta_items (detalle de cada venta)
-- ============================================================

CREATE TABLE venta_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id    UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  kilos       NUMERIC(10,3) NOT NULL CHECK (kilos > 0),
  precio_kg   NUMERIC(10,2),
  subtotal    NUMERIC(12,2) GENERATED ALWAYS AS (kilos * precio_kg) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: auditoria (log general de acciones)
-- ============================================================

CREATE TABLE auditoria (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla       TEXT NOT NULL,
  operacion   TEXT NOT NULL,     -- INSERT, UPDATE, DELETE
  registro_id UUID,
  datos_antes JSONB,
  datos_despues JSONB,
  usuario_id  UUID REFERENCES usuarios(id),
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lotes_updated_at
  BEFORE UPDATE ON lotes_cajones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ordenes_updated_at
  BEFORE UPDATE ON ordenes_desposte FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_produccion_updated_at
  BEFORE UPDATE ON produccion FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger: descontar cajones del lote al crear orden
CREATE OR REPLACE FUNCTION descontar_cajones_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_peso_por_cajon NUMERIC;
BEGIN
  -- validar cajones disponibles
  SELECT cajones_disponibles INTO STRICT v_peso_por_cajon FROM lotes_cajones WHERE id = NEW.lote_id;
  IF v_peso_por_cajon < NEW.cantidad_cajones THEN
    RAISE EXCEPTION 'No hay suficientes cajones disponibles. Disponibles: %, Solicitados: %',
      v_peso_por_cajon, NEW.cantidad_cajones;
  END IF;

  -- calcular peso estimado
  SELECT (peso_total / cantidad_cajones) * NEW.cantidad_cajones
  INTO NEW.peso_estimado
  FROM lotes_cajones WHERE id = NEW.lote_id;

  -- descontar cajones
  UPDATE lotes_cajones
  SET cajones_disponibles = cajones_disponibles - NEW.cantidad_cajones
  WHERE id = NEW.lote_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orden_descontar_cajones
  BEFORE INSERT ON ordenes_desposte
  FOR EACH ROW EXECUTE FUNCTION descontar_cajones_lote();

-- Trigger: al registrar producción → actualizar stock y calcular rendimiento
CREATE OR REPLACE FUNCTION procesar_produccion()
RETURNS TRIGGER AS $$
DECLARE
  v_peso_estimado   NUMERIC;
  v_rendimiento     NUMERIC;
  v_alerta          BOOLEAN := FALSE;
  v_alerta_detalle  TEXT := '';
  v_stock_anterior  NUMERIC;
  v_producto_id     UUID;
  cortes            TEXT[] := ARRAY['pata_muslo','pechuga','alitas','carcasa','menudos'];
  corte             TEXT;
  kilos_corte       NUMERIC;
BEGIN
  -- obtener peso estimado de la orden
  SELECT od.peso_estimado INTO v_peso_estimado
  FROM ordenes_desposte od WHERE od.id = NEW.orden_id;

  -- calcular rendimiento real
  IF v_peso_estimado > 0 THEN
    v_rendimiento := ROUND((NEW.peso_total_producido / v_peso_estimado) * 100, 2);
  END IF;
  NEW.rendimiento_real := v_rendimiento;

  -- verificar alertas de rendimiento
  IF v_rendimiento < 85 THEN
    v_alerta := TRUE;
    v_alerta_detalle := v_alerta_detalle || 'Rendimiento total bajo (' || v_rendimiento || '%). ';
  END IF;
  IF v_rendimiento > 105 THEN
    v_alerta := TRUE;
    v_alerta_detalle := v_alerta_detalle || 'Rendimiento total anormalmente alto (' || v_rendimiento || '%). ';
  END IF;

  NEW.tiene_alerta := v_alerta;
  NEW.alerta_detalle := NULLIF(TRIM(v_alerta_detalle), '');

  -- actualizar stock por cada corte
  FOREACH corte IN ARRAY cortes LOOP
    EXECUTE format('SELECT $1.%I', corte) INTO kilos_corte USING NEW;

    SELECT sp.kilos, p.id INTO v_stock_anterior, v_producto_id
    FROM stock_productos sp
    JOIN productos p ON p.id = sp.producto_id
    WHERE p.nombre = corte;

    IF v_producto_id IS NOT NULL THEN
      UPDATE stock_productos SET kilos = kilos + kilos_corte, updated_at = NOW()
      WHERE producto_id = v_producto_id;

      INSERT INTO movimientos_stock
        (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo, referencia_tipo, referencia_id, usuario_id)
      VALUES
        (v_producto_id, 'ingreso', kilos_corte, v_stock_anterior, v_stock_anterior + kilos_corte,
         'produccion', NEW.id, NEW.registrado_por);
    END IF;
  END LOOP;

  -- marcar orden como completada
  UPDATE ordenes_desposte SET estado = 'completada', fecha_proceso = NOW()
  WHERE id = NEW.orden_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procesar_produccion
  BEFORE INSERT ON produccion
  FOR EACH ROW EXECUTE FUNCTION procesar_produccion();

-- Trigger: ventas → descontar stock
CREATE OR REPLACE FUNCTION procesar_venta_item()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_actual NUMERIC;
BEGIN
  SELECT kilos INTO v_stock_actual FROM stock_productos WHERE producto_id = NEW.producto_id;

  IF v_stock_actual IS NULL OR v_stock_actual < NEW.kilos THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto. Disponible: % kg, Solicitado: % kg',
      COALESCE(v_stock_actual, 0), NEW.kilos;
  END IF;

  UPDATE stock_productos SET kilos = kilos - NEW.kilos, updated_at = NOW()
  WHERE producto_id = NEW.producto_id;

  INSERT INTO movimientos_stock
    (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo, referencia_tipo, referencia_id, usuario_id)
  SELECT NEW.producto_id, 'egreso', NEW.kilos, v_stock_actual, v_stock_actual - NEW.kilos,
         'venta', NEW.venta_id,
         (SELECT usuario_id FROM ventas WHERE id = NEW.venta_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venta_item_stock
  BEFORE INSERT ON venta_items
  FOR EACH ROW EXECUTE FUNCTION procesar_venta_item();

-- Trigger: lotes_cajones → inicializar cajones_disponibles
CREATE OR REPLACE FUNCTION init_cajones_disponibles()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cajones_disponibles := NEW.cantidad_cajones;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lote_init_disponibles
  BEFORE INSERT ON lotes_cajones
  FOR EACH ROW EXECUTE FUNCTION init_cajones_disponibles();

-- Trigger: nuevo usuario auth → insertar en tabla usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, nombre, email, rol)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''),
      split_part(COALESCE(NEW.email, ''), '@', 1),
      'Usuario'
    ),
    COALESCE(NEW.email, NEW.id::text),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'rol'), '')::public.user_role,
      'operario'::public.user_role
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: % — %', SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;

CREATE TRIGGER trg_auth_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

CREATE VIEW v_stock_actual AS
SELECT
  p.id AS producto_id,
  p.nombre AS producto,
  sp.kilos,
  sp.updated_at
FROM stock_productos sp
JOIN productos p ON p.id = sp.producto_id
WHERE p.activo = TRUE
ORDER BY p.nombre;

CREATE VIEW v_dashboard_lotes AS
SELECT
  lc.id,
  lc.marca,
  lc.calibre,
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

CREATE VIEW v_alertas_produccion AS
SELECT
  pr.id,
  pr.rendimiento_real,
  pr.alerta_detalle,
  pr.fecha_produccion,
  od.cantidad_cajones,
  od.peso_estimado,
  lc.marca,
  lc.calibre,
  u.nombre AS operario
FROM produccion pr
JOIN ordenes_desposte od ON od.id = pr.orden_id
JOIN lotes_cajones lc ON lc.id = od.lote_id
LEFT JOIN usuarios u ON u.id = od.operario_id
WHERE pr.tiene_alerta = TRUE
ORDER BY pr.fecha_produccion DESC;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_cajones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_desposte ENABLE ROW LEVEL SECURITY;
ALTER TABLE produccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- USUARIOS: solo admin gestiona, cada uno puede ver el suyo
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT
  TO authenticated USING (id = auth.uid() OR get_user_role() IN ('admin', 'encargado'));
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT
  TO authenticated WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin' OR id = auth.uid());
-- service_role necesita insertar para que el trigger handle_new_user funcione
CREATE POLICY "service_role_insert_usuarios" ON usuarios FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_usuarios" ON usuarios FOR UPDATE
  TO service_role USING (true);

-- LOTES: admin y encargado pueden insertar; todos leen
CREATE POLICY "lotes_select" ON lotes_cajones FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "lotes_insert" ON lotes_cajones FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado'));
CREATE POLICY "lotes_update" ON lotes_cajones FOR UPDATE
  TO authenticated USING (get_user_role() IN ('admin', 'encargado'));

-- ORDENES: admin, encargado y operario
CREATE POLICY "ordenes_select" ON ordenes_desposte FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "ordenes_insert" ON ordenes_desposte FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado', 'operario'));
CREATE POLICY "ordenes_update" ON ordenes_desposte FOR UPDATE
  TO authenticated USING (get_user_role() IN ('admin', 'encargado'));

-- PRODUCCION
CREATE POLICY "produccion_select" ON produccion FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "produccion_insert" ON produccion FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado', 'operario'));

-- STOCK (solo lectura para cajero)
CREATE POLICY "stock_select" ON stock_productos FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "stock_update" ON stock_productos FOR UPDATE
  TO authenticated USING (get_user_role() IN ('admin', 'encargado'));

-- MOVIMIENTOS (solo lectura para todos)
CREATE POLICY "movimientos_select" ON movimientos_stock FOR SELECT TO authenticated USING (TRUE);

-- VENTAS
CREATE POLICY "ventas_select" ON ventas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "ventas_insert" ON ventas FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado', 'cajero'));

CREATE POLICY "venta_items_select" ON venta_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "venta_items_insert" ON venta_items FOR INSERT
  TO authenticated WITH CHECK (get_user_role() IN ('admin', 'encargado', 'cajero'));

-- AUDITORIA (solo admin)
CREATE POLICY "auditoria_select" ON auditoria FOR SELECT
  TO authenticated USING (get_user_role() = 'admin');

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_lotes_fecha ON lotes_cajones (fecha DESC);
CREATE INDEX idx_lotes_marca ON lotes_cajones (marca);
CREATE INDEX idx_ordenes_lote ON ordenes_desposte (lote_id);
CREATE INDEX idx_ordenes_estado ON ordenes_desposte (estado);
CREATE INDEX idx_produccion_orden ON produccion (orden_id);
CREATE INDEX idx_produccion_alerta ON produccion (tiene_alerta) WHERE tiene_alerta = TRUE;
CREATE INDEX idx_movimientos_producto ON movimientos_stock (producto_id, created_at DESC);
CREATE INDEX idx_movimientos_ref ON movimientos_stock (referencia_tipo, referencia_id);
CREATE INDEX idx_ventas_fecha ON ventas (created_at DESC);
CREATE INDEX idx_venta_items_venta ON venta_items (venta_id);
CREATE INDEX idx_auditoria_tabla ON auditoria (tabla, created_at DESC);

-- ============================================================
-- DATOS INICIALES DE CONFIGURACIÓN
-- ============================================================

INSERT INTO configuracion_rendimiento (calibre) VALUES
  ('2-2.5kg'), ('2.5-3kg'), ('3-3.5kg'), ('3.5-4kg'), ('+4kg');
