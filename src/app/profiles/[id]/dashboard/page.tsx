import { dashboardFor, feedFor } from "@/lib/analytics";
import { loadProfile } from "@/lib/load";
import { DashboardCharts } from "@/components/DashboardCharts";
import { ProfileHeader } from "@/components/ProfileHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, profile, versions } = await loadProfile(id);
  return (
    <>
      <ProfileHeader profile={profile} versions={versions} current="dashboard" />
      <DashboardCharts d={dashboardFor(feedFor(data, id))} />
    </>
  );
}
