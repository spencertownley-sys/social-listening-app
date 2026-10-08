import { NextResponse } from "next/server";
import { feedFor } from "@/lib/analytics";
import { buildDigest, sendDigestEmail } from "@/lib/digest";
import { read } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

async function digestFor(id: string) {
  const data = await read();
  const profile = data.profiles.find((p) => p.id === id);
  return profile ? buildDigest(profile, feedFor(data, id)) : null;
}

/** The rendered digest email, for previewing. */
export async function GET(_req: Request, { params }: Ctx) {
  const digest = await digestFor((await params).id);
  if (!digest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(digest.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Send the digest now. */
export async function POST(_req: Request, { params }: Ctx) {
  const digest = await digestFor((await params).id);
  if (!digest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await sendDigestEmail(digest);
  return NextResponse.json({ ...result, subject: digest.subject, items: digest.items.length });
}
