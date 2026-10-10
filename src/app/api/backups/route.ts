import { NextResponse } from "next/server";
import { backupStatus, canManageBackups, listBackups, runBackup } from "@/lib/backup";
import { apiContext } from "@/lib/http";

async function guard() {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  if (!canManageBackups(ctx)) return NextResponse.json({ error: "Only the site's owners can manage backups." }, { status: 403 });
  return ctx;
}

/** GET → saved backups and the last run. POST → back up now (and email it). */
export async function GET() {
  const ctx = await guard();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ backups: await listBackups(), status: backupStatus() });
}

export async function POST() {
  const ctx = await guard();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json(await runBackup(), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: `Backup failed: ${(e as Error).message}` }, { status: 500 });
  }
}
