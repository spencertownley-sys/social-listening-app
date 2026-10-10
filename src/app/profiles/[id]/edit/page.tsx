import { notFound } from "next/navigation";
import { loadProfile } from "@/lib/load";
import { Builder } from "@/components/Builder";
import { ProfileHeader } from "@/components/ProfileHeader";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, versions, canEdit } = await loadProfile(id);
  if (!canEdit) notFound();
  return (
    <>
      <ProfileHeader profile={profile} versions={versions} current="edit" canEdit={canEdit} />
      <Builder profileId={profile.id} initial={profile.config} />
    </>
  );
}
