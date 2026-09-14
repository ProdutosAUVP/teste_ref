import type { Board, Item } from "./types";

/**
 * Leitura dos dois arquivos que trazem um acervo de volta:
 *
 *   referencias/backup   o export de Ajustes — um JSON só, imagens embutidas
 *   referencias/acervo   o acervo.json da pasta em disco — imagens ao lado
 *
 * São o mesmo conteúdo em embalagens diferentes, e quem importa não deveria
 * precisar saber qual é qual: os dois entram pelo mesmo botão. A diferença
 * aparece só nas imagens, que num caso vêm no próprio arquivo (`imageData`) e
 * no outro são um caminho pra pasta vizinha (`image`).
 */

export const BACKUP_FORMAT = "referencias/backup";
/**
 * Repetido de `vaultTypes.ts` de propósito: este módulo não importa nada em
 * tempo de execução, que é o que permite testá-lo direto com o runner do Node.
 * Um teste amarra os dois valores, então eles não podem divergir em silêncio —
 * e nem deveriam mudar nunca: é o que identifica arquivos já gravados por aí.
 */
export const ACERVO_FORMAT = "referencias/acervo";

/** Item como ele aparece nos dois arquivos, antes de virar Blob. */
export type ImportItem = Omit<Item, "imageBlob"> & {
  /** Backup: a imagem embutida como data URL. */
  imageData?: string;
  /** Pasta do acervo: `imagens/<id>.webp`, um arquivo ao lado do JSON. */
  image?: string;
};

export interface ImportFile {
  kind: "backup" | "acervo";
  boards: Board[];
  items: ImportItem[];
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

/**
 * Valida e normaliza o arquivo. Erra com uma frase que diz o que fazer, não
 * com "JSON inválido": quem chega aqui está tentando recuperar o próprio
 * acervo e merece saber se pegou o arquivo errado.
 */
export function parseImportFile(text: string): ImportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportFormatError("Esse arquivo não é um JSON válido");
  }
  return parseImportValue(parsed);
}

/** O mesmo, pra quem já tem o JSON lido — a cópia anterior vem assim da rota. */
export function parseImportValue(parsed: unknown): ImportFile {
  if (!parsed || typeof parsed !== "object") {
    throw new ImportFormatError("Esse arquivo não parece um acervo de Referências");
  }

  const file = parsed as { format?: unknown; boards?: unknown; items?: unknown };
  const kind =
    file.format === BACKUP_FORMAT ? "backup" :
    file.format === ACERVO_FORMAT ? "acervo" : null;

  if (!kind) {
    throw new ImportFormatError(
      "Esse arquivo não é de Referências — use o backup exportado ou o acervo.json da pasta",
    );
  }
  if (!Array.isArray(file.items)) {
    throw new ImportFormatError("O arquivo está sem a lista de referências");
  }

  const boards = (Array.isArray(file.boards) ? file.boards : []).filter(
    (board): board is Board => Boolean(board && typeof board === "object" && (board as Board).id && (board as Board).name),
  );

  const items = (file.items as ImportItem[]).filter((item) => Boolean(item?.id));

  return { kind, boards, items };
}
