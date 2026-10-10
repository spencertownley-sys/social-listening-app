import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, verifySession, checkSetupCode } from "./auth";
import { DEFAULT_WORKSPACE_ID, mutate, newId, read, type Invite, type Membership, type Role, type StoreData, type User } from "./store";

/**
 * Accounts: email + password users, workspaces they belong to, and invite links.
 *  - The very first account is created at /setup (with APP_PASSWORD as the setup code on the
 *    hosted site) and owns the existing workspace and its data.
 *  - Owners and editors create invite links; someone who opens one signs up into that workspace.
 *  - Roles: owner (everything, incl. members), editor (profiles, feedback, listening), viewer (read).
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const N = 16384;
const INVITE_DAYS = 7;

export class AccountError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AccountError";
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: 8, p: 1 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validate(email: string, password: string, name: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Enter a valid email address.");
  if (password.length < 10) throw new AccountError("Use a password of at least 10 characters.");
  if (name.trim().length > 80) throw new AccountError("That name is too long.");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// Session context for pages and API routes

export interface Context {
  user: User;
  memberships: Membership[];
  /** The workspace the UI works in (the user's first membership). */
  workspaceId: string;
  role: Role;
}

export function contextFor(data: StoreData, userId: string, sessionVersion?: number): Context | null {
  const user = data.users.find((u) => u.id === userId);
  if (!user || (sessionVersion !== undefined && user.sessionVersion !== sessionVersion)) return null;
  const memberships = data.memberships.filter((m) => m.userId === user.id);
  if (memberships.length === 0) return null;
  return { user, memberships, workspaceId: memberships[0].workspaceId, role: memberships[0].role };
}

/** The signed-in user, or null. */
export async function currentContext(): Promise<Context | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return contextFor(await read(), session.u, session.v);
}

export function canWrite(ctx: Context): boolean {
  return ctx.role === "owner" || ctx.role === "editor";
}

export function workspaceIds(ctx: Context): Set<string> {
  return new Set(ctx.memberships.map((m) => m.workspaceId));
}

/** Profiles this user can see. */
export function visibleProfiles(data: StoreData, ctx: Context) {
  const ws = workspaceIds(ctx);
  return data.profiles.filter((p) => ws.has(p.workspaceId));
}

export function canSeeProfile(data: StoreData, ctx: Context, profileId: string): boolean {
  return visibleProfiles(data, ctx).some((p) => p.id === profileId);
}

export async function sessionCookieFor(user: User): Promise<{ name: string; value: string }> {
  return { name: SESSION_COOKIE, value: await signSession(user.id, user.sessionVersion) };
}

// ---------------------------------------------------------------------------------------------
// Flows

export async function needsSetup(): Promise<boolean> {
  return (await read()).users.length === 0;
}

/** Create the first account; it owns the pre-existing workspace and its data. */
export async function setupFirstAccount(input: { setupCode: string; email: string; name: string; password: string }): Promise<User> {
  const email = normalizeEmail(input.email);
  validate(email, input.password, input.name);
  if (!(await checkSetupCode(input.setupCode))) throw new AccountError("That setup code didn't match.", 403);
  const passwordHash = await hashPassword(input.password);
  return mutate((data) => {
    if (data.users.length > 0) throw new AccountError("This site already has an account. Sign in instead.", 409);
    const user: User = { id: newId("usr"), email, name: input.name.trim(), passwordHash, sessionVersion: 1, createdAt: new Date().toISOString() };
    data.users.push(user);
    const workspaceId = data.workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;
    if (!data.workspaces.some((w) => w.id === workspaceId)) data.workspaces.push({ id: workspaceId, name: "My workspace", createdAt: user.createdAt });
    data.memberships.push({ workspaceId, userId: user.id, role: "owner" });
    return user;
  });
}

export async function login(emailInput: string, password: string): Promise<User | null> {
  const email = normalizeEmail(emailInput);
  const user = (await read()).users.find((u) => u.email === email);
  // Hash even when the user doesn't exist so timing doesn't reveal which emails have accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  return user && ok ? user : null;
}

