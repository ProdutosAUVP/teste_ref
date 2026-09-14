import "server-only";

import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  VAULT_FILE,
  VAULT_FORMAT,
  VAULT_IMAGES,
  VAULT_RESCUE,
  imageNameOf,
  isSafeImageName,
  shouldArchive,
  type VaultItem,
  type VaultSnapshot,
} from "../vaultTypes";
import type { Board, Settings } from "../types";

export { VAULT_FILE, VAULT_FORMAT, VAULT_IMAGES, VAULT_RESCUE, isSafeImageName };
export type { VaultItem, VaultSnapshot };

/**
 * O acervo gravado numa pasta de verdade da máquina que roda o app.
 *
 *   data/
 *   ├─ acervo.json          boards, referências e preferências
 *   └─ imagens/<id>.webp    uma imagem por referência
 *
 * O IndexedDB do navegador continua sendo a fonte de render — a tela nunca
 * espera o disco. A pasta é a cópia que sobrevive a ele: limpar os dados do
 * navegador, trocar de perfil ou de navegador não tira nada daqui, e na
 * abertura seguinte o acervo volta de disco sozinho.
 *
 * Diferente da sincronização, não há conta nem banco: é um diretório, e o
 * backup é copiar a pasta. Por isso mesmo a pasta não tem senha — quem
 * alcança o app alcança o acervo. Ligue num servidor exposto só se o acesso
 * a ele já for restrito.
 */

/**
 * Onde a pasta fica — e se ela existe nesta instalação.
 *
 * `VAULT_DIR` manda em tudo: um caminho liga, `off` desliga. Sem ela, o
 * salvamento em disco vem ligado em `next dev` (máquina de quem desenvolve,
 * servidor local) e desligado em produção, onde o disco costuma ser efêmero e
 * o app, público.
 */
export function vaultDir(): string | null {
  const configured = process.env.VAULT_DIR?.trim();

  if (configured) {
    if (/^(off|no|false|0)$/i.test(configured)) return null;
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }

  if (process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim()) {
    return resolve(process.cwd(), "data");
  }

  return null;
}

export function isVaultConfigured(): boolean {
  return vaultDir() !== null;
}

export class VaultNotConfiguredError extends Error {
  constructor() {
    super("Salvamento em pasta desligado. Defina VAULT_DIR para ligar.");
    this.name = "VaultNotConfiguredError";
  }
}

function requireDir(): string {
  const dir = vaultDir();
  if (!dir) throw new VaultNotConfiguredError();
  return dir;
}

/* ────────────────────────────── acervo.json ──────────────────────────────── */

export async function readSnapshot(name: string = VAULT_FILE): Promise<VaultSnapshot | null> {
  const file = join(requireDir(), name);

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!raw.trim()) return null;

  const parsed = JSON.parse(raw) as Partial<VaultSnapshot>;
  if (parsed.format !== VAULT_FORMAT || !Array.isArray(parsed.items)) {
    throw new Error(`${file} não parece um acervo de Referências`);
  }

  return {
    format: VAULT_FORMAT,
    version: 1,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    settings: parsed.settings,
    boards: Array.isArray(parsed.boards) ? parsed.boards : [],
    items: parsed.items,
  };
}

/** Lê sem reclamar: arquivo que falta ou que não entendemos vira `null`. */
async function readSnapshotOrNull(name: string): Promise<VaultSnapshot | null> {
  try {
    return await readSnapshot(name);
  } catch {
    return null;
  }
}

/**
 * Grava o acervo — e, quando ele encolheu, guarda antes a versão que estava em
 * disco como cópia de resgate.
 *
 * Só encolhendo: gravar um acervo vazio dez vezes seguidas não pode enterrar a
 * última versão cheia. É o que faz um "Limpar acervo" sem querer, ou uma
 * exclusão em massa, continuar tendo volta — a pasta é a rede de segurança do
 * navegador, e uma rede que se esvazia junto não é rede nenhuma.
 *
 * Cada arquivo vai primeiro num temporário e só então substitui o antigo: um
 * app morto no meio da gravação não deixa acervo.json pela metade.
 */
export async function writeSnapshot(input: {
  boards: Board[];
  items: VaultItem[];
  settings?: Partial<Settings>;
}): Promise<{ snapshot: VaultSnapshot; rescue: VaultSnapshot | null }> {
  const dir = requireDir();
  await mkdir(dir, { recursive: true });

  const current = await readSnapshotOrNull(VAULT_FILE);
  let rescue: VaultSnapshot | null;

  if (current && shouldArchive(current.items.length, input.items.length)) {
    await writeJson(join(dir, VAULT_RESCUE), current);
    rescue = current;
  } else {
    rescue = await readSnapshotOrNull(VAULT_RESCUE);
  }

  const snapshot: VaultSnapshot = {
    format: VAULT_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    settings: input.settings,
    boards: input.boards,
    items: input.items,
  };

  await writeJson(join(dir, VAULT_FILE), snapshot);

  return { snapshot, rescue };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/* ──────────────────────────────── imagens ────────────────────────────────── */

function imagePath(name: string): string {
  if (!isSafeImageName(name)) throw new Error("Nome de imagem inválido");
  const dir = join(requireDir(), VAULT_IMAGES);
  const file = join(dir, name);
  // Cinto e suspensório: mesmo passando na peneira, o caminho tem que cair
  // dentro da pasta de imagens.
  if (dirname(file) !== dir) throw new Error("Nome de imagem inválido");
  return file;
}

export async function listImages(): Promise<string[]> {
  try {
    const entries = await readdir(join(requireDir(), VAULT_IMAGES), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readImage(name: string): Promise<Buffer | null> {
  try {
    return await readFile(imagePath(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeImage(name: string, data: Buffer): Promise<void> {
  const file = imagePath(name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

/**
 * Apaga as imagens que nenhuma referência aponta mais — nem as do acervo, nem
 * as da cópia de resgate. Restaurar sem as capas seria restaurar pela metade.
 */
export async function pruneImages(keep: Iterable<string>): Promise<number> {
  const wanted = new Set(keep);

  const rescue = await readSnapshotOrNull(VAULT_RESCUE);
  for (const item of rescue?.items ?? []) {
    const name = imageNameOf(item.image);
    if (name) wanted.add(name);
  }

  const present = await listImages();
  let removed = 0;

  for (const name of present) {
    if (wanted.has(name)) continue;
    await rm(join(requireDir(), VAULT_IMAGES, name), { force: true });
    removed += 1;
  }

  return removed;
}
