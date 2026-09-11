"use client";

import { useSyncExternalStore } from "react";
import { STORE_SETTINGS, get, put } from "./idb";
import { applyVault, getState, subscribeStore } from "./store";
import { imageFileName, type VaultItem } from "./vaultTypes";
import type { Board, Item, Settings } from "./types";

/**
 * Cliente da pasta do acervo.
 *
 * O IndexedDB continua sendo a fonte de render — a tela nunca espera o disco.
 * Por cima dele, toda alteração é gravada na pasta do servidor (`data/` por
 * padrão em desenvolvimento, `VAULT_DIR` pra escolher outra), e na abertura o
 * que estiver na pasta e faltar aqui volta pro navegador.
 *
 * Não é backup e não é sincronização: é o mesmo acervo, num lugar que não
 * some quando o navegador é limpo. Sem `VAULT_DIR` (e fora do `next dev`) a
 * rota responde "desligado" e nada disso existe — o app segue 100% local.
 */

interface VaultPayload {
  enabled: boolean;
  dir?: string;
  savedAt?: string;
  settings?: Partial<Settings>;
  boards?: Board[];
  items?: VaultItem[];
  images?: string[];
  error?: string;
}

export type VaultStatus =
  /** Sem pasta configurada nesta instalação: o acervo só vive no navegador. */
  | "off"
  | "loading"
  | "saving"
  | "ready"
  | "error";

export interface VaultState {
  status: VaultStatus;
  /** Caminho da pasta no servidor, pra mostrar na interface. */
  dir: string | null;
  savedAt: number;
  error: string | null;
}

const IDLE: VaultState = { status: "off", dir: null, savedAt: 0, error: null };

let state: VaultState = IDLE;
const listeners = new Set<() => void>();

function setState(patch: Partial<VaultState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useVaultState(): VaultState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => IDLE,
  );
}

export function getVaultState(): VaultState {
  return state;
}

/* ──────────────────────────────── arranque ───────────────────────────────── */

/** Nomes de imagem que a pasta já tem — o que evita subir tudo de novo. */
let onDisk = new Set<string>();
/** `savedAt` da nossa última gravação: diz se a pasta mudou por fora. */
const STAMP_KEY = "vault";

let started = false;

export async function initVault(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  setState({ status: "loading" });

  let payload: VaultPayload;
  try {
    const response = await fetch("/api/vault");
    payload = (await response.json()) as VaultPayload;
  } catch {
    // App aberto sem servidor (export estático, offline no primeiro load):
    // não é erro, é só não ter pasta.
    setState({ status: "off" });
    return;
  }

  if (!payload.enabled) {
    setState({ status: "off" });
    return;
  }

  if (payload.error) {
    // A pasta existe mas o servidor não conseguiu lê-la — acervo.json de outro
    // programa, permissão negada, disco com problema. Ficamos de fora sem
    // gravar nada: sobrescrever um arquivo que não sabemos ler seria pior do
    // que não salvar.
    setState({ status: "error", dir: payload.dir ?? null, error: payload.error });
    return;
  }

  onDisk = new Set(payload.images ?? []);
  setState({ dir: payload.dir ?? null, status: "loading" });

  try {
    const stamp = (await get<{ stamp: string }>(STORE_SETTINGS, STAMP_KEY))?.stamp ?? "";
    // Se a pasta ainda tem o carimbo da nossa última gravação, este navegador
    // já é a versão mais nova e não há o que trazer de volta.
    if (payload.savedAt && payload.savedAt !== stamp) await hydrate(payload);
    setState({ status: "ready", error: null });
  } catch (error) {
    console.error("Falha ao ler a pasta do acervo", error);
    setState({ status: "error", error: describe(error) });
  }

  subscribeStore(() => scheduleVaultSave());
  // Primeira gravação da sessão: sobe o que o navegador tem e o disco não.
  scheduleVaultSave(600);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) void saveVault();
  });
}

/**
 * Traz da pasta o que está lá e não está aqui. Em cada id vence quem tem o
 * `updatedAt` mais novo, então recuperar nunca desfaz uma edição recente
 * deste navegador.
 */
