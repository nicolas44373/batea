"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { insertLote, getMarcasByTipo } from "@/lib/supabase/queries";
import {
  CALIBRES_POLLO,
  TIPOS_CAJON,
  PESO_NOMINAL_CAJON,
  formatMoneda,
} from "@/lib/utils";
import type { MarcaConfiguracion } from "@/types";

const schema = z.object({
  tipo_producto: z.enum([
    "pollo_entero",
    "filet_fresco",
    "filet_congelado",
    "pata_muslo_fresca",
    "pata_muslo_congelada",
  ]),
  marca: z.string().min(1, "Requerido"),
  calibre: z.string().optional(),
  peso_total: z.coerce.number().positive("Debe ser mayor a 0"),
  cantidad_cajones: z.coerce.number().int().positive("Debe ser mayor a 0"),
  costo_por_cajon: z.coerce.number().min(0).default(0),
  fecha: z.string().min(1, "Requerido"),
  notas: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipo_producto === "pollo_entero" && !data.calibre) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Requerido para pollo entero",
      path: ["calibre"],
    });
  }
});

type FormData = z.infer<typeof schema>;

interface IngresoCajonesFormProps {
  usuarioId: string;
  onSuccess?: () => void;
}

export function IngresoCajonesForm({ usuarioId, onSuccess }: IngresoCajonesFormProps) {
  const [loading, setLoading]               = useState(false);
  const [marcasDisp, setMarcasDisp]         = useState<MarcaConfiguracion[]>([]);
  const [marcaSelId, setMarcaSelId]         = useState<string>("");

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_producto:   "pollo_entero",
      costo_por_cajon: 0,
      fecha: new Date().toISOString().split("T")[0],
    },
  });

  const tipoProducto    = watch("tipo_producto");
  const pesoTotal       = watch("peso_total");
  const cantidadCajones = watch("cantidad_cajones");
  const costoPorCajon   = watch("costo_por_cajon");

  const tipoConfig   = TIPOS_CAJON.find((t) => t.value === tipoProducto);
  const esPolloEntero = tipoProducto === "pollo_entero";
  const esDirecto    = !esPolloEntero;

  // Al cambiar tipo, cargar marcas y resetear selección
  useEffect(() => {
    setMarcaSelId("");
    getMarcasByTipo(tipoProducto)
      .then(setMarcasDisp)
      .catch(() => setMarcasDisp([]));

    if (cantidadCajones && cantidadCajones > 0) {
      const pesoNominal = PESO_NOMINAL_CAJON[tipoProducto] ?? 20;
      setValue("peso_total", pesoNominal * cantidadCajones);
    }
    if (!esPolloEntero) {
      setValue("calibre", undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoProducto]);

  // Al cambiar cantidad, actualizar peso total sugerido
  useEffect(() => {
    if (cantidadCajones && cantidadCajones > 0) {
      const pesoNominal = PESO_NOMINAL_CAJON[tipoProducto] ?? 20;
      setValue("peso_total", pesoNominal * cantidadCajones);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidadCajones]);

  // Cuando se selecciona una marca predefinida, auto-completar nombre y costo
  const handleMarcaPredef = (id: string) => {
    setMarcaSelId(id);
    if (!id) return;
    const m = marcasDisp.find((x) => x.id === id);
    if (!m) return;
    setValue("marca", m.nombre);
    setValue("costo_por_cajon", m.costo_por_cajon);
  };

  const pesoProm =
    pesoTotal && cantidadCajones && cantidadCajones > 0
      ? (pesoTotal / cantidadCajones).toFixed(2)
      : "—";

  const costoTotal =
    costoPorCajon && cantidadCajones && cantidadCajones > 0
      ? costoPorCajon * cantidadCajones
      : 0;

  const costoPorKg =
    costoTotal > 0 && pesoTotal > 0
      ? costoTotal / pesoTotal
      : 0;

  const defaultReset = () => {
    reset({
      tipo_producto:   "pollo_entero",
      costo_por_cajon: 0,
      fecha: new Date().toISOString().split("T")[0],
    });
    setMarcaSelId("");
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await insertLote({
        marca:           data.marca,
        tipo_producto:   data.tipo_producto,
        calibre:         data.calibre,
        peso_total:      data.peso_total,
        cantidad_cajones: data.cantidad_cajones,
        costo_por_cajon: data.costo_por_cajon || 0,
        fecha:           data.fecha,
        notas:           data.notas,
        usuario_id:      usuarioId,
      });
      toast.success(
        esDirecto
          ? "Cajones registrados y stock actualizado automáticamente"
          : "Lote registrado correctamente"
      );
      defaultReset();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar lote";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Tipo de cajón */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Tipo de cajón</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIPOS_CAJON.map((tipo) => (
            <label
              key={tipo.value}
              className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                tipoProducto === tipo.value
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                value={tipo.value}
                {...register("tipo_producto")}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-gray-900">{tipo.label}</span>
              <span className="text-xs text-gray-500">
                {tipo.pesoNominal} kg / cajón
                {tipo.requiresCalibration ? " · calibre 5–12" : ""}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Alerta stock directo */}
      {esDirecto && (
        <Alert variant="info">
          Este tipo de cajón <strong>ingresa directo al stock</strong>. No requiere
          orden de desposte. Los kilos se suman automáticamente a la batea al guardar.
        </Alert>
      )}

      {/* Selector de marcas predefinidas */}
      {marcasDisp.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Marcas configuradas para {tipoConfig?.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {marcasDisp.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMarcaPredef(marcaSelId === m.id ? "" : m.id)}
                className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                  marcaSelId === m.id
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
                    : "border-gray-200 hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                <span className="text-sm font-semibold text-gray-900 truncate">{m.nombre}</span>
                <span className="text-xs text-green-700 font-medium">
                  {formatMoneda(m.costo_por_cajon)}/cajón
                </span>
                {m.rendimiento_esperado && (
                  <span className="text-xs text-gray-400">
                    Rend. esperado: {m.rendimiento_esperado}%
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setMarcaSelId(""); setValue("marca", ""); setValue("costo_por_cajon", 0); }}
              className={`flex items-center justify-center p-2.5 rounded-lg border transition-all text-sm text-gray-400 hover:border-gray-300 ${
                !marcaSelId ? "border-dashed border-gray-300 bg-gray-50" : "border-gray-200"
              }`}
            >
              + Otra marca
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Marca / Proveedor"
          placeholder="ej: Avícola San Luis"
          error={errors.marca?.message}
          {...register("marca")}
        />

        {/* Calibre — solo para pollo entero */}
        {esPolloEntero ? (
          <Select
            label="Calibre (pollos por cajón)"
            placeholder="Seleccionar calibre"
            options={CALIBRES_POLLO.map((c) => ({
              value: c,
              label: `Calibre ${c} — ${c} pollos/cajón`,
            }))}
            error={errors.calibre?.message}
            {...register("calibre")}
          />
        ) : (
          <div className="flex items-end">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 w-full">
              <p className="text-xs text-gray-500 font-medium">Tipo</p>
              <p className="text-sm font-semibold text-gray-900">{tipoConfig?.label}</p>
              <p className="text-xs text-gray-400">Sin calibre de ave</p>
            </div>
          </div>
        )}

        <Input
          label="Cantidad de cajones"
          type="number"
          min="1"
          step="1"
          placeholder="0"
          hint={`Peso nominal: ${PESO_NOMINAL_CAJON[tipoProducto] ?? 20} kg × cajón`}
          error={errors.cantidad_cajones?.message}
          {...register("cantidad_cajones")}
        />

        <Input
          label="Peso total real (kg)"
          type="number"
          step="0.001"
          min="0"
          placeholder="0.000"
          hint="Puede diferir del nominal por hielo o inyección"
          error={errors.peso_total?.message}
          {...register("peso_total")}
        />

        {/* Costo por cajón */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Costo por cajón ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("costo_por_cajon")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {costoTotal > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Costo total: <span className="font-semibold">{formatMoneda(costoTotal)}</span>
              {costoPorKg > 0 && (
                <> · <span className="font-semibold">{formatMoneda(costoPorKg)}/kg</span></>
              )}
            </p>
          )}
        </div>

        <Input
          label="Fecha"
          type="date"
          error={errors.fecha?.message}
          {...register("fecha")}
        />

        {/* Peso promedio calculado */}
        <div className="flex items-end">
          <div
            className={`rounded-lg border px-3 py-2 w-full ${
              pesoProm !== "—" &&
              parseFloat(pesoProm) < (PESO_NOMINAL_CAJON[tipoProducto] ?? 20) - 1
                ? "bg-yellow-50 border-yellow-200"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <p className="text-xs text-gray-500 font-medium">Peso promedio / cajón</p>
            <p className="text-xl font-bold text-gray-900">{pesoProm} kg</p>
            {pesoProm !== "—" &&
              parseFloat(pesoProm) < (PESO_NOMINAL_CAJON[tipoProducto] ?? 20) - 1 && (
                <p className="text-xs text-yellow-700 mt-0.5">
                  Bajo el nominal ({PESO_NOMINAL_CAJON[tipoProducto]} kg) — ¿mucho hielo?
                </p>
              )}
          </div>
        </div>
      </div>

      <Textarea
        label="Notas (opcional)"
        placeholder="Observaciones del lote: proveedor, condición, temperatura..."
        {...register("notas")}
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={defaultReset}>
          Limpiar
        </Button>
        <Button type="submit" loading={loading}>
          {esDirecto ? "Registrar e ingresar al stock" : "Registrar lote"}
        </Button>
      </div>
    </form>
  );
}
