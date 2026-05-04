"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table } from "@/components/ui/Table";
import { getAlertas, getLotes, getStock, getVentas } from "@/lib/supabase/queries";
import {
  formatFecha,
  formatFechaHora,
  formatKilos,
  formatMoneda,
  localDateStr,
  rendimientoColor,
} from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { LoteCajones, VAlertasProduccion, VStockActual, Venta } from "@/types";

const PRODUCTO_LABELS: Record<string, string> = {
  pata_muslo: "Pata/Muslo",
  pechuga: "Pechuga",
  alitas: "Alitas",
  carcasa: "Carcasa",
  menudos: "Menudos",
  pollo_entero: "Pollo entero",
};

export default function DashboardPage() {
  const [stock, setStock] = useState<VStockActual[]>([]);
  const [lotes, setLotes] = useState<LoteCajones[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [alertas, setAlertas] = useState<VAlertasProduccion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStock(), getLotes(), getVentas(), getAlertas()])
      .then(([s, l, v, a]) => {
        setStock(s);
        setLotes(l);
        setVentas(v);
        setAlertas(a);
      })
      .finally(() => setLoading(false));
  }, []);

  const hoy = localDateStr();
  const ventasHoy = ventas.filter((v) => v.created_at.startsWith(hoy));
  const kilosHoy = ventasHoy.reduce((s, v) => s + (v.total_kilos ?? 0), 0);
  const montoHoy = ventasHoy.reduce((s, v) => s + (v.total_monto ?? 0), 0);
  const totalKilosStock = stock.reduce((s, p) => s + p.kilos, 0);
  const lotesDisponibles = lotes.filter((l) => l.cajones_disponibles > 0).length;

  const stockChartData = stock.map((s) => ({
    name: PRODUCTO_LABELS[s.producto] ?? s.producto,
    kilos: parseFloat(s.kilos.toFixed(2)),
    low: s.kilos < 10,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 capitalize">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "America/Argentina/Buenos_Aires",
          })}
        </p>
      </div>

      {/* Alertas activas */}
      {alertas.length > 0 && (
        <Alert variant="warning" title={`${alertas.length} alerta(s) de rendimiento`}>
          Hay producciones con rendimiento fuera del rango esperado.{" "}
          <Link href="/produccion" className="underline font-medium">
            Ver producción
          </Link>
        </Alert>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Stock total"
          value={`${totalKilosStock.toFixed(0)} kg`}
          sub="en batea"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
        />
        <StatCard
          label="Kilos vendidos hoy"
          value={`${kilosHoy.toFixed(1)} kg`}
          sub={`${ventasHoy.length} ventas`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Monto hoy"
          value={formatMoneda(montoHoy)}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Lotes disponibles"
          value={lotesDisponibles}
          sub={`de ${lotes.length} totales`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stock chart */}
        <Card>
          <CardHeader>Stock por producto</CardHeader>
          <CardBody>
            {loading ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                Cargando...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stockChartData} barSize={32}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [`${v} kg`, "Stock"]}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="kilos" radius={[4, 4, 0, 0]}>
                    {stockChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.kilos === 0 ? "#ef4444" : entry.low ? "#f59e0b" : "#ea580c"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Alertas de rendimiento */}
        <Card>
          <CardHeader
            actions={
              <Link href="/produccion" className="text-xs text-brand-600 hover:text-brand-800">
                Ver todo
              </Link>
            }
          >
            Alertas de rendimiento
          </CardHeader>
          <CardBody className="p-0">
            {alertas.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Sin alertas activas
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {alertas.slice(0, 5).map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-gray-900">
                          {a.marca} — {a.calibre}
                        </p>
                        <p className="text-xs text-gray-500">{a.alerta_detalle}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatFechaHora(a.fecha_produccion)} · {a.operario}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${rendimientoColor(a.rendimiento_real)}`}>
                        {a.rendimiento_real?.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Últimas ventas */}
      <Card>
        <CardHeader
          actions={
            <Link href="/ventas" className="text-xs text-brand-600 hover:text-brand-800">
              Ver todo
            </Link>
          }
        >
          Últimas ventas
        </CardHeader>
        <CardBody className="p-0">
          <Table
            data={ventas.slice(0, 8)}
            loading={loading}
            keyExtractor={(v) => v.id}
            emptyMessage="Sin ventas"
            columns={[
              {
                key: "numero",
                header: "#",
                render: (v) => <span className="font-mono">#{v.numero}</span>,
              },
              {
                key: "created_at",
                header: "Fecha",
                render: (v) => (
                  <span className="text-xs">{formatFechaHora(v.created_at)}</span>
                ),
              },
              {
                key: "cliente",
                header: "Cliente",
                render: (v) => v.cliente ?? <span className="text-gray-400 text-xs">Mostrador</span>,
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
                  v.total_monto ? formatMoneda(v.total_monto) : "—",
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Lotes recientes */}
      <Card>
        <CardHeader
          actions={
            <Link href="/cajones" className="text-xs text-brand-600 hover:text-brand-800">
              Ver todo
            </Link>
          }
        >
          Lotes recientes
        </CardHeader>
        <CardBody className="p-0">
          <Table
            data={lotes.slice(0, 5)}
            loading={loading}
            keyExtractor={(l) => l.id}
            emptyMessage="Sin lotes"
            columns={[
              { key: "fecha", header: "Fecha", render: (l) => formatFecha(l.fecha) },
              { key: "marca", header: "Marca" },
              {
                key: "calibre",
                header: "Calibre",
                render: (l) => <Badge variant="info">{l.calibre}</Badge>,
              },
              {
                key: "cajones",
                header: "Cajones disp.",
                align: "right",
                render: (l) => `${l.cajones_disponibles} / ${l.cantidad_cajones}`,
              },
              {
                key: "peso_total",
                header: "Peso total",
                align: "right",
                render: (l) => formatKilos(l.peso_total),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
