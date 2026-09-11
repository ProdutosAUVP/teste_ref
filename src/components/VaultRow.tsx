"use client";

import { saveVault, useVaultState, type VaultState } from "@/lib/vault";
import { cx, timeAgo } from "@/lib/utils";
import { Button } from "./Modal";
import { toast } from "./Toast";
import { FolderIcon } from "./Icons";

/**
 * O acervo em disco, visto pela interface.
 *
 * Quando não há pasta configurada nada disso aparece: o app é o mesmo de
 * sempre, local no navegador. Quando há, a barra lateral passa a dizer onde o
 * acervo está sendo gravado — a resposta pra "e se eu perder o navegador?".
 */

export function VaultRow() {
  const vault = useVaultState();
  if (vault.status === "off") return null;

  const { label, dot, title } = describe(vault);

  return (
    <div
      title={title}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12px] text-[var(--text-muted)]"
    >
      <span
        className={cx(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          dot,
          vault.status === "saving" && "animate-pulse",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  );
}

/** O mesmo estado, com detalhe e um botão de gravar agora, dentro de Ajustes. */
export function VaultSection() {
  const vault = useVaultState();

  if (vault.status === "off") {
    return (
      <section>
        <h3 className="text-[13px] font-semibold">Salvar em disco</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Hoje o acervo só existe no banco deste navegador — limpar os dados dele apaga
          tudo. Definindo <Code>VAULT_DIR</Code> no servidor (ou rodando{" "}
          <Code>npm run dev</Code>, onde já vem ligado), cada alteração passa a ser
          gravada numa pasta da máquina, com as imagens junto, e o acervo volta de lá
          na próxima abertura.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
{`VAULT_DIR=./data

data/
├─ acervo.json
└─ imagens/`}
        </pre>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-[13px] font-semibold">Salvo em disco</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        Cada alteração é gravada em <Code>{vault.dir ?? "data"}</Code>, com as imagens
        junto. Limpar os dados do navegador não tira nada de lá: na abertura seguinte o
        acervo volta de disco sozinho. Copiar essa pasta é copiar o acervo inteiro.
      </p>
      {vault.status === "error" && vault.error && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--bad,#b4342a)]">
          Última gravação falhou: {vault.error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            await saveVault();
            toast("Pasta atualizada", { tone: "success" });
          }}
        >
          <span className="flex items-center gap-1.5">
            <FolderIcon size={14} />
            Gravar agora
          </span>
        </Button>
        {vault.savedAt > 0 && (
          <span className="text-[11px] text-[var(--text-faint)]">
            última gravação {timeAgo(vault.savedAt)}
          </span>
        )}
      </div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-[11px]">{children}</code>
  );
}

function describe(vault: VaultState) {
  switch (vault.status) {
    case "saving":
      return {
        label: "Gravando em disco…",
        dot: "bg-[var(--accent)]",
        title: `Gravando o acervo em ${vault.dir ?? "disco"}`,
      };
    case "ready":
      return {
        label: `Salvo em ${shorten(vault.dir)}`,
        dot: "bg-emerald-500",
        title: `Cada alteração é gravada em ${vault.dir ?? "disco"}`,
      };
    case "error":
      return {
        label: "Falha ao salvar em disco",
        dot: "bg-red-500",
        title: vault.error ?? "A gravação na pasta falhou",
      };
    default:
      return {
        label: "Lendo o acervo do disco…",
        dot: "bg-[var(--text-faint)]",
        title: "Procurando o acervo gravado em disco",
      };
  }
}

/** Caminho inteiro no title; na barra lateral cabe só o fim dele. */
function shorten(dir: string | null): string {
  if (!dir) return "disco";
  const parts = dir.split("/").filter(Boolean);
  return parts.length <= 2 ? dir : `…/${parts.slice(-2).join("/")}`;
}
