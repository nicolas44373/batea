-- ============================================================
--  FIX: Verificar y corregir rol del usuario admin
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. VER qué usuarios existen y qué rol tienen en la tabla pública
SELECT
  u.id,
  u.email,
  u.nombre,
  u.rol,
  u.activo,
  au.email AS auth_email,
  au.raw_user_meta_data->>'rol' AS meta_rol,
  au.created_at AS auth_created_at
FROM public.usuarios u
JOIN auth.users au ON au.id = u.id
ORDER BY au.created_at;

-- 2. Ver si el usuario admin en auth.users tiene el perfil en public.usuarios
--    (si la query anterior devuelve vacío, el trigger no creó el perfil)

-- ── PASO A: Si la fila SÍ existe pero el rol es incorrecto ────────────
-- Reemplazá el email con el tuyo y ejecutá:
UPDATE public.usuarios
SET rol = 'admin'
WHERE email = 'TU_EMAIL_ADMIN_AQUI';       -- ← cambiar por tu email

-- ── PASO B: Si la fila NO existe (no apareció en la query anterior) ───
-- Descomentá y ejecutá estas líneas reemplazando los datos:
/*
INSERT INTO public.usuarios (id, nombre, email, rol, activo)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'nombre', split_part(email,'@',1)),
  email,
  'admin',
  TRUE
FROM auth.users
WHERE email = 'TU_EMAIL_ADMIN_AQUI'       -- ← cambiar por tu email
ON CONFLICT (id) DO UPDATE SET rol = 'admin';
*/

-- 3. Verificar que get_user_role() retorna el rol correcto
--    (ejecutar estando logueado — solo funciona con sesión activa de ese usuario)
-- SELECT get_user_role();

-- 4. Confirmar resultado final
SELECT id, email, nombre, rol
FROM public.usuarios
ORDER BY rol, nombre;
