"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatFecha, formatKilos, TIPO_CAJON_LABELS, CALIBRES_POLLO } from "@/lib/utils";
import { updateLote, deleteLote } from "@/lib/supabase/queries";
import type { LoteCajones } from "@/types";

interface ListaCajonesProps {
  lotes: LoteCajones[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function ListaCajones({ lotes, loading, onRefresh }: ListaCajonesProps) {
  const [editTarget, setEditTarget] = useState<LoteCajones | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoteCajones | null>(null);
  const [saving, setSaving] = useState(false);

  // edit form state
  const [editForm, setEditForm] = useState({ marca: "", calibre: "", peso_total: "", cantidad_cajones: "", costo_por_cajon: "" });

  function openEdit(lote: LoteCajones) {
    setEditForm({
      marca: lote.marca,
      calibre: lote.calibre?.toString() ?? "",
      peso_total: lote.peso_total.toString(),
      cantidad_cajones: lote.cantidad_cajones.toString(),
      costo_por_cajon: lote.costo_por_cajon?.toString() ?? "0",
    });
    setEditTarget(lote);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateLote(editTarget.id, {
        marca: editForm.marca,
        calibre: editForm.calibre ? Number(editForm.calibre) : undefined,
        peso_total: Number(editForm.peso_total),
        cantidad_cajones: Number(editForm.cantidad_cajones),
        costo_por_cajon: editForm.costo_por_cajon ? Number(editForm.costo_por_cajon) : 0,
      });
      toast.success("Lote actualizado");
      setEditTarget(null);
      onRefresh?.();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteLote(deleteTarget.id);
      toast.success("Lote eliminado");
      setDeleteTarget(null);
      onRefresh?.();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Table
        data={lotes}
        loading={loading}
        keyExtractor={(row) => row.id}
        emptyMessage="No hay lotes registrados"
        columns={[
          {
            key: "fecha",
            header: "Fecha",
            render: (row) => formatFecha(row.fecha),
          },
          {
            key: "marca",
            header: "Marca",
            render: (row) => <span className="font-medium text-gray-900">{row.marca}</span>,
          },
          {
            key: "tipo_producto",
            header: "Tipo",
            render: (row) => (
              <div className="flex flex-col gap-0.5">
                <Badge variant={row.tipo_producto === "pollo_entero" ? "info" : "neutral"}>
                  {TIPO_CAJON_LABELS[row.tipo_producto] ?? row.tipo_producto}
                </Badge>
                {row.tipo_producto === "pollo_entero" && row.calibre && (
                  <span className="text-xs text-gray-500">Cal. {row.calibre}</span>
                )}
              </div>
            ),
          },
          {
            key: "cantidad_cajones",
            header: "Cajones",
            align: "right",
            render: (row) => (
              <div className="text-right">
                <span className="font-semibold">{row.cajones_disponibles}</span>
                <span className="text-gray-400"> / {row.cantidad_cajones}</span>
              </div>
            ),
          },
          {
            key: "peso_total",
            header: "Peso total",
            align: "right",
            render: (row) => formatKilos(row.peso_total),
          },
          {
            key: "peso_promedio",
            header: "Prom/cajón",
            align: "right",
            render: (row) => formatKilos(row.peso_promedio),
          },
          {
            key: "costo_por_cajon",
            header: "Costo/cajón",
            align: "right",
            render: (row) =>
              row.costo_por_cajon && row.costo_por_cajon > 0 ? (
                <div className="text-right">
                  <span className="font-medium text-gray-800">
                    ${row.costo_por_cajon.toLocaleString("es-AR")}
                  </span>
                  <div className="text-xs text-gray-400">
                    Total: ${(row.costo_por_cajon * row.cantidad_cajones).toLocaleString("es-AR")}
                  </div>
                </div>
              ) : (
                <span className="text-xs text-amber-500 font-medium">Sin costo</span>
              ),
          },
          {
            key: "usuario_id",
            header: "Registrado por",
            render: (row) =>
              row.usuario ? <span className="text-gray-600">{row.usuario.nombre}</span> : "—",
          },
          {
            key: "estado",
            header: "Estado",
            render: (row) => {
              const pct = Math.round((row.cajones_disponibles / row.cantidad_cajones) * 100);
              if (pct === 0) return <Badge variant="neutral">Agotado</Badge>;
              if (pct < 30) return <Badge variant="warning">Bajo stock</Badge>;
              return <Badge variant="success">Disponible</Badge>;
            },
          },
          {
            key: "acciones",
            header: "",
            render: (row) => (
              <AdminOnly>
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>
                    Eliminar
                  </Button>
                </div>
              </AdminOnly>
            ),
          },
        ]}
      />

      {/* Modal editar */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar lote" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Marca</label>
            <Input value={editForm.marca} onChange={(e) => setEditForm((f) => ({ ...f, marca: e.target.value }))} />
          </div>
          {editTarget?.tipo_producto === "pollo_entero" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Calibre</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={editForm.calibre}
                onChange={(e) => setEditForm((f) => ({ ...f, calibre: e.target.value }))}
              >
                <option value="">Sin calibre</option>
                {CALIBRES_POLLO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Peso total (kg)</label>
            <Input
              type="number" step="0.1"
              value={editForm.peso_total}
              onChange={(e) => setEditForm((f) => ({ ...f, peso_total: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad cajones</label>
            <Input
              type="number"
              value={editForm.cantidad_cajones}
              onChange={(e) => setEditForm((f) => ({ ...f, cantidad_cajones: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Costo por cajón ($)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={editForm.costo_por_cajon}
              onChange={(e) => setEditForm((f) => ({ ...f, costo_por_cajon: e.target.value }))}
            />
            {editForm.costo_por_cajon && editForm.cantidad_cajones && (
              <p className="text-xs text-gray-500 mt-1">
                Costo total: ${(Number(editForm.costo_por_cajon) * Number(editForm.cantidad_cajones)).toLocaleString("es-AR")}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        message={`¿Eliminar el lote de ${deleteTarget?.marca ?? ""}? Esta acción no se puede deshacer.`}
      />
    </>
  );
}
