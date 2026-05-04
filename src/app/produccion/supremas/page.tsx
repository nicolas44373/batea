"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { ElaboracionSupremasForm } from "@/components/produccion/ElaboracionSupremasForm";
import { getElaboracionSupremas, getStock } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos, rendimientoColor } from "@/lib/utils";
import type { ElaboracionSupremas, VStockActual } from "@/types";

const FILET_LABELS: Record<string, string> = {
  pechuga: "Pechuga",
  filet_fresco: "Filet fresco",
  filet_congelado: "Filet congelado",
};

export default function SupremasPage() {
  const [elaboraciones, setElaboraciones] = useState<ElaboracionSupremas[]>([]);
  const [stock, setStock]                 = useState<VStockActual[]>([]);
  const [modalOpen, setModalOpen]         = useState(false);
  const [loading, setLoading]             = useState(true);
  const [userId, setUserId]               = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [elab, s] = await Promise.all([getElaboracionSupremas(), getStock()]);
      setElaboraciones(elab);
      setStock(s);
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
  const stockPechuga   = stock.find((s) => s.producto === "pechuga");
  const stockFiletF    = stock.find((s) => s.producto === "filet_fresco");
  const stockFiletC    = stock.find((s) => s.producto === "filet_congelado");

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
        <Button onClick={() => setModalOpen(true)}>+ Nueva elaboración</Button>
      </div>

      {/* Stock disponible de materia prima */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pechuga</p>
          <p className={`text-2xl font-bold ${(stockPechuga?.kilos ?? 0) < 5 ? "text-red-600" : "text-gray-900"}`}>
            {(stockPechuga?.kilos ?? 0).toFixed(1)} kg
          </p>
          <p className="text-xs text-gray-400">disponible</p>
        </Card>
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
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Elaboraciones</p>
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

      {/* Historial */}
      <Card>
        <CardHeader>Historial de elaboraciones</CardHeader>
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
                key: "operario",
                header: "Operario",
                render: (e) => e.operario?.nombre ?? "—",
              },
            ]}
          />
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Elaboración de supremas"
        size="lg"
      >
        <ElaboracionSupremasForm
          usuarioId={userId}
          onSuccess={() => { setModalOpen(false); fetchData(); }}
        />
      </Modal>
    </div>
  );
}
