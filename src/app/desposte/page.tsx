"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table } from "@/components/ui/Table";
import { OrdenDesposteForm } from "@/components/desposte/OrdenDesposteForm";
import { getOrdenes, deleteOrden, updateOrden, getUsuarios } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { ESTADO_COLORS, ESTADO_LABELS, formatFecha, formatKilos } from "@/lib/utils";
import type { OrdenDesposte, OrdenEstado, Usuario } from "@/types";

export default function DespostePage() {
  const [ordenes, setOrdenes] = useState<OrdenDesposte[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrdenDesposte | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edición admin
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [editTarget, setEditTarget] = useState<OrdenDesposte | null>(null);
  const [editForm, setEditForm] = useState({
    cantidad_cajones: "",
    peso_estimado: "",
    operario_id: "",
    estado: "pendiente" as OrdenEstado,
    notas: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(o: OrdenDesposte) {
    setEditForm({
      cantidad_cajones: o.cantidad_cajones.toString(),
      peso_estimado: o.peso_estimado.toString(),
      operario_id: o.operario_id ?? "",
      estado: o.estado,
      notas: o.notas ?? "",
    });
    setEditTarget(o);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    const cajones = Number(editForm.cantidad_cajones);
    if (!cajones || cajones <= 0) {
      toast.error("Ingresá una cantidad de cajones válida");
      return;
    }
    setEditSaving(true);
    try {
      await updateOrden(editTarget.id, {
        cantidad_cajones: cajones,
        peso_estimado: Number(editForm.peso_estimado) || editTarget.peso_estimado,
        operario_id: editForm.operario_id || undefined,
        estado: editForm.estado,
        notas: editForm.notas.trim() || undefined,
      });
      toast.success("Orden actualizada");
      setEditTarget(null);
      fetchOrdenes();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al actualizar");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteOrden(deleteTarget.id);
      toast.success("Orden eliminada");
      setDeleteTarget(null);
      fetchOrdenes();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrdenes();
      setOrdenes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    fetchOrdenes();
    getUsuarios().then(setUsuarios).catch(() => {});
  }, [fetchOrdenes]);

  const pendientes = ordenes.filter((o) => o.estado === "pendiente").length;
  const enProceso = ordenes.filter((o) => o.estado === "en_proceso").length;
  const completadas = ordenes.filter((o) => o.estado === "completada").length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Órdenes de Desposte</h1>
          <p className="text-sm text-gray-500">Gestión de órdenes de trabajo</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Nueva orden</Button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">Pendientes</p>
          <p className="text-xl sm:text-2xl font-bold text-yellow-600">{pendientes}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">En proceso</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600">{enProceso}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">Completadas</p>
          <p className="text-xl sm:text-2xl font-bold text-green-600">{completadas}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>Órdenes de desposte</CardHeader>
        <CardBody className="p-0">
          <Table
            data={ordenes}
            loading={loading}
            keyExtractor={(o) => o.id}
            emptyMessage="No hay órdenes registradas"
            columns={[
              {
                key: "fecha_orden",
                header: "Fecha",
                render: (o) => formatFecha(o.fecha_orden),
              },
              {
                key: "lote",
                header: "Lote",
                render: (o) =>
                  o.lote ? (
                    <div>
                      <p className="font-medium text-gray-900">{o.lote.marca}</p>
                      <p className="text-xs text-gray-500">{o.lote.calibre}</p>
                    </div>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "cantidad_cajones",
                header: "Cajones",
                align: "right",
                render: (o) => o.cantidad_cajones,
              },
              {
                key: "peso_estimado",
                header: "Peso est.",
                align: "right",
                render: (o) => formatKilos(o.peso_estimado),
              },
              {
                key: "operario",
                header: "Operario",
                render: (o) => o.operario?.nombre ?? <span className="text-gray-400">Sin asignar</span>,
              },
              {
                key: "estado",
                header: "Estado",
                render: (o) => (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLORS[o.estado]}`}>
                    {ESTADO_LABELS[o.estado]}
                  </span>
                ),
              },
              {
                key: "acciones",
                header: "",
                render: (o) => (
                  <div className="flex items-center gap-1 justify-end">
                    {o.estado === "completada" && o.produccion ? (
                      <Badge variant={o.produccion.tiene_alerta ? "warning" : "success"}>
                        {o.produccion.rendimiento_real?.toFixed(1)}%
                      </Badge>
                    ) : o.estado === "pendiente" ? (
                      <Link href={`/produccion?orden=${o.id}`}>
                        <Button size="sm" variant="outline">Registrar</Button>
                      </Link>
                    ) : null}
                    <AdminOnly>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(o)}>
                        Eliminar
                      </Button>
                    </AdminOnly>
                  </div>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva orden de desposte"
        size="lg"
      >
        <OrdenDesposteForm
          active={modalOpen}
          usuarioId={userId}
          onSuccess={() => {
            setModalOpen(false);
            fetchOrdenes();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        message={`¿Eliminar la orden de desposte del ${deleteTarget?.fecha_orden ? formatFecha(deleteTarget.fecha_orden) : ""}? Esta acción no se puede deshacer.`}
      />

      {/* Modal editar orden (admin) */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Editar orden de desposte"
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de cajones</label>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.cantidad_cajones}
              onChange={(e) => setEditForm((f) => ({ ...f, cantidad_cajones: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Peso estimado (kg)</label>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.peso_estimado}
              onChange={(e) => setEditForm((f) => ({ ...f, peso_estimado: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Operario</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.operario_id}
              onChange={(e) => setEditForm((f) => ({ ...f, operario_id: e.target.value }))}
            >
              <option value="">Sin asignar</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.estado}
              onChange={(e) => setEditForm((f) => ({ ...f, estado: e.target.value as OrdenEstado }))}
            >
              {(["pendiente", "en_proceso", "completada", "cancelada"] as const).map((es) => (
                <option key={es} value={es}>{ESTADO_LABELS[es]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.notas}
              onChange={(e) => setEditForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} loading={editSaving}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
