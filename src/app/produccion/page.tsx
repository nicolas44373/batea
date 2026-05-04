"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
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
import { getOrdenes, getOrden, getProduccion, deleteProduccion } from "@/lib/supabase/queries";
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
        <p className="text-sm text-gray-500">Registro de kilos obtenidos por corte</p>
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
                render: (p) => (
                  <span className={`font-semibold ${rendimientoColor(p.rendimiento_real)}`}>
                    {p.rendimiento_real?.toFixed(1)}%
                  </span>
                ),
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
                  <AdminOnly>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(p)}>
                      Eliminar
                    </Button>
                  </AdminOnly>
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

export default function ProduccionPage() {
  return (
    <Suspense>
      <ProduccionContent />
    </Suspense>
  );
}
