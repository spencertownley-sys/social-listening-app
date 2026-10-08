import { feedFor } from "@/lib/analytics";
import { buildDigest } from "@/lib/digest";
import { loadProfile } from "@/lib/load";
import { ProfileHeader } from "@/components/ProfileHeader";
import { SendDigestButton } from "@/components/SendDigestButton";

export const dynamic = "force-dynamic";

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, profile, versions } = await loadProfile(id);
  const digest = buildDigest(profile, feedFor(data, id));
  return (
    <>
      <ProfileHeader profile={profile} versions={versions} current="digest" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{digest.subject}</p>
          <p className="text-sm text-muted">
            {profile.config.delivery.cadence} digest · {digest.items.length} posts in this window · channels: {profile.config.delivery.channels.join(", ")}
          </p>
        </div>
        <SendDigestButton profileId={profile.id} />
      </div>
      <iframe title="Digest email preview" srcDoc={digest.html} className="h-[70vh] w-full rounded-lg border border-line bg-white" sandbox="" />
    </>
  );
}
