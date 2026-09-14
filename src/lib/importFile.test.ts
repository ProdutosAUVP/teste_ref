import assert from "node:assert/strict";
import { test } from "node:test";
import { ACERVO_FORMAT, BACKUP_FORMAT, ImportFormatError, parseImportFile } from "./importFile.ts";
import { VAULT_FORMAT } from "./vaultTypes.ts";

test("o formato que o import reconhece é o mesmo que a pasta grava", () => {
  assert.equal(ACERVO_FORMAT, VAULT_FORMAT);
  assert.equal(BACKUP_FORMAT, "referencias/backup");
});

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: "link", title: "Um site", url: "https://exemplo.com",
  boardIds: [], tags: [], favorite: false, createdAt: 1, updatedAt: 1, ...extra,
});

const backup = (items: unknown[] = [item("a")]) => JSON.stringify({
  format: "referencias/backup", version: 1, exportedAt: "2026-01-01T00:00:00.000Z",
  boards: [{ id: "b1", name: "Ideias", emoji: "💡", color: "#5b9279", position: 0, createdAt: 1, updatedAt: 1 }],
  items,
});

const acervo = (items: unknown[] = [item("a")]) => JSON.stringify({
  format: "referencias/acervo", version: 1, savedAt: "2026-01-01T00:00:00.000Z",
  boards: [{ id: "b1", name: "Ideias", emoji: "💡", color: "#5b9279", position: 0, createdAt: 1, updatedAt: 1 }],
  items,
});

test("lê o backup exportado", () => {
  const parsed = parseImportFile(backup());
  assert.equal(parsed.kind, "backup");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.boards.length, 1);
});

test("lê o acervo.json da pasta — o arquivo que o salvamento em disco grava", () => {
  const parsed = parseImportFile(acervo());
  assert.equal(parsed.kind, "acervo");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.boards[0].name, "Ideias");
});

test("preserva as duas formas de imagem, cada uma do seu arquivo", () => {
  const doBackup = parseImportFile(backup([item("a", { imageData: "data:image/webp;base64,AA" })]));
  assert.equal(doBackup.items[0].imageData, "data:image/webp;base64,AA");

  const daPasta = parseImportFile(acervo([item("a", { image: "imagens/a.webp" })]));
  assert.equal(daPasta.items[0].image, "imagens/a.webp");
});

test("descarta item sem id e board sem nome, em vez de recusar o arquivo", () => {
  const parsed = parseImportFile(JSON.stringify({
    format: "referencias/acervo", items: [item("a"), { title: "sem id" }, null],
    boards: [{ id: "b1", name: "Ideias" }, { id: "b2" }, null],
  }));
  assert.deepEqual(parsed.items.map((i) => i.id), ["a"]);
  assert.deepEqual(parsed.boards.map((b) => b.id), ["b1"]);
});

test("recusa arquivo de outro programa dizendo o que serve", () => {
  assert.throws(
    () => parseImportFile(JSON.stringify({ format: "outra-coisa", items: [] })),
    (error: unknown) =>
      error instanceof ImportFormatError && /acervo\.json/.test(error.message),
  );
});

test("recusa arquivo quebrado sem falar em JSON.parse", () => {
  assert.throws(() => parseImportFile("{ isso não é json"), ImportFormatError);
  assert.throws(() => parseImportFile(""), ImportFormatError);
  assert.throws(() => parseImportFile("[]"), ImportFormatError);
  // Formato certo, mas sem a lista: o arquivo está truncado.
  assert.throws(() => parseImportFile(JSON.stringify({ format: "referencias/acervo" })), ImportFormatError);
});
