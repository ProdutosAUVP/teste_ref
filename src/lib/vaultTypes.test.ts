import assert from "node:assert/strict";
import { test } from "node:test";
import { imageFileName, imageNameOf, isSafeImageName } from "./vaultTypes.ts";

test("o arquivo da imagem se chama como o id da referência", () => {
  assert.equal(imageFileName("abc123"), "abc123.webp");
  assert.equal(imageFileName("abc123", "image/webp"), "abc123.webp");
  assert.equal(imageFileName("abc123", "image/png"), "abc123.png");
  assert.equal(imageFileName("abc123", "image/jpeg"), "abc123.jpg");
  assert.equal(imageFileName("abc123", "image/svg+xml"), "abc123.svg");
  // Tipo desconhecido não inventa extensão: cai no padrão do app.
  assert.equal(imageFileName("abc123", "application/pdf"), "abc123.webp");
});

test("aceita os nomes que o app gera", () => {
  assert.ok(isSafeImageName("7f3c1e2a-9b40-4d51-8a2e-000000000001.webp"));
  assert.ok(isSafeImageName("seed-item-1.png"));
  assert.ok(isSafeImageName("a.jpeg"));
});

test("recusa nome que escaparia da pasta de imagens", () => {
  assert.equal(isSafeImageName("../acervo.json"), false);
  assert.equal(isSafeImageName("..%2Facervo.json"), false);
  assert.equal(isSafeImageName("sub/dir.webp"), false);
  assert.equal(isSafeImageName("/etc/passwd.png"), false);
  assert.equal(isSafeImageName(".oculto.webp"), false);
  assert.equal(isSafeImageName("nome com espaço.webp"), false);
  assert.equal(isSafeImageName(""), false);
});

test("recusa o que não é imagem, mesmo com nome inocente", () => {
  assert.equal(isSafeImageName("acervo.json"), false);
  assert.equal(isSafeImageName("script.js"), false);
  assert.equal(isSafeImageName("semextensao"), false);
  assert.equal(isSafeImageName(`${"a".repeat(200)}.webp`), false);
});

test("extrai o nome do caminho que o cliente manda", () => {
  assert.equal(imageNameOf("imagens/abc.webp"), "abc.webp");
  assert.equal(imageNameOf("abc.webp"), "abc.webp");
  assert.equal(imageNameOf(undefined), null);
  assert.equal(imageNameOf(""), null);
  // Caminho hostil: o último segmento é o que vale, e ele tem que passar.
  assert.equal(imageNameOf("imagens/../../etc/passwd"), null);
  assert.equal(imageNameOf("imagens/acervo.json"), null);
});
