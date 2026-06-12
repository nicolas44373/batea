"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ElaboracionSupremasForm } from "@/components/produccion/ElaboracionSupremasForm";
import { IniciarLoteSupremasForm } from "@/components/produccion/IniciarLoteSupremasForm";
import { FinalizarLoteSupremasForm } from "@/components/produccion/FinalizarLoteSupremasForm";
import {
  getElaboracionSupremas,
  getStock,
  getOrdenesElaboracionSupremas,
  deleteElaboracionSupremas,
  deleteOrdenElaboracionSupremas,
} from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos, rendimientoColor } from "@/lib/utils";
import type { ElaboracionSupremas, VStockActual, OrdenElaboracionSupremas } from "@/types";

const FILET_LABELS: Record<string, string> = {
  filet_fresco:    "Filet fresco",
  filet_congelado: "Filet congelado",
  pechuga:         "Filet fresco (desposte)",
};

export default function SupremasPage() {
  const [elaboraciones, setElaboraciones] = useState<ElaboracionSupremas[]>([]);
  const [ordenes, setOrdenes]             = useState<OrdenElaboracionSupremas[]>([]);
  const [stock, setStock]                 = useState<VStockActual[]>([]);
  const [loading, setLoading]             = useState(true);
  const [userId, setUserId]               = useState("");
  const [activeTab, setActiveTab]         = useState<"lotes" | "historial" | "finalizados">("lotes");

  // Modales
  const [modalIniciarOpen, setModalIniciarOpen]   = useState(false);
  const [modalPesadaOpen, setModalPesadaOpen]     = useState(false);
  const [modalFinalizarOpen, setModalFinalizarOpen] = useState(false);

  // Orden seleccionada para pesada o finalizar
  const [selectedOrden, setSelectedOrden]         = useState<OrdenElaboracionSupremas | null>(null);

  // Eliminación admin
  const [deletePesada, setDeletePesada] = useState<ElaboracionSupremas | null>(null);
  const [deleteLote, setDeleteLote]     = useState<OrdenElaboracionSupremas | null>(null);
  const [deleting, setDeleting]         = useState(false);

  async function handleDeletePesada() {
    if (!deletePesada) return;
    setDeleting(true);
    try {
      await deleteElaboracionSupremas(deletePesada.id);
      toast.success("Pesada eliminada");
      setDeletePesada(null);
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteLote() {
    if (!deleteLote) return;
    setDeleting(true);
    try {
      await deleteOrdenElaboracionSupremas(deleteLote.id);
      toast.success("Lote eliminado");
      setDeleteLote(null);
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
      const [elab, s, ord] = await Promise.all([
        getElaboracionSupremas(),
        getStock(),
        getOrdenesElaboracionSupremas(),
      ]);
      setElaboraciones(elab);
      setStock(s);
      setOrdenes(ord);
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

  const stockSupremas  = stock.find((s) => s.producto === "supremas");
  const stockFiletF    = stock.find((s) => s.producto === "filet_fresco");
  const stockFiletC    = stock.find((s) => s.producto === "filet_congelado");

  // Lotes filtrados
  const lotesActivos = ordenes.filter((o) => o.estado === "en_proceso");
  const lotesFinalizados = ordenes.filter((o) => o.estado === "completada");

  // Totales históricos
  const totalProducido = elaboraciones.reduce((s, e) => s + e.kilos_supremas, 0);
  const totalFiletUsado = elaboraciones.reduce((s, e) => s + e.kilos_filet, 0);
  const rendProm = elaboraciones.length
    ? elaboraciones.reduce((s, e) => s + e.rendimiento_real, 0) / elaboraciones.length
    : null;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Elaboración de Supremas</h1>
          <p className="text-sm text-gray-500">Transformación filet → supremas de pollo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSelectedOrden(null); setModalPesadaOpen(true); }}>
            + Pesada directa
          </Button>
          <Button onClick={() => setModalIniciarOpen(true)}>
            + Separar Filet (Iniciar Lote)
          </Button>
        </div>
      </div>

      {/* Stock disponible de materia prima */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filet fresco</p>
          <p className={`text-2xl font-bold ${(stockFiletF?.kilos ?? 0) < 5 ? "text-red-600" : "text-gray-900"}`}>
            {(stockFiletF?.kilos ?? 0).toFixed(1)} kg
          </p>
          <p className="text-xs text-gray-400">disponible</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filet congelado</p>
          <p className={`text-2xl font-bold ${(stockFiletC?.kilos ?? 0) < 5 ? "text-red-600" : "text-gray-900"}`}>
            {(stockFiletC?.kilos ?? 0).toFixed(1)} kg
          </p>
          <p className="text-xs text-gray-400">disponible</p>
        </Card>
        <Card className="p-4 border-brand-200 bg-brand-50">
          <p className="text-xs text-brand-700 font-medium uppercase tracking-wide">Supremas en stock</p>
          <p className="text-2xl font-bold text-brand-800">
            {(stockSupremas?.kilos ?? 0).toFixed(1)} kg
          </p>
          <p className="text-xs text-brand-500">listo para venta</p>
        </Card>
      </div>

      {/* Métricas históricas */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pesadas Registradas</p>
          <p className="text-2xl font-bold text-gray-900">{elaboraciones.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filet usado (total)</p>
          <p className="text-2xl font-bold text-gray-900">{totalFiletUsado.toFixed(1)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Rend. promedio</p>
          <p className={`text-2xl font-bold ${rendProm !== null ? rendimientoColor(rendProm) : "text-gray-400"}`}>
            {rendProm !== null ? `${rendProm.toFixed(1)}%` : "—"}
          </p>
        </Card>
      </div>

      {/* TABS Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("lotes")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-all ${
              activeTab === "lotes"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Lotes en Proceso ({lotesActivos.length})
          </button>
          <button
            onClick={() => setActiveTab("historial")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-all ${
              activeTab === "historial"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Historial de Pesadas
          </button>
          <button
            onClick={() => setActiveTab("finalizados")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-all ${
              activeTab === "finalizados"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Lotes Finalizados ({lotesFinalizados.length})
          </button>
        </nav>
      </div>

      {/* TAB content: LOTES EN PROCESO */}
      {activeTab === "lotes" && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Cargando lotes...</div>
          ) : lotesActivos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-500 text-sm">No hay lotes de elaboración activos.</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Separa filet fresco o congelado para iniciar la producción incremental.</p>
              <Button onClick={() => setModalIniciarOpen(true)} size="sm">
                Iniciar Lote
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lotesActivos.map((lote) => {
                const restante = Math.max(0, lote.kilos_separados - lote.kilos_procesados);
                const porcentaje = Math.min(100, Math.round((lote.kilos_procesados / lote.kilos_separados) * 100));
                const rendimientoLote = lote.kilos_procesados > 0
                  ? Math.round((lote.kilos_supremas / lote.kilos_procesados) * 1000) / 10
                  : null;

                return (
                  <Card key={lote.id} className="border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-semibold text-gray-500">
                          {formatFechaHora(lote.fecha_inicio)}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                          <span className="text-sm font-bold text-gray-900">
                            {FILET_LABELS[lote.tipo_filet] || lote.tipo_filet}
                          </span>
                        </div>
                      </div>
                      <Badge variant="success">En proceso</Badge>
                    </div>

                    <CardBody className="p-4 space-y-4">
                      {/* Barra de progreso */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                          <span>Procesado: {formatKilos(lote.kilos_procesados)} / {formatKilos(lote.kilos_separados)}</span>
                          <span>{porcentaje}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-brand-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${porcentaje}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Detalles en Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center py-2 bg-gray-50 rounded-lg text-xs">
                        <div>
                          <p className="text-gray-400">Resta Procesar</p>
                          <p className="font-bold text-gray-700">{formatKilos(restante)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Supremas Obtenidas</p>
                          <p className="font-bold text-brand-700">{formatKilos(lote.kilos_supremas)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Rendimiento</p>
                          <p className={`font-bold ${rendimientoLote !== null ? rendimientoColor(rendimientoLote) : "text-gray-400"}`}>
                            {rendimientoLote !== null ? `${rendimientoLote}%` : "—"}
                          </p>
                        </div>
                      </div>

                      {lote.operario?.nombre && (
                        <p className="text-xs text-gray-500">
                          Operario: <strong className="font-medium text-gray-700">{lote.operario.nombre}</strong>
                        </p>
                      )}

                      {lote.notas && (
                        <p className="text-xs text-gray-500 italic bg-amber-50 p-2 rounded border border-amber-100/50">
                          Nota: {lote.notas}
                        </p>
                      )}

                      {/* Botones de acción */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setSelectedOrden(lote);
                            setModalPesadaOpen(true);
                          }}
                        >
                          + Registrar Pesada
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setSelectedOrden(lote);
                            setModalFinalizarOpen(true);
                          }}
                        >
                          ✓ Finalizar Lote
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB content: HISTORIAL DE PESADAS */}
      {activeTab === "historial" && (
        <Card>
          <CardHeader>Historial de elaboraciones individuales</CardHeader>
          <CardBody className="p-0">
            <Table
              data={elaboraciones}
              loading={loading}
              keyExtractor={(e) => e.id}
              emptyMessage="Sin elaboraciones registradas"
              columns={[
                {
                  key: "fecha_elaboracion",
                  header: "Fecha",
                  render: (e) => <span className="text-xs">{formatFechaHora(e.fecha_elaboracion)}</span>,
                },
                {
                  key: "tipo_filet",
                  header: "Materia prima",
                  render: (e) => (
                    <Badge variant="info">{FILET_LABELS[e.tipo_filet] ?? e.tipo_filet}</Badge>
                  ),
                },
                {
                  key: "kilos_filet",
                  header: "Filet usado",
                  align: "right",
                  render: (e) => formatKilos(e.kilos_filet),
                },
                {
                  key: "kilos_supremas",
                  header: "Supremas obtenidas",
                  align: "right",
                  render: (e) => (
                    <span className="font-semibold">{formatKilos(e.kilos_supremas)}</span>
                  ),
                },
                {
                  key: "rendimiento_real",
                  header: "Rendimiento",
                  align: "right",
                  render: (e) => (
                    <span className={`font-semibold ${rendimientoColor(e.rendimiento_real)}`}>
                      {e.rendimiento_real?.toFixed(1)}%
                    </span>
                  ),
                },
                {
                  key: "tiene_alerta",
                  header: "Estado",
                  render: (e) =>
                    e.tiene_alerta ? (
                      <Badge variant="warning">Alerta</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    ),
                },
                {
                  key: "orden_elaboracion_id",
                  header: "Lote Incremental",
                  render: (e) =>
                    e.orden_elaboracion_id ? (
                      <Badge variant="info">Lote incremental</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Directo</span>
                    ),
                },
                {
                  key: "operario",
                  header: "Operario",
                  render: (e) => e.operario?.nombre ?? "—",
                },
                {
                  key: "acciones",
                  header: "",
                  render: (e) => (
                    <AdminOnly>
                      <Button size="sm" variant="danger" onClick={() => setDeletePesada(e)}>
                        Eliminar
                      </Button>
                    </AdminOnly>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {/* TAB content: LOTES FINALIZADOS */}
      {activeTab === "finalizados" && (
        <Card>
          <CardHeader>Registro de lotes completados</CardHeader>
          <CardBody className="p-0">
            <Table
              data={lotesFinalizados}
              loading={loading}
              keyExtractor={(o) => o.id}
              emptyMessage="No hay lotes finalizados aún"
              columns={[
                {
                  key: "fecha_fin",
                  header: "Fecha Cierre",
                  render: (o) => <span className="text-xs">{o.fecha_fin ? formatFechaHora(o.fecha_fin) : "—"}</span>,
                },
                {
                  key: "tipo_filet",
                  header: "Materia prima",
                  render: (o) => (
                    <Badge variant="info">{FILET_LABELS[o.tipo_filet] ?? o.tipo_filet}</Badge>
                  ),
                },
                {
                  key: "kilos_separados",
                  header: "Filet Separado",
                  align: "right",
                  render: (o) => formatKilos(o.kilos_separados),
                },
                {
                  key: "kilos_procesados",
                  header: "Filet Procesado",
                  align: "right",
                  render: (o) => formatKilos(o.kilos_procesados),
                },
                {
                  key: "kilos_supremas",
                  header: "Supremas Obtenidas",
                  align: "right",
                  render: (o) => <span className="font-semibold">{formatKilos(o.kilos_supremas)}</span>,
                },
                {
                  key: "kilos_devueltos",
                  header: "Sobrante Devuelto",
                  align: "right",
                  render: (o) => formatKilos(o.kilos_devueltos),
                },
                {
                  key: "rendimiento",
                  header: "Rend. Promedio",
                  align: "right",
                  render: (o) => {
                    const rend = o.kilos_procesados > 0 ? (o.kilos_supremas / o.kilos_procesados) * 100 : 0;
                    return (
                      <span className={`font-semibold ${rendimientoColor(rend)}`}>
                        {rend.toFixed(1)}%
                      </span>
                    );
                  },
                },
                {
                  key: "notas",
                  header: "Notas",
                  render: (o) => <span className="text-xs text-gray-500 block truncate max-w-xs">{o.notas || "—"}</span>,
                },
                {
                  key: "acciones",
                  header: "",
                  render: (o) => (
                    <AdminOnly>
                      <Button size="sm" variant="danger" onClick={() => setDeleteLote(o)}>
                        Eliminar
                      </Button>
                    </AdminOnly>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {/* MODAL: INICIAR LOTE (SEPARAR FILET) */}
      <Modal
        open={modalIniciarOpen}
        onClose={() => setModalIniciarOpen(false)}
        title="Iniciar lote de elaboración (Separar Filet)"
        size="md"
      >
        <IniciarLoteSupremasForm
          usuarioId={userId}
          onSuccess={() => { setModalIniciarOpen(false); fetchData(); }}
        />
      </Modal>

      {/* MODAL: REGISTRAR PESADA */}
      <Modal
        open={modalPesadaOpen}
        onClose={() => setModalPesadaOpen(false)}
        title={selectedOrden ? `Registrar pesada para lote de ${FILET_LABELS[selectedOrden.tipo_filet]}` : "Registrar pesada directa"}
        size="lg"
      >
        <ElaboracionSupremasForm
          usuarioId={userId}
          orden={selectedOrden || undefined}
          onSuccess={() => { setModalPesadaOpen(false); fetchData(); }}
        />
      </Modal>

      {/* MODAL: FINALIZAR LOTE */}
      <Modal
        open={modalFinalizarOpen}
        onClose={() => setModalFinalizarOpen(false)}
        title="Finalizar Lote de Elaboración"
        size="md"
      >
        {selectedOrden && (
          <FinalizarLoteSupremasForm
            orden={selectedOrden}
            onSuccess={() => { setModalFinalizarOpen(false); fetchData(); }}
          />
        )}
      </Modal>

      {/* Confirmaciones de borrado (admin) */}
      <ConfirmDialog
        open={!!deletePesada}
        onClose={() => setDeletePesada(null)}
        onConfirm={handleDeletePesada}
        loading={deleting}
        message="¿Eliminar esta pesada? El stock de supremas y filet que movió no se revertirá automáticamente; si corresponde, ajustalo desde la sección Stock."
      />
      <ConfirmDialog
        open={!!deleteLote}
        onClose={() => setDeleteLote(null)}
        onConfirm={handleDeleteLote}
        loading={deleting}
        message="¿Eliminar este lote de elaboración? Las pesadas asociadas se conservarán como pesadas directas. El stock no se revertirá automáticamente."
      />
    </div>
  );
}
