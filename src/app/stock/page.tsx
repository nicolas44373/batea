"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { useCurrentUser } from "@/context/UserContext";
import { getMovimientos, getStock } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import { formatFechaHora, formatKilos } from "@/lib/utils";
import type { MovimientoStock, VStockActual } from "@/types";

const PRODUCTO_LABELS: Record<string, string> = {
  filet_fresco:      "Filet fresco",
  pata_muslo_fresca: "Pata/Muslo fresca",
  pechuga_con_piel:  "Pechuga c/piel",
  alitas:            "Alitas",
  carcasa:           "Carcasa",
  menudos:           "Menudos",
  pollo_entero:      "Pollo entero",
  supremas:          "Supremas",
};

// Productos que se muestran en la batea (excluye congelados, pechuga y pata_muslo del desposte)
const PRODUCTOS_BATEA = new Set(Object.keys(PRODUCTO_LABELS));

export default function StockPage() {
  const [stock, setStock]         = useState<VStockActual[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtroProducto, setFiltroProducto] = useState<string | undefined>();
  const [ajusteModal, setAjusteModal] = useState(false);
  const [ajusteProducto, setAjusteProducto] = useState<VStockActual | null>(null);
  const [ajusteKilos, setAjusteKilos] = useState("");
  const [ajusteTipo, setAjusteTipo]   = useState<"ingreso" | "egreso" | "ajuste">("ajuste");
  const [ajusteNota, setAjusteNota]   = useState("");
  const [ajusteLoading, setAjusteLoading] = useState(false);
  const { userId, isAdmin } = useCurrentUser();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([getStock(), getMovimientos(filtroProducto)]);
      setStock(s);
      setMovimientos(m);
    } finally {
      setLoading(false);
    }
  }, [filtroProducto]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stockBatea = stock.filter((s) => PRODUCTOS_BATEA.has(s.producto));
  const totalKilos = stockBatea.reduce((s, p) => s + p.kilos, 0);

  const handleAjuste = async () => {
    if (!ajusteProducto || !ajusteKilos) return;
    const kilos = parseFloat(ajusteKilos);
    if (!kilos || kilos <= 0) { toast.error("Ingresá los kilos"); return; }
    setAjusteLoading(true);
    try {
      const supabase = createClient();
      const stockActual = ajusteProducto.kilos;
      const nuevoStock = ajusteTipo === "ingreso"
        ? stockActual + kilos
        : ajusteTipo === "egreso"
        ? stockActual - kilos
        : kilos; // ajuste = setea el valor exacto

      if (nuevoStock < 0) { toast.error("El stock no puede quedar negativo"); setAjusteLoading(false); return; }

      await supabase.from("stock_productos")
        .update({ kilos: nuevoStock, updated_at: new Date().toISOString() })
        .eq("producto_id", ajusteProducto.producto_id);

      await supabase.from("movimientos_stock").insert({
        producto_id: ajusteProducto.producto_id,
        tipo: ajusteTipo,
        kilos,
        kilos_anterior: stockActual,
        kilos_nuevo: nuevoStock,
        referencia_tipo: "ajuste_manual",
        notas: ajusteNota || "Ajuste manual desde stock",
        usuario_id: userId,
      });

      toast.success("Stock ajustado correctamente");
      setAjusteModal(false);
      setAjusteKilos("");
      setAjusteNota("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al ajustar");
    } finally {
      setAjusteLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Stock / Batea</h1>
        <p className="text-sm text-gray-500">Stock en tiempo real por producto</p>
      </div>

      {/* Stock cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stockBatea.map((s) => (
          <button
            key={s.producto_id}
            onClick={() =>
              setFiltroProducto(
                filtroProducto === s.producto_id ? undefined : s.producto_id
              )
            }
            className={`p-4 rounded-xl border text-left transition-all ${
              filtroProducto === s.producto_id
                ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {PRODUCTO_LABELS[s.producto] ?? s.producto}
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                s.kilos === 0
                  ? "text-red-600"
                  : s.kilos < 10
                  ? "text-yellow-600"
                  : "text-gray-900"
              }`}
            >
              {s.kilos.toFixed(1)} kg
            </p>
            {s.kilos === 0 && (
              <span className="text-xs text-red-600 font-medium">Sin stock</span>
            )}
            {s.kilos > 0 && s.kilos < 10 && (
              <span className="text-xs text-yellow-600 font-medium">Stock bajo</span>
            )}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Total en batea
            </p>
            <p className="text-3xl font-bold text-gray-900">{totalKilos.toFixed(1)} kg</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminOnly>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAjusteProducto(null); setAjusteModal(true); }}
              >
                Ajuste manual
              </Button>
            </AdminOnly>
            <button
              onClick={() => { setFiltroProducto(undefined); fetchData(); }}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1"
            >
              Actualizar
            </button>
          </div>
        </div>
      </Card>

      {/* Movimientos */}
      <Card>
        <CardHeader
          actions={
            filtroProducto ? (
              <button
                onClick={() => setFiltroProducto(undefined)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Ver todos
              </button>
            ) : undefined
          }
        >
          Historial de movimientos
          {filtroProducto && (
            <span className="ml-2 text-xs text-gray-500 font-normal">
              — {PRODUCTO_LABELS[stockBatea.find((s) => s.producto_id === filtroProducto)?.producto ?? ""] ?? ""}
            </span>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <Table
            data={movimientos}
            loading={loading}
            keyExtractor={(m) => m.id}
            emptyMessage="Sin movimientos"
            columns={[
              {
                key: "created_at",
                header: "Fecha",
                render: (m) => (
                  <span className="text-xs">{formatFechaHora(m.created_at)}</span>
                ),
              },
              {
                key: "producto",
                header: "Producto",
                render: (m) =>
                  PRODUCTO_LABELS[m.producto?.nombre ?? ""] ?? m.producto?.nombre ?? "—",
              },
              {
                key: "tipo",
                header: "Tipo",
                render: (m) => (
                  <Badge
                    variant={
                      m.tipo === "ingreso"
                        ? "success"
                        : m.tipo === "egreso"
                        ? "danger"
                        : "neutral"
                    }
                  >
                    {m.tipo}
                  </Badge>
                ),
              },
              {
                key: "kilos",
                header: "Kilos",
                align: "right",
                render: (m) => (
                  <span
                    className={
                      m.tipo === "ingreso" ? "text-green-700 font-medium" : "text-red-700 font-medium"
                    }
                  >
                    {m.tipo === "ingreso" ? "+" : "-"}{formatKilos(m.kilos)}
                  </span>
                ),
              },
              {
                key: "stock",
                header: "Stock resultante",
                align: "right",
                render: (m) => formatKilos(m.kilos_nuevo),
              },
              {
                key: "referencia",
                header: "Origen",
                render: (m) => (
                  <span className="text-xs text-gray-500">
                    {m.referencia_tipo ?? "—"}
                  </span>
                ),
              },
              {
                key: "usuario",
                header: "Usuario",
                render: (m) => m.usuario?.nombre ?? "—",
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Modal ajuste manual — solo admin */}
      <AdminOnly>
        <Modal
          open={ajusteModal}
          onClose={() => { setAjusteModal(false); setAjusteProducto(null); setAjusteKilos(""); setAjusteNota(""); }}
          title="Ajuste manual de stock"
          size="sm"
        >
          <div className="space-y-4">
            {/* Selección de producto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
              <select
                value={ajusteProducto?.producto_id ?? ""}
                onChange={(e) => {
                  const s = stockBatea.find((x) => x.producto_id === e.target.value);
                  setAjusteProducto(s ?? null);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Seleccionar...</option>
                {stockBatea.map((s) => (
                  <option key={s.producto_id} value={s.producto_id}>
                    {PRODUCTO_LABELS[s.producto] ?? s.producto} — {s.kilos.toFixed(2)} kg actuales
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de ajuste */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <div className="grid grid-cols-3 gap-2">
                {(["ingreso", "egreso", "ajuste"] as const).map((t) => (
                  <label key={t} className={`flex items-center justify-center py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all ${ajusteTipo === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <input type="radio" className="sr-only" value={t} checked={ajusteTipo === t} onChange={() => setAjusteTipo(t)} />
                    {t === "ingreso" ? "Ingreso" : t === "egreso" ? "Egreso" : "Setear valor"}
                  </label>
                ))}
              </div>
              {ajusteTipo === "ajuste" && (
                <p className="text-xs text-amber-600 mt-1">El stock quedará exactamente en el valor ingresado.</p>
              )}
            </div>

            {/* Kilos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {ajusteTipo === "ajuste" ? "Nuevo valor de stock (kg)" : "Kilos"}
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={ajusteKilos}
                onChange={(e) => setAjusteKilos(e.target.value)}
                placeholder="0.000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {ajusteProducto && ajusteKilos && ajusteTipo !== "ajuste" && (
                <p className="text-xs text-gray-500 mt-1">
                  Resultado: {
                    ajusteTipo === "ingreso"
                      ? (ajusteProducto.kilos + parseFloat(ajusteKilos || "0")).toFixed(3)
                      : Math.max(0, ajusteProducto.kilos - parseFloat(ajusteKilos || "0")).toFixed(3)
                  } kg
                </p>
              )}
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
              <input
                type="text"
                value={ajusteNota}
                onChange={(e) => setAjusteNota(e.target.value)}
                placeholder="Merma, corrección de inventario..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <Button onClick={handleAjuste} loading={ajusteLoading} fullWidth disabled={!ajusteProducto || !ajusteKilos}>
              Confirmar ajuste
            </Button>
          </div>
        </Modal>
      </AdminOnly>
    </div>
  );
}
