-- ============================================================
--  FIX: RLS en productos + columnas precio/PLU seguros
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Activar RLS en productos (si no estaba)
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de acceso
DROP POLICY IF EXISTS "productos_select_all"     ON productos;
DROP POLICY IF EXISTS "productos_insert_admin"   ON productos;
DROP POLICY IF EXISTS "productos_update_admin"   ON productos;
DROP POLICY IF EXISTS "productos_service_all"    ON productos;

-- Cualquier usuario autenticado puede ver productos
CREATE POLICY "productos_select_all" ON productos
  FOR SELECT TO authenticated USING (TRUE);

-- Admin y encargado pueden crear/editar
CREATE POLICY "productos_insert_admin" ON productos
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'encargado'));

CREATE POLICY "productos_update_admin" ON productos
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'encargado'));

-- Service role (triggers) acceso total
CREATE POLICY "productos_service_all" ON productos
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- 3. Asegurar que las columnas existen (idempotente)
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS codigo_plu   TEXT;

-- Índice único en codigo_plu (solo donde no es null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_plu
  ON productos (codigo_plu) WHERE codigo_plu IS NOT NULL;

-- 4. Asegurar RLS en stock_productos para service_role
DROP POLICY IF EXISTS "stock_service_all" ON stock_productos;
CREATE POLICY "stock_service_all" ON stock_productos
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- 5. Verificar
SELECT id, nombre, codigo_plu, precio_venta, activo
FROM productos
ORDER BY nombre;
