import { feedFor } from "@/lib/analytics";
import { loadProfile } from "@/lib/load";
import { Feed } from "@/components/Feed";
import { ProfileHeader } from "@/components/ProfileHeader";

export const dynamic = "force-dynamic";

export default async function FeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, profile, versions, renderedAt, canEdit } = await loadProfile(id);
  return (
    <>
      <ProfileHeader profile={profile} versions={versions} current="feed" canEdit={canEdit} />
      <Feed profileId={profile.id} items={feedFor(data, profile.id)} now={renderedAt} weights={profile.config.sources} readOnly={!canEdit} />
    </>
  );
}
