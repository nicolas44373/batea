"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table } from "@/components/ui/Table";
import {
  getSaldosClientes,
  insertCliente,
  updateCliente,
  deleteCliente,
  getVentasDeCliente,
  getPagosClientes,
  insertPagoCliente,
} from "@/lib/supabase/queries";
import { formatFechaHora, formatMoneda, MEDIO_PAGO_LABELS } from "@/lib/utils";
import { useCurrentUser } from "@/context/UserContext";
import type { Cliente, MedioPago, PagoCliente, SaldoCliente, Venta } from "@/types";

const FORM_VACIO = { nombre: "", telefono: "", direccion: "", cuit: "", notas: "" };

export default function ClientesPage() {
  const { userId } = useCurrentUser();
  const [saldos, setSaldos] = useState<SaldoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorSchema, setErrorSchema] = useState(false);

  // alta / edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cliente | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [deleting, setDeleting] = useState(false);

  // cuenta corriente
  const [cuentaTarget, setCuentaTarget] = useState<SaldoCliente | null>(null);
  const [ventasCliente, setVentasCliente] = useState<Venta[]>([]);
  const [pagosCliente, setPagosCliente] = useState<PagoCliente[]>([]);
  const [cuentaLoading, setCuentaLoading] = useState(false);

  // registrar pago
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoMedio, setPagoMedio] = useState<MedioPago>("efectivo");
  const [pagoNotas, setPagoNotas] = useState("");
  const [pagoSaving, setPagoSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSaldosClientes();
      setSaldos(data);
      setErrorSchema(false);
    } catch {
      setErrorSchema(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openNew() {
    setEditTarget(null);
    setForm(FORM_VACIO);
    setModalOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditTarget(c);
    setForm({
      nombre: c.nombre,
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      cuit: c.cuit ?? "",
      notas: c.notas ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        cuit: form.cuit.trim() || undefined,
        notas: form.notas.trim() || undefined,
      };
      if (editTarget) {
        await updateCliente(editTarget.id, payload);
        toast.success("Cliente actualizado");
      } else {
        await insertCliente(payload);
        toast.success("Cliente creado");
      }
      setModalOpen(false);
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCliente(deleteTarget.id);
      toast.success("Cliente eliminado");
      setDeleteTarget(null);
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  async function openCuenta(s: SaldoCliente) {
    setCuentaTarget(s);
    setCuentaLoading(true);
    setPagoMonto("");
    setPagoMedio("efectivo");
    setPagoNotas("");
    try {
      const [v, p] = await Promise.all([
        getVentasDeCliente(s.cliente.id),
        getPagosClientes(s.cliente.id),
      ]);
      setVentasCliente(v);
      setPagosCliente(p);
    } catch {
      toast.error("Error al cargar la cuenta del cliente");
    } finally {
      setCuentaLoading(false);
    }
  }

  async function handleRegistrarPago() {
    if (!cuentaTarget) return;
    const monto = parseFloat(pagoMonto);
    if (!monto || monto <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setPagoSaving(true);
    try {
      await insertPagoCliente({
        cliente_id: cuentaTarget.cliente.id,
        monto,
        medio_pago: pagoMedio,
        notas: pagoNotas.trim() || undefined,
        usuario_id: userId || undefined,
      });
      toast.success("Pago registrado");
      // refrescar detalle y listado
      await openCuenta({ ...cuentaTarget });
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error al registrar pago");
    } finally {
      setPagoSaving(false);
    }
  }

  const totalDeuda = saldos.reduce((s, x) => s + Math.max(0, x.saldo), 0);
  const conDeuda = saldos.filter((s) => s.saldo > 0.009).length;
  const saldoActual = cuentaTarget
    ? saldos.find((s) => s.cliente.id === cuentaTarget.cliente.id)?.saldo ?? cuentaTarget.saldo
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">Cuentas corrientes, deudas y pagos</p>
        </div>
        <Button onClick={openNew}>+ Nuevo cliente</Button>
      </div>

      {errorSchema && (
        <Alert variant="warning" title="Falta ejecutar la migración de base de datos">
          Esta sección necesita tablas nuevas. Ejecutá el archivo{" "}
          <code className="font-mono text-xs">supabase/migracion_v2_clientes_caja.sql</code> en
          Supabase → SQL Editor y recargá la página.
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Clientes</p>
          <p className="text-2xl font-bold text-gray-900">{saldos.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Con deuda</p>
          <p className="text-2xl font-bold text-amber-600">{conDeuda}</p>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Deuda total</p>
          <p className={`text-2xl font-bold ${totalDeuda > 0 ? "text-red-700" : "text-gray-900"}`}>
            {formatMoneda(totalDeuda)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>Listado de clientes</CardHeader>
        <CardBody className="p-0">
          <Table
            data={saldos}
            loading={loading}
            keyExtractor={(s) => s.cliente.id}
            emptyMessage="Sin clientes registrados. Creá el primero con «+ Nuevo cliente»."
            onRowClick={(s) => openCuenta(s)}
            columns={[
              {
                key: "nombre",
                header: "Cliente",
                render: (s) => (
                  <div>
                    <p className="font-medium text-gray-900">{s.cliente.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {[s.cliente.telefono, s.cliente.cuit && `CUIT ${s.cliente.cuit}`]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                ),
              },
              {
                key: "estado",
                header: "Estado",
                render: (s) => (
                  <Badge variant={s.cliente.activo ? "success" : "neutral"}>
                    {s.cliente.activo ? "Activo" : "Inactivo"}
                  </Badge>
                ),
              },
              {
                key: "total_fiado",
                header: "Fiado",
                align: "right",
                render: (s) => (s.total_fiado > 0 ? formatMoneda(s.total_fiado) : "—"),
              },
              {
                key: "total_pagado",
                header: "Pagado",
                align: "right",
                render: (s) => (s.total_pagado > 0 ? formatMoneda(s.total_pagado) : "—"),
              },
              {
                key: "saldo",
                header: "Saldo",
                align: "right",
                render: (s) =>
                  s.saldo > 0.009 ? (
                    <span className="font-bold text-red-700">{formatMoneda(s.saldo)}</span>
                  ) : s.saldo < -0.009 ? (
                    <span className="font-bold text-green-700">{formatMoneda(s.saldo)}</span>
                  ) : (
                    <span className="text-gray-400">Al día</span>
                  ),
              },
              {
                key: "acciones",
                header: "",
                render: (s) => (
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm" variant="outline"
                      onClick={(e) => { e.stopPropagation(); openCuenta(s); }}
                    >
                      Cuenta
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={(e) => { e.stopPropagation(); openEdit(s.cliente); }}
                    >
                      Editar
                    </Button>
                    <AdminOnly>
                      <Button
                        size="sm" variant="danger"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.cliente); }}
                      >
                        Eliminar
                      </Button>
                    </AdminOnly>
                  </div>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Modal alta / edición */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Editar: ${editTarget.nombre}` : "Nuevo cliente"}
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Rotisería Don Pepe"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CUIT</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.cuit}
                onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editTarget ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal cuenta corriente */}
      <Modal
        open={!!cuentaTarget}
        onClose={() => setCuentaTarget(null)}
        title={`Cuenta corriente — ${cuentaTarget?.cliente.nombre ?? ""}`}
        size="lg"
      >
        {cuentaTarget && (
          <div className="space-y-4">
            {/* Saldo */}
            <div className={`rounded-lg p-4 border ${
              saldoActual > 0.009 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
            }`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo actual</p>
              <p className={`text-2xl font-bold ${saldoActual > 0.009 ? "text-red-700" : "text-green-700"}`}>
                {saldoActual > 0.009 ? `Debe ${formatMoneda(saldoActual)}` : "Al día"}
              </p>
            </div>

            {/* Registrar pago */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Registrar pago</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={pagoMonto}
                    onChange={(e) => setPagoMonto(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Medio</label>
                  <select
                    value={pagoMedio}
                    onChange={(e) => setPagoMedio(e.target.value as MedioPago)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nota</label>
                  <input
                    placeholder="opcional"
                    value={pagoNotas}
                    onChange={(e) => setPagoNotas(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <Button onClick={handleRegistrarPago} loading={pagoSaving} fullWidth>
                Registrar pago
              </Button>
            </div>

            {cuentaLoading ? (
              <p className="text-center text-sm text-gray-400 py-4">Cargando movimientos...</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ventas */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Ventas ({ventasCliente.length})
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {ventasCliente.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400 text-center">Sin ventas registradas</p>
                    ) : (
                      ventasCliente.map((v) => (
                        <div key={v.id} className="p-2.5 flex items-center justify-between gap-2 text-sm">
                          <div>
                            <p className="font-medium text-gray-800">#{v.numero}</p>
                            <p className="text-xs text-gray-400">{formatFechaHora(v.created_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{v.total_monto ? formatMoneda(v.total_monto) : "—"}</p>
                            <p className={`text-xs ${v.medio_pago === "cuenta_corriente" ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
                              {MEDIO_PAGO_LABELS[v.medio_pago ?? "efectivo"]}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Pagos */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Pagos recibidos ({pagosCliente.length})
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {pagosCliente.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400 text-center">Sin pagos registrados</p>
                    ) : (
                      pagosCliente.map((p) => (
                        <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 text-sm">
                          <div>
                            <p className="text-xs text-gray-400">{formatFechaHora(p.created_at)}</p>
                            {p.notas && <p className="text-xs text-gray-500 italic">{p.notas}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-700">{formatMoneda(p.monto)}</p>
                            <p className="text-xs text-gray-400">{MEDIO_PAGO_LABELS[p.medio_pago]}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        message={`¿Eliminar al cliente "${deleteTarget?.nombre}"? Si tiene ventas o pagos registrados, se desactivará para preservar el historial.`}
      />
    </div>
  );
}
