-- ============================================================
--  FIX: trigger procesar_produccion
--  Mapea correctamente las columnas de produccion → productos en stock
--
--  Columna DB   →  Producto en stock
--  pata_muslo   →  pata_muslo_fresca
--  pechuga      →  filet_fresco       (llamado "Filet fresco" en la UI)
--  alitas       →  alitas
--  carcasa      →  carcasa
--  menudos      →  menudos
-- ============================================================

CREATE OR REPLACE FUNCTION public.procesar_produccion()
RETURNS TRIGGER AS $$
DECLARE
  v_peso_estimado   NUMERIC;
  v_rendimiento     NUMERIC;
  v_alerta          BOOLEAN := FALSE;
  v_alerta_detalle  TEXT := '';
  v_stock_anterior  NUMERIC;
  v_producto_id     UUID;
  v_kilos_corte     NUMERIC;

  -- col_db: nombre de la columna en la tabla produccion
  -- prod_nombre: nombre del producto en la tabla productos
  col_db      TEXT;
  prod_nombre TEXT;

  -- Mapeo explícito: columna → nombre del producto en stock
  columnas    TEXT[] := ARRAY['pata_muslo','pechuga','alitas','carcasa','menudos'];
  productos_map TEXT[] := ARRAY['pata_muslo_fresca','filet_fresco','alitas','carcasa','menudos'];
  i           INT;
BEGIN
  -- Obtener peso estimado de la orden
  SELECT od.peso_estimado INTO v_peso_estimado
  FROM public.ordenes_desposte od WHERE od.id = NEW.orden_id;

  -- Calcular rendimiento real
  IF v_peso_estimado IS NOT NULL AND v_peso_estimado > 0 THEN
    v_rendimiento := ROUND((NEW.peso_total_producido / v_peso_estimado) * 100, 2);
  END IF;
  NEW.rendimiento_real := v_rendimiento;

  -- Verificar alertas de rendimiento
  IF v_rendimiento IS NOT NULL AND v_rendimiento < 85 THEN
    v_alerta := TRUE;
    v_alerta_detalle := v_alerta_detalle || 'Rendimiento total bajo (' || v_rendimiento || '%). ';
  END IF;
  IF v_rendimiento IS NOT NULL AND v_rendimiento > 105 THEN
    v_alerta := TRUE;
    v_alerta_detalle := v_alerta_detalle || 'Rendimiento anormalmente alto (' || v_rendimiento || '%). ';
  END IF;

  NEW.tiene_alerta   := v_alerta;
  NEW.alerta_detalle := NULLIF(TRIM(v_alerta_detalle), '');

  -- Actualizar stock usando el mapeo correcto
  FOR i IN 1 .. array_length(columnas, 1) LOOP
    col_db      := columnas[i];
    prod_nombre := productos_map[i];

    -- Leer los kilos del campo correspondiente de la fila nueva
    EXECUTE format('SELECT ($1).%I', col_db) INTO v_kilos_corte USING NEW;

    IF v_kilos_corte IS NULL OR v_kilos_corte = 0 THEN
      CONTINUE;
    END IF;

    -- Buscar el producto por nombre
    SELECT sp.kilos, p.id
      INTO v_stock_anterior, v_producto_id
    FROM public.stock_productos sp
    JOIN public.productos p ON p.id = sp.producto_id
    WHERE p.nombre = prod_nombre;

    IF v_producto_id IS NOT NULL THEN
      UPDATE public.stock_productos
        SET kilos = kilos + v_kilos_corte,
            updated_at = NOW()
      WHERE producto_id = v_producto_id;

      INSERT INTO public.movimientos_stock
        (producto_id, tipo, kilos, kilos_anterior, kilos_nuevo,
         referencia_tipo, referencia_id, usuario_id)
      VALUES
        (v_producto_id, 'ingreso', v_kilos_corte,
         v_stock_anterior, v_stock_anterior + v_kilos_corte,
         'produccion', NEW.id, NEW.registrado_por);
    END IF;
  END LOOP;

  -- Marcar orden como completada
  UPDATE public.ordenes_desposte
    SET estado = 'completada', fecha_proceso = NOW()
  WHERE id = NEW.orden_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Verificar que el trigger sigue activo
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_procesar_produccion';
