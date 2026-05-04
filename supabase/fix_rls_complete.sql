-- ============================================================
--  FIX COMPLETO DE RLS — Todas las tablas principales
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Asegurar que get_user_role() funciona bien ──────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;

-- ── 2. Función helper que devuelve texto (más robusta para comparaciones) ──
CREATE OR REPLACE FUNCTION public.get_user_role_text()
RETURNS text AS $$
  SELECT rol::text FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_role_text() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role_text() TO service_role;

-- ── 3. lotes_cajones ──────────────────────────────────────
ALTER TABLE public.lotes_cajones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lotes_select"  ON public.lotes_cajones;
DROP POLICY IF EXISTS "lotes_insert"  ON public.lotes_cajones;
DROP POLICY IF EXISTS "lotes_update"  ON public.lotes_cajones;
DROP POLICY IF EXISTS "lotes_delete"  ON public.lotes_cajones;

CREATE POLICY "lotes_select" ON public.lotes_cajones FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "lotes_insert" ON public.lotes_cajones FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado'));

CREATE POLICY "lotes_update" ON public.lotes_cajones FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "lotes_delete" ON public.lotes_cajones FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 4. ordenes_desposte ────────────────────────────────────
ALTER TABLE public.ordenes_desposte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ordenes_select" ON public.ordenes_desposte;
DROP POLICY IF EXISTS "ordenes_insert" ON public.ordenes_desposte;
DROP POLICY IF EXISTS "ordenes_update" ON public.ordenes_desposte;
DROP POLICY IF EXISTS "ordenes_delete" ON public.ordenes_desposte;

CREATE POLICY "ordenes_select" ON public.ordenes_desposte FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "ordenes_insert" ON public.ordenes_desposte FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado', 'operario'));

CREATE POLICY "ordenes_update" ON public.ordenes_desposte FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "ordenes_delete" ON public.ordenes_desposte FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 5. produccion ──────────────────────────────────────────
ALTER TABLE public.produccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produccion_select" ON public.produccion;
DROP POLICY IF EXISTS "produccion_insert" ON public.produccion;
DROP POLICY IF EXISTS "produccion_update" ON public.produccion;
DROP POLICY IF EXISTS "produccion_delete" ON public.produccion;

CREATE POLICY "produccion_select" ON public.produccion FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "produccion_insert" ON public.produccion FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado', 'operario'));

CREATE POLICY "produccion_update" ON public.produccion FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "produccion_delete" ON public.produccion FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 6. stock_productos ─────────────────────────────────────
ALTER TABLE public.stock_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_select" ON public.stock_productos;
DROP POLICY IF EXISTS "stock_insert" ON public.stock_productos;
DROP POLICY IF EXISTS "stock_update" ON public.stock_productos;

CREATE POLICY "stock_select" ON public.stock_productos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "stock_insert" ON public.stock_productos FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "stock_update" ON public.stock_productos FOR UPDATE
  TO authenticated USING (true);

-- ── 7. movimientos_stock ───────────────────────────────────
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_select" ON public.movimientos_stock;
DROP POLICY IF EXISTS "movimientos_insert" ON public.movimientos_stock;

CREATE POLICY "movimientos_select" ON public.movimientos_stock FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "movimientos_insert" ON public.movimientos_stock FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── 8. ventas ──────────────────────────────────────────────
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_select" ON public.ventas;
DROP POLICY IF EXISTS "ventas_insert" ON public.ventas;
DROP POLICY IF EXISTS "ventas_update" ON public.ventas;
DROP POLICY IF EXISTS "ventas_delete" ON public.ventas;

CREATE POLICY "ventas_select" ON public.ventas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "ventas_insert" ON public.ventas FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado', 'cajero'));

CREATE POLICY "ventas_update" ON public.ventas FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "ventas_delete" ON public.ventas FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 9. venta_items ─────────────────────────────────────────
ALTER TABLE public.venta_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venta_items_select" ON public.venta_items;
DROP POLICY IF EXISTS "venta_items_insert" ON public.venta_items;
DROP POLICY IF EXISTS "venta_items_update" ON public.venta_items;
DROP POLICY IF EXISTS "venta_items_delete" ON public.venta_items;

