import { NextResponse } from "next/server";
import { VAULT_RESCUE, VaultNotConfiguredError, readSnapshot } from "@/lib/server/vault";

/**
 * A cópia anterior guardada na pasta — o conteúdo inteiro, pra restaurar.
 *
 * Fica numa rota separada porque `/api/vault` é lido a cada abertura do app e
 * não faz sentido carregar duas versões do acervo toda vez: essa aqui só é
 * pedida quando alguém clica em restaurar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rescue = await readSnapshot(VAULT_RESCUE);
    if (!rescue) {
      return NextResponse.json(
        { error: "Não há cópia anterior nessa pasta", code: "no_rescue" },
        { status: 404 },
      );
    }
    return NextResponse.json(rescue);
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: "vault_not_configured" },
        { status: 503 },
      );
    }
    console.error("[vault] cópia anterior ilegível", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
