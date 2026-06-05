"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { getProductos, insertProducto, updateProductoPrecio, deleteProducto } from "@/lib/supabase/queries";
import { formatMoneda, getProductoLabel } from "@/lib/utils";
import { useCurrentUser } from "@/context/UserContext";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Producto } from "@/types";

// Labels para productos del sistema
const SISTEMA_LABELS: Record<string, string> = {
  filet_fresco:         "Filet fresco",
  pata_muslo_fresca:    "Pata/Muslo fresca",
  pechuga_con_piel:     "Pechuga c/piel",
  alitas:               "Alitas",
  carcasa:              "Carcasa",
  menudos:              "Menudos",
  pollo_entero:         "Pollo entero",
  supremas:             "Supremas",
  filet_congelado:      "Filet congelado",
  pata_muslo_congelada: "Pata/Muslo congelada",
  pata_muslo:           "Pata/Muslo (desposte)",
  pechuga:              "Filet fresco (desposte)",
};

const PRODUCTOS_SISTEMA = Object.keys(SISTEMA_LABELS);

function getNombreDisplay(prod: Producto): string {
  return getProductoLabel(prod.nombre);
}

interface PrecioEdit {
  precio_venta:    string;
  codigo_plu:      string;
  stock_source_id: string;   // solo relevante para productos personalizados
  precio_fijo:     boolean;  // true = precio_venta es total fijo (promo), no por kg
}

