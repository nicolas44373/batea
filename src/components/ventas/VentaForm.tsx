"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getProductoPorPlu, getStock, insertVenta } from "@/lib/supabase/queries";
import { formatKilos, formatMoneda, resolverScanBalanza } from "@/lib/utils";
import type { Producto, VStockActual } from "@/types";

const PRODUCTO_LABELS: Record<string, string> = {
  filet_fresco:      "Filet fresco",
  pata_muslo_fresca: "Pata/Muslo fresca",
  pechuga_con_piel:  "Pechuga c/piel",
  alitas:            "Alitas",
  carcasa:           "Carcasa",
  menudos:           "Menudos",
  pollo_entero:      "Pollo entero",
  supremas:          "Supremas",
  pata_muslo:        "Pata/Muslo",
  pechuga:           "Filet fresco (desposte)",
};

const PRODUCTOS_BATEA_VENTA = new Set([
  "filet_fresco",
  "pata_muslo_fresca",
  "pechuga_con_piel",
  "alitas",
  "carcasa",
  "menudos",
  "pollo_entero",
  "supremas",
]);

// Productos habilitados para el modo promo (precio fijo por unidad de venta)
const PRODUCTOS_PROMO = new Set(["filet_fresco", "pata_muslo_fresca", "pechuga_con_piel"]);

interface CartItem {
  producto: Producto;
  kilos: number;           // kilos reales (balanza) → se descuenta del stock
  precio_kg: number;       // calculado internamente: precio_total / kilos
  isPromo: boolean;        // true cuando se vendió con precio fijo
  promoTotal: number;      // precio fijo total de la promo (solo cuando isPromo=true)
  stockProductoId?: string; // si != null, este es el producto_id real para deducir stock
}

interface VentaFormProps {
  usuarioId: string;
  onSuccess?: () => void;
}

