"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getStock, getUsuarios, insertElaboracionSupremas } from "@/lib/supabase/queries";
import { formatKilos, rendimientoBg, rendimientoColor } from "@/lib/utils";
import type { VStockActual, Usuario } from "@/types";

const TIPOS_FILET = [
  { value: "filet_fresco",   label: "Filet fresco" },
  { value: "filet_congelado",label: "Filet congelado" },
] as const;

const schema = z.object({
  tipo_filet:     z.enum(["pechuga", "filet_fresco", "filet_congelado"]),
  kilos_filet:    z.coerce.number().positive("Debe ser mayor a 0"),
  kilos_supremas: z.coerce.number().positive("Debe ser mayor a 0"),
  operario_id:    z.string().optional(),
  notas:          z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  usuarioId: string;
  onSuccess?: () => void;
}

export function ElaboracionSupremasForm({ usuarioId, onSuccess }: Props) {
  const [stock, setStock]         = useState<VStockActual[]>([]);
  const [operarios, setOperarios] = useState<Usuario[]>([]);
  const [loading, setLoading]     = useState(false);

  const {
    register, handleSubmit, watch, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo_filet: "filet_fresco" },
  });

  const tipoFilet    = watch("tipo_filet");
  const kilosFilet   = watch("kilos_filet");
  const kilosSuprem  = watch("kilos_supremas");

  useEffect(() => {
    Promise.all([getStock(), getUsuarios()]).then(([s, u]) => {
      setStock(s);
      setOperarios(u.filter((x) => x.rol === "operario" || x.rol === "encargado"));
    });
  }, []);

  const stockFilet = stock.find((s) => s.producto === tipoFilet);
  const rendimiento =
    kilosFilet && kilosSuprem && kilosFilet > 0
      ? Math.round((kilosSuprem / kilosFilet) * 1000) / 10
      : null;

  const stockInsuficiente =
    stockFilet !== undefined && kilosFilet > stockFilet.kilos;

  const onSubmit = async (data: FormData) => {
    if (stockInsuficiente) {
      toast.error(`Stock insuficiente de ${tipoFilet}`);
      return;
    }
    setLoading(true);
    try {
      await insertElaboracionSupremas({
        ...data,
        registrado_por: usuarioId,
      });
      toast.success("Elaboración de supremas registrada");
      reset({ tipo_filet: "filet_fresco" });
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Tipo de filet */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Materia prima (filet de origen)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIPOS_FILET.map((t) => (
            <label
              key={t.value}
              className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                tipoFilet === t.value
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input type="radio" value={t.value} {...register("tipo_filet")} className="sr-only" />
              <span className="text-sm font-semibold text-gray-900">{t.label}</span>
              {stockFilet && t.value === tipoFilet && (
                <span className={`text-xs font-medium ${stockFilet.kilos < 1 ? "text-red-600" : "text-green-700"}`}>
                  Stock: {formatKilos(stockFilet.kilos)}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Kilos de filet a usar"
          type="number"
          step="0.001"
          min="0.001"
          placeholder="0.000"
          hint={stockFilet ? `Disponible: ${formatKilos(stockFilet.kilos)}` : undefined}
          error={
            stockInsuficiente
              ? `Máximo disponible: ${formatKilos(stockFilet!.kilos)}`
              : errors.kilos_filet?.message
          }
          {...register("kilos_filet")}
        />

        <Input
          label="Kilos de supremas obtenidas"
          type="number"
          step="0.001"
          min="0.001"
          placeholder="0.000"
          hint="El resultado después del procesado"
          error={errors.kilos_supremas?.message}
          {...register("kilos_supremas")}
        />
      </div>

      {/* Rendimiento en tiempo real */}
      {rendimiento !== null && (
        <div className={`rounded-lg border p-4 ${rendimientoBg(rendimiento)}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Rendimiento</p>
              <p className={`text-3xl font-bold ${rendimientoColor(rendimiento)}`}>
                {rendimiento}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Esperado para supremas: 65–85%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Merma</p>
              <p className="text-lg font-semibold text-gray-700">
                {(kilosFilet - kilosSuprem).toFixed(3)} kg
              </p>
              <p className="text-xs text-gray-400">
                ({(100 - rendimiento).toFixed(1)}%)
              </p>
            </div>
          </div>

          {rendimiento < 60 && (
            <Alert variant="danger" className="mt-3">
              Rendimiento muy bajo. Revisá los kilos ingresados.
            </Alert>
          )}
          {rendimiento > 90 && (
            <Alert variant="warning" className="mt-3">
              Rendimiento anormalmente alto. ¿Los kilos son correctos?
            </Alert>
          )}
        </div>
      )}

      <Select
        label="Operario (opcional)"
        placeholder="Sin asignar"
        options={operarios.map((u) => ({ value: u.id, label: u.nombre }))}
        {...register("operario_id")}
      />

      <Input
        label="Notas (opcional)"
        placeholder="Observaciones del proceso..."
        {...register("notas")}
      />

      <Button type="submit" loading={loading} fullWidth disabled={stockInsuficiente}>
        Registrar elaboración
      </Button>
    </form>
  );
}
