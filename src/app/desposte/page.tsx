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
import { getOrdenes, deleteOrden } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { ESTADO_COLORS, ESTADO_LABELS, formatFecha, formatKilos } from "@/lib/utils";
import type { OrdenDesposte } from "@/types";

export default function DespostePage() {
  const [ordenes, setOrdenes] = useState<OrdenDesposte[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrdenDesposte | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    </div>
  );
}
