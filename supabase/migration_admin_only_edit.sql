-- ============================================================
--  MIGRACIÓN: Solo admin puede editar o eliminar registros
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── lotes_cajones ─────────────────────────────────────────
DROP POLICY IF EXISTS "lotes_update" ON lotes_cajones;
DROP POLICY IF EXISTS "lotes_delete" ON lotes_cajones;
CREATE POLICY "lotes_update" ON lotes_cajones FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "lotes_delete" ON lotes_cajones FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── ordenes_desposte ──────────────────────────────────────
DROP POLICY IF EXISTS "ordenes_update" ON ordenes_desposte;
DROP POLICY IF EXISTS "ordenes_delete" ON ordenes_desposte;
CREATE POLICY "ordenes_update" ON ordenes_desposte FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "ordenes_delete" ON ordenes_desposte FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── produccion ────────────────────────────────────────────
DROP POLICY IF EXISTS "produccion_update" ON produccion;
DROP POLICY IF EXISTS "produccion_delete" ON produccion;
CREATE POLICY "produccion_update" ON produccion FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "produccion_delete" ON produccion FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── stock_productos ───────────────────────────────────────
DROP POLICY IF EXISTS "stock_update" ON stock_productos;
DROP POLICY IF EXISTS "stock_delete" ON stock_productos;
CREATE POLICY "stock_update" ON stock_productos FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
-- El trigger de producción/venta usa service_role que ya tiene acceso total

-- ── ventas ────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_update" ON ventas;
DROP POLICY IF EXISTS "ventas_delete" ON ventas;
CREATE POLICY "ventas_update" ON ventas FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "ventas_delete" ON ventas FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── venta_items ───────────────────────────────────────────
DROP POLICY IF EXISTS "venta_items_update" ON venta_items;
DROP POLICY IF EXISTS "venta_items_delete" ON venta_items;
CREATE POLICY "venta_items_update" ON venta_items FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "venta_items_delete" ON venta_items FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── usuarios ──────────────────────────────────────────────
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "usuarios_delete" ON usuarios FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── productos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "productos_update_admin" ON productos;
DROP POLICY IF EXISTS "productos_delete_admin" ON productos;
DROP POLICY IF EXISTS "productos_insert_admin" ON productos;
CREATE POLICY "productos_update_admin" ON productos FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "productos_delete_admin" ON productos FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "productos_insert_admin" ON productos FOR INSERT
  TO authenticated WITH CHECK (get_user_role() = 'admin');

-- ── configuracion_rendimiento ─────────────────────────────
ALTER TABLE configuracion_rendimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_select" ON configuracion_rendimiento;
DROP POLICY IF EXISTS "config_all_admin" ON configuracion_rendimiento;
DROP POLICY IF EXISTS "config_service" ON configuracion_rendimiento;
CREATE POLICY "config_select"    ON configuracion_rendimiento FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "config_all_admin" ON configuracion_rendimiento FOR ALL
  TO authenticated USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "config_service"   ON configuracion_rendimiento FOR ALL
  TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ── elaboracion_supremas ──────────────────────────────────
DROP POLICY IF EXISTS "elab_sup_update" ON elaboracion_supremas;
DROP POLICY IF EXISTS "elab_sup_delete" ON elaboracion_supremas;
CREATE POLICY "elab_sup_update" ON elaboracion_supremas FOR UPDATE
  TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "elab_sup_delete" ON elaboracion_supremas FOR DELETE
  TO authenticated USING (get_user_role() = 'admin');

-- ── movimientos_stock (nadie puede borrar — auditoría) ────
-- Sin política DELETE: imposible borrar registros de movimientos

-- Verificar políticas activas
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
