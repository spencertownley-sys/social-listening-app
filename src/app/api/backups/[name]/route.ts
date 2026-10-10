import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { backupPath, canManageBackups, isBackupName } from "@/lib/backup";
import { apiContext } from "@/lib/http";

/** GET → download one saved backup. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  if (!canManageBackups(ctx)) return NextResponse.json({ error: "Only the site's owners can download backups." }, { status: 403 });
  const { name } = await params;
  if (!isBackupName(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await fs.readFile(backupPath(name));
    return new NextResponse(new Uint8Array(body), {
      headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${name}"` },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
