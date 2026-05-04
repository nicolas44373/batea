"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AdminOnly } from "@/components/ui/AdminOnly";
import { IngresoCajonesForm } from "@/components/cajones/IngresoCajonesForm";
import { ListaCajones } from "@/components/cajones/ListaCajones";
import { getLotes } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import type { LoteCajones } from "@/types";

export default function CajonesPage() {
  const [lotes, setLotes] = useState<LoteCajones[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const fetchLotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLotes();
      setLotes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    fetchLotes();
  }, [fetchLotes]);

  const totalCajones = lotes.reduce((s, l) => s + l.cantidad_cajones, 0);
  const disponibles = lotes.reduce((s, l) => s + l.cajones_disponibles, 0);
  const totalKilos = lotes.reduce((s, l) => s + l.peso_total, 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ingreso de Cajones</h1>
          <p className="text-sm text-gray-500">Control de stock mayorista</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Nuevo lote</Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Lotes totales</p>
          <p className="text-2xl font-bold text-gray-900">{lotes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cajones disponibles</p>
          <p className="text-2xl font-bold text-gray-900">{disponibles}</p>
          <p className="text-xs text-gray-400">de {totalCajones} totales</p>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Kilos totales</p>
          <p className="text-2xl font-bold text-gray-900">{totalKilos.toFixed(1)} kg</p>
        </Card>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>Lotes registrados</CardHeader>
        <CardBody className="p-0">
          <ListaCajones lotes={lotes} loading={loading} onRefresh={fetchLotes} />
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar nuevo lote"
        size="lg"
      >
        <IngresoCajonesForm
          usuarioId={userId}
          onSuccess={() => {
            setModalOpen(false);
            fetchLotes();
          }}
        />
      </Modal>
    </div>
  );
}
