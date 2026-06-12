"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatFecha, formatMoneda, rendimientoColor, getProductoLabel } from "@/lib/utils";
import { getRentabilidadLotes, getVentasPorProducto, getProductos } from "@/lib/supabase/queries";
import type { Producto, VRentabilidadLote, VVentasPorProducto } from "@/types";

const TIPO_LABELS: Record<string, string> = {
  pollo_entero:         "Pollo entero",
  filet_fresco:         "Filet fresco",
  filet_congelado:      "Filet congelado",
  pata_muslo_fresca:    "Pata/Muslo fresca",
  pata_muslo_congelada: "Pata/Muslo congelada",
};

type Periodo = "30d" | "90d" | "365d" | "todo";

function fechaDesde(periodo: Periodo): string | null {
  if (periodo === "todo") return null;
  const d = new Date();
  if (periodo === "30d")  d.setDate(d.getDate() - 30);
  if (periodo === "90d")  d.setDate(d.getDate() - 90);
  if (periodo === "365d") d.setDate(d.getDate() - 365);
  return d.toISOString().split("T")[0];
}

export default function RentabilidadPage() {
  const [lotes, setLotes]         = useState<VRentabilidadLote[]>([]);
  const [ventas, setVentas]       = useState<VVentasPorProducto[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading]     = useState(true);
  const [periodo, setPeriodo]     = useState<Periodo>("30d");
  const [tabActivo, setTabActivo] = useState<"resumen" | "lotes" | "marcas" | "ventas">("resumen");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [l, v, p] = await Promise.all([
        getRentabilidadLotes(),
        getVentasPorProducto(),
        getProductos(),
      ]);
      setLotes(l);
      setVentas(v);
      setProductos(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtrar por período
  const desde = fechaDesde(periodo);
  const lotesFiltrados = desde
    ? lotes.filter((l) => l.fecha >= desde)
    : lotes;

  // ── Métricas generales ─────────────────────────────────────────────
  const totalInversion   = lotesFiltrados.reduce((s, l) => s + (l.costo_total ?? 0), 0);
  const totalCajones     = lotesFiltrados.reduce((s, l) => s + l.cantidad_cajones, 0);
  const totalKgComprados = lotesFiltrados.reduce((s, l) => s + l.peso_total, 0);
  const totalKgProd      = lotesFiltrados.reduce((s, l) => s + (l.kilos_producidos ?? 0), 0);
  const costoPorKgProm   = totalKgProd > 0 ? totalInversion / totalKgProd : 0;

  // Ventas filtradas por período
  const ventasFiltradas = desde
    ? ventas.filter((v) => !v.ultima_venta || v.ultima_venta >= desde)
    : ventas;
  const totalIngresos   = ventasFiltradas.reduce((s, v) => s + v.ingreso_total, 0);
  const margenBruto     = totalIngresos - totalInversion;
  const margenPct       = totalInversion > 0 ? (margenBruto / totalInversion) * 100 : 0;

  // ── Por marca (agrupado) ────────────────────────────────────────────
  const porMarca = Object.values(
    lotesFiltrados.reduce((acc, l) => {
      const key = `${l.marca}__${l.tipo_producto}`;
      if (!acc[key]) {
        acc[key] = {
          marca:            l.marca,
          tipo_producto:    l.tipo_producto,
          lotes:            0,
          cajones:          0,
          costo_total:      0,
          kg_comprados:     0,
          kg_producidos:    0,
          rendimientos:     [] as number[],
        };
      }
      acc[key].lotes++;
      acc[key].cajones      += l.cantidad_cajones;
      acc[key].costo_total  += l.costo_total ?? 0;
      acc[key].kg_comprados += l.peso_total;
      acc[key].kg_producidos += l.kilos_producidos ?? 0;
      if (l.rendimiento_promedio > 0) acc[key].rendimientos.push(l.rendimiento_promedio);
      return acc;
    }, {} as Record<string, {
      marca: string; tipo_producto: string; lotes: number; cajones: number;
      costo_total: number; kg_comprados: number; kg_producidos: number; rendimientos: number[];
    }>)
  ).map((m) => ({
    ...m,
    rendimiento_promedio: m.rendimientos.length
      ? m.rendimientos.reduce((s, r) => s + r, 0) / m.rendimientos.length
      : null,
    costo_por_kg: m.kg_producidos > 0 ? m.costo_total / m.kg_producidos : null,
  })).sort((a, b) => b.costo_total - a.costo_total);

  const TABS = [
    { id: "resumen", label: "Resumen" },
    { id: "lotes",   label: "Por lote" },
    { id: "marcas",  label: "Por marca" },
    { id: "ventas",  label: "Ingresos" },
  ] as const;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rentabilidad</h1>
          <p className="text-sm text-gray-500">Costos, rendimiento y márgenes reales de la batea</p>
        </div>

        {/* Filtro de período */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
          {([["30d","Últimos 30d"],["90d","3 meses"],["365d","1 año"],["todo","Todo"]] as [Periodo,string][]).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 transition-colors ${
                periodo === p
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Inversión</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoneda(totalInversion)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalCajones} cajones · {totalKgComprados.toFixed(0)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ingresos ventas</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoneda(totalIngresos)}</p>
          <p className="text-xs text-gray-400 mt-0.5">ventas registradas</p>
        </Card>
        <Card className={`p-4 ${margenBruto >= 0 ? "bg-green-50" : "bg-red-50"}`}>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Margen bruto</p>
          <p className={`text-2xl font-bold ${margenBruto >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatMoneda(margenBruto)}
          </p>
          <p className={`text-xs mt-0.5 font-semibold ${margenBruto >= 0 ? "text-green-600" : "text-red-500"}`}>
            {margenBruto >= 0 ? "+" : ""}{margenPct.toFixed(1)}%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Costo/kg producido</p>
          <p className="text-2xl font-bold text-gray-900">
            {costoPorKgProm > 0 ? formatMoneda(costoPorKgProm) : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{totalKgProd.toFixed(0)} kg producidos</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTabActivo(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tabActivo === t.id
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando datos...</div>
      ) : (
        <>
          {/* ── Tab: Resumen ─────────────────────────────────────────── */}
          {tabActivo === "resumen" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top marcas por inversión */}
              <Card>
                <CardHeader>Top marcas por inversión</CardHeader>
                <CardBody className="p-0">
                  {porMarca.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">
                      Sin datos en el período. Asegurate de cargar los costos al registrar los lotes.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {porMarca.slice(0, 6).map((m, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{m.marca}</p>
                            <p className="text-xs text-gray-400">
                              {TIPO_LABELS[m.tipo_producto] ?? m.tipo_producto} · {m.lotes} lote{m.lotes !== 1 ? "s" : ""} · {m.cajones} cajones
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900">{formatMoneda(m.costo_total)}</p>
                            {m.costo_por_kg && (
                              <p className="text-xs text-gray-500">{formatMoneda(m.costo_por_kg)}/kg prod.</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Top productos por ingreso */}
              <Card>
                <CardHeader>Ingresos por producto</CardHeader>
                <CardBody className="p-0">
                  {ventasFiltradas.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">
                      Sin ventas con precio registrado en el período.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {ventasFiltradas.slice(0, 6).map((v, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {getProductoLabel(v.producto)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {v.kilos_vendidos.toFixed(1)} kg · {v.transacciones} transacciones
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-green-700">{formatMoneda(v.ingreso_total)}</p>
                            <p className="text-xs text-gray-500">
                              {formatMoneda(v.precio_kg_promedio)}/kg prom.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── Tab: Por lote ─────────────────────────────────────────── */}
          {tabActivo === "lotes" && (
            <Card>
              <CardHeader>
                Detalle por lote
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  {lotesFiltrados.length} lote{lotesFiltrados.length !== 1 ? "s" : ""}
                </span>
              </CardHeader>
              <CardBody className="p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Marca</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Cajones</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">$/cajón</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Costo total</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Kg prod.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">$/kg prod.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Rend.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lotesFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                          Sin lotes en el período seleccionado
                        </td>
                      </tr>
                    ) : (
                      lotesFiltrados.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-xs text-gray-500">{formatFecha(l.fecha)}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{l.marca}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant="neutral">
                              {TIPO_LABELS[l.tipo_producto] ?? l.tipo_producto}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right">{l.cantidad_cajones}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {l.costo_por_cajon > 0 ? formatMoneda(l.costo_por_cajon) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            {l.costo_total > 0 ? formatMoneda(l.costo_total) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {l.kilos_producidos > 0 ? `${l.kilos_producidos.toFixed(1)} kg` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {l.costo_por_kg_prod > 0 ? formatMoneda(l.costo_por_kg_prod) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {l.rendimiento_promedio > 0 ? (
                              <span className={`font-semibold ${rendimientoColor(l.rendimiento_promedio)}`}>
                                {l.rendimiento_promedio.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {lotesFiltrados.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">TOTALES</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{totalCajones}</td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right font-bold">{formatMoneda(totalInversion)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{totalKgProd.toFixed(1)} kg</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-brand-700">
                          {costoPorKgProm > 0 ? formatMoneda(costoPorKgProm) : "—"}
                        </td>
                        <td className="px-3 py-2.5" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardBody>
            </Card>
          )}

          {/* ── Tab: Por marca ────────────────────────────────────────── */}
          {tabActivo === "marcas" && (
            <Card>
              <CardHeader>Rendimiento y costo por marca</CardHeader>
              <CardBody className="p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Marca</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Lotes</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Cajones</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Inversión total</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Kg producidos</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">$/kg producido</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Rend. prom.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {porMarca.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                          Sin datos en el período
                        </td>
                      </tr>
                    ) : (
                      porMarca.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-semibold text-gray-900">{m.marca}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {TIPO_LABELS[m.tipo_producto] ?? m.tipo_producto}
                          </td>
                          <td className="px-3 py-2.5 text-right">{m.lotes}</td>
                          <td className="px-3 py-2.5 text-right">{m.cajones}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{formatMoneda(m.costo_total)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {m.kg_producidos > 0 ? `${m.kg_producidos.toFixed(1)} kg` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {m.costo_por_kg != null ? (
                              <span className="font-semibold text-brand-700">{formatMoneda(m.costo_por_kg)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {m.rendimiento_promedio != null ? (
                              <span className={`font-bold ${rendimientoColor(m.rendimiento_promedio)}`}>
                                {m.rendimiento_promedio.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* ── Tab: Ventas ───────────────────────────────────────────── */}
          {tabActivo === "ventas" && (
            <div className="space-y-5">
              <Card>
                <CardHeader>Ingresos por producto</CardHeader>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Producto</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Kg vendidos</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Ingreso total</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">$/kg promedio</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Precio lista</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Margen est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ventasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                            Sin ventas con precio registrado
                          </td>
                        </tr>
                      ) : (
                        ventasFiltradas.map((v, i) => {
                          const margen = costoPorKgProm > 0 && v.precio_kg_promedio > 0
                            ? ((v.precio_kg_promedio - costoPorKgProm) / v.precio_kg_promedio) * 100
                            : null;
                          const precioLista = productos.find((p) => p.nombre === v.producto)?.precio_venta ?? null;
                          const vendeBajoLista = precioLista != null && precioLista > 0 && v.precio_kg_promedio < precioLista * 0.97;
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 font-semibold text-gray-900">
                                {getProductoLabel(v.producto)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs">
                                {v.kilos_vendidos.toFixed(1)} kg
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-green-700">
                                {formatMoneda(v.ingreso_total)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">
                                <span className={vendeBajoLista ? "text-amber-600 font-semibold" : ""}>
                                  {formatMoneda(v.precio_kg_promedio)}
                                </span>
                                {vendeBajoLista && (
                                  <span className="block text-[10px] text-amber-500">debajo de lista</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-500">
                                {precioLista != null && precioLista > 0 ? formatMoneda(precioLista) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {margen != null ? (
                                  <span className={`font-semibold ${margen >= 30 ? "text-green-600" : margen >= 10 ? "text-yellow-600" : "text-red-600"}`}>
                                    {margen.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">Sin costo ref.</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {ventasFiltradas.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                        <tr>
                          <td className="px-3 py-2.5 font-semibold text-gray-600 text-xs uppercase">TOTAL</td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            {ventasFiltradas.reduce((s, v) => s + v.kilos_vendidos, 0).toFixed(1)} kg
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-green-700">
                            {formatMoneda(totalIngresos)}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                    El margen estimado compara el precio promedio de venta contra el costo por kg
                    producido del desposte ({costoPorKgProm > 0 ? formatMoneda(costoPorKgProm) : "sin datos"}/kg,
                    promedio del período). Cargá el costo por cajón en cada lote para que sea preciso.
                  </p>
                </CardBody>
              </Card>

              {/* Comparativa inversión vs ingresos */}
              {(totalInversion > 0 || totalIngresos > 0) && (
                <Card className="p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Comparativa del período</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Inversión</p>
                      <p className="text-xl font-bold text-gray-900">{formatMoneda(totalInversion)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Ingresos</p>
                      <p className="text-xl font-bold text-green-700">{formatMoneda(totalIngresos)}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${margenBruto >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Margen bruto</p>
                      <p className={`text-xl font-bold ${margenBruto >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatMoneda(margenBruto)}
                      </p>
                      <p className={`text-xs font-semibold mt-0.5 ${margenBruto >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {margenBruto >= 0 ? "+" : ""}{margenPct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
