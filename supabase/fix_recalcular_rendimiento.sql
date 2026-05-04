-- Recalcula peso_estimado en órdenes donde es 0 o null
-- usando el peso promedio por cajón del lote correspondiente
UPDATE ordenes_desposte od
SET    peso_estimado = ROUND(
         (lc.peso_total::numeric / NULLIF(lc.cantidad_cajones, 0)) * od.cantidad_cajones,
         3
       )
FROM   lotes_cajones lc
WHERE  od.lote_id = lc.id
  AND  (od.peso_estimado IS NULL OR od.peso_estimado = 0)
  AND  lc.cantidad_cajones > 0;

-- Recalcula rendimiento_real en todos los registros de producción
-- donde el campo está en 0 o null pero hay peso_estimado disponible
UPDATE produccion p
SET    rendimiento_real = ROUND(
         (p.peso_total_producido::numeric / NULLIF(od.peso_estimado, 0)) * 100,
         2
       )
FROM   ordenes_desposte od
WHERE  p.orden_id = od.id
  AND  od.peso_estimado > 0
  AND  (p.rendimiento_real IS NULL OR p.rendimiento_real = 0)
  AND  p.peso_total_producido > 0;

-- Muestra cuántos registros fueron actualizados
SELECT
  (SELECT COUNT(*) FROM ordenes_desposte WHERE peso_estimado > 0)   AS ordenes_con_peso,
  (SELECT COUNT(*) FROM produccion WHERE rendimiento_real > 0)       AS producciones_con_rendimiento,
  (SELECT COUNT(*) FROM produccion WHERE rendimiento_real IS NULL OR rendimiento_real = 0) AS producciones_sin_rendimiento;
