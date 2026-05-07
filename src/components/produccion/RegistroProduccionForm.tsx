"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { insertProduccion } from "@/lib/supabase/queries";
import { CORTES, formatKilos, rendimientoBg, rendimientoColor } from "@/lib/utils";
import type { OrdenDesposte } from "@/types";

const schema = z.object({
  pata_muslo:       z.coerce.number().min(0, "Debe ser >= 0"),
  pechuga:          z.coerce.number().min(0),
  pechuga_con_piel: z.coerce.number().min(0),
  alitas:           z.coerce.number().min(0),
  carcasa:          z.coerce.number().min(0),
  menudos:          z.coerce.number().min(0),
  pollo_entero:     z.coerce.number().min(0),
});

type FormData = z.infer<typeof schema>;

interface RegistroProduccionFormProps {
  orden: OrdenDesposte;
  usuarioId: string;
  onSuccess?: () => void;
}

export function RegistroProduccionForm({
  orden,
  usuarioId,
  onSuccess,
}: RegistroProduccionFormProps) {
  const [loading, setLoading] = useState(false);
  const [rendimiento, setRendimiento] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      pata_muslo:       0,
      pechuga:          0,
      pechuga_con_piel: 0,
      alitas:           0,
      carcasa:          0,
      menudos:          0,
      pollo_entero:     0,
    },
  });

  const values = watch();
  const totalProducido = Object.values(values).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );

  useEffect(() => {
    const base = orden.peso_estimado ?? 0;
    if (base > 0 && totalProducido > 0) {
      setRendimiento(Math.round((totalProducido / base) * 1000) / 10);
    } else {
      setRendimiento(null);
    }
  }, [totalProducido, orden.peso_estimado]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await insertProduccion({
        orden_id: orden.id,
        registrado_por: usuarioId,
        ...data,
      });
      toast.success("Producción registrada correctamente");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar producción";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Info de la orden */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
        <div>
          <p className="text-xs text-gray-500">Lote</p>
          <p className="font-semibold">{orden.lote?.marca ?? "—"}</p>
          <p className="text-xs text-gray-400">{orden.lote?.calibre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Cajones</p>
          <p className="font-semibold">{orden.cantidad_cajones}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Peso estimado</p>
          <p className="font-semibold">{formatKilos(orden.peso_estimado)}</p>
        </div>
      </div>

      {/* Inputs por corte */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Kilos obtenidos por corte
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {CORTES.map((corte) => (
            <Input
              key={corte.key}
              label={corte.label}
              type="number"
              step="0.001"
              min="0"
              placeholder="0.000"
              error={(errors as Record<string, { message?: string }>)[corte.key]?.message}
              {...register(corte.key)}
            />
          ))}
        </div>
      </div>

      {/* Totales y rendimiento */}
      <div className={`rounded-lg border p-4 ${rendimiento !== null ? rendimientoBg(rendimiento) : "bg-gray-50 border-gray-200"}`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-600">Total producido</p>
            <p className="text-2xl font-bold text-gray-900">{totalProducido.toFixed(3)} kg</p>
          </div>
          {rendimiento !== null ? (
            <div>
              <p className="text-xs font-medium text-gray-600">Rendimiento</p>
              <p className={`text-2xl font-bold ${rendimientoColor(rendimiento)}`}>
                {rendimiento}%
              </p>
              <p className="text-xs text-gray-500">
                Esperado: 85–100% · Base: {formatKilos(orden.peso_estimado)}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-gray-500">Rendimiento</p>
              <p className="text-sm text-gray-400 mt-1">
                {(orden.peso_estimado ?? 0) === 0
                  ? "Sin peso estimado en la orden"
                  : "Ingresá los kilos producidos"}
              </p>
            </div>
          )}
        </div>

        {rendimiento !== null && rendimiento < 85 && (
          <Alert variant="danger" className="mt-3">
            <strong>Rendimiento bajo ({rendimiento}%).</strong> Se generará una alerta
            en el sistema. Verifique los datos antes de confirmar.
          </Alert>
        )}
        {rendimiento !== null && rendimiento > 105 && (
          <Alert variant="warning" className="mt-3">
            <strong>Rendimiento anormalmente alto ({rendimiento}%).</strong> Posible
            error en el ingreso de datos. Verifique antes de confirmar.
          </Alert>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" loading={loading} fullWidth>
          Confirmar producción
        </Button>
      </div>
    </form>
  );
}
