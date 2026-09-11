import { NextResponse } from "next/server";
import {
  VaultNotConfiguredError,
  listImages,
  pruneImages,
  readSnapshot,
  vaultDir,
  writeSnapshot,
} from "@/lib/server/vault";
import { imageNameOf, type VaultItem } from "@/lib/vaultTypes";
import type { Board, Settings } from "@/lib/types";

/**
 * A pasta do acervo, vista pelo navegador.
 *
 *   GET  → o que está gravado em disco (e a lista de imagens que já subiram)
 *   PUT  → grava o acervo inteiro e apaga as imagens que ninguém aponta mais
 *
 * Gravar tudo de uma vez, em vez de um diff, é o que deixa a exclusão ser
 * implícita: o que não está no corpo não existe mais, e a pasta nunca fica
 * com resto de item apagado.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface VaultStatePayload {
  enabled: boolean;
  dir?: string;
  savedAt?: string;
  settings?: Partial<Settings>;
  boards?: Board[];
  items?: VaultItem[];
  images?: string[];
  error?: string;
}

export async function GET() {
  const dir = vaultDir();
  if (!dir) return NextResponse.json({ enabled: false } satisfies VaultStatePayload);

  try {
    const [snapshot, images] = await Promise.all([readSnapshot(), listImages()]);
    return NextResponse.json({
      enabled: true,
      dir,
      savedAt: snapshot?.savedAt ?? "",
      settings: snapshot?.settings,
      boards: snapshot?.boards ?? [],
      items: snapshot?.items ?? [],
      images,
    } satisfies VaultStatePayload);
  } catch (error) {
    console.error("[vault] leitura falhou", error);
    return NextResponse.json(
      { enabled: true, dir, error: message(error) } satisfies VaultStatePayload,
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      boards?: Board[];
      items?: VaultItem[];
      settings?: Partial<Settings>;
    };

    if (!Array.isArray(body.items) || !Array.isArray(body.boards)) {
      return NextResponse.json(
        { error: "Esperava boards e items", code: "invalid_request" },
        { status: 400 },
      );
    }

    const snapshot = await writeSnapshot({
      boards: body.boards,
      items: body.items,
      settings: body.settings,
    });

    const keep = body.items
      .map((item) => imageNameOf(item.image))
      .filter((name): name is string => Boolean(name));
    const removed = await pruneImages(keep);

    return NextResponse.json({
      savedAt: snapshot.savedAt,
      items: body.items.length,
      boards: body.boards.length,
      removedImages: removed,
    });
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: "vault_not_configured" },
        { status: 503 },
      );
    }
    console.error("[vault] gravação falhou", error);
    return NextResponse.json(
      { error: message(error), code: "vault_write_failed" },
      { status: 500 },
    );
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
