"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { finalizarOrdenElaboracionSupremas } from "@/lib/supabase/queries";
import { formatKilos } from "@/lib/utils";
import type { OrdenElaboracionSupremas } from "@/types";

const schema = z.object({
  kilos_devueltos: z.coerce.number().min(0, "Debe ser mayor o igual a 0"),
  notas:           z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  orden: OrdenElaboracionSupremas;
  onSuccess?: () => void;
}

export function FinalizarLoteSupremasForm({ orden, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const restanteTeorico = Math.max(0, orden.kilos_separados - orden.kilos_procesados);

  const {
    register, handleSubmit, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      kilos_devueltos: parseFloat(restanteTeorico.toFixed(3)),
    },
  });

  const kilosDevueltos = watch("kilos_devueltos");

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await finalizarOrdenElaboracionSupremas(orden.id, data.kilos_devueltos, data.notas);
      toast.success("Lote finalizado correctamente");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al finalizar el lote";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const diferencia = restanteTeorico - kilosDevueltos;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Resumen del Lote */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 font-medium">Materia prima original</p>
          <p className="text-base font-semibold text-gray-900">
            {formatKilos(orden.kilos_separados)} ({orden.tipo_filet === "filet_fresco" ? "Fresco" : "Congelado"})
          </p>
        </div>
        <div>
          <p className="text-gray-500 font-medium">Total Procesado</p>
          <p className="text-base font-semibold text-gray-900">
            {formatKilos(orden.kilos_procesados)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 font-medium">Restante Teórico</p>
          <p className="text-base font-semibold text-gray-800">
            {formatKilos(restanteTeorico)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 font-medium">Supremas Obtenidas</p>
          <p className="text-base font-bold text-brand-700">
            {formatKilos(orden.kilos_supremas)}
          </p>
        </div>
      </div>

      <Input
        label="Kilos devueltos al stock general"
        type="number"
        step="0.001"
        min="0"
        hint="Kilos físicos de filet sobrantes que regresarán al stock general."
        error={errors.kilos_devueltos?.message}
        {...register("kilos_devueltos")}
      />

      {diferencia > 0 && (
        <Alert variant="warning">
          Se registrará una pérdida (merma física adicional) de{" "}
          <strong className="font-semibold">{formatKilos(diferencia)}</strong> que no regresará al inventario general.
        </Alert>
      )}

      {diferencia < 0 && (
        <Alert variant="danger">
          No puedes devolver más del restante disponible en el lote ({formatKilos(restanteTeorico)}).
        </Alert>
      )}

      <Input
        label="Notas de cierre (opcional)"
        placeholder="Observaciones de finalización del lote..."
        {...register("notas")}
      />

      <Button
        type="submit"
        loading={loading}
        disabled={diferencia < 0}
        fullWidth
      >
        Finalizar lote y guardar sobrante
      </Button>
    </form>
  );
}
