import { redirect } from "next/navigation";
import { AccountError, canWrite, currentContext, type Context } from "./accounts";
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

// ---------------------------------------------------------------------------------------------
// Access control. Every API route except login/setup/signup/health/cron starts with one of these.


type Need = "read" | "write" | "owner";

/** The signed-in context, or the 401/403 response to return. */
export async function apiContext(need: Need = "read"): Promise<Context | NextResponse> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (need === "write" && !canWrite(ctx)) return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });
  if (need === "owner" && ctx.role !== "owner") return NextResponse.json({ error: "Only workspace owners can do that." }, { status: 403 });
  return ctx;
}

/** For server-rendered pages: the signed-in context, or a redirect to sign in. */
export async function pageContext(): Promise<Context> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export function accountErrorResponse(e: unknown): NextResponse {
  if (e instanceof AccountError) return NextResponse.json({ error: e.message }, { status: e.status });
  return errorResponse(e);
}
