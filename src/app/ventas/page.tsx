"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table } from "@/components/ui/Table";
import { VentaForm } from "@/components/ventas/VentaForm";
import { getVentas, deleteVenta } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos, formatMoneda, localDateStr } from "@/lib/utils";
import type { Venta } from "@/types";

const PRODUCTO_LABELS: Record<string, string> = {
  filet_fresco:      "Filet fresco",
  pata_muslo_fresca: "Pata/Muslo fresca",
  alitas:            "Alitas",
  carcasa:           "Carcasa",
  menudos:           "Menudos",
  pollo_entero:      "Pollo entero",
  supremas:          "Supremas",
  // compatibilidad con registros viejos
  pata_muslo:        "Pata/Muslo",
  pechuga:           "Filet fresco (desposte)",
};

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Venta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [userId, setUserId] = useState("");

  async function handleDeleteVenta() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVenta(deleteTarget.id);
      toast.success(`Venta #${deleteTarget.numero} eliminada`);
      setDeleteTarget(null);
      fetchVentas();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVentas();
      setVentas(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    fetchVentas();
  }, [fetchVentas]);

  const hoy = localDateStr();
  const totalKilosHoy = ventas
    .filter((v) => v.created_at.startsWith(hoy))
    .reduce((s, v) => s + (v.total_kilos ?? 0), 0);

  const totalMontoHoy = ventas
    .filter((v) => v.created_at.startsWith(hoy))
    .reduce((s, v) => s + (v.total_monto ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ventas</h1>
          <p className="text-sm text-gray-500">Registro y control de ventas</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Nueva venta</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Ventas totales
          </p>
          <p className="text-2xl font-bold text-gray-900">{ventas.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Kilos hoy
          </p>
          <p className="text-2xl font-bold text-gray-900">{totalKilosHoy.toFixed(1)} kg</p>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Monto hoy
          </p>
          <p className="text-2xl font-bold text-gray-900">{formatMoneda(totalMontoHoy)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>Historial de ventas</CardHeader>
        <CardBody className="p-0">
          <Table
            data={ventas}
            loading={loading}
            keyExtractor={(v) => v.id}
            emptyMessage="Sin ventas registradas"
            onRowClick={(v) => setVentaDetalle(v)}
            columns={[
              {
                key: "numero",
                header: "#",
                render: (v) => <span className="font-mono font-medium">#{v.numero}</span>,
              },
              {
                key: "created_at",
                header: "Fecha",
                render: (v) => formatFechaHora(v.created_at),
              },
              {
                key: "cliente",
                header: "Cliente",
                render: (v) => v.cliente ?? <span className="text-gray-400">Mostrador</span>,
              },
              {
                key: "items",
                header: "Productos",
                render: (v) => (
                  <div className="text-xs space-y-0.5">
                    {(v.items ?? []).slice(0, 2).map((item) => (
                      <div key={item.id}>
                        {PRODUCTO_LABELS[item.producto?.nombre ?? ""] ?? item.producto?.nombre} —{" "}
                        {item.kilos.toFixed(2)} kg
                      </div>
                    ))}
                    {(v.items?.length ?? 0) > 2 && (
                      <div className="text-gray-400">+{(v.items?.length ?? 0) - 2} más</div>
                    )}
                  </div>
                ),
              },
              {
                key: "total_kilos",
                header: "Kilos",
                align: "right",
                render: (v) => formatKilos(v.total_kilos ?? 0),
              },
              {
                key: "total_monto",
                header: "Total",
                align: "right",
                render: (v) =>
                  v.total_monto ? (
                    <span className="font-semibold">{formatMoneda(v.total_monto)}</span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "usuario",
                header: "Cajero",
                render: (v) => v.usuario?.nombre ?? "—",
              },
              {
                key: "acciones",
                header: "",
                render: (v) => (
                  <AdminOnly>
                    <Button
                      size="sm" variant="danger"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                    >
                      Eliminar
                    </Button>
                  </AdminOnly>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Modal nueva venta */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva venta"
        size="xl"
      >
        <VentaForm
          usuarioId={userId}
          onSuccess={() => {
            setModalOpen(false);
            fetchVentas();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteVenta}
        loading={deleting}
        message={`¿Eliminar la venta #${deleteTarget?.numero}? El stock descontado no se revertirá automáticamente.`}
      />

      {/* Modal detalle venta */}
      <Modal
        open={!!ventaDetalle}
        onClose={() => setVentaDetalle(null)}
        title={`Venta #${ventaDetalle?.numero}`}
        size="md"
      >
        {ventaDetalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Fecha</p>
                <p className="font-medium">{formatFechaHora(ventaDetalle.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Cliente</p>
                <p className="font-medium">{ventaDetalle.cliente ?? "Mostrador"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Cajero</p>
                <p className="font-medium">{ventaDetalle.usuario?.nombre ?? "—"}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[340px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Producto</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Kilos</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">$/kg</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(ventaDetalle.items ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {PRODUCTO_LABELS[item.producto?.nombre ?? ""] ?? item.producto?.nombre}
                      </td>
                      <td className="px-3 py-2 text-right">{item.kilos.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right">
                        {item.precio_kg ? formatMoneda(item.precio_kg) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {item.subtotal ? formatMoneda(item.subtotal) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-semibold text-right">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {ventaDetalle.total_monto
                        ? formatMoneda(ventaDetalle.total_monto)
                        : `${formatKilos(ventaDetalle.total_kilos ?? 0)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
