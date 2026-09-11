import type { Board, Item, Settings } from "./types";

/**
 * Formato da pasta do acervo — o contrato entre o navegador, o servidor e o
 * disco. Fica fora de `lib/server` porque os três lados leem daqui, e é o
 * mesmo formato da versão standalone (`index.html`), então uma pasta gravada
 * lá abre aqui e vice-versa.
 *
 *   <pasta>/
 *   ├─ acervo.json          boards, referências e preferências
 *   └─ imagens/<id>.webp    uma imagem por referência
 */

export const VAULT_FILE = "acervo.json";
export const VAULT_IMAGES = "imagens";
export const VAULT_FORMAT = "referencias/acervo";

/** Item como ele vai pro disco: sem o Blob, com o caminho da imagem. */
export type VaultItem = Omit<Item, "imageBlob"> & { image?: string };

export interface VaultSnapshot {
  format: typeof VAULT_FORMAT;
  version: 1;
  savedAt: string;
  settings?: Partial<Settings>;
  boards: Board[];
  items: VaultItem[];
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * O arquivo da imagem se chama como o id da referência. Como o id não é
 * reaproveitado e a capa de uma referência não muda, o nome é estável: dá pra
 * pular o que já está gravado e apagar o que ninguém aponta mais.
 */
export function imageFileName(id: string, mime?: string): string {
  return `${id}.${(mime && EXTENSIONS[mime]) ?? "webp"}`;
}

/**
 * O nome vem de um id gerado no navegador. Sem uma peneira aqui, um id com
 * `../` faria o servidor escrever fora da pasta.
 */
export function isSafeImageName(name: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) &&
    !name.includes("..") &&
    /\.(webp|png|jpg|jpeg|gif|svg)$/i.test(name)
  );
}

/** Extrai o nome do arquivo de um `imagens/<nome>` vindo do cliente. */
export function imageNameOf(reference: string | undefined): string | null {
  if (!reference) return null;
  const name = reference.split("/").pop() ?? "";
  return isSafeImageName(name) ? name : null;
}
