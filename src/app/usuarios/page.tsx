"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table } from "@/components/ui/Table";
import { getUsuariosAll, updateUsuario, deleteUsuario } from "@/lib/supabase/queries";
import { formatFecha } from "@/lib/utils";
import { useCurrentUser } from "@/context/UserContext";
import type { Usuario, UserRole } from "@/types";

const ROL_OPTIONS: UserRole[] = ["admin", "encargado", "operario", "cajero"];

const ROL_COLORS: Record<UserRole, string> = {
  admin:     "danger",
  encargado: "info",
  operario:  "neutral",
  cajero:    "success",
} as const;

export default function UsuariosPage() {
  const { userId: currentUserId, isAdmin } = useCurrentUser();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({ nombre: "", rol: "operario" as UserRole, activo: true });

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsuariosAll();
      setUsuarios(data);
    } catch {
      toast.error("Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  function openEdit(u: Usuario) {
    setEditForm({ nombre: u.nombre, rol: u.rol, activo: u.activo });
    setEditTarget(u);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateUsuario(editTarget.id, editForm);
      toast.success("Usuario actualizado");
      setEditTarget(null);
      fetchUsuarios();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteUsuario(deleteTarget.id);
      toast.success("Usuario eliminado");
      setDeleteTarget(null);
      fetchUsuarios();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-gray-500">
        Solo el administrador puede acceder a esta sección.
      </div>
    );
  }

  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gestión de Usuarios</h1>
        <p className="text-sm text-gray-500">Administrar roles y accesos del sistema</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROL_OPTIONS.map((rol) => {
          const count = usuarios.filter((u) => u.rol === rol).length;
          return (
            <Card key={rol} className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide capitalize">{rol}</p>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Usuarios ({activos} activos)</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            data={usuarios}
            loading={loading}
            keyExtractor={(u) => u.id}
            emptyMessage="No hay usuarios registrados"
            columns={[
              {
                key: "nombre",
                header: "Nombre",
                render: (u) => (
                  <div>
                    <p className="font-medium text-gray-900">{u.nombre}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                ),
              },
              {
                key: "rol",
                header: "Rol",
                render: (u) => (
                  <Badge variant={ROL_COLORS[u.rol] as "danger" | "info" | "neutral" | "success" | "warning"}>
                    {u.rol}
                  </Badge>
                ),
              },
              {
                key: "activo",
                header: "Estado",
                render: (u) => (
                  <Badge variant={u.activo ? "success" : "neutral"}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </Badge>
                ),
              },
              {
                key: "created_at",
                header: "Registrado",
                render: (u) => formatFecha(u.created_at),
              },
              {
                key: "acciones",
                header: "",
                render: (u) => (
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      Editar
                    </Button>
                    <Button
                      size="sm" variant="danger"
                      disabled={u.id === currentUserId}
                      onClick={() => setDeleteTarget(u)}
                    >
                      Eliminar
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Modal editar usuario */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar usuario" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.nombre}
              onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={editForm.rol}
              onChange={(e) => setEditForm((f) => ({ ...f, rol: e.target.value as UserRole }))}
            >
              {ROL_OPTIONS.map((r) => (
                <option key={r} value={r} className="capitalize">{r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activo"
              checked={editForm.activo}
              onChange={(e) => setEditForm((f) => ({ ...f, activo: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
            />
            <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Guardar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        message={`¿Eliminar al usuario "${deleteTarget?.nombre}"? Esta acción borrará su perfil del sistema (no su cuenta de autenticación).`}
      />
    </div>
  );
}