CREATE POLICY "venta_items_select" ON public.venta_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "venta_items_insert" ON public.venta_items FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado', 'cajero'));

CREATE POLICY "venta_items_update" ON public.venta_items FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "venta_items_delete" ON public.venta_items FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 10. productos ──────────────────────────────────────────
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_select"       ON public.productos;
DROP POLICY IF EXISTS "productos_select_all"   ON public.productos;
DROP POLICY IF EXISTS "productos_insert_admin" ON public.productos;
DROP POLICY IF EXISTS "productos_update_admin" ON public.productos;
DROP POLICY IF EXISTS "productos_delete_admin" ON public.productos;

CREATE POLICY "productos_select" ON public.productos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "productos_insert_admin" ON public.productos FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado'));

CREATE POLICY "productos_update_admin" ON public.productos FOR UPDATE
  TO authenticated USING (get_user_role_text() IN ('admin', 'encargado'));

CREATE POLICY "productos_delete_admin" ON public.productos FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 11. elaboracion_supremas ───────────────────────────────
ALTER TABLE public.elaboracion_supremas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "elab_sup_select" ON public.elaboracion_supremas;
DROP POLICY IF EXISTS "elab_sup_insert" ON public.elaboracion_supremas;
DROP POLICY IF EXISTS "elab_sup_update" ON public.elaboracion_supremas;
DROP POLICY IF EXISTS "elab_sup_delete" ON public.elaboracion_supremas;

CREATE POLICY "elab_sup_select" ON public.elaboracion_supremas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "elab_sup_insert" ON public.elaboracion_supremas FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() IN ('admin', 'encargado', 'operario'));

CREATE POLICY "elab_sup_update" ON public.elaboracion_supremas FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "elab_sup_delete" ON public.elaboracion_supremas FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 12. configuracion_rendimiento ─────────────────────────
ALTER TABLE public.configuracion_rendimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_select"     ON public.configuracion_rendimiento;
DROP POLICY IF EXISTS "config_all_admin"  ON public.configuracion_rendimiento;

CREATE POLICY "config_select" ON public.configuracion_rendimiento FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "config_all_admin" ON public.configuracion_rendimiento FOR ALL
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 13. usuarios ───────────────────────────────────────────
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select"        ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_own"    ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_admin"  ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert"        ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_admin"  ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_service" ON public.usuarios;
DROP POLICY IF EXISTS "service_role_insert_usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "service_role_update_usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update"        ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin"  ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_service" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete"        ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin"  ON public.usuarios;

-- Cualquier usuario autenticado lee su propio perfil (necesario para UserContext)
CREATE POLICY "usuarios_select_own" ON public.usuarios FOR SELECT
  TO authenticated USING (id = auth.uid());

-- Admin y encargado ven todos los usuarios
CREATE POLICY "usuarios_select_all" ON public.usuarios FOR SELECT
  TO authenticated USING (get_user_role_text() IN ('admin', 'encargado'));

-- El trigger handle_new_user necesita insertar (corre como service_role)
CREATE POLICY "usuarios_insert_service" ON public.usuarios FOR INSERT
  TO service_role WITH CHECK (true);

-- Solo admin puede insertar manualmente
CREATE POLICY "usuarios_insert_admin" ON public.usuarios FOR INSERT
  TO authenticated WITH CHECK (get_user_role_text() = 'admin');

-- Solo admin puede actualizar (y service_role para el trigger)
CREATE POLICY "usuarios_update_service" ON public.usuarios FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "usuarios_update_admin" ON public.usuarios FOR UPDATE
  TO authenticated USING (get_user_role_text() = 'admin');

CREATE POLICY "usuarios_delete_admin" ON public.usuarios FOR DELETE
  TO authenticated USING (get_user_role_text() = 'admin');

-- ── 14. auditoria ──────────────────────────────────────────
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_select" ON public.auditoria;
DROP POLICY IF EXISTS "auditoria_insert" ON public.auditoria;

CREATE POLICY "auditoria_select" ON public.auditoria FOR SELECT
  TO authenticated USING (get_user_role_text() IN ('admin', 'encargado'));

CREATE POLICY "auditoria_insert" ON public.auditoria FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── VERIFICAR RESULTADO ────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
