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
import { Badge } from "@/components/ui/Badge";
import { getVentas, deleteVenta, updateVentaConPrecios } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos, formatMoneda, localDateStr, getProductoLabel, MEDIO_PAGO_LABELS } from "@/lib/utils";
import type { Venta } from "@/types";

const MEDIO_BADGE: Record<string, "success" | "info" | "neutral" | "warning"> = {
  efectivo:         "success",
  transferencia:    "info",
  tarjeta:          "neutral",
  cuenta_corriente: "warning",
};

/** Ticket de venta imprimible (formato angosto tipo 80mm) */
function imprimirTicket(v: Venta) {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  const filas = (v.items ?? [])
    .map((item) => {
      const nombre = item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—";
      const sub = item.subtotal ?? item.kilos * (item.precio_kg ?? 0);
      return `<tr>
        <td>${nombre}</td>
        <td class="r">${item.kilos.toFixed(3)}</td>
        <td class="r">${item.precio_kg ? formatMoneda(item.precio_kg) : "—"}</td>
        <td class="r">${sub ? formatMoneda(sub) : "—"}</td>
      </tr>`;
    })
    .join("");
  win.document.write(`
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <title>Ticket venta #${v.numero}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 12px; max-width: 320px; }
      h1 { font-size: 16px; text-align: center; }
      .sub { text-align: center; font-size: 11px; margin-bottom: 8px; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
      td { padding: 2px 0; font-size: 11px; vertical-align: top; }
      .r { text-align: right; }
      .tot { font-size: 14px; font-weight: bold; }
      .foot { text-align: center; font-size: 10px; margin-top: 10px; }
    </style></head><body>
      <h1>BATEA</h1>
      <p class="sub">Ticket de venta #${v.numero}</p>
      <hr/>
      <p>Fecha: ${formatFechaHora(v.created_at)}</p>
      <p>Cliente: ${v.cliente_registrado?.nombre ?? v.cliente ?? "Mostrador"}</p>
      <p>Pago: ${MEDIO_PAGO_LABELS[v.medio_pago ?? "efectivo"] ?? v.medio_pago ?? "Efectivo"}</p>
      <p>Cajero: ${v.usuario?.nombre ?? "—"}</p>
      <hr/>
      <table>
        <thead><tr><th>Producto</th><th class="r">Kg</th><th class="r">$/kg</th><th class="r">Subt.</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <hr/>
      <p class="r">Kilos: ${(v.total_kilos ?? 0).toFixed(3)} kg</p>
      <p class="r tot">TOTAL: ${v.total_monto ? formatMoneda(v.total_monto) : "—"}</p>
      <hr/>
      <p class="foot">¡Gracias por su compra!</p>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}



export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Venta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [userId, setUserId] = useState("");

  // Edición admin
  const [editTarget, setEditTarget] = useState<Venta | null>(null);
  const [editCliente, setEditCliente] = useState("");
  const [editNotas, setEditNotas] = useState("");
  const [editItems, setEditItems] = useState<{ id: string; nombre: string; kilos: number; precio_kg: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(v: Venta) {
    setEditCliente(v.cliente ?? "");
    setEditNotas(v.notas ?? "");
    setEditItems(
      (v.items ?? []).map((item) => ({
        id: item.id,
        nombre: item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—",
        kilos: item.kilos,
        precio_kg: item.precio_kg?.toString() ?? "",
      }))
    );
    setEditTarget(v);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await updateVentaConPrecios(
        editTarget.id,
        { cliente: editCliente.trim() || null, notas: editNotas.trim() || null },
        editItems.map((i) => ({ id: i.id, kilos: i.kilos, precio_kg: parseFloat(i.precio_kg) || 0 }))
      );
      toast.success(`Venta #${editTarget.numero} actualizada`);
      setEditTarget(null);
      fetchVentas();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al actualizar");
    } finally {
      setEditSaving(false);
    }
  }

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
                render: (v) =>
                  v.cliente_registrado?.nombre ?? v.cliente ?? (
                    <span className="text-gray-400">Mostrador</span>
                  ),
              },
              {
                key: "medio_pago",
                header: "Pago",
                render: (v) => (
                  <Badge variant={MEDIO_BADGE[v.medio_pago ?? "efectivo"] ?? "neutral"}>
                    {MEDIO_PAGO_LABELS[v.medio_pago ?? "efectivo"] ?? v.medio_pago}
                  </Badge>
                ),
              },
              {
                key: "items",
                header: "Productos",
                render: (v) => (
                  <div className="text-xs space-y-0.5">
                    {(v.items ?? []).slice(0, 2).map((item) => (
                      <div key={item.id}>
                        {item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—"} —{" "}
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
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm" variant="ghost"
                        onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm" variant="danger"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                      >
                        Eliminar
                      </Button>
                    </div>
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

      {/* Modal editar venta (admin) */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Editar venta #${editTarget?.numero}`}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cliente</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Mostrador"
              value={editCliente}
              onChange={(e) => setEditCliente(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Precios por producto</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {editItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <span className="flex-1 text-sm font-medium text-gray-800">{item.nombre}</span>
                  <span className="text-sm font-mono text-gray-500">{item.kilos.toFixed(3)} kg</span>
                  <div className="w-[120px]">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.precio_kg}
                      onChange={(e) =>
                        setEditItems((prev) => prev.map((x, i) => (i === idx ? { ...x, precio_kg: e.target.value } : x)))
                      }
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <span className="w-[100px] text-right text-sm font-semibold text-gray-700">
                    {formatMoneda(item.kilos * (parseFloat(item.precio_kg) || 0))}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Los kilos no se editan acá porque el stock ya fue descontado. Nuevo total:{" "}
              <strong className="text-gray-700">
                {formatMoneda(editItems.reduce((s, i) => s + i.kilos * (parseFloat(i.precio_kg) || 0), 0))}
              </strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={2}
              value={editNotas}
              onChange={(e) => setEditNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} loading={editSaving}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>

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
                <p className="font-medium">
                  {ventaDetalle.cliente_registrado?.nombre ?? ventaDetalle.cliente ?? "Mostrador"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Cajero</p>
                <p className="font-medium">{ventaDetalle.usuario?.nombre ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Medio de pago</p>
                <Badge variant={MEDIO_BADGE[ventaDetalle.medio_pago ?? "efectivo"] ?? "neutral"}>
                  {MEDIO_PAGO_LABELS[ventaDetalle.medio_pago ?? "efectivo"] ?? ventaDetalle.medio_pago}
                </Badge>
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
                        {item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—"}
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

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setVentaDetalle(null)}>Cerrar</Button>
              <Button onClick={() => imprimirTicket(ventaDetalle)}>
                <svg className="w-4 h-4 mr-1.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir ticket
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
