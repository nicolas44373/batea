"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getLotes, getUsuarios, insertOrden } from "@/lib/supabase/queries";
import { formatFecha } from "@/lib/utils";
import type { LoteCajones, Usuario } from "@/types";

const schema = z.object({
  lote_id: z.string().uuid("Seleccione un lote"),
  cantidad_cajones: z.coerce.number().int().positive("Debe ser mayor a 0"),
  operario_id: z.string().optional(),
  notas: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface OrdenDesposteFormProps {
  usuarioId: string;
  onSuccess?: () => void;
}

export function OrdenDesposteForm({ usuarioId, onSuccess }: OrdenDesposteFormProps) {
  const [lotes, setLotes] = useState<LoteCajones[]>([]);
  const [operarios, setOperarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLote, setSelectedLote] = useState<LoteCajones | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const loteId = watch("lote_id");
  const cantCajones = watch("cantidad_cajones");

  useEffect(() => {
    Promise.all([getLotes(), getUsuarios()]).then(([ls, us]) => {
      // Solo pollo entero requiere desposte; filet y pata/muslo ya ingresan al stock
      setLotes(ls.filter((l) => l.cajones_disponibles > 0 && l.tipo_producto === "pollo_entero"));
      setOperarios(us.filter((u) => u.rol === "operario" || u.rol === "encargado"));
    });
  }, []);

  useEffect(() => {
    if (loteId) {
      const lote = lotes.find((l) => l.id === loteId);
      setSelectedLote(lote ?? null);
    }
  }, [loteId, lotes]);

  const pesoEstimadoNum =
    selectedLote && cantCajones && selectedLote.cantidad_cajones > 0
      ? (selectedLote.peso_total / selectedLote.cantidad_cajones) * Number(cantCajones)
      : 0;
  const pesoEstimado = pesoEstimadoNum > 0 ? pesoEstimadoNum.toFixed(2) : null;

  const onSubmit = async (data: FormData) => {
    if (selectedLote && data.cantidad_cajones > selectedLote.cajones_disponibles) {
      toast.error(`Sólo hay ${selectedLote.cajones_disponibles} cajones disponibles`);
      return;
    }
    setLoading(true);
    try {
      const lote = lotes.find((l) => l.id === data.lote_id);
      const pesoPorCajon = lote && lote.cantidad_cajones > 0
        ? lote.peso_total / lote.cantidad_cajones
        : 0;
      const peso_estimado = parseFloat((pesoPorCajon * data.cantidad_cajones).toFixed(3));

      await insertOrden({
        ...data,
        usuario_id: usuarioId,
        fecha_orden: new Date().toISOString().split("T")[0],
        peso_estimado,
      });
      toast.success("Orden de desposte creada");
      reset();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear orden";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Lote de cajones"
        placeholder="Seleccionar lote disponible"
        options={lotes.map((l) => ({
          value: l.id,
          label: `${l.marca} — ${l.calibre} — ${l.cajones_disponibles} cajones disp. (${formatFecha(l.fecha)})`,
        }))}
        error={errors.lote_id?.message}
        {...register("lote_id")}
      />

      {selectedLote && (
        <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Calibre</p>
            <p className="font-semibold">{selectedLote.calibre}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Cajones disponibles</p>
            <p className="font-semibold text-green-700">{selectedLote.cajones_disponibles}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Peso promedio / cajón</p>
            <p className="font-semibold">{selectedLote.peso_promedio?.toFixed(2)} kg</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Cantidad de cajones a procesar"
          type="number"
          min="1"
          step="1"
          placeholder="0"
          hint={
            selectedLote
              ? `Máximo: ${selectedLote.cajones_disponibles}`
              : undefined
          }
          error={errors.cantidad_cajones?.message}
          {...register("cantidad_cajones")}
        />

        {pesoEstimado && (
          <div className="flex items-end">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 w-full">
              <p className="text-xs text-brand-700 font-medium">Peso estimado a procesar</p>
              <p className="text-xl font-bold text-brand-800">{pesoEstimado} kg</p>
            </div>
          </div>
        )}
      </div>

      <Select
        label="Operario asignado (opcional)"
        placeholder="Sin asignar"
        options={operarios.map((u) => ({ value: u.id, label: u.nombre }))}
        {...register("operario_id")}
      />

      <Textarea
        label="Notas (opcional)"
        placeholder="Instrucciones, observaciones..."
        {...register("notas")}
      />

      {errors.cantidad_cajones && (
        <Alert variant="warning">{errors.cantidad_cajones.message}</Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={() => reset()}>
          Limpiar
        </Button>
        <Button type="submit" loading={loading}>
          Crear orden
        </Button>
      </div>
    </form>
  );
}