export default function PreciosPage() {
  const [productos, setProductos]     = useState<Producto[]>([]);
  const [edits, setEdits]             = useState<Record<string, PrecioEdit>>({});
  const [saving, setSaving]           = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [modalType, setModalType]     = useState<"original" | "promo" | null>(null);

  // Nuevo producto
  const [newNombre, setNewNombre]             = useState("");
  const [newPlu, setNewPlu]                   = useState("");
  const [newPrecio, setNewPrecio]             = useState("");
  const [newStockSource, setNewStockSource]   = useState("");
  const [newPrecioFijo, setNewPrecioFijo]     = useState(false);
  const [creating, setCreating]               = useState(false);
  const nombreRef                             = useRef<HTMLInputElement>(null);

  // Renombrar producto
  const [renamingTarget, setRenamingTarget]   = useState<Producto | null>(null);
  const [newNameValue, setNewNameValue]       = useState("");
  const [renaming, setRenaming]               = useState(false);

  // Eliminar producto
  const [deletingTarget, setDeletingTarget]   = useState<Producto | null>(null);
  const [deleting, setDeleting]               = useState(false);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductos();
      setProductos(data);
      const initial: Record<string, PrecioEdit> = {};
      data.forEach((p) => {
        initial[p.id] = {
          precio_venta:    p.precio_venta?.toString() ?? "",
          codigo_plu:      p.codigo_plu ?? "",
          stock_source_id: p.stock_source_id ?? "",
          precio_fijo:     p.precio_fijo ?? false,
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
    if (modalType) setTimeout(() => nombreRef.current?.focus(), 100);
  }, [modalType]);

  // ── Guardar precio/PLU ──────────────────────────────────────────────
  const handleSave = async (producto: Producto) => {
    const edit = edits[producto.id];
    if (!edit) return;
    setSaving((prev) => ({ ...prev, [producto.id]: true }));
    try {
      await updateProductoPrecio(
        producto.id,
        edit.precio_venta ? parseFloat(edit.precio_venta) : null,
        edit.codigo_plu.trim() || null,
        edit.stock_source_id || null,
        edit.precio_fijo
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
      edit.precio_venta    !== (producto.precio_venta?.toString() ?? "") ||
      edit.codigo_plu      !== (producto.codigo_plu ?? "") ||
      edit.stock_source_id !== (producto.stock_source_id ?? "") ||
      edit.precio_fijo     !== (producto.precio_fijo ?? false)
    );
  };

  // ── Crear producto personalizado ────────────────────────────────────
  // Slug estable y único: nombre + sufijo del PLU (evita 409 por "Promo pata" repetido)
  const toSlug = (str: string) =>
    str.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const handleCreate = async () => {
    if (!newNombre.trim()) { toast.error("Ingresá el nombre del producto"); return; }
    if (!newPlu.trim())    { toast.error("Ingresá el código PLU"); return; }
    if (modalType === "promo" && !newStockSource) {
      toast.error("Seleccioná de qué producto descuenta stock esta promo");
      return;
    }

    const base = toSlug(newNombre);
    if (!base) { toast.error("El nombre no es válido"); return; }
    const slug = base;

    setCreating(true);
    try {
      const prod = await insertProducto({
        nombre:          slug,
        codigo_plu:      newPlu.trim(),
        precio_venta:    newPrecio ? parseFloat(newPrecio) : undefined,
      });
      // Si hay configuración extra (stock_source o precio_fijo), actualizar
      // Para tipo original, stock_source es null por defecto
      const stockSourceId = modalType === "promo" ? newStockSource : null;
      const precioFijoVal = modalType === "promo" ? newPrecioFijo : false;

      if (stockSourceId || precioFijoVal) {
        await updateProductoPrecio(
          prod.id,
          newPrecio ? parseFloat(newPrecio) : null,
          newPlu.trim() || null,
          stockSourceId || null,
          precioFijoVal
        );
      }
      toast.success(`Producto "${newNombre}" creado`);
      setNewNombre("");
      setNewPlu("");
      setNewPrecio("");
      setNewStockSource("");
      setNewPrecioFijo(false);
      setModalType(null);
      fetchProductos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear producto";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renamingTarget) return;
    if (!newNameValue.trim()) {
      toast.error("Ingresá un nombre válido");
      return;
    }
    const base = toSlug(newNameValue);
    if (!base) {
      toast.error("El nombre no es válido");
      return;
    }
    setRenaming(true);
    try {
      const edit = edits[renamingTarget.id];
      await updateProductoPrecio(
        renamingTarget.id,
        edit?.precio_venta ? parseFloat(edit.precio_venta) : null,
        edit?.codigo_plu.trim() || null,
        edit?.stock_source_id || null,
        edit?.precio_fijo || false,
        base
      );
      toast.success(`Producto renombrado a "${newNameValue}"`);
      setRenamingTarget(null);
      setNewNameValue("");
      fetchProductos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al renombrar";
      toast.error(msg);
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteProducto = async () => {
    if (!deletingTarget) return;
    setDeleting(true);
    try {
      await deleteProducto(deletingTarget.id);
      toast.success(`Producto "${getNombreDisplay(deletingTarget)}" eliminado`);
      setDeletingTarget(null);
      fetchProductos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Separar productos originales (los de sistema + nuevos sin vincular) de las promos (los vinculados)
  const prodSistema      = productos.filter((p) => p.stock_source_id == null);
  const prodPersonalizados = productos.filter((p) => p.stock_source_id != null);
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
        <AdminOnly>
          <div className="flex flex-wrap gap-2">
            {totalCambiados > 0 && (
              <Button variant="primary" onClick={handleSaveAll}>
                Guardar todos ({totalCambiados})
              </Button>
            )}
            <Button variant="outline" onClick={() => {
              setNewStockSource("");
              setNewPrecioFijo(false);
              setModalType("original");
            }}>
              + Nuevo original
            </Button>
            <Button variant="outline" onClick={() => {
              setNewStockSource("");
              setNewPrecioFijo(true);
              setModalType("promo");
            }}>
              + Nueva promo
            </Button>
          </div>
        </AdminOnly>
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
              Productos originales (con stock)
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
                  onRename={(p) => {
                    setRenamingTarget(p);
                    setNewNameValue(getNombreDisplay(p));
                  }}
                  onDelete={setDeletingTarget}
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
                </div>
              }
            >
              Promociones / Combos (vínculo de stock)
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
                    onClick={() => setModalType("promo")}
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
                  stockOptions={prodSistema}
                  onRename={(p) => {
                    setRenamingTarget(p);
                    setNewNameValue(getNombreDisplay(p));
                  }}
                  onDelete={setDeletingTarget}
                />
                
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Modal nuevo producto */}
      <Modal
        open={!!modalType}
        onClose={() => setModalType(null)}
        title={modalType === "original" ? "Nuevo producto original" : "Nueva promo / personalizado"}
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
                  Nombre interno:&nbsp;
                  <code className="bg-gray-100 px-1 rounded">
                    {toSlug(newNombre)}
                  </code>
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

            {/* Toggle precio fijo (solo para promos) */}
            {modalType === "promo" && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Precio fijo (promo)</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    El precio configurado es el total cobrado (ej: $10.500 por el combo),
                    no se multiplica por los kilos. Solo se pide el peso real.
                  </p>
                </div>
                <Toggle value={newPrecioFijo} onChange={setNewPrecioFijo} />
              </div>
            )}

            {modalType === "promo" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descuenta stock de <span className="text-red-500">*</span>
                </label>
                <select
                  value={newStockSource}
                  onChange={(e) => setNewStockSource(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-500
                    ${newStockSource ? "border-green-400" : "border-amber-300"}`}
                >
                  <option value="">Seleccionar producto original...</option>
                  {prodSistema.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getProductoLabel(s.nombre)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Al vender este producto, el stock se descuenta del producto original seleccionado.
                </p>
              </div>
            )}
          </div>

          <Button onClick={handleCreate} loading={creating} fullWidth>
            Crear producto
          </Button>
        </div>
      </Modal>

      {/* Modal renombrar producto */}
      <Modal
        open={!!renamingTarget}
        onClose={() => { setRenamingTarget(null); setNewNameValue(""); }}
        title="Renombrar producto"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nuevo nombre del producto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newNameValue}
              onChange={(e) => setNewNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              placeholder="ej: Suprema de Pollo..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {newNameValue.trim() && (
              <p className="text-xs text-gray-400 mt-1">
                Nombre interno (slug):&nbsp;
                <code className="bg-gray-100 px-1 rounded">
                  {toSlug(newNameValue)}
                </code>
              </p>
            )}
          </div>

          <Button onClick={handleRename} loading={renaming} fullWidth>
            Guardar cambios
          </Button>
        </div>
      </Modal>

      {/* Confirmación eliminar producto */}
      <ConfirmDialog
        open={!!deletingTarget}
        onClose={() => setDeletingTarget(null)}
        onConfirm={handleDeleteProducto}
        loading={deleting}
        title="Eliminar producto"
        message={`¿Eliminar "${deletingTarget ? getNombreDisplay(deletingTarget) : ""}"? Si el producto posee transacciones (ventas, remitos, etc.) registradas, se desactivará lógicamente en lugar de borrarse físicamente para preservar el historial.`}
      />
    </div>
  );
}

// ── Toggle reutilizable ──────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`relative inline-flex shrink-0 h-6 w-11 items-center rounded-full transition-colors duration-200
        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1
        ${value ? "bg-purple-600" : "bg-gray-300"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
          ${value ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ── Componente reutilizable para lista de productos ─────────────────────
interface ProductosListProps {
  productos:       Producto[];
  edits:           Record<string, PrecioEdit>;
  saving:          Record<string, boolean>;
  hasChange:       (p: Producto) => boolean;
  onEdit:          (id: string, field: keyof PrecioEdit, val: string | boolean) => void;
  onSave:          (p: Producto) => Promise<void>;
  getNombre:       (p: Producto) => string;
  showSlug:        boolean;
  stockOptions?:   Producto[];   // opciones para "Descuenta de"
  onRename?:       (p: Producto) => void;
  onDelete?:       (p: Producto) => void;
}

function ProductosList({
  productos, edits, saving, hasChange, onEdit, onSave, getNombre, showSlug, stockOptions, onRename, onDelete,
}: ProductosListProps) {
  const { isAdmin } = useCurrentUser();

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
                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    {onRename && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRename(prod)}
                      >
                        Renombrar
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onDelete(prod)}
                      >
                        Eliminar
                      </Button>
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
                )}
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
                  disabled={!isAdmin}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-brand-500 text-center disabled:bg-gray-100 disabled:text-gray-500"
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
                    disabled={!isAdmin}
                    className="w-full rounded-lg border border-gray-300 pl-5 pr-2.5 py-1.5 text-sm font-mono
                               focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>
            </div>

            {/* Opciones extra — solo para productos personalizados */}
            {showSlug && (
              <div className="mt-2 space-y-2">
                {/* Toggle precio fijo */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-200 bg-gray-50">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Precio fijo (promo)</p>
                    <p className="text-xs text-gray-400">
                      {edit.precio_fijo
                        ? "El precio no se multiplica por kilos — se cobra el total configurado"
                        : "Precio normal por kg"}
                    </p>
                  </div>
                  <Toggle
                    value={!!edit.precio_fijo}
                    onChange={(v) => onEdit(prod.id, "precio_fijo", v)}
                    disabled={!isAdmin}
                  />
                </div>

                {/* Descuenta de */}
                {stockOptions && stockOptions.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Descuenta stock de
                    </label>
                    <select
                      value={edit.stock_source_id}
                      onChange={(e) => onEdit(prod.id, "stock_source_id", e.target.value)}
                      disabled={!isAdmin}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-sm
                        focus:outline-none focus:ring-2 focus:ring-brand-500
                        ${edit.stock_source_id
                          ? "border-green-400 bg-green-50 text-green-800 font-medium"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                        } disabled:opacity-50 disabled:bg-gray-100`}
                    >
                      <option value="">— Sin vincular (no descuenta stock) —</option>
                      {stockOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {SISTEMA_LABELS[s.nombre] ?? s.nombre}
                        </option>
                      ))}
                    </select>
                    {!edit.stock_source_id && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Sin vincular: este producto no descontará stock al venderse.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
