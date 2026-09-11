import { NextResponse } from "next/server";
import { VaultNotConfiguredError, readImage, writeImage } from "@/lib/server/vault";
import { isSafeImageName } from "@/lib/vaultTypes";
import { MAX_ASSET_BYTES } from "@/lib/syncTypes";

/**
 * As imagens da pasta do acervo, uma requisição por arquivo.
 *
 *   PUT → sobe a capa de uma referência (corpo cru, sem multipart)
 *   GET → baixa de volta, quando o navegador perdeu o banco local
 *
 * O nome é sempre `<id da referência>.<ext>`, então subir de novo o mesmo
 * arquivo é idempotente e nenhum lixo se acumula.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  return guarded(async () => {
    const { name } = await params;
    if (!isSafeImageName(name)) return invalidName();

    const bytes = await readImage(name);
    if (!bytes) {
      return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": mimeOf(name),
        "content-length": String(bytes.byteLength),
        // O nome vem do id da referência, que não é reaproveitado.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  return guarded(async () => {
    const { name } = await params;
    if (!isSafeImageName(name)) return invalidName();

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
    }
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      return NextResponse.json(
        { error: "Imagem grande demais (máximo 8 MB)", code: "too_large" },
        { status: 400 },
      );
    }

    await writeImage(name, bytes);
    return NextResponse.json({ name, size: bytes.byteLength });
  });
}

async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: "vault_not_configured" },
        { status: 503 },
      );
    }
    console.error("[vault] imagem falhou", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function invalidName() {
  return NextResponse.json(
    { error: "Nome de imagem inválido", code: "invalid_name" },
    { status: 400 },
  );
}

function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
