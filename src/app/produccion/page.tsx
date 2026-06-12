"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table } from "@/components/ui/Table";
import { Alert } from "@/components/ui/Alert";
import { RegistroProduccionForm } from "@/components/produccion/RegistroProduccionForm";
import { getOrdenes, getOrden, getProduccion, deleteProduccion, updateProduccion } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos, rendimientoColor, CORTES } from "@/lib/utils";
import type { Produccion, OrdenDesposte } from "@/types";

function ProduccionContent() {
  const searchParams = useSearchParams();
  const ordenParam = searchParams.get("orden");

  const [producciones, setProducciones] = useState<Produccion[]>([]);
  const [ordenesPendientes, setOrdenesPendientes] = useState<OrdenDesposte[]>([]);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenDesposte | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Produccion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detalleProduccion, setDetalleProduccion] = useState<Produccion | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Edición admin de cortes
  const [editTarget, setEditTarget] = useState<Produccion | null>(null);
  const [editCortes, setEditCortes] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(p: Produccion) {
    const cortes: Record<string, string> = {};
    for (const c of CORTES) {
      cortes[c.key] = ((p[c.key as keyof Produccion] as number) ?? 0).toString();
    }
    setEditCortes(cortes);
    setEditTarget(p);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await updateProduccion(editTarget.id, {
        pata_muslo:       parseFloat(editCortes.pata_muslo) || 0,
        pechuga:          parseFloat(editCortes.pechuga) || 0,
        pechuga_con_piel: parseFloat(editCortes.pechuga_con_piel) || 0,
        alitas:           parseFloat(editCortes.alitas) || 0,
        carcasa:          parseFloat(editCortes.carcasa) || 0,
        menudos:          parseFloat(editCortes.menudos) || 0,
        pollo_entero:     parseFloat(editCortes.pollo_entero) || 0,
      });
      toast.success("Producción actualizada");
      setEditTarget(null);
      fetchData();
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
      await deleteProduccion(deleteTarget.id);
      toast.success("Registro de producción eliminado");
      setDeleteTarget(null);
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, ordenes] = await Promise.all([
        getProduccion(),
        getOrdenes(),
      ]);
      setProducciones(prods);
      setOrdenesPendientes(ordenes.filter((o) => o.estado === "pendiente"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (ordenParam) {
      getOrden(ordenParam).then(setOrdenSeleccionada).catch(() => {});
    }
  }, [ordenParam]);

  const alertas = producciones.filter((p) => p.tiene_alerta);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Producción — Desposte</h1>
        <p className="text-sm text-gray-500">
          Registro de kilos obtenidos por corte. Al confirmar, el stock de cortes se actualiza y compensa saldos negativos
          por ventas previas.
        </p>
      </div>

      {alertas.length > 0 && (
        <Alert variant="warning" title={`${alertas.length} alerta(s) de rendimiento activas`}>
          Hay producciones con rendimiento fuera del rango esperado. Revise el historial.
        </Alert>
      )}

      {/* Órdenes pendientes */}
      {ordenesPendientes.length > 0 && (
        <Card>
          <CardHeader>Órdenes pendientes de registro</CardHeader>
          <CardBody className="p-0">
            <Table
              data={ordenesPendientes}
              keyExtractor={(o) => o.id}
              emptyMessage="Sin órdenes pendientes"
              columns={[
                {
                  key: "lote",
                  header: "Lote",
                  render: (o) => (
                    <div>
                      <p className="font-medium">{o.lote?.marca}</p>
                      <p className="text-xs text-gray-500">{o.lote?.calibre}</p>
                    </div>
                  ),
                },
                { key: "cantidad_cajones", header: "Cajones" },
                {
                  key: "peso_estimado",
                  header: "Peso est.",
                  render: (o) => formatKilos(o.peso_estimado),
                },
                {
                  key: "operario",
                  header: "Operario",
                  render: (o) => o.operario?.nombre ?? "Sin asignar",
                },
                {
                  key: "accion",
                  header: "",
                  render: (o) => (
                    <button
                      onClick={() => setOrdenSeleccionada(o)}
                      className="text-brand-600 hover:text-brand-800 text-sm font-medium"
                    >
                      Registrar
                    </button>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {/* Historial de producción */}
      <Card>
        <CardHeader>Historial de producción</CardHeader>
        <CardBody className="p-0">
          <Table
            data={producciones}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage="Sin registros de producción"
            columns={[
              {
                key: "fecha_produccion",
                header: "Fecha",
                render: (p) => formatFechaHora(p.fecha_produccion),
              },
              {
                key: "lote",
                header: "Lote",
                render: (p) => (
                  <div>
                    <p className="font-medium">{p.orden?.lote?.marca ?? "—"}</p>
                    <p className="text-xs text-gray-500">{p.orden?.lote?.calibre}</p>
                  </div>
                ),
              },
              {
                key: "cajones",
                header: "Cajones",
                render: (p) => p.orden?.cantidad_cajones ?? "—",
              },
              {
                key: "peso_total_producido",
                header: "Total prod.",
                align: "right",
                render: (p) => formatKilos(p.peso_total_producido),
              },
              {
                key: "rendimiento_real",
                header: "Rendimiento",
                align: "right",
                render: (p) => {
                  const r = p.rendimiento_real;
                  if (!r || r <= 0) {
                    return <span className="text-gray-400 text-xs">Sin datos</span>;
                  }
                  return (
                    <span className={`font-semibold ${rendimientoColor(r)}`}>
                      {r.toFixed(1)}%
                    </span>
                  );
                },
              },
              {
                key: "tiene_alerta",
                header: "Alerta",
                render: (p) =>
                  p.tiene_alerta ? (
                    <Badge variant="warning">
                      Alerta
                    </Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  ),
              },
              {
                key: "cortes",
                header: "Cortes (kg)",
                render: (p) => (
                  <div className="text-xs space-y-0.5">
                    {CORTES.slice(0, 3).map((c) => (
                      <div key={c.key} className="flex justify-between gap-2">
                        <span className="text-gray-500">{c.label}</span>
                        <span className="font-medium">
                          {(p[c.key as keyof Produccion] as number)?.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: "acciones",
                header: "",
                render: (p) => (
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setDetalleProduccion(p)}>
                      Ver
                    </Button>
                    <AdminOnly>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(p)}>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        message="¿Eliminar este registro de producción? Los movimientos de stock asociados también se verán afectados."
      />

      {/* Modal editar producción (admin) */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Editar producción"
        size="md"
      >
        <div className="space-y-4">
          <Alert variant="warning">
            Corregir kilos acá no recalcula el stock automáticamente. Si la diferencia es importante,
            ajustá el stock del producto desde la sección Stock (Ajuste manual).
          </Alert>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CORTES.map((c) => (
              <div key={c.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{c.label} (kg)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={editCortes[c.key] ?? ""}
                  onChange={(e) => setEditCortes((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600">
            Nuevo total:{" "}
            <strong>
              {CORTES.reduce((s, c) => s + (parseFloat(editCortes[c.key]) || 0), 0).toFixed(3)} kg
            </strong>
          </p>
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

      {/* Modal detalle / impresión */}
      {detalleProduccion && (
        <Modal
          open={!!detalleProduccion}
          onClose={() => setDetalleProduccion(null)}
          title="Resumen de producción"
          size="md"
        >
          <ResumenProduccion
            produccion={detalleProduccion}
            printRef={printRef}
            onClose={() => setDetalleProduccion(null)}
          />
        </Modal>
      )}

      {/* Modal registro */}
      <Modal
        open={!!ordenSeleccionada}
        onClose={() => setOrdenSeleccionada(null)}
        title="Registrar producción"
        size="xl"
      >
        {ordenSeleccionada && (
          <RegistroProduccionForm
            orden={ordenSeleccionada}
            usuarioId={userId}
            onSuccess={() => {
              setOrdenSeleccionada(null);
              fetchData();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ── Componente de resumen imprimible ─────────────────────────────────────
function ResumenProduccion({
  produccion: p,
  printRef,
  onClose,
}: {
  produccion: Produccion;
  printRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const peso_estimado = p.orden?.peso_estimado ?? 0;

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <title>Resumen de Producción</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 24px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .stat { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
          .stat-label { font-size: 10px; text-transform: uppercase; color: #888; }
          .stat-value { font-size: 20px; font-weight: bold; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 11px; text-transform: uppercase; color: #666; }
          td { padding: 7px 10px; border-top: 1px solid #eee; }
          .bar-bg { background: #e5e7eb; border-radius: 4px; height: 8px; width: 100%; }
          .bar-fill { background: #2563eb; border-radius: 4px; height: 8px; }
          .alerta { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 12px; }
          .footer { margin-top: 20px; font-size: 11px; color: #aaa; text-align: right; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <div class="footer">Generado: ${new Date().toLocaleString("es-AR")}</div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div className="space-y-4">
      {/* Contenido imprimible */}
      <div ref={printRef}>
        {/* Encabezado */}
        <div className="mb-4">
          <h1 className="text-base font-bold text-gray-900">Resumen de Producción</h1>
          <p className="text-xs text-gray-500">
            {formatFechaHora(p.fecha_produccion)} — Lote: {p.orden?.lote?.marca ?? "—"}
            {p.orden?.lote?.calibre ? ` · Cal. ${p.orden.lote.calibre}` : ""}
            {p.orden?.cantidad_cajones ? ` · ${p.orden.cantidad_cajones} cajones` : ""}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-gray-200 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Peso estimado</p>
            <p className="text-lg font-bold text-gray-900">{peso_estimado.toFixed(1)} kg</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total producido</p>
            <p className="text-lg font-bold text-gray-900">{p.peso_total_producido.toFixed(1)} kg</p>
          </div>
          <div className={`border rounded-lg p-3 text-center ${
            !p.rendimiento_real || p.rendimiento_real <= 0 ? "border-gray-200 bg-gray-50"
            : p.rendimiento_real < 85 ? "border-red-300 bg-red-50"
            : p.rendimiento_real > 105 ? "border-yellow-300 bg-yellow-50"
            : "border-green-300 bg-green-50"
          }`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Rendimiento</p>
            <p className={`text-lg font-bold ${p.rendimiento_real && p.rendimiento_real > 0 ? rendimientoColor(p.rendimiento_real) : "text-gray-400"}`}>
              {p.rendimiento_real && p.rendimiento_real > 0 ? `${p.rendimiento_real.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>

        {/* Tabla de cortes */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Corte</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Kilos</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">% del total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">% sobre est.</th>
              <th className="px-3 py-2 w-24 hidden sm:table-cell"></th>
            </tr>
          </thead>
          <tbody>
            {CORTES.map((corte) => {
              const kilos = (p[corte.key as keyof Produccion] as number) ?? 0;
              const pctTotal = p.peso_total_producido > 0 ? (kilos / p.peso_total_producido) * 100 : 0;
              const pctEst   = peso_estimado > 0 ? (kilos / peso_estimado) * 100 : 0;
              return (
                <tr key={corte.key} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 font-medium text-gray-800">{corte.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">{kilos.toFixed(3)} kg</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{pctTotal.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{pctEst.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full"
                        style={{ width: `${Math.min(pctTotal, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Total */}
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="px-3 py-2.5 text-gray-900">TOTAL</td>
              <td className="px-3 py-2.5 text-right font-mono">{p.peso_total_producido.toFixed(3)} kg</td>
              <td className="px-3 py-2.5 text-right">100%</td>
              <td className="px-3 py-2.5 text-right">
                {p.rendimiento_real && p.rendimiento_real > 0 ? `${p.rendimiento_real.toFixed(1)}%` : "—"}
              </td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tbody>
        </table>

        {/* Alerta si hay */}
        {p.tiene_alerta && p.alerta_detalle && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            <span className="font-semibold">⚠ Alerta: </span>{p.alerta_detalle}
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={handlePrint}>
          <svg className="w-4 h-4 mr-1.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir
        </Button>
      </div>
    </div>
  );
}

export default function ProduccionPage() {
  return (
    <Suspense>
      <ProduccionContent />
    </Suspense>
  );
}
