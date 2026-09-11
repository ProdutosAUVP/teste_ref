"use client";

import { useRef, useState } from "react";
import { exportBackup, importBackup, resetAll } from "@/lib/store";
import { download, formatBytes } from "@/lib/utils";
import { Button, Modal } from "./Modal";
import { toast } from "./Toast";
import { DownloadIcon, UploadIcon } from "./Icons";
import { VaultSection } from "./VaultRow";
import { useVaultState } from "@/lib/vault";

/**
 * Onde o acervo é salvo, a cópia em arquivo e a zona de risco. O export
 * continua sendo a cópia portátil — um JSON único com boards, itens e imagens
 * embutidas, que volta inteiro no import —, mas não é mais a única defesa:
 * com uma pasta configurada, o acervo já mora em disco.
 */
export function SettingsDialog({
  itemCount,
  boardCount,
  onClose,
  onChanged,
}: {
  itemCount: number;
  boardCount: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const vault = useVaultState();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      download(`referencias-${stamp}.json`, blob);
      toast(`Backup gerado (${formatBytes(blob.size)})`, { tone: "success" });
    } catch {
      toast("Não consegui gerar o backup", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const result = await importBackup(file);
      onChanged();
      toast(`${result.items} referências e ${result.boards} boards importados`, {
        tone: "success",
      });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Arquivo de backup inválido",
        { tone: "error" },
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleReset() {
    setBusy(true);
    try {
      await resetAll();
      onChanged();
      toast("Acervo limpo", { tone: "success" });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Ajustes e backup"
      description="Onde o acervo é salvo, a cópia em arquivo e a zona de risco."
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col gap-6">
        <section className="card-surface flex items-center gap-4 p-4">
          <Stat value={itemCount} label={itemCount === 1 ? "referência" : "referências"} />
          <span className="h-8 w-px bg-[var(--border)]" />
          <Stat value={boardCount} label={boardCount === 1 ? "board" : "boards"} />
        </section>

        <VaultSection />

        <section>
          <h3 className="text-[13px] font-semibold">Cópia em arquivo</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Um JSON único com tudo dentro — inclusive as imagens enviadas — pra guardar
            onde você quiser ou levar pra outra máquina.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void handleExport()}>
              <span className="flex items-center gap-1.5">
                <DownloadIcon size={14} />
                Exportar tudo
              </span>
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              <span className="flex items-center gap-1.5">
                <UploadIcon size={14} />
                Importar backup
              </span>
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
            O import soma ao que já existe. Reimportar o mesmo arquivo não duplica nada.
          </p>
        </section>

        <section>
          <h3 className="text-[13px] font-semibold">Zona de risco</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Apaga todas as referências e boards deste navegador. Não dá pra desfazer.
            {vault.status !== "off" && " A pasta em disco é esvaziada junto."} Com a
            sincronização ligada, some também dos seus outros dispositivos.
          </p>
          <div className="mt-3">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirmingReset ? void handleReset() : setConfirmingReset(true)
              }
            >
              {confirmingReset
                ? `Confirmar: apagar ${itemCount} itens`
                : "Limpar acervo"}
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-[var(--text-faint)]">{label}</p>
    </div>
  );
}