async function hydrate(payload: VaultPayload): Promise<number> {
  const local = getState();
  const localBoards = new Map(local.boards.map((board) => [board.id, board]));
  const localItems = new Map(local.items.map((item) => [item.id, item]));

  const boards = (payload.boards ?? []).filter((board) => {
    if (!board?.id) return false;
    const current = localBoards.get(board.id);
    return !current || (current.updatedAt ?? 0) <= (board.updatedAt ?? 0);
  });

  const items: Item[] = [];
  for (const raw of payload.items ?? []) {
    if (!raw?.id) continue;
    const current = localItems.get(raw.id);
    if (current && (current.updatedAt ?? 0) > (raw.updatedAt ?? 0)) continue;

    const { image, ...rest } = raw;
    const item: Item = {
      ...(rest as Omit<Item, "imageBlob">),
      tags: Array.isArray(rest.tags) ? rest.tags : [],
      boardIds: Array.isArray(rest.boardIds) ? rest.boardIds : [],
      favorite: Boolean(rest.favorite),
    };

    const blob = current?.imageBlob ?? (image ? await fetchImage(image) : null);
    if (blob) item.imageBlob = blob;

    items.push(item);
  }

  if (items.length === 0 && boards.length === 0) return 0;

  await applyVault({
    boards,
    items,
    idsInVault: new Set((payload.items ?? []).map((item) => item.id)),
  });

  return items.length;
}

async function fetchImage(reference: string): Promise<Blob | null> {
  const name = reference.split("/").pop();
  if (!name) return null;
  try {
    const response = await fetch(`/api/vault/imagens/${encodeURIComponent(name)}`);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/* ──────────────────────────────── gravação ───────────────────────────────── */

let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let dirty = false;
/** Falhas seguidas — servidor caído, disco cheio, permissão. */
let failures = 0;

/**
 * Chamada a cada alteração do acervo. O atraso junta a rajada de uma ação só
 * — colar vinte links, arrastar dez imagens — numa gravação só.
 */
export function scheduleVaultSave(delay = 1200): void {
  if (state.status === "off" || state.status === "loading") return;
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void saveVault(), delay);
}

export async function saveVault(): Promise<void> {
  if (saving || state.status === "off") return;
  if (timer) clearTimeout(timer);

  saving = true;
  dirty = false;
  setState({ status: "saving" });

  try {
    const { boards, items, settings } = getState();

    const rows: VaultItem[] = [];
    const referenced = new Set<string>();

    for (const item of items) {
      const { imageBlob, ...rest } = item;
      if (!imageBlob) {
        rows.push(rest);
        continue;
      }
      const name = imageFileName(item.id, imageBlob.type);
      referenced.add(name);
      // O nome vem do id e a capa de uma referência não muda: se o arquivo já
      // está na pasta, subir de novo seria só tráfego.
      if (!onDisk.has(name)) {
        await uploadImage(name, imageBlob);
        onDisk.add(name);
      }
      rows.push({ ...rest, image: `imagens/${name}` });
    }

    const response = await fetch("/api/vault", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boards, items: rows, settings }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(detail?.error ?? `A pasta recusou a gravação (${response.status})`);
    }

    const { savedAt } = (await response.json()) as { savedAt: string };
    await put(STORE_SETTINGS, { stamp: savedAt }, STAMP_KEY);
    // O servidor apaga as imagens que ninguém aponta mais; o cliente acompanha
    // pra não achar que elas continuam lá.
    onDisk = referenced;

    failures = 0;
    setState({ status: "ready", savedAt: Date.now(), error: null });
  } catch (error) {
    console.error("Falha ao gravar na pasta do acervo", error);
    failures += 1;
    // O que falhou continua só no navegador: tenta de novo sozinho, mas sem
    // martelar pra sempre um servidor que já caiu.
    if (failures <= 3) dirty = true;
    setState({ status: "error", error: describe(error) });
  } finally {
    saving = false;
    if (dirty) scheduleVaultSave(failures > 0 ? failures * 5_000 : 800);
  }
}

async function uploadImage(name: string, blob: Blob): Promise<void> {
  const response = await fetch(`/api/vault/imagens/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Não consegui gravar a imagem ${name}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
