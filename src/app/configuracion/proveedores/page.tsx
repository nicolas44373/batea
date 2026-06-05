"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { getProveedoresAll, insertProveedor, updateProveedor, deleteProveedor } from "@/lib/supabase/queries";
import type { Proveedor } from "@/types";

interface FormState {
  nombre: string;
  cuit: string;
  telefono: string;
  direccion: string;
  notas: string;
  activo: boolean;
}

const FORM_EMPTY: FormState = {
  nombre: "",
  cuit: "",
  telefono: "",
  direccion: "",
  notas: "",
  activo: true,
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores]   = useState<Proveedor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState<Proveedor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proveedor | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [form, setForm]                 = useState<FormState>(FORM_EMPTY);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProveedoresAll();
      setProveedores(data);
    } catch (err: unknown) {
      toast.error("Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  function openCreate() {
    setForm(FORM_EMPTY);
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(p: Proveedor) {
    setForm({
      nombre:    p.nombre,
      cuit:      p.cuit ?? "",
      telefono:  p.telefono ?? "",
      direccion: p.direccion ?? "",
      notas:     p.notas ?? "",
      activo:    p.activo,
    });
    setEditTarget(p);
    setModalOpen(true);
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error("Ingresá el nombre del proveedor");
      return;
    }
    setSaving(true);
    try {
      // Yes, in migration we wrote: "notas TEXT"
      const dbPayload = {
        nombre:    form.nombre.trim(),
        cuit:      form.cuit.trim() || undefined,
        telefono:  form.telefono.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        notas:     form.notas.trim() || undefined,
      };

      if (editTarget) {
        await updateProveedor(editTarget.id, { ...dbPayload, activo: form.activo });
        toast.success("Proveedor actualizado");
      } else {
        await insertProveedor(dbPayload);
        toast.success("Proveedor creado");
      }
      setModalOpen(false);
      fetchProveedores();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProveedor(deleteTarget.id);
      toast.success("Proveedor eliminado o desactivado correctamente");
      setDeleteTarget(null);
      fetchProveedores();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    (p.cuit && p.cuit.includes(filtroBusqueda))
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500">
            Administrá los proveedores de mercadería del sistema.
          </p>
        </div>
        <AdminOnly>
          <Button onClick={openCreate}>+ Nuevo Proveedor</Button>
        </AdminOnly>
      </div>

      <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar proveedor por nombre o CUIT..."
          value={filtroBusqueda}
          onChange={(e) => setFiltroBusqueda(e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando proveedores...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-gray-400">
              No se encontraron proveedores.
            </p>
          ) : (
            filtered.map((p) => (
              <Card key={p.id} className={`${!p.activo ? "opacity-60 bg-gray-50" : ""}`}>
                <CardHeader
                  actions={
                    <div className="flex items-center gap-1.5">
                      {p.activo ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="neutral">Inactivo</Badge>
                      )}
                    </div>
                  }
                >
                  {p.nombre}
                </CardHeader>
                <CardBody className="space-y-2.5 text-xs text-gray-600">
                  {p.cuit && (
                    <div className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="font-semibold text-gray-500">CUIT:</span>
                      <span className="font-mono text-gray-800">{p.cuit}</span>
                    </div>
                  )}
                  {p.telefono && (
                    <div className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="font-semibold text-gray-500">Teléfono:</span>
                      <span className="text-gray-800">{p.telefono}</span>
                    </div>
                  )}
                  {p.direccion && (
                    <div className="flex justify-between border-b border-gray-100 pb-1 text-right">
                      <span className="font-semibold text-gray-500 shrink-0">Dirección:</span>
                      <span className="text-gray-800 truncate pl-3">{p.direccion}</span>
                    </div>
                  )}
                  {p.notas && (
                    <div className="pt-1 italic text-gray-400 bg-gray-50/50 p-2 rounded border border-gray-100">
                      {p.notas}
                    </div>
                  )}
                  
                  <AdminOnly>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(p)}>
                        Eliminar
                      </Button>
                    </div>
                  </AdminOnly>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Editar: ${editTarget.nombre}` : "Nuevo Proveedor"}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre / Razón Social <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="ej: Distribuidora Avícola S.A."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CUIT
            </label>
            <input
              type="text"
              value={form.cuit}
              onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
              placeholder="ej: 30-12345678-9"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono de contacto
            </label>
            <input
              type="text"
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              placeholder="ej: +54 9 11 1234-5678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección
            </label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              placeholder="ej: Av. Rivadavia 1234, CABA"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas adicionales
            </label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="ej: Reparto los días martes por la mañana."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {editTarget && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Proveedor activo</span>
            </label>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              {editTarget ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar proveedor"
        message={`¿Estás seguro de que querés eliminar a "${deleteTarget?.nombre}"? Si ya posee remitos registrados, se desactivará automáticamente para preservar el historial.`}
      />
    </div>
  );
}
