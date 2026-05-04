-- ============================================================
--  FIX DEFINITIVO: get_user_role + RLS básico usuarios
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Recrear la función get_user_role con SECURITY DEFINER garantizado
--    Usamos CREATE OR REPLACE para no romper las políticas que dependen de ella
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. Exponer a los roles correctos
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;

-- 3. Asegurarse de que la tabla usuarios tiene RLS activo
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- 4. Política SELECT: cada usuario puede leer su propio perfil
DROP POLICY IF EXISTS "usuarios_select"         ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_own"      ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_all"      ON public.usuarios;

-- Simplificado: cualquier usuario autenticado puede leer su propio row
-- (evitamos llamar get_user_role() en la política SELECT de usuarios para no circular)
CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admin y encargado pueden ver todos
CREATE POLICY "usuarios_select_admin"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'encargado'));

-- 5. Políticas INSERT / UPDATE / DELETE
DROP POLICY IF EXISTS "usuarios_insert"                   ON public.usuarios;
DROP POLICY IF EXISTS "service_role_insert_usuarios"      ON public.usuarios;
DROP POLICY IF EXISTS "service_role_update_usuarios"      ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update"                   ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete"                   ON public.usuarios;

CREATE POLICY "usuarios_insert_admin"
  ON public.usuarios FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "usuarios_insert_service"
  ON public.usuarios FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "usuarios_update_admin"
  ON public.usuarios FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin');

CREATE POLICY "usuarios_update_service"
  ON public.usuarios FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "usuarios_delete_admin"
  ON public.usuarios FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- 6. Verificar resultado
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'usuarios'
ORDER BY cmd;
