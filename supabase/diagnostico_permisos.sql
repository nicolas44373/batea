-- ============================================================
--  DIAGNÓSTICO COMPLETO DE PERMISOS
--  Ejecutar en Supabase SQL Editor (como postgres/admin)
-- ============================================================

-- 1. Ver usuarios y sus roles
SELECT id, email, nombre, rol FROM public.usuarios ORDER BY rol;

-- 2. Ver TODAS las políticas RLS activas
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 3. Verificar que la función get_user_role existe y es SECURITY DEFINER
SELECT
  routine_name,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_user_role';

-- 4. Simular get_user_role para el admin
--    (reemplazá el UUID por el del admin)
SELECT rol
FROM public.usuarios
WHERE id = '24a2fed4-7c03-466a-b6f4-6cd5d2fa6292';

-- 5. Si el admin puede leer su propio perfil via RLS
--    Temporalmente impersonar usando SET LOCAL (solo Supabase)
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"24a2fed4-7c03-466a-b6f4-6cd5d2fa6292","role":"authenticated"}';
SELECT rol FROM public.usuarios WHERE id = '24a2fed4-7c03-466a-b6f4-6cd5d2fa6292';
RESET role;

-- 6. Si las políticas de UPDATE están correctas para admin en lotes_cajones
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'lotes_cajones'
  AND cmd IN ('UPDATE','DELETE');
