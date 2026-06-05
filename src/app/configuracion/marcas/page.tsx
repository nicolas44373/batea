"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { formatMoneda } from "@/lib/utils";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { getMarcas, insertMarca, updateMarca, deleteMarca } from "@/lib/supabase/queries";
import type { MarcaConfiguracion } from "@/types";

const TIPO_LABELS: Record<string, string> = {
  pollo_entero:         "Pollo entero",
  filet_fresco:         "Filet fresco",
  filet_congelado:      "Filet congelado",
  pata_muslo_fresca:    "Pata/Muslo fresca",
  pata_muslo_congelada: "Pata/Muslo congelada",
};

const TIPOS = Object.entries(TIPO_LABELS);

interface FormState {
  nombre: string;
  tipo_producto: string;
  costo_por_cajon: string;
  rendimiento_esperado: string;
  notas: string;
  activo: boolean;
}

const FORM_EMPTY: FormState = {
  nombre: "",
  tipo_producto: "pollo_entero",
  costo_por_cajon: "",
  rendimiento_esperado: "",
  notas: "",
  activo: true,
};

export default function MarcasPage() {
  const [marcas, setMarcas]           = useState<MarcaConfiguracion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editTarget, setEditTarget]   = useState<MarcaConfiguracion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MarcaConfiguracion | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [form, setForm]               = useState<FormState>(FORM_EMPTY);

  const fetchMarcas = useCallback(async () => {
    setLoading(true);
    try {
      setMarcas(await getMarcas());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMarcas(); }, [fetchMarcas]);

  function openCreate() {
    setForm(FORM_EMPTY);
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(m: MarcaConfiguracion) {
    setForm({
      nombre:               m.nombre,
      tipo_producto:        m.tipo_producto,
      costo_por_cajon:      m.costo_por_cajon.toString(),
      rendimiento_esperado: m.rendimiento_esperado?.toString() ?? "",
      notas:                m.notas ?? "",
      activo:               m.activo,
    });
    setEditTarget(m);
    setModalOpen(true);
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error("Ingresá el nombre de la marca"); return; }
    if (!form.costo_por_cajon || parseFloat(form.costo_por_cajon) <= 0) {
      toast.error("Ingresá el costo por cajón"); return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre:               form.nombre.trim(),
        tipo_producto:        form.tipo_producto,
        costo_por_cajon:      parseFloat(form.costo_por_cajon),
        rendimiento_esperado: form.rendimiento_esperado ? parseFloat(form.rendimiento_esperado) : undefined,
        notas:                form.notas.trim() || undefined,
        activo:               form.activo,
      };
      if (editTarget) {
        await updateMarca(editTarget.id, payload);
        toast.success("Marca actualizada");
      } else {
        await insertMarca(payload);
        toast.success("Marca creada");
      }
      setModalOpen(false);
      fetchMarcas();
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "Error al guardar";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        toast.error("Ya existe esa marca para ese tipo de producto");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMarca(deleteTarget.id);
      toast.success("Marca eliminada");
      setDeleteTarget(null);
      fetchMarcas();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  // Agrupar por tipo de producto
  const porTipo = TIPOS.map(([tipo, label]) => ({
    tipo,
    label,
    items: marcas.filter((m) => m.tipo_producto === tipo),
  })).filter((g) => g.items.length > 0 || true); // siempre mostrar todos los tipos

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marcas de cajones</h1>
          <p className="text-sm text-gray-500">
            Configurá marcas con su costo y rendimiento esperado.
            Se auto-completan al registrar un nuevo lote.
          </p>
        </div>
        <AdminOnly>
          <Button onClick={openCreate}>+ Nueva marca</Button>
        </AdminOnly>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {porTipo.map(({ tipo, label, items }) => (
            <Card key={tipo}>
              <CardHeader
                actions={
                  <span className="text-xs text-gray-400">{items.length} marca{items.length !== 1 ? "s" : ""}</span>
                }
              >
                {label}
              </CardHeader>
              <CardBody className="p-0">
                {items.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-400 text-center">
                    Sin marcas configuradas para este tipo
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {items.map((m) => (
                      <div key={m.id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{m.nombre}</p>
                            {!m.activo && (
                              <Badge variant="neutral">Inactivo</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                            <span>
                              Costo:{" "}
                              <span className="font-semibold text-gray-800">
                                {formatMoneda(m.costo_por_cajon)}/cajón
                              </span>
                            </span>
                            {m.rendimiento_esperado && (
                              <span>
                                Rendimiento esperado:{" "}
                                <span className="font-semibold text-green-700">
                                  {m.rendimiento_esperado}%
                                </span>
                              </span>
                            )}
                            {m.notas && (
                              <span className="italic text-gray-400">{m.notas}</span>
                            )}
                          </div>
                        </div>
                        <AdminOnly>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                              Editar
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(m)}>
                              ×
                            </Button>
                          </div>
                        </AdminOnly>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Editar: ${editTarget.nombre}` : "Nueva marca"}
        size="sm"
      >
        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la marca
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: La Rural, Don Pollo, etc."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Tipo de producto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de cajón
            </label>
            <select
              value={form.tipo_producto}
              onChange={(e) => setForm((f) => ({ ...f, tipo_producto: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {TIPOS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Costo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Costo por cajón ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costo_por_cajon}
              onChange={(e) => setForm((f) => ({ ...f, costo_por_cajon: e.target.value }))}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {form.costo_por_cajon && parseFloat(form.costo_por_cajon) > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                ≈ {formatMoneda(parseFloat(form.costo_por_cajon) / 15)} por kg estimado
                (cajón 15kg) · {formatMoneda(parseFloat(form.costo_por_cajon) / 20)} por kg
                (cajón 20kg)
              </p>
            )}
          </div>

          {/* Rendimiento esperado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rendimiento esperado (%) — opcional
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="110"
              value={form.rendimiento_esperado}
              onChange={(e) => setForm((f) => ({ ...f, rendimiento_esperado: e.target.value }))}
              placeholder="Ej: 88.5"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Se usará para comparar contra el rendimiento real obtenido
            </p>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones sobre esta marca..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Activo */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="w-4 h-4 text-brand-600 rounded"
            />
            <span className="text-sm text-gray-700">Marca activa (aparece en el formulario de cajones)</span>
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              {editTarget ? "Guardar cambios" : "Crear marca"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar marca"
        message={`¿Eliminar "${deleteTarget?.nombre}"? Los lotes ya registrados con esta marca no se verán afectados.`}
      />
    </div>
  );
}
