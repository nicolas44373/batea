"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getStock, getUsuarios, insertOrdenElaboracionSupremas } from "@/lib/supabase/queries";
import { formatKilos } from "@/lib/utils";
import type { VStockActual, Usuario } from "@/types";

const TIPOS_FILET = [
  { value: "filet_fresco",   label: "Filet fresco" },
  { value: "filet_congelado",label: "Filet congelado" },
] as const;

const schema = z.object({
  tipo_filet:      z.enum(["pechuga", "filet_fresco", "filet_congelado"]),
  kilos_separados: z.coerce.number().positive("Debe ser mayor a 0"),
  operario_id:     z.string().optional(),
  notas:           z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  usuarioId: string;
  onSuccess?: () => void;
}

export function IniciarLoteSupremasForm({ usuarioId, onSuccess }: Props) {
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

  const tipoFilet      = watch("tipo_filet");
  const kilosSeparados = watch("kilos_separados");

  useEffect(() => {
    Promise.all([getStock(), getUsuarios()]).then(([s, u]) => {
      setStock(s);
      setOperarios(u.filter((x) => x.rol === "operario" || x.rol === "encargado"));
    });
  }, []);

  const stockFilet = stock.find((s) => s.producto === tipoFilet);
  const stockInsuficiente =
    stockFilet !== undefined && kilosSeparados > stockFilet.kilos;

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await insertOrdenElaboracionSupremas({
        tipo_filet: data.tipo_filet,
        kilos_separados: data.kilos_separados,
        operario_id: data.operario_id || undefined,
        notas: data.notas || undefined,
        registrado_por: usuarioId,
      });
      toast.success("Lote de elaboración de supremas iniciado");
      reset({ tipo_filet: "filet_fresco" });
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al iniciar el lote";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Tipo de filet */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Materia prima a separar</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  Stock actual: {formatKilos(stockFilet.kilos)}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <Input
        label="Kilos de filet a separar"
        type="number"
        step="0.001"
        min="0.001"
        placeholder="0.000"
        hint={stockFilet ? `Disponible: ${formatKilos(stockFilet.kilos)}` : undefined}
        error={errors.kilos_separados?.message}
        {...register("kilos_separados")}
      />

      {stockInsuficiente && stockFilet && (
        <Alert variant="warning">
          Superás el filet en stock ({formatKilos(stockFilet.kilos)}). El saldo de stock quedará negativo en el sistema.
        </Alert>
      )}

      <Select
        label="Operario a cargo (opcional)"
        placeholder="Sin asignar"
        options={operarios.map((u) => ({ value: u.id, label: u.nombre }))}
        {...register("operario_id")}
      />

      <Input
        label="Notas (opcional)"
        placeholder="Observaciones iniciales del lote..."
        {...register("notas")}
      />

      <Button type="submit" loading={loading} fullWidth>
        Iniciar lote
      </Button>
    </form>
  );
}