export async function createInvite(ctx: Context, role: Role): Promise<{ token: string; invite: Invite }> {
  if (!canWrite(ctx)) throw new AccountError("Only owners and editors can invite people.", 403);
  if (role === "owner" && ctx.role !== "owner") throw new AccountError("Only owners can invite owners.", 403);
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const invite: Invite = {
    id: newId("inv"),
    tokenHash: tokenHash(token),
    workspaceId: ctx.workspaceId,
    role,
    createdBy: ctx.user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  await mutate((data) => {
    data.invites.push(invite);
  });
  return { token, invite };
}

export function findInvite(data: StoreData, token: string): Invite | null {
  const h = tokenHash(token);
  const invite = data.invites.find((i) => i.tokenHash === h);
  if (!invite || invite.usedAt || Date.parse(invite.expiresAt) < Date.now()) return null;
  return invite;
}

export async function signupWithInvite(input: { token: string; email: string; name: string; password: string }): Promise<User> {
  const email = normalizeEmail(input.email);
  validate(email, input.password, input.name);
  const passwordHash = await hashPassword(input.password);
  return mutate((data) => {
    const invite = findInvite(data, input.token);
    if (!invite) throw new AccountError("This invite link has expired or was already used. Ask for a new one.", 410);
    if (data.users.some((u) => u.email === email)) throw new AccountError("An account with that email already exists. Sign in instead.", 409);
    const user: User = { id: newId("usr"), email, name: input.name.trim(), passwordHash, sessionVersion: 1, createdAt: new Date().toISOString() };
    data.users.push(user);
    data.memberships.push({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role });
    invite.usedBy = user.id;
    invite.usedAt = user.createdAt;
    return user;
  });
}

export async function changePassword(ctx: Context, current: string, next: string): Promise<User> {
  if (!(await verifyPassword(current, ctx.user.passwordHash))) throw new AccountError("Your current password didn't match.", 403);
  validate(ctx.user.email, next, ctx.user.name);
  const passwordHash = await hashPassword(next);
  return mutate((data) => {
    const user = data.users.find((u) => u.id === ctx.user.id)!;
    user.passwordHash = passwordHash;
    user.sessionVersion += 1; // other devices are signed out
    return user;
  });
}

export async function signOutEverywhere(ctx: Context): Promise<void> {
  await mutate((data) => {
    const user = data.users.find((u) => u.id === ctx.user.id);
    if (user) user.sessionVersion += 1;
  });
}

export async function removeMember(ctx: Context, userId: string): Promise<void> {
  if (ctx.role !== "owner") throw new AccountError("Only owners can remove people.", 403);
  if (userId === ctx.user.id) throw new AccountError("You can't remove yourself.");
  await mutate((data) => {
    data.memberships = data.memberships.filter((m) => !(m.userId === userId && m.workspaceId === ctx.workspaceId));
    if (!data.memberships.some((m) => m.userId === userId)) {
      data.users = data.users.filter((u) => u.id !== userId);
    }
  });
}

export async function revokeInvite(ctx: Context, inviteId: string): Promise<void> {
  if (!canWrite(ctx)) throw new AccountError("Not allowed.", 403);
  await mutate((data) => {
    data.invites = data.invites.filter((i) => !(i.id === inviteId && i.workspaceId === ctx.workspaceId));
  });
}

/** Unused, unexpired invites for the user's workspace (for the account page). */
export function openInvites(data: StoreData, ctx: Context, now = Date.now()): Pick<Invite, "id" | "role" | "expiresAt">[] {
  if (!canWrite(ctx)) return [];
  return data.invites
    .filter((i) => i.workspaceId === ctx.workspaceId && !i.usedAt && Date.parse(i.expiresAt) > now)
    .map((i) => ({ id: i.id, role: i.role, expiresAt: i.expiresAt }));
}
