-- ============================================================
--  INICIALIZAR stock_productos
--  Crea una fila en 0 kg para cada producto que no tenga stock todavía
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Ver qué productos existen
SELECT id, nombre, activo FROM public.productos ORDER BY nombre;

-- 2. Ver qué hay en stock_productos ahora
SELECT sp.id, p.nombre, sp.kilos
FROM public.stock_productos sp
JOIN public.productos p ON p.id = sp.producto_id;

-- 3. Insertar fila de stock en 0 para cada producto que no tenga una todavía
INSERT INTO public.stock_productos (producto_id, kilos)
SELECT p.id, 0
FROM public.productos p
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_productos sp WHERE sp.producto_id = p.id
);

-- 4. Verificar resultado final
SELECT
  p.nombre                          AS producto,
  CASE p.nombre
    WHEN 'filet_fresco'      THEN 'Filet fresco'
    WHEN 'pata_muslo_fresca' THEN 'Pata/Muslo fresca'
    WHEN 'alitas'            THEN 'Alitas'
    WHEN 'carcasa'           THEN 'Carcasa'
    WHEN 'menudos'           THEN 'Menudos'
    WHEN 'pollo_entero'      THEN 'Pollo entero'
    WHEN 'supremas'          THEN 'Supremas'
    WHEN 'pechuga'           THEN 'Filet fresco (desposte)'
    WHEN 'pata_muslo'        THEN 'Pata/Muslo (desposte)'
    ELSE p.nombre
  END                               AS descripcion,
  ROUND(sp.kilos::numeric, 3)       AS kilos
FROM public.stock_productos sp
JOIN public.productos p ON p.id = sp.producto_id
ORDER BY p.nombre;
