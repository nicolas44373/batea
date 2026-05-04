"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { getProductoPorPlu, getStock, insertVenta } from "@/lib/supabase/queries";
import { formatKilos, formatMoneda } from "@/lib/utils";
import type { Producto, VStockActual } from "@/types";

const PRODUCTO_LABELS: Record<string, string> = {
  pata_muslo: "Pata/Muslo",
  pechuga: "Pechuga",
  alitas: "Alitas",
  carcasa: "Carcasa",
  menudos: "Menudos",
  pollo_entero: "Pollo entero",
  supremas: "Supremas",
  filet_fresco: "Filet fresco",
  filet_congelado: "Filet congelado",
  pata_muslo_fresca: "Pata/Muslo fresca",
  pata_muslo_congelada: "Pata/Muslo congelada",
};

interface CartItem {
  producto: Producto;
  kilos: number;
  precio_kg: number;
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

  // Timing para detectar pistola (input rápido)
  const lastKeyTime = useRef<number>(0);
  const scanBuffer  = useRef<string>("");
  const pluRef      = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStock().then(setStock);
  }, []);

  // Auto-focus en el campo PLU al abrir modo scanner
  useEffect(() => {
    if (scannerMode) {
      setTimeout(() => pluRef.current?.focus(), 100);
    }
  }, [scannerMode]);

  // ── Manejo de la pistola lectora ─────────────────────────────────────
  // Las pistolas envían caracteres muy rápido (<50ms entre teclas) + Enter al final
  const handlePluKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const delta = now - lastKeyTime.current;
    lastKeyTime.current = now;

    // Si el caracter llegó en menos de 80ms del anterior → es pistola
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
      const prod = await getProductoPorPlu(code);
      if (!prod) {
        setScanError(`Código "${code}" no encontrado. Verificá el PLU.`);
        setPluInput("");
        pluRef.current?.focus();
        return;
      }
      const stockItem = stock.find((s) => s.producto_id === prod.id);
      if (!stockItem || stockItem.kilos <= 0) {
        setScanError(`Sin stock disponible de ${PRODUCTO_LABELS[prod.nombre] ?? prod.nombre}.`);
        setPluInput("");
        pluRef.current?.focus();
        return;
      }
      setScanResult(prod);
      setScanKilos("");
      setScanPrecio(prod.precio_venta?.toString() ?? "");
      setPluInput("");
    } catch {
      setScanError("Error al buscar el producto.");
    }
  };

  const agregarAlCarrito = () => {
    if (!scanResult) return;
    const kilos = parseFloat(scanKilos);
    if (!kilos || kilos <= 0) {
      toast.error("Ingresá los kilos");
      return;
    }
    const stockItem = stock.find((s) => s.producto_id === scanResult.id);
    if (stockItem && kilos > stockItem.kilos) {
      toast.error(`Máximo disponible: ${formatKilos(stockItem.kilos)}`);
      return;
    }
    const precio = parseFloat(scanPrecio) || 0;
    const existing = cart.findIndex((c) => c.producto.id === scanResult.id);
    if (existing >= 0) {
      const updated = [...cart];
      updated[existing] = { ...updated[existing], kilos: updated[existing].kilos + kilos };
      setCart(updated);
    } else {
      setCart((prev) => [...prev, { producto: scanResult, kilos, precio_kg: precio }]);
    }
    setScanResult(null);
    setScanKilos("");
    setScanPrecio("");
    toast.success(`${PRODUCTO_LABELS[scanResult.nombre] ?? scanResult.nombre} agregado`);
    setTimeout(() => pluRef.current?.focus(), 100);
  };

  const removeFromCart = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const updateCartItem = (idx: number, field: "kilos" | "precio_kg", value: number) => {
    setCart((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // ── Validación de stock ───────────────────────────────────────────────
  const stockErrors: Record<number, string> = {};
  cart.forEach((item, i) => {
    const s = stock.find((s) => s.producto_id === item.producto.id);
    if (s && item.kilos > s.kilos) {
      stockErrors[i] = `Máx: ${s.kilos.toFixed(2)} kg`;
    }
  });

  const totalKilos  = cart.reduce((s, i) => s + i.kilos, 0);
  const totalMonto  = cart.reduce((s, i) => s + i.kilos * i.precio_kg, 0);
  const hasErrors   = Object.keys(stockErrors).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) { toast.error("Agregá al menos un producto"); return; }
    if (hasErrors) { toast.error("Hay ítems con stock insuficiente"); return; }
    setLoading(true);
    try {
      await insertVenta(
        { cliente: cliente || undefined, notas: notas || undefined, usuario_id: usuarioId },
        cart.map((i) => ({ producto_id: i.producto.id, kilos: i.kilos, precio_kg: i.precio_kg || undefined }))
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
            <div className="border-2 border-green-400 bg-green-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Producto detectado</p>
                  <p className="text-lg font-bold text-gray-900">
                    {PRODUCTO_LABELS[scanResult.nombre] ?? scanResult.nombre}
                  </p>
                  {scanResult.codigo_plu && (
                    <p className="text-xs text-gray-500">PLU {scanResult.codigo_plu}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setScanResult(null); pluRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >×</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kilos
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-mono
                               focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    $/kg
                  </label>
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
                </div>
              </div>

              {scanKilos && parseFloat(scanKilos) > 0 && parseFloat(scanPrecio) > 0 && (
                <p className="text-sm font-semibold text-gray-800 text-right">
                  Subtotal: {formatMoneda(parseFloat(scanKilos) * parseFloat(scanPrecio))}
                </p>
              )}

              <Button type="button" onClick={agregarAlCarrito} fullWidth>
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
            {stock.filter((s) => s.kilos > 0).map((s) => (
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
                className="flex flex-col text-left p-3 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-all"
              >
                <span className="text-sm font-semibold text-gray-900">
                  {PRODUCTO_LABELS[s.producto] ?? s.producto}
                </span>
                <span className="text-xs text-green-700">{formatKilos(s.kilos)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Carrito ─────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">Carrito ({cart.length} ítem{cart.length !== 1 ? "s" : ""})</p>
          </div>
          <div className="divide-y divide-gray-100">
            {cart.map((item, i) => (
              <div key={i} className="px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {PRODUCTO_LABELS[item.producto.nombre] ?? item.producto.nombre}
                  </p>
                  {stockErrors[i] && (
                    <p className="text-xs text-red-600">{stockErrors[i]}</p>
                  )}
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={item.kilos}
                  onChange={(e) => updateCartItem(i, "kilos", parseFloat(e.target.value) || 0)}
                  className={`w-20 rounded border px-2 py-1 text-sm font-mono text-right
                    ${stockErrors[i] ? "border-red-400" : "border-gray-300"}`}
                />
                <span className="text-xs text-gray-400">kg</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.precio_kg}
                  onChange={(e) => updateCartItem(i, "precio_kg", parseFloat(e.target.value) || 0)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm font-mono text-right"
                />
                <span className="text-xs text-gray-400">$/kg</span>
                <span className="text-sm font-semibold text-gray-800 w-24 text-right">
                  {item.precio_kg > 0 ? formatMoneda(item.kilos * item.precio_kg) : "—"}
                </span>
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
            <div className="flex gap-4 text-sm">
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

      {hasErrors && (
        <Alert variant="danger">Hay productos con stock insuficiente. Ajustá las cantidades.</Alert>
      )}

      {/* Cliente */}
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
        disabled={cart.length === 0 || hasErrors}
      >
        Confirmar venta {cart.length > 0 ? `(${cart.length} ítem${cart.length !== 1 ? "s" : ""})` : ""}
      </Button>
    </form>
  );
}
