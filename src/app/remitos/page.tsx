"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  getProveedores,
  getProductos,
  getRemitos,
  insertRemito,
  updateRemito,
  updateRemitoItem,
  deleteRemito,
} from "@/lib/supabase/queries";
import { formatFechaHora, getProductoLabel } from "@/lib/utils";
import { useCurrentUser } from "@/context/UserContext";
import type { Proveedor, Producto, Remito } from "@/types";

interface ItemLinea {
  producto_id: string;
  kilos: string; // representará Unidades de cara al usuario, pero se llama kilos en el estado/payload/base de datos.
  precio_costo: string;
  costo_total: string;
}

export default function RemitosPage() {
  const [remitos, setRemitos]         = useState<Remito[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos]     = useState<Producto[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [tabActiva, setTabActiva]     = useState<"cargar" | "historial">("cargar");

  // User context
  const { userId } = useCurrentUser();

  // Form State
  const [proveedorId, setProveedorId]   = useState("");
  const [numeroRemito, setNumeroRemito] = useState("");
  const [fecha, setFecha]               = useState("");
  const [notas, setNotas]               = useState("");
  const [lineas, setLineas]             = useState<ItemLinea[]>([
    { producto_id: "", kilos: "", precio_costo: "", costo_total: "" }
  ]);

  // Edición / eliminación (admin)
  const [editTarget, setEditTarget]     = useState<Remito | null>(null);
  const [editCabecera, setEditCabecera] = useState({ proveedor_id: "", numero_remito: "", notas: "" });
  const [editItems, setEditItems]       = useState<{ id: string; producto_nombre: string; kilos: string; precio_costo: string }[]>([]);
  const [editSaving, setEditSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Remito | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Último precio de costo cargado por producto (remitos ya vienen ordenados por fecha desc)
  const ultimoCostoPorProducto = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of remitos) {
      for (const item of r.items ?? []) {
        if (!map.has(item.producto_id) && item.precio_costo && item.precio_costo > 0) {
          map.set(item.producto_id, item.precio_costo);
        }
      }
    }
    return map;
  }, [remitos]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, provs, prods] = await Promise.all([
        getRemitos(),
        getProveedores(),
        getProductos(),
      ]);
      setRemitos(r);
      setProveedores(provs);
      // Solo productos originales (stock_source_id === null) y no los de desposte internos (pechuga, pata_muslo)
      const EXCLUDED = new Set(["pechuga", "pata_muslo"]);
      setProductos(prods.filter((p) => p.stock_source_id == null && !EXCLUDED.has(p.nombre)));
    } catch (err: unknown) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Form actions
  const addLinea = () => {
    setLineas((prev) => [
      ...prev,
      { producto_id: "", kilos: "", precio_costo: "", costo_total: "" }
    ]);
  };

  const removeLinea = (idx: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLineaChange = (idx: number, field: keyof ItemLinea, val: string) => {
    setLineas((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: val };

        // Al elegir producto, autocompletar con el último costo cargado para no re-tipearlo
        if (field === "producto_id" && val) {
          const ultimo = ultimoCostoPorProducto.get(val);
          if (ultimo) updated.precio_costo = ultimo.toString();
        }

        // Calcular costo total si cambia producto, kilos (unidades) o precio_costo
        const qty = parseFloat(updated.kilos) || 0;
        const cost = parseFloat(updated.precio_costo) || 0;
        updated.costo_total = (qty * cost).toFixed(2);
        return updated;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error("Error de sesión de usuario. Intentá ingresar nuevamente.");
      return;
    }
    if (!proveedorId) {
      toast.error("Seleccioná un proveedor");
      return;
    }
    if (!numeroRemito.trim()) {
      toast.error("Ingresá el número de remito");
      return;
    }

    // Filtrar líneas vacías o inválidas
    const validLineas = lineas.filter((l) => l.producto_id && parseFloat(l.kilos) > 0);
    if (validLineas.length === 0) {
      toast.error("Cargá al menos un producto con unidades válidas");
      return;
    }

    setSaving(true);
    try {
      const remitoPayload = {
        proveedor_id:   proveedorId,
        numero_remito:  numeroRemito.trim(),
        fecha:          fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        registrado_por: userId,
        notas:          notas.trim() || undefined,
      };

      const itemsPayload = validLineas.map((l) => ({
        producto_id: l.producto_id,
        kilos:       parseFloat(l.kilos),
        precio_costo: l.precio_costo ? parseFloat(l.precio_costo) : undefined,
        costo_total: l.costo_total ? parseFloat(l.costo_total) : undefined,
      }));

      await insertRemito(remitoPayload, itemsPayload);
      toast.success("Remito cargado exitosamente. Stock actualizado.");
      
      // Reset form
      setProveedorId("");
      setNumeroRemito("");
      setFecha("");
      setNotas("");
      setLineas([{ producto_id: "", kilos: "", precio_costo: "", costo_total: "" }]);

      // Ir a pestaña historial
      setTabActiva("historial");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar remito");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (r: Remito) => {
    setEditCabecera({
      proveedor_id: r.proveedor_id,
      numero_remito: r.numero_remito,
      notas: r.notas ?? "",
    });
    setEditItems(
      (r.items ?? []).map((item) => ({
        id: item.id,
        producto_nombre: item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—",
        kilos: item.kilos.toString(),
        precio_costo: item.precio_costo?.toString() ?? "",
      }))
    );
    setEditTarget(r);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editCabecera.numero_remito.trim()) {
      toast.error("El número de remito no puede quedar vacío");
      return;
    }
    setEditSaving(true);
    try {
      await updateRemito(editTarget.id, {
        proveedor_id: editCabecera.proveedor_id,
        numero_remito: editCabecera.numero_remito.trim(),
        notas: editCabecera.notas.trim() || undefined,
      });
      for (const item of editItems) {
        const kilos = parseFloat(item.kilos);
        if (!kilos || kilos <= 0) continue;
        const precio = item.precio_costo ? parseFloat(item.precio_costo) : null;
        await updateRemitoItem(item.id, {
          kilos,
          precio_costo: precio,
          costo_total: precio ? kilos * precio : null,
        });
      }
      toast.success("Remito actualizado");
      setEditTarget(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar remito");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRemito = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRemito(deleteTarget.id);
      toast.success(`Remito N° ${deleteTarget.numero_remito} eliminado`);
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar remito");
    } finally {
      setDeleting(false);
    }
  };

  const totalCostoRemito = lineas.reduce((acc, line) => {
    const qty = parseFloat(line.kilos) || 0;
    const cost = parseFloat(line.precio_costo) || 0;
    return acc + (qty * cost);
  }, 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Remitos de Mercadería</h1>
        <p className="text-sm text-gray-500">
          Registrá el ingreso de mercadería de tus proveedores para sumar stock de forma directa.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTabActiva("cargar")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-all ${
            tabActiva === "cargar"
              ? "border-brand-500 text-brand-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Cargar Nuevo Remito
        </button>
        <button
          onClick={() => setTabActiva("historial")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-all ${
            tabActiva === "historial"
              ? "border-brand-500 text-brand-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Historial de Ingresos ({remitos.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
      ) : tabActiva === "cargar" ? (
        <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
          <Card>
            <CardHeader>Cabecera del Remito</CardHeader>
            <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Proveedor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proveedor <span className="text-red-500">*</span>
                </label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.cuit ? `(CUIT: ${p.cuit})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nro de Remito */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Remito <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ej: 0001-00123456"
                  value={numeroRemito}
                  onChange={(e) => setNumeroRemito(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              {/* Fecha (opcional, default hoy) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Ingreso (Opcional)
                </label>
                <input
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </CardBody>
          </Card>

          {/* Items de Remito */}
          <Card>
            <CardHeader
              actions={
                <Button type="button" size="sm" variant="outline" onClick={addLinea}>
                  + Añadir producto
                </Button>
              }
            >
              Productos Recibidos
            </CardHeader>
            <CardBody className="space-y-3">
              {lineas.map((linea, idx) => (
                <div key={idx} className="flex gap-3 items-end flex-wrap md:flex-nowrap border-b border-gray-100 pb-3 md:border-none md:pb-0">
                  {/* Selector de Producto */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Producto</label>
                    <select
                      value={linea.producto_id}
                      onChange={(e) => handleLineaChange(idx, "producto_id", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {getProductoLabel(p.nombre)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Cantidad Unidades */}
                  <div className="w-[120px]">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Unidades</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="0"
                      value={linea.kilos}
                      onChange={(e) => handleLineaChange(idx, "kilos", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>

                  {/* Precio Costo */}
                  <div className="w-[150px]">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Costo ($ / unidad)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={linea.precio_costo}
                      onChange={(e) => handleLineaChange(idx, "precio_costo", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {linea.producto_id && ultimoCostoPorProducto.has(linea.producto_id) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Último: ${ultimoCostoPorProducto.get(linea.producto_id)!.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>

                  {/* Costo Total */}
                  <div className="w-[150px]">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Costo Total ($)</label>
                    <input
                      type="text"
                      value={linea.costo_total ? `$ ${parseFloat(linea.costo_total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$ 0.00"}
                      disabled
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-500 focus:outline-none"
                    />
                  </div>

                  {/* Quitar fila */}
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLinea(idx)}
                      className="h-9 px-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors text-sm font-semibold border border-red-200"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Notas */}
          <Card>
            <CardBody className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notas adicionales (Opcional)
              </label>
              <textarea
                placeholder="Observaciones generales sobre el remito..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </CardBody>
          </Card>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-700">
              Costo Total Estimado: <strong className="text-lg font-bold text-gray-900">${totalCostoRemito.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
            </div>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              Registrar Remito y Cargar Stock
            </Button>
          </div>
        </form>
      ) : (
        /* Historial */
        <div className="space-y-4">
          {remitos.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">
              No hay remitos registrados en el sistema.
            </p>
          ) : (
            remitos.map((r) => {
              const remitoCostoTotal = (r.items ?? []).reduce((acc, item) => acc + (item.costo_total ?? 0), 0);
              return (
                <Card key={r.id}>
                  <CardHeader
                    actions={
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          Registrado: {formatFechaHora(r.fecha)}
                        </span>
                        <AdminOnly>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>
                            Eliminar
                          </Button>
                        </AdminOnly>
                      </div>
                    }
                  >
                    Remito N° {r.numero_remito} — {r.proveedor?.nombre ?? "Proveedor desconocido"}
                  </CardHeader>
                  <CardBody className="space-y-3">
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <div>
                        Registrado por: <strong className="font-semibold text-gray-700">{r.usuario?.nombre ?? "—"}</strong>
                      </div>
                      {remitoCostoTotal > 0 && (
                        <div>
                          Costo Total Remito: <strong className="text-sm font-bold text-gray-900">${remitoCostoTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                        </div>
                      )}
                    </div>

                    {/* Desglose de Items */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Producto</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Unidades</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Precio Costo</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Costo Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {(r.items ?? []).map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2 font-medium text-gray-800">
                                {item.producto?.nombre ? getProductoLabel(item.producto.nombre) : "—"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-gray-700">
                                {Math.round(item.kilos)} und
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-gray-700">
                                {item.precio_costo ? `$ ${item.precio_costo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">
                                {item.costo_total ? `$ ${item.costo_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {r.notas && (
                      <div className="p-2.5 rounded bg-gray-50 border border-gray-100 text-xs italic text-gray-500">
                        <strong>Notas:</strong> {r.notas}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Modal editar remito (admin) */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Editar Remito N° ${editTarget?.numero_remito ?? ""}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Proveedor</label>
              <select
                value={editCabecera.proveedor_id}
                onChange={(e) => setEditCabecera((f) => ({ ...f, proveedor_id: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número de Remito</label>
              <input
                type="text"
                value={editCabecera.numero_remito}
                onChange={(e) => setEditCabecera((f) => ({ ...f, numero_remito: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Productos</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {editItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-3 flex-wrap sm:flex-nowrap">
                  <span className="flex-1 min-w-[140px] text-sm font-medium text-gray-800">
                    {item.producto_nombre}
                  </span>
                  <div className="w-[110px]">
                    <label className="block text-[11px] text-gray-500">Unidades</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={item.kilos}
                      onChange={(e) =>
                        setEditItems((prev) => prev.map((x, i) => (i === idx ? { ...x, kilos: e.target.value } : x)))
                      }
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="w-[130px]">
                    <label className="block text-[11px] text-gray-500">Costo ($/unidad)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.precio_costo}
                      onChange={(e) =>
                        setEditItems((prev) => prev.map((x, i) => (i === idx ? { ...x, precio_costo: e.target.value } : x)))
                      }
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="w-[110px] text-right text-sm font-mono text-gray-600">
                    ${((parseFloat(item.kilos) || 0) * (parseFloat(item.precio_costo) || 0)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-1">
              Modificar unidades no recalcula el stock automáticamente. Si cambiás cantidades, ajustá el stock desde la sección Stock.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={2}
              value={editCabecera.notas}
              onChange={(e) => setEditCabecera((f) => ({ ...f, notas: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} loading={editSaving}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmación de borrado (admin) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRemito}
        loading={deleting}
        message={`¿Eliminar el remito N° ${deleteTarget?.numero_remito}? El stock que sumó este remito no se revertirá automáticamente; si corresponde, ajustalo desde la sección Stock.`}
      />
    </div>
  );
}
