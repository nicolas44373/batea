"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Table } from "@/components/ui/Table";
import { getVentas, getPagosClientes, getCierresCaja, insertCierreCaja } from "@/lib/supabase/queries";
import { formatFecha, formatFechaHora, formatMoneda, localDateStr, MEDIO_PAGO_LABELS } from "@/lib/utils";
import { useCurrentUser } from "@/context/UserContext";
import type { CierreCaja, PagoCliente, Venta } from "@/types";

export default function CajaPage() {
  const { userId } = useCurrentUser();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pagos, setPagos] = useState<PagoCliente[]>([]);
  const [cierres, setCierres] = useState<CierreCaja[]>([]);
  const [loading, setLoading] = useState(true);

  const [efectivoContado, setEfectivoContado] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, c] = await Promise.all([
        getVentas(),
        getPagosClientes(),
        getCierresCaja(),
      ]);
      setVentas(v);
      setPagos(p);
      setCierres(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Datos del día ─────────────────────────────────────────────────────
  const hoy = localDateStr();
  const ventasHoy = ventas.filter((v) => v.created_at.startsWith(hoy));
  const pagosHoy = pagos.filter((p) => p.created_at.startsWith(hoy));

  const porMedio = (medio: string) =>
    ventasHoy
      .filter((v) => (v.medio_pago ?? "efectivo") === medio)
      .reduce((s, v) => s + (v.total_monto ?? 0), 0);

  const totalEfectivo = porMedio("efectivo");
  const totalTransferencia = porMedio("transferencia");
  const totalTarjeta = porMedio("tarjeta");
  const totalCtaCte = porMedio("cuenta_corriente");
  const totalVentasHoy = ventasHoy.reduce((s, v) => s + (v.total_monto ?? 0), 0);

  const pagosEfectivoHoy = pagosHoy
    .filter((p) => p.medio_pago === "efectivo")
    .reduce((s, p) => s + p.monto, 0);
  const totalPagosHoy = pagosHoy.reduce((s, p) => s + p.monto, 0);

  // Efectivo que debería haber físicamente en la caja
  const efectivoEsperado = totalEfectivo + pagosEfectivoHoy;
  const contado = parseFloat(efectivoContado);
  const diferencia = Number.isFinite(contado) ? contado - efectivoEsperado : null;

  const cierreHoyExiste = cierres.some((c) => c.fecha === hoy);

  // Resumen por cajero
  const porCajero = Object.values(
    ventasHoy.reduce((acc, v) => {
      const key = v.usuario?.nombre ?? "—";
      if (!acc[key]) acc[key] = { cajero: key, ventas: 0, monto: 0 };
      acc[key].ventas++;
      acc[key].monto += v.total_monto ?? 0;
      return acc;
    }, {} as Record<string, { cajero: string; ventas: number; monto: number }>)
  ).sort((a, b) => b.monto - a.monto);

  async function handleGuardarCierre() {
    if (!Number.isFinite(contado)) {
      toast.error("Ingresá el efectivo contado en caja");
      return;
    }
    setSaving(true);
    try {
      await insertCierreCaja({
        fecha: hoy,
        total_ventas: totalVentasHoy,
        total_efectivo: totalEfectivo,
        total_transferencia: totalTransferencia,
        total_tarjeta: totalTarjeta,
        total_cuenta_corriente: totalCtaCte,
        total_pagos_recibidos: totalPagosHoy,
        efectivo_contado: contado,
        diferencia: diferencia ?? undefined,
        notas: notas.trim() || undefined,
        usuario_id: userId || undefined,
      });
      toast.success("Cierre de caja guardado");
      setEfectivoContado("");
      setNotas("");
      fetchData();
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "Error al guardar el cierre";
      if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("could not find")) {
        toast.error("Falta ejecutar la migración SQL (supabase/migracion_v2_clientes_caja.sql)");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cierre de Caja</h1>
        <p className="text-sm text-gray-500">
          Arqueo del día {formatFecha(hoy)} — ventas por medio de pago y control de efectivo
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando movimientos del día...</div>
      ) : (
        <>
          {/* Totales por medio de pago */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="p-4 border-green-200 bg-green-50">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Efectivo</p>
              <p className="text-xl font-bold text-green-800">{formatMoneda(totalEfectivo)}</p>
              <p className="text-xs text-green-600">
                {ventasHoy.filter((v) => (v.medio_pago ?? "efectivo") === "efectivo").length} ventas
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Transferencia</p>
              <p className="text-xl font-bold text-gray-900">{formatMoneda(totalTransferencia)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tarjeta</p>
              <p className="text-xl font-bold text-gray-900">{formatMoneda(totalTarjeta)}</p>
            </Card>
            <Card className="p-4 border-amber-200 bg-amber-50">
              <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Cta. Corriente</p>
              <p className="text-xl font-bold text-amber-800">{formatMoneda(totalCtaCte)}</p>
              <p className="text-xs text-amber-600">fiado (no entra a caja)</p>
            </Card>
            <Card className="p-4 col-span-2 sm:col-span-1 border-brand-200 bg-brand-50">
              <p className="text-xs text-brand-700 font-medium uppercase tracking-wide">Total del día</p>
              <p className="text-xl font-bold text-brand-800">{formatMoneda(totalVentasHoy)}</p>
              <p className="text-xs text-brand-600">{ventasHoy.length} ventas</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Arqueo de efectivo */}
            <Card>
              <CardHeader>Arqueo de efectivo</CardHeader>
              <CardBody className="space-y-4">
                {cierreHoyExiste && (
                  <Alert variant="info">
                    Ya hay un cierre guardado para hoy. Podés registrar otro si hiciste un arqueo nuevo.
                  </Alert>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ventas en efectivo</span>
                    <span className="font-semibold">{formatMoneda(totalEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pagos de clientes en efectivo</span>
                    <span className="font-semibold">{formatMoneda(pagosEfectivoHoy)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-semibold text-gray-800">Efectivo esperado en caja</span>
                    <span className="font-bold text-lg">{formatMoneda(efectivoEsperado)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Efectivo contado (físico)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={efectivoContado}
                    onChange={(e) => setEfectivoContado(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {diferencia != null && (
                  <div className={`rounded-lg p-3 border text-sm font-semibold ${
                    Math.abs(diferencia) < 0.01
                      ? "bg-green-50 border-green-200 text-green-700"
                      : diferencia > 0
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}>
                    {Math.abs(diferencia) < 0.01
                      ? "✓ La caja cierra perfecta"
                      : diferencia > 0
                      ? `Sobran ${formatMoneda(diferencia)}`
                      : `Faltan ${formatMoneda(Math.abs(diferencia))}`}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                  <input
                    placeholder="Observaciones del arqueo..."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <Button onClick={handleGuardarCierre} loading={saving} fullWidth>
                  Guardar cierre del día
                </Button>
              </CardBody>
            </Card>

            {/* Por cajero */}
            <Card>
              <CardHeader>Ventas por cajero (hoy)</CardHeader>
              <CardBody className="p-0">
                {porCajero.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">Sin ventas hoy</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {porCajero.map((c) => (
                      <div key={c.cajero} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.cajero}</p>
                          <p className="text-xs text-gray-400">{c.ventas} venta{c.ventas !== 1 ? "s" : ""}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{formatMoneda(c.monto)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {pagosHoy.length > 0 && (
                  <div className="border-t border-gray-200 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Pagos de clientes recibidos hoy
                    </p>
                    <div className="space-y-1">
                      {pagosHoy.map((p) => (
                        <div key={p.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {p.cliente?.nombre ?? "—"}{" "}
                            <span className="text-xs text-gray-400">({MEDIO_PAGO_LABELS[p.medio_pago]})</span>
                          </span>
                          <span className="font-semibold text-green-700">{formatMoneda(p.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Historial de cierres */}
          <Card>
            <CardHeader>Historial de cierres</CardHeader>
            <CardBody className="p-0">
              <Table
                data={cierres}
                keyExtractor={(c) => c.id}
                emptyMessage="Sin cierres registrados. Para usar esta sección ejecutá la migración SQL si aún no lo hiciste."
                columns={[
                  {
                    key: "fecha",
                    header: "Fecha",
                    render: (c) => formatFecha(c.fecha),
                  },
                  {
                    key: "total_ventas",
                    header: "Ventas",
                    align: "right",
                    render: (c) => formatMoneda(c.total_ventas),
                  },
                  {
                    key: "total_efectivo",
                    header: "Efectivo",
                    align: "right",
                    render: (c) => formatMoneda(c.total_efectivo),
                  },
                  {
                    key: "total_transferencia",
                    header: "Transf.",
                    align: "right",
                    render: (c) => formatMoneda(c.total_transferencia),
                  },
                  {
                    key: "total_cuenta_corriente",
                    header: "Cta. Cte.",
                    align: "right",
                    render: (c) => formatMoneda(c.total_cuenta_corriente),
                  },
                  {
                    key: "efectivo_contado",
                    header: "Contado",
                    align: "right",
                    render: (c) => (c.efectivo_contado != null ? formatMoneda(c.efectivo_contado) : "—"),
                  },
                  {
                    key: "diferencia",
                    header: "Diferencia",
                    align: "right",
                    render: (c) =>
                      c.diferencia == null ? (
                        "—"
                      ) : Math.abs(c.diferencia) < 0.01 ? (
                        <span className="text-green-600 font-semibold">OK</span>
                      ) : (
                        <span className={`font-semibold ${c.diferencia > 0 ? "text-blue-600" : "text-red-600"}`}>
                          {c.diferencia > 0 ? "+" : ""}{formatMoneda(c.diferencia)}
                        </span>
                      ),
                  },
                  {
                    key: "usuario",
                    header: "Cerró",
                    render: (c) => c.usuario?.nombre ?? "—",
                  },
                  {
                    key: "created_at",
                    header: "Hora",
                    render: (c) => <span className="text-xs text-gray-400">{formatFechaHora(c.created_at)}</span>,
                  },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
