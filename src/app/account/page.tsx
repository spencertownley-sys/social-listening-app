import { canWrite, openInvites } from "@/lib/accounts";
import { pageContext } from "@/lib/http";
import { read, storageBackendName } from "@/lib/store";
import { AccountPanel } from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const ctx = await pageContext();
  const data = await read();
  const workspace = data.workspaces.find((w) => w.id === ctx.workspaceId);
  const members = data.memberships
    .filter((m) => m.workspaceId === ctx.workspaceId)
    .map((m) => {
      const u = data.users.find((x) => x.id === m.userId);
      return { userId: m.userId, role: m.role, name: u?.name ?? "", email: u?.email ?? "" };
    });
  const invites = openInvites(data, ctx);
  return (
    <AccountPanel
      me={{ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.role }}
      workspaceName={workspace?.name ?? "My workspace"}
      members={members}
      invites={invites}
      canInvite={canWrite(ctx)}
      storage={await storageBackendName()}
    />
  );
}
