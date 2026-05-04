-- ============================================================
-- FIX: handle_new_user trigger + RLS para usuarios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Reemplazar la función con search_path correcto y manejo de errores
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
  ON CONFLICT (id) DO NOTHING;  -- evitar error si ya existe

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- No bloquear la creación del usuario si el insert falla
  RAISE WARNING 'handle_new_user error: % — %', SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;  -- crítico: sin esto no encuentra las tablas

-- 2. Asegurarse de que el trigger esté bien creado
DROP TRIGGER IF EXISTS trg_auth_new_user ON auth.users;
CREATE TRIGGER trg_auth_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Agregar política que permite a service_role insertar en usuarios
--    (el trigger corre como service_role en Supabase)
DROP POLICY IF EXISTS "service_role_insert_usuarios" ON public.usuarios;
CREATE POLICY "service_role_insert_usuarios" ON public.usuarios
  FOR INSERT TO service_role
  WITH CHECK (true);

-- 4. También permitir al service_role actualizar (por si acaso)
DROP POLICY IF EXISTS "service_role_update_usuarios" ON public.usuarios;
CREATE POLICY "service_role_update_usuarios" ON public.usuarios
  FOR UPDATE TO service_role
  USING (true);

-- Verificar que el trigger quedó activo
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';
