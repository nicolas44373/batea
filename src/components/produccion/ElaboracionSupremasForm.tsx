"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getStock, getUsuarios, insertElaboracionSupremas } from "@/lib/supabase/queries";
import { formatKilos, rendimientoBg, rendimientoColor } from "@/lib/utils";
import type { VStockActual, Usuario, OrdenElaboracionSupremas } from "@/types";

const TIPOS_FILET = [
  { value: "filet_fresco",   label: "Filet fresco" },
  { value: "filet_congelado",label: "Filet congelado" },
] as const;

interface Props {
  usuarioId: string;
  orden?: OrdenElaboracionSupremas;
  onSuccess?: () => void;
}

export function ElaboracionSupremasForm({ usuarioId, orden, onSuccess }: Props) {
  const [stock, setStock]         = useState<VStockActual[]>([]);
  const [operarios, setOperarios] = useState<Usuario[]>([]);
  const [loading, setLoading]     = useState(false);

  // Schema reactivo según si hay orden o no
  const schema = useMemo(() => {
    const o = orden;
    return z.object({
      tipo_filet:     z.enum(["pechuga", "filet_fresco", "filet_congelado"]),
      kilos_filet:    z.coerce.number().positive("Debe ser mayor a 0").refine(
        (val) => {
          if (!o) return true;
          const restante = o.kilos_separados - o.kilos_procesados;
          // Pequeño margen de tolerancia para decimales (1 gramo)
          return val <= (restante + 0.001);
        },
        {
          message: `Supera el restante disponible en el lote (${formatKilos(
            o ? Math.max(0, o.kilos_separados - o.kilos_procesados) : 0
          )})`,
        }
      ),
      kilos_supremas: z.coerce.number().positive("Debe ser mayor a 0"),
      operario_id:    z.string().optional(),
      notes:          z.string().optional(), // mapea a notas en onSubmit
    });
  }, [orden]);

  type FormData = z.infer<typeof schema>;

  const {
    register, handleSubmit, watch, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_filet: orden ? orden.tipo_filet : "filet_fresco",
      operario_id: orden ? orden.operario_id : undefined,
    },
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

  // Solo se evalúa si NO hay orden (registro directo)
  const stockInsuficiente =
    !orden && stockFilet !== undefined && kilosFilet > stockFilet.kilos;

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await insertElaboracionSupremas({
        tipo_filet: data.tipo_filet,
        kilos_filet: data.kilos_filet,
        kilos_supremas: data.kilos_supremas,
        operario_id: data.operario_id || undefined,
        notas: data.notes || undefined,
        orden_elaboracion_id: orden ? orden.id : undefined,
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
        {orden ? (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 text-sm">
            <p className="text-brand-900 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
              Procesando sobre Lote Activo
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-brand-800">
              <p>
                Materia prima: <strong className="font-semibold">{orden.tipo_filet === "filet_fresco" ? "Filet fresco" : "Filet congelado"}</strong>
              </p>
              <p>
                Restante en lote: <strong className="font-semibold">{formatKilos(Math.max(0, orden.kilos_separados - orden.kilos_procesados))}</strong>
              </p>
            </div>
            {/* Campo oculto para mantener tipo_filet en el form state */}
            <input type="hidden" value={orden.tipo_filet} {...register("tipo_filet")} />
          </div>
        ) : (
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
                    Stock: {formatKilos(stockFilet.kilos)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Kilos de filet a usar"
          type="number"
          step="0.001"
          min="0.001"
          placeholder="0.000"
          hint={
            orden
              ? `Máximo disponible en lote: ${formatKilos(Math.max(0, orden.kilos_separados - orden.kilos_procesados))}`
              : stockFilet
              ? `Disponible: ${formatKilos(stockFilet.kilos)}`
              : undefined
          }
          error={errors.kilos_filet?.message}
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

      {stockInsuficiente && stockFilet && (
        <Alert variant="warning">
          Superás el filet mostrado en stock ({formatKilos(stockFilet.kilos)}). El saldo de stock del filet quedará negativo en el sistema.
        </Alert>
      )}

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
                {Math.max(0, kilosFilet - kilosSuprem).toFixed(3)} kg
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
        {...register("notes")}
      />

      <Button type="submit" loading={loading} fullWidth>
        Registrar pesada
      </Button>
    </form>
  );
}
