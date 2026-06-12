"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getVentas, getRemitos } from "@/lib/supabase/queries";
import {
  descargarCsv,
  formatMoneda,
  getProductoLabel,
  localDateStr,
  MEDIO_PAGO_LABELS,
} from "@/lib/utils";
import type { Remito, Venta } from "@/types";

type Rango = "hoy" | "7d" | "30d" | "mes" | "custom";

function inicioDe(rango: Rango): string {
  const d = new Date();
  if (rango === "7d") d.setDate(d.getDate() - 7);
  if (rango === "30d") d.setDate(d.getDate() - 30);
  if (rango === "mes") d.setDate(1);
  return localDateStr(d);
}

export default function ReportesPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [loading, setLoading] = useState(true);

  const [rango, setRango] = useState<Rango>("7d");
  const [desde, setDesde] = useState(inicioDe("7d"));
  const [hasta, setHasta] = useState(localDateStr());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([getVentas(), getRemitos()]);
      setVentas(v);
      setRemitos(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function aplicarRango(r: Rango) {
    setRango(r);
    if (r !== "custom") {
      setDesde(inicioDe(r));
      setHasta(localDateStr());
    }
  }

  // ── Filtro por fecha (inclusive) ──────────────────────────────────────
  const enRango = (fechaIso: string) => {
    const f = fechaIso.slice(0, 10);
    return f >= desde && f <= hasta;
  };

  const ventasFiltradas = ventas.filter((v) => enRango(v.created_at));
  const remitosFiltrados = remitos.filter((r) => enRango(r.fecha));

  // ── KPIs de ventas ────────────────────────────────────────────────────
  const totalMonto = ventasFiltradas.reduce((s, v) => s + (v.total_monto ?? 0), 0);
  const totalKilos = ventasFiltradas.reduce((s, v) => s + (v.total_kilos ?? 0), 0);

  const porMedio = Object.entries(
    ventasFiltradas.reduce((acc, v) => {
      const m = v.medio_pago ?? "efectivo";
      acc[m] = (acc[m] ?? 0) + (v.total_monto ?? 0);
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]);

  // ── Top productos vendidos en el período ──────────────────────────────
  const porProducto = Object.values(
    ventasFiltradas
      .flatMap((v) => v.items ?? [])
      .reduce((acc, item) => {
        const nombre = item.producto?.nombre ?? "desconocido";
        if (!acc[nombre]) acc[nombre] = { producto: nombre, kilos: 0, monto: 0 };
        acc[nombre].kilos += item.kilos ?? 0;
        acc[nombre].monto += item.subtotal ?? (item.kilos ?? 0) * (item.precio_kg ?? 0);
        return acc;
      }, {} as Record<string, { producto: string; kilos: number; monto: number }>)
  ).sort((a, b) => b.monto - a.monto);

  // ── Compras (remitos) ─────────────────────────────────────────────────
  const totalCompras = remitosFiltrados.reduce(
    (s, r) => s + (r.items ?? []).reduce((si, i) => si + (i.costo_total ?? 0), 0),
    0
  );

  // ── Exportaciones CSV ─────────────────────────────────────────────────
  function exportVentas() {
    const rows = ventasFiltradas.flatMap((v) =>
      (v.items ?? []).map((item) => ({
        fecha: v.created_at.slice(0, 10),
        hora: v.created_at.slice(11, 16),
        numero: v.numero,
        cliente: v.cliente_registrado?.nombre ?? v.cliente ?? "Mostrador",
        medio_pago: MEDIO_PAGO_LABELS[v.medio_pago ?? "efectivo"] ?? v.medio_pago ?? "",
        producto: item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "",
        kilos: item.kilos.toFixed(3).replace(".", ","),
        precio_kg: item.precio_kg != null ? item.precio_kg.toFixed(2).replace(".", ",") : "",
        subtotal: (item.subtotal ?? item.kilos * (item.precio_kg ?? 0)).toFixed(2).replace(".", ","),
        cajero: v.usuario?.nombre ?? "",
      }))
    );
    descargarCsv(`ventas_${desde}_a_${hasta}.csv`, [
      { key: "fecha", label: "Fecha" },
      { key: "hora", label: "Hora" },
      { key: "numero", label: "Venta #" },
      { key: "cliente", label: "Cliente" },
      { key: "medio_pago", label: "Medio de pago" },
      { key: "producto", label: "Producto" },
      { key: "kilos", label: "Kilos" },
      { key: "precio_kg", label: "$/kg" },
      { key: "subtotal", label: "Subtotal" },
      { key: "cajero", label: "Cajero" },
    ], rows);
  }

  function exportRemitos() {
    const rows = remitosFiltrados.flatMap((r) =>
      (r.items ?? []).map((item) => ({
        fecha: r.fecha.slice(0, 10),
        numero: r.numero_remito,
        proveedor: r.proveedor?.nombre ?? "",
        producto: item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "",
        unidades: Math.round(item.kilos),
        costo_unitario: item.precio_costo != null ? item.precio_costo.toFixed(2).replace(".", ",") : "",
        costo_total: item.costo_total != null ? item.costo_total.toFixed(2).replace(".", ",") : "",
        registrado_por: r.usuario?.nombre ?? "",
      }))
    );
    descargarCsv(`compras_${desde}_a_${hasta}.csv`, [
      { key: "fecha", label: "Fecha" },
      { key: "numero", label: "Remito" },
      { key: "proveedor", label: "Proveedor" },
      { key: "producto", label: "Producto" },
      { key: "unidades", label: "Unidades" },
      { key: "costo_unitario", label: "Costo unitario" },
      { key: "costo_total", label: "Costo total" },
      { key: "registrado_por", label: "Registrado por" },
    ], rows);
  }

  const RANGOS: [Rango, string][] = [
    ["hoy", "Hoy"],
    ["7d", "7 días"],
    ["30d", "30 días"],
    ["mes", "Este mes"],
    ["custom", "Personalizado"],
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500">Ventas y compras por período, exportables a Excel</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
          {RANGOS.map(([r, label]) => (
            <button
              key={r}
              type="button"
              onClick={() => aplicarRango(r)}
              className={`px-3 py-1.5 transition-colors ${
                rango === r ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Rango personalizado */}
      {rango === "custom" && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando datos...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ventas</p>
              <p className="text-2xl font-bold text-gray-900">{ventasFiltradas.length}</p>
              <p className="text-xs text-gray-400">{totalKilos.toFixed(1)} kg vendidos</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Facturado</p>
              <p className="text-2xl font-bold text-green-700">{formatMoneda(totalMonto)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Compras (remitos)</p>
              <p className="text-2xl font-bold text-gray-900">{formatMoneda(totalCompras)}</p>
              <p className="text-xs text-gray-400">{remitosFiltrados.length} remito{remitosFiltrados.length !== 1 ? "s" : ""}</p>
            </Card>
            <Card className={`p-4 ${totalMonto - totalCompras >= 0 ? "bg-green-50" : "bg-red-50"}`}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Diferencia</p>
              <p className={`text-2xl font-bold ${totalMonto - totalCompras >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatMoneda(totalMonto - totalCompras)}
              </p>
              <p className="text-xs text-gray-400">ventas - compras del período</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Por medio de pago */}
            <Card>
              <CardHeader
                actions={
                  <Button size="sm" variant="outline" onClick={exportVentas} disabled={ventasFiltradas.length === 0}>
                    ⬇ Exportar ventas (CSV)
                  </Button>
                }
              >
                Ventas por medio de pago
              </CardHeader>
              <CardBody className="p-0">
                {porMedio.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Sin ventas en el período</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {porMedio.map(([medio, monto]) => (
                      <div key={medio} className="px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                          {MEDIO_PAGO_LABELS[medio] ?? medio}
                        </span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-900">{formatMoneda(monto)}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            {totalMonto > 0 ? `${((monto / totalMonto) * 100).toFixed(0)}%` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Top productos */}
            <Card>
              <CardHeader
                actions={
                  <Button size="sm" variant="outline" onClick={exportRemitos} disabled={remitosFiltrados.length === 0}>
                    ⬇ Exportar compras (CSV)
                  </Button>
                }
              >
                Productos más vendidos
              </CardHeader>
              <CardBody className="p-0">
                {porProducto.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Sin datos en el período</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {porProducto.slice(0, 8).map((p) => (
                      <div key={p.producto} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {getProductoLabel(p.producto)}
                          </p>
                          <p className="text-xs text-gray-400">{p.kilos.toFixed(1)} kg</p>
                        </div>
                        <p className="text-sm font-bold text-green-700 shrink-0">{formatMoneda(p.monto)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
