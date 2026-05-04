"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { getProductos, insertProducto, updateProductoPrecio } from "@/lib/supabase/queries";
import { formatMoneda } from "@/lib/utils";
import type { Producto } from "@/types";

// Labels para productos del sistema
const SISTEMA_LABELS: Record<string, string> = {
  filet_fresco:         "Filet fresco",
  pata_muslo_fresca:    "Pata/Muslo fresca",
  alitas:               "Alitas",
  carcasa:              "Carcasa",
  menudos:              "Menudos",
  pollo_entero:         "Pollo entero",
  supremas:             "Supremas",
  filet_congelado:      "Filet congelado",
  pata_muslo_congelada: "Pata/Muslo congelada",
  // productos internos (no se venden normalmente)
  pata_muslo:           "Pata/Muslo (desposte)",
  pechuga:              "Filet fresco (desposte)",
};

const PRODUCTOS_SISTEMA = Object.keys(SISTEMA_LABELS);

function getNombreDisplay(prod: Producto): string {
  return SISTEMA_LABELS[prod.nombre] ?? prod.nombre;
}

interface PrecioEdit {
  precio_venta: string;
  codigo_plu:   string;
}

export default function PreciosPage() {
  const [productos, setProductos]     = useState<Producto[]>([]);
  const [edits, setEdits]             = useState<Record<string, PrecioEdit>>({});
  const [saving, setSaving]           = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [modalOpen, setModalOpen]     = useState(false);

  // Nuevo producto
  const [newNombre, setNewNombre]     = useState("");
  const [newPlu, setNewPlu]           = useState("");
  const [newPrecio, setNewPrecio]     = useState("");
  const [creating, setCreating]       = useState(false);
  const nombreRef                     = useRef<HTMLInputElement>(null);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductos();
      setProductos(data);
      const initial: Record<string, PrecioEdit> = {};
      data.forEach((p) => {
        initial[p.id] = {
          precio_venta: p.precio_venta?.toString() ?? "",
          codigo_plu:   p.codigo_plu ?? "",
        };
      });
      setEdits(initial);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cargar productos";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProductos(); }, [fetchProductos]);

  useEffect(() => {
    if (modalOpen) setTimeout(() => nombreRef.current?.focus(), 100);
  }, [modalOpen]);

  // ── Guardar precio/PLU ──────────────────────────────────────────────
  const handleSave = async (producto: Producto) => {
    const edit = edits[producto.id];
    if (!edit) return;
    setSaving((prev) => ({ ...prev, [producto.id]: true }));
    try {
      await updateProductoPrecio(
        producto.id,
        edit.precio_venta ? parseFloat(edit.precio_venta) : null,
        edit.codigo_plu.trim() || null
      );
      toast.success(`${getNombreDisplay(producto)} actualizado`);
      fetchProductos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving((prev) => ({ ...prev, [producto.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    const changed = productos.filter((p) => hasChange(p));
    if (changed.length === 0) return;
    for (const p of changed) await handleSave(p);
  };

  const hasChange = (producto: Producto) => {
    const edit = edits[producto.id];
    if (!edit) return false;
    return (
      edit.precio_venta !== (producto.precio_venta?.toString() ?? "") ||
      edit.codigo_plu   !== (producto.codigo_plu ?? "")
    );
  };

  // ── Crear producto personalizado ────────────────────────────────────
  // El "nombre" interno en la DB es el slug del PLU o del nombre visible
  const toSlug = (str: string) =>
    str.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const handleCreate = async () => {
    if (!newNombre.trim()) { toast.error("Ingresá el nombre del producto"); return; }
    if (!newPlu.trim())    { toast.error("Ingresá el código PLU"); return; }

    const slug = toSlug(newNombre);
    if (!slug) { toast.error("El nombre no es válido"); return; }

    setCreating(true);
    try {
      await insertProducto({
        nombre:       slug,
        codigo_plu:   newPlu.trim(),
        precio_venta: newPrecio ? parseFloat(newPrecio) : undefined,
      });
      toast.success(`Producto "${newNombre}" creado`);
      setNewNombre("");
      setNewPlu("");
      setNewPrecio("");
      setModalOpen(false);
      fetchProductos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear producto";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  // Separar productos del sistema de los personalizados
  const prodSistema      = productos.filter((p) => PRODUCTOS_SISTEMA.includes(p.nombre));
  const prodPersonalizados = productos.filter((p) => !PRODUCTOS_SISTEMA.includes(p.nombre));
  const totalCambiados   = productos.filter((p) => hasChange(p)).length;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Precios y Códigos PLU</h1>
          <p className="text-sm text-gray-500">
            Configurá el precio por kilo y el código PLU de cada producto para la pistola lectora.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {totalCambiados > 0 && (
            <Button variant="primary" onClick={handleSaveAll}>
              Guardar todos ({totalCambiados})
            </Button>
          )}
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            + Nuevo producto
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title="Error al cargar productos">
          {error}
          <br />
          <strong>Solución:</strong> ejecutá el archivo{" "}
          <code className="bg-red-100 px-1 rounded">supabase/fix_productos_rls.sql</code>{" "}
          en el SQL Editor de Supabase para configurar los permisos de la tabla.
        </Alert>
      )}

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-gray-400 animate-pulse">Cargando productos...</p>
        </Card>
      ) : (
        <>
          {/* Productos del sistema */}
          <Card>
            <CardHeader
              actions={<Badge variant="neutral">{prodSistema.length} productos</Badge>}
            >
              Productos del sistema
            </CardHeader>
            <CardBody className="p-0">
              {prodSistema.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  No se encontraron productos.{" "}
                  <button
                    onClick={fetchProductos}
                    className="text-brand-600 hover:underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <ProductosList
                  productos={prodSistema}
                  edits={edits}
                  saving={saving}
                  hasChange={hasChange}
                  onEdit={(id, field, val) =>
                    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
                  }
                  onSave={handleSave}
                  getNombre={getNombreDisplay}
                  showSlug={false}
                />
              )}
            </CardBody>
          </Card>

          {/* Productos personalizados */}
          <Card>
            <CardHeader
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant="info">{prodPersonalizados.length} productos</Badge>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                  >
                    + Agregar
                  </button>
                </div>
              }
            >
              Productos personalizados (balanza)
            </CardHeader>
            <CardBody className="p-0">
              {prodPersonalizados.length === 0 ? (
                <div className="px-4 py-8 text-center space-y-2">
                  <p className="text-sm text-gray-500">
                    No hay productos personalizados todavía.
                  </p>
                  <p className="text-xs text-gray-400">
                    Agregá los productos de tu balanza con su código PLU.
                  </p>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                  >
                    Crear primer producto
                  </button>
                </div>
              ) : (
                <ProductosList
                  productos={prodPersonalizados}
                  edits={edits}
                  saving={saving}
                  hasChange={hasChange}
                  onEdit={(id, field, val) =>
                    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
                  }
                  onSave={handleSave}
                  getNombre={getNombreDisplay}
                  showSlug={true}
                />
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Modal nuevo producto */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo producto personalizado"
        size="sm"
      >
        <div className="space-y-4">
          <Alert variant="info">
            Ingresá el nombre como querés que se muestre y el código PLU tal como
            está programado en tu balanza.
          </Alert>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <input
                ref={nombreRef}
                type="text"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="ej: Milanesa, Suprema rebozada..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {newNombre.trim() && (
                <p className="text-xs text-gray-400 mt-1">
                  Nombre interno: <code className="bg-gray-100 px-1 rounded">{toSlug(newNombre)}</code>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código PLU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newPlu}
                onChange={(e) => setNewPlu(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="ej: 20, 150, o código de tu balanza"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                El mismo código que programaste en tu balanza electrónica.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio ($/kg) — opcional
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPrecio}
                  onChange={(e) => setNewPrecio(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <Button onClick={handleCreate} loading={creating} fullWidth>
            Crear producto
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Componente reutilizable para lista de productos ─────────────────────
interface ProductosListProps {
  productos:   Producto[];
  edits:       Record<string, PrecioEdit>;
  saving:      Record<string, boolean>;
  hasChange:   (p: Producto) => boolean;
  onEdit:      (id: string, field: "precio_venta" | "codigo_plu", val: string) => void;
  onSave:      (p: Producto) => Promise<void>;
  getNombre:   (p: Producto) => string;
  showSlug:    boolean;
}

function ProductosList({
  productos, edits, saving, hasChange, onEdit, onSave, getNombre, showSlug,
}: ProductosListProps) {
  return (
    <div className="divide-y divide-gray-100">
      {productos.map((prod) => {
        const edit    = edits[prod.id];
        const changed = hasChange(prod);
        if (!edit) return null;

        return (
          <div
            key={prod.id}
            className={`px-4 py-3 transition-colors ${changed ? "bg-amber-50" : ""}`}
          >
            {/* Fila nombre + botón guardar */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{getNombre(prod)}</p>
                {showSlug && (
                  <p className="text-xs text-gray-400 font-mono truncate">{prod.nombre}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {edit.precio_venta && parseFloat(edit.precio_venta) > 0 && (
                  <span className={`text-sm font-semibold hidden sm:inline ${changed ? "text-amber-700" : "text-gray-600"}`}>
                    {formatMoneda(parseFloat(edit.precio_venta))}
                  </span>
                )}
                <Button
                  size="sm"
                  variant={changed ? "primary" : "secondary"}
                  loading={saving[prod.id]}
                  disabled={!changed}
                  onClick={() => onSave(prod)}
                >
                  {changed ? "Guardar" : "OK"}
                </Button>
              </div>
            </div>

            {/* Fila inputs */}
            <div className="flex flex-wrap gap-3">
              {/* PLU */}
              <div className="flex-1 min-w-[100px] max-w-[140px]">
                <label className="block text-xs text-gray-500 mb-1">Código PLU</label>
                <input
                  type="text"
                  value={edit.codigo_plu}
                  onChange={(e) => onEdit(prod.id, "codigo_plu", e.target.value)}
                  placeholder="—"
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
                />
              </div>

              {/* Precio */}
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-gray-500 mb-1">Precio ($/kg)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={edit.precio_venta}
                    onChange={(e) => onEdit(prod.id, "precio_venta", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 pl-5 pr-2.5 py-1.5 text-sm font-mono
                               focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