export function VentaForm({ usuarioId, onSuccess }: VentaFormProps) {
  const [stock, setStock]         = useState<VStockActual[]>([]);
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [cliente, setCliente]     = useState("");
  const [notas, setNotas]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [scannerMode, setScannerMode] = useState(true);

  // Scanner state
  const [pluInput, setPluInput]         = useState("");
  const [scanResult, setScanResult]     = useState<Producto | null>(null);
  const [scanKilos, setScanKilos]       = useState("");
  const [scanPrecio, setScanPrecio]     = useState("");
  const [scanError, setScanError]       = useState("");

  // Promo state
  const [promoMode, setPromoMode]       = useState(false);
  const [scanPromoTotal, setScanPromoTotal] = useState("");

  const lastKeyTime = useRef<number>(0);
  const scanBuffer  = useRef<string>("");
  const pluRef      = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStock().then(setStock);
  }, []);

  useEffect(() => {
    if (scannerMode) {
      setTimeout(() => pluRef.current?.focus(), 100);
    }
  }, [scannerMode]);

  // Cuando cambia el producto escaneado: si es precio_fijo, activar promo automáticamente
  useEffect(() => {
    if (scanResult) {
      const esFijo = scanResult.precio_fijo === true;
      setPromoMode(esFijo);
      setScanPromoTotal(
        scanResult.precio_venta ? scanResult.precio_venta.toString() : ""
      );
    }
  }, [scanResult]);

  const handlePluKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const delta = now - lastKeyTime.current;
    lastKeyTime.current = now;
    if (delta < 80 && e.key.length === 1) {
      scanBuffer.current += e.key;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const code = (pluInput + (scanBuffer.current || "")).trim();
      scanBuffer.current = "";
      if (!code) return;
      await buscarProducto(code);
    }
  };

  const buscarProducto = async (code: string) => {
    setScanError("");
    setScanResult(null);
    try {
      const { pesoKg } = resolverScanBalanza(code);
      const prod = await getProductoPorPlu(code);
      if (!prod) {
        setScanError(`Código "${code}" no encontrado. Verificá el PLU.`);
        setPluInput("");
        pluRef.current?.focus();
        return;
      }
      // Para productos personalizados con stock vinculado, verificar el stock de la fuente
      const stockCheckId = prod.stock_source_id ?? prod.id;
      const stockItem = stock.find((s) => s.producto_id === stockCheckId);
      if (!stockItem) {
        const nombre = PRODUCTO_LABELS[prod.nombre] ?? prod.nombre;
        setScanError(`No hay registro de stock para ${nombre}.`);
        setPluInput("");
        pluRef.current?.focus();
        return;
      }
      setScanResult(prod);
      setScanKilos(pesoKg != null && pesoKg > 0 ? pesoKg.toFixed(3) : "");
      setScanPrecio(prod.precio_venta?.toString() ?? "");
      setPluInput("");
    } catch {
      setScanError("Error al buscar el producto.");
    }
  };

  const resetScanPanel = () => {
    setScanResult(null);
    setScanKilos("");
    setScanPrecio("");
    setScanPromoTotal("");
    setPromoMode(false);
  };

  const agregarAlCarrito = () => {
    if (!scanResult) return;
    const kilos = parseFloat(scanKilos);
    if (!kilos || kilos <= 0) {
      toast.error("Ingresá los kilos");
      return;
    }
    let precio_kg: number;
    let promoTotal = 0;
    let isPromo = false;

    if (promoMode) {
      const total = parseFloat(scanPromoTotal);
      if (!total || total <= 0) {
        toast.error("Ingresá el precio total de la promo");
        return;
      }
      precio_kg  = total / kilos;
      promoTotal = total;
      isPromo    = true;
    } else {
      precio_kg = parseFloat(scanPrecio) || 0;
    }

    // Los ítems promo se agregan siempre como línea nueva (no se acumulan)
    const stockProductoId = scanResult.stock_source_id ?? undefined;
    const existing = !isPromo ? cart.findIndex((c) => c.producto.id === scanResult.id && !c.isPromo) : -1;
    if (existing >= 0) {
      const updated = [...cart];
      updated[existing] = { ...updated[existing], kilos: updated[existing].kilos + kilos };
      setCart(updated);
    } else {
      setCart((prev) => [...prev, { producto: scanResult, kilos, precio_kg, isPromo, promoTotal, stockProductoId }]);
    }

    resetScanPanel();
    toast.success(`${PRODUCTO_LABELS[scanResult.nombre] ?? scanResult.nombre} agregado`);
    setTimeout(() => pluRef.current?.focus(), 100);
  };

  const removeFromCart = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const updateCartKilos = (idx: number, kilos: number) => {
    setCart((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      if (item.isPromo) {
        // Recalcular precio_kg para mantener el promoTotal exacto
        return { ...item, kilos, precio_kg: item.promoTotal / kilos };
      }
      return { ...item, kilos };
    }));
  };

  const updateCartPrecio = (idx: number, value: number) => {
    setCart((prev) => prev.map((item, i) => i === idx ? { ...item, precio_kg: value } : item));
  };

  const stockWarnings: Record<number, string> = {};
  cart.forEach((item, i) => {
    const checkId = item.stockProductoId ?? item.producto.id;
    const s = stock.find((s) => s.producto_id === checkId);
    if (s && item.kilos > s.kilos) {
      stockWarnings[i] = `Supera stock registrado (${s.kilos.toFixed(2)} kg) — saldo negativo permitido hasta conciliar producción`;
    }
  });

  const totalKilos = cart.reduce((s, i) => s + i.kilos, 0);
  const totalMonto = cart.reduce((s, i) => s + (i.isPromo ? i.promoTotal : i.kilos * i.precio_kg), 0);
  const hasStockWarnings = Object.keys(stockWarnings).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) { toast.error("Agregá al menos un producto"); return; }
    setLoading(true);
    try {
      await insertVenta(
        { cliente: cliente || undefined, notas: notas || undefined, usuario_id: usuarioId },
        cart.map((i) => ({
          // Si el producto tiene fuente de stock, usar ese id para que el trigger descuente correctamente
          producto_id: i.stockProductoId ?? i.producto.id,
          kilos: i.kilos,
          precio_kg: i.precio_kg || undefined,
        }))
      );
      toast.success("Venta registrada");
      setCart([]);
      setCliente("");
      setNotas("");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar venta";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Pueden entrar en modo promo: productos del sistema habilitados + cualquier producto personalizado
  const canPromo = scanResult
    ? PRODUCTOS_PROMO.has(scanResult.nombre) || !!scanResult.stock_source_id || !!scanResult.precio_fijo
    : false;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Header: modo scanner / manual */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setScannerMode(true)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
            scannerMode
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          Pistola / PLU
        </button>
        <button
          type="button"
          onClick={() => setScannerMode(false)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
            !scannerMode
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          Selección manual
        </button>
      </div>

      {/* ── Modo pistola ────────────────────────────────────────────── */}
      {scannerMode && (
        <div className="space-y-3">
          <div className="relative">
            <input
              ref={pluRef}
              type="text"
              value={pluInput}
              onChange={(e) => setPluInput(e.target.value)}
              onKeyDown={handlePluKeyDown}
              placeholder="Escanear código o ingresar PLU + Enter"
              className="w-full rounded-lg border-2 border-brand-400 bg-brand-50 px-4 py-3 text-base font-mono
                         focus:outline-none focus:border-brand-600 focus:ring-0 placeholder:text-brand-300"
              autoComplete="off"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1
                     1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1
                     0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1
                     1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
          </div>

          {scanError && (
            <Alert variant="danger" onClose={() => setScanError("")}>{scanError}</Alert>
          )}

          {/* Panel del producto escaneado */}
          {scanResult && (
            <div className={`border-2 rounded-xl p-4 space-y-3 ${promoMode ? "border-purple-400 bg-purple-50" : "border-green-400 bg-green-50"}`}>
              {(() => {
                const sid = scanResult.stock_source_id ?? scanResult.id;
                const si = stock.find((s) => s.producto_id === sid);
                if (!si || si.kilos > 0) return null;
                return (
                  <Alert variant="warning" className="py-2">
                    Stock actual {formatKilos(si.kilos)}. Podés vender igual; el saldo puede quedar negativo hasta registrar
                    la producción.
                  </Alert>
                );
              })()}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className={`text-xs font-medium uppercase tracking-wide ${promoMode ? "text-purple-600" : "text-green-600"}`}>
                    Producto detectado
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {PRODUCTO_LABELS[scanResult.nombre] ?? scanResult.nombre}
                  </p>
                  {scanResult.codigo_plu && (
                    <p className="text-xs text-gray-500">PLU {scanResult.codigo_plu}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Toggle promo — solo para productos habilitados */}
                  {canPromo && (
                    <button
                      type="button"
                      onClick={() => setPromoMode((v) => !v)}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                        promoMode
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-purple-700 border-purple-300 hover:bg-purple-50"
                      }`}
                    >
                      PROMO
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { resetScanPanel(); pluRef.current?.focus(); }}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  >×</button>
                </div>
              </div>

              {/* Aviso modo promo */}
              {promoMode && (
                <p className="text-xs text-purple-700 bg-purple-100 rounded-lg px-3 py-2">
                  El stock se descuenta por los kilos reales de la balanza.
                  El cliente paga el precio total fijo de la promo.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {promoMode ? "Kilos balanza (real)" : "Kilos"}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    autoFocus
                    value={scanKilos}
                    onChange={(e) => setScanKilos(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarAlCarrito(); } }}
                    placeholder="0.000"
                    className={`w-full rounded-lg border px-3 py-2 text-base font-mono
                               focus:outline-none ${promoMode
                                 ? "border-purple-300 focus:ring-2 focus:ring-purple-400"
                                 : "border-gray-300 focus:ring-2 focus:ring-green-400"
                               }`}
                  />
                  {promoMode && scanKilos && (
                    <p className="text-xs text-purple-600 mt-0.5">Se descuenta del stock</p>
                  )}
                </div>

                <div>
                  {promoMode ? (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Precio total promo ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={scanPromoTotal}
                        onChange={(e) => setScanPromoTotal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarAlCarrito(); } }}
                        placeholder="0.00"
                        readOnly={scanResult?.precio_fijo === true}
                        className={`w-full rounded-lg border px-3 py-2 text-base font-mono
                          focus:outline-none focus:ring-2 focus:ring-purple-400
                          ${scanResult?.precio_fijo
                            ? "border-purple-300 bg-purple-50 text-purple-800 font-bold cursor-default"
                            : "border-purple-300"
                          }`}
                      />
                      <p className="text-xs text-purple-600 mt-0.5">
                        {scanResult?.precio_fijo ? "Precio fijo — no se multiplica por kg" : "Precio fijo cobrado"}
                      </p>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-1">$/kg</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={scanPrecio}
                        onChange={(e) => setScanPrecio(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarAlCarrito(); } }}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-mono
                                   focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Preview subtotal */}
              {promoMode
                ? scanKilos && parseFloat(scanKilos) > 0 && scanPromoTotal && parseFloat(scanPromoTotal) > 0 && (
                  <div className="text-sm text-right space-y-0.5">
                    <p className="text-gray-500">{parseFloat(scanKilos).toFixed(3)} kg reales → stock</p>
                    <p className="font-bold text-purple-800">
                      Promo: {formatMoneda(parseFloat(scanPromoTotal))}
                    </p>
                  </div>
                )
                : scanKilos && parseFloat(scanKilos) > 0 && parseFloat(scanPrecio) > 0 && (
                  <p className="text-sm font-semibold text-gray-800 text-right">
                    Subtotal: {formatMoneda(parseFloat(scanKilos) * parseFloat(scanPrecio))}
                  </p>
                )
              }

              <Button type="button" onClick={agregarAlCarrito} fullWidth
                className={promoMode ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
              >
                Agregar al carrito (Enter)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Modo selección manual ────────────────────────────────────── */}
      {!scannerMode && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Seleccioná un producto:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stock
              .filter((s) => PRODUCTOS_BATEA_VENTA.has(s.producto))
              .sort((a, b) => {
                const orden = ["filet_fresco", "pata_muslo_fresca", "pechuga_con_piel"];
                const ia = orden.indexOf(a.producto);
                const ib = orden.indexOf(b.producto);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return 0;
              })
              .map((s) => (
                <button
                  key={s.producto_id}
                  type="button"
                  onClick={() => {
                    const prod: Producto = {
                      id: s.producto_id,
                      nombre: s.producto,
                      unidad: "kg",
                      activo: true,
                      created_at: "",
                    };
                    setScanResult(prod);
                    setScanKilos("");
                    setScanPrecio("");
                    setScannerMode(true);
                  }}
                  className={`flex flex-col text-left p-3 rounded-lg border transition-all
                    ${["filet_fresco","pata_muslo_fresca","pechuga_con_piel"].includes(s.producto)
                      ? "border-brand-300 bg-brand-50 hover:border-brand-500"
                      : "border-gray-200 hover:border-brand-400 hover:bg-brand-50"
                    }`}
                >
                  <span className="text-sm font-semibold text-gray-900">
                    {PRODUCTO_LABELS[s.producto] ?? s.producto}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      s.kilos < 0 ? "text-red-700" : s.kilos <= 0 ? "text-amber-700" : "text-green-700"
                    }`}
                  >
                    {formatKilos(s.kilos)} disp.
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Carrito ─────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">
              Carrito ({cart.length} ítem{cart.length !== 1 ? "s" : ""})
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {cart.map((item, i) => (
              <div key={i} className={`px-3 py-2.5 flex items-center gap-2 ${item.isPromo ? "bg-purple-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {PRODUCTO_LABELS[item.producto.nombre] ?? item.producto.nombre}
                    </p>
                    {item.isPromo && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold shrink-0">
                        PROMO
                      </span>
                    )}
                  </div>
                  {stockWarnings[i] && (
                    <p className="text-xs text-amber-700">{stockWarnings[i]}</p>
                  )}
                </div>

                {/* Kilos reales */}
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={item.kilos}
                  onChange={(e) => updateCartKilos(i, parseFloat(e.target.value) || 0)}
                  className={`w-20 rounded border px-2 py-1 text-sm font-mono text-right
                    ${stockWarnings[i] ? "border-amber-400" : item.isPromo ? "border-purple-300" : "border-gray-300"}`}
                />
                <span className="text-xs text-gray-400">kg</span>

                {/* Precio: editable solo para no-promo */}
                {item.isPromo ? (
                  <span className="text-sm font-bold text-purple-700 w-28 text-right shrink-0">
                    {formatMoneda(item.promoTotal)}
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.precio_kg}
                      onChange={(e) => updateCartPrecio(i, parseFloat(e.target.value) || 0)}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm font-mono text-right"
                    />
                    <span className="text-xs text-gray-400">$/kg</span>
                    <span className="text-sm font-semibold text-gray-800 w-24 text-right">
                      {item.precio_kg > 0 ? formatMoneda(item.kilos * item.precio_kg) : "—"}
                    </span>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => removeFromCart(i)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0"
                >×</button>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="bg-gray-50 border-t border-gray-200 px-3 py-2.5 flex items-center justify-between">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-600">
                Total: <strong>{totalKilos.toFixed(3)} kg</strong>
              </span>
              {totalMonto > 0 && (
                <span className="text-gray-900 font-bold">{formatMoneda(totalMonto)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Vaciar
            </button>
          </div>
        </div>
      )}

      {hasStockWarnings && (
        <Alert variant="warning">
          Hay líneas que superan el stock mostrado. La venta se registrará y el saldo puede quedar negativo hasta que el
          operario cargue la producción del desposte.
        </Alert>
      )}

      <Input
        label="Cliente (opcional)"
        placeholder="Nombre del cliente"
        value={cliente}
        onChange={(e) => setCliente(e.target.value)}
      />

      <Button
        type="submit"
        loading={loading}
        fullWidth
        disabled={cart.length === 0}
      >
        Confirmar venta {cart.length > 0 ? `(${cart.length} ítem${cart.length !== 1 ? "s" : ""})` : ""}
      </Button>
    </form>
  );
}
