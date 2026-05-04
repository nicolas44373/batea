-- ============================================================
--  STOCK ACTUAL EN BATEA
--  Productos visibles en la batea (frescos + alitas, carcasa, etc.)
--  Ejecutar en Supabase SQL Editor
-- ============================================================

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
    ELSE p.nombre
  END                               AS descripcion,
  ROUND(sp.kilos::numeric, 3)       AS kilos_actuales,
  sp.updated_at                     AS ultima_actualizacion
FROM stock_productos sp
JOIN productos p ON p.id = sp.producto_id
WHERE p.nombre IN (
  'filet_fresco',
  'pata_muslo_fresca',
  'alitas',
  'carcasa',
  'menudos',
  'pollo_entero',
  'supremas'
)
  AND p.activo = true
ORDER BY
  CASE p.nombre
    WHEN 'filet_fresco'      THEN 1
    WHEN 'pata_muslo_fresca' THEN 2
    WHEN 'alitas'            THEN 3
    WHEN 'carcasa'           THEN 4
    WHEN 'menudos'           THEN 5
    WHEN 'pollo_entero'      THEN 6
    WHEN 'supremas'          THEN 7
    ELSE 99
  END;
