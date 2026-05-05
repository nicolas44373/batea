"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import {
  getLotes,
  getUsuarios,
  insertOrden,
  getOrdenesCajonesResumen,
} from "@/lib/supabase/queries";
import { formatFecha, cajonesLibresParaNuevaOrden } from "@/lib/utils";
import type { LoteCajones, Usuario } from "@/types";

const schema = z.object({
  lote_id: z.string().uuid("Seleccione un lote"),
  cantidad_cajones: z.coerce.number().int().positive("Debe ser mayor a 0"),
  operario_id: z.string().optional(),
  notas: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

/** Lotes de pollo entero que aún admiten nueva orden */
interface LoteOpcionDesposte {
  lote: LoteCajones;
  /** Cajones que quedan libres para asignar (no cubiertos por órdenes existentes) */
  cajonesEfectivos: number;
}

interface OrdenDesposteFormProps {
  usuarioId: string;
  onSuccess?: () => void;
  /** Al abrir el modal, recarga lotes y órdenes */
  active?: boolean;
}

export function OrdenDesposteForm({ usuarioId, onSuccess, active = true }: OrdenDesposteFormProps) {
  const [opciones, setOpciones] = useState<LoteOpcionDesposte[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(true);
  const [operarios, setOperarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [seleccion, setSeleccion] = useState<LoteOpcionDesposte | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const loteId = watch("lote_id");
  const cantCajones = watch("cantidad_cajones");

  const cargarLotes = useCallback(async () => {
    setLoadingLotes(true);
    try {
      const [ls, resumen] = await Promise.all([
        getLotes(),
        getOrdenesCajonesResumen(),
      ]);

      const pollo = ls.filter((l) => l.tipo_producto === "pollo_entero");
      const ops: LoteOpcionDesposte[] = pollo
        .map((lote) => ({
          lote,
          cajonesEfectivos: cajonesLibresParaNuevaOrden(lote, resumen ?? []),
        }))
        .filter((o) => o.cajonesEfectivos > 0);
      setOpciones(ops);
    } catch {
      toast.error("No se pudieron cargar los lotes");
      setOpciones([]);
    } finally {
      setLoadingLotes(false);
    }
  }, []);

  useEffect(() => {
    getUsuarios().then((us) =>
      setOperarios(us.filter((u) => u.rol === "operario" || u.rol === "encargado"))
    );
  }, []);

  useEffect(() => {
    if (!active) return;
    cargarLotes();
  }, [active, cargarLotes]);

  useEffect(() => {
    if (loteId) {
      const op = opciones.find((o) => o.lote.id === loteId) ?? null;
      setSeleccion(op);
    } else {
      setSeleccion(null);
    }
  }, [loteId, opciones]);

  const loteSeleccionado = seleccion?.lote;
  const cajonesEfectivos = seleccion?.cajonesEfectivos ?? 0;

  const pesoEstimadoNum =
    loteSeleccionado && cantCajones && loteSeleccionado.cantidad_cajones > 0
      ? (loteSeleccionado.peso_total / loteSeleccionado.cantidad_cajones) * Number(cantCajones)
      : 0;
  const pesoEstimado = pesoEstimadoNum > 0 ? pesoEstimadoNum.toFixed(2) : null;

  const onSubmit = async (data: FormData) => {
    if (seleccion && data.cantidad_cajones > seleccion.cajonesEfectivos) {
      toast.error(`Sólo hay ${seleccion.cajonesEfectivos} cajones libres para este lote`);
      return;
    }
    setLoading(true);
    try {
      const loteInfo = opciones.find((o) => o.lote.id === data.lote_id)?.lote;
      const pesoPorCajon =
        loteInfo && loteInfo.cantidad_cajones > 0 ? loteInfo.peso_total / loteInfo.cantidad_cajones : 0;
      const peso_estimado = parseFloat((pesoPorCajon * data.cantidad_cajones).toFixed(3));

      await insertOrden({
        ...data,
        usuario_id: usuarioId,
        fecha_orden: new Date().toISOString().split("T")[0],
        peso_estimado,
      });
      toast.success("Orden de desposte creada");
      reset();
      cargarLotes();
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
      {loadingLotes ? (
        <p className="text-sm text-gray-500 animate-pulse">Cargando lotes disponibles…</p>
      ) : opciones.length === 0 ? (
        <Alert variant="info">
          No hay lotes de pollo entero con cajones libres para una nueva orden. Si ya están todas las
          órdenes completas para un lote, no volverá a aparecer hasta que haya cajones disponibles.
        </Alert>
      ) : null}

      <Select
        label="Lote de cajones"
        placeholder={loadingLotes ? "Cargando…" : "Seleccionar lote disponible"}
        options={opciones.map(({ lote: l, cajonesEfectivos: eff }) => ({
          value: l.id,
          label: `${l.marca} — cal. ${l.calibre ?? "—"} — ${eff}/${l.cantidad_cajones} cajones libres · ${formatFecha(l.fecha)}`,
        }))}
        error={errors.lote_id?.message}
        {...register("lote_id")}
        disabled={loadingLotes || opciones.length === 0}
      />

      {seleccion && loteSeleccionado && (
        <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Calibre</p>
            <p className="font-semibold">{loteSeleccionado.calibre}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Cajones libres (nueva orden)</p>
            <p className="font-semibold text-green-700">{cajonesEfectivos}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Total ingresados en el lote</p>
            <p className="font-semibold text-gray-700">{loteSeleccionado.cantidad_cajones}</p>
          </div>
          <div className="col-span-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
            Se excluyen cajones ya cubiertos por órdenes existentes (pendientes, completadas, etc.;
            solo no se cuentan las canceladas).
          </div>
          <div className="col-span-3">
            <p className="text-gray-500 text-xs">Peso promedio / cajón</p>
            <p className="font-semibold">{loteSeleccionado.peso_promedio?.toFixed(2)} kg</p>
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
            seleccion ? `Máximo: ${cajonesEfectivos} (libres para asignar)` : undefined
          }
          error={errors.cantidad_cajones?.message}
          {...register("cantidad_cajones")}
          disabled={!seleccion}
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
        <Button type="button" variant="secondary" onClick={() => reset()} disabled={loading}>
          Limpiar
        </Button>
        <Button type="submit" loading={loading} disabled={opciones.length === 0}>
          Crear orden
        </Button>
      </div>
    </form>
  );
}
