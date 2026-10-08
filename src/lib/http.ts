import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { QuerySyntaxError } from "./query";

/** Turn thrown errors into JSON responses: validation problems are 400s, everything else 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ") },
      { status: 400 },
    );
  }
  if (error instanceof QuerySyntaxError) {
    return NextResponse.json({ error: `Query: ${error.message} (at character ${error.position + 1})` }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: (error as Error).message ?? "Something went wrong" }, { status: 500 });
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
