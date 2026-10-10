import { notFound } from "next/navigation";
import { canWrite } from "@/lib/accounts";
import { pageContext } from "@/lib/http";
import { Builder } from "@/components/Builder";

export const dynamic = "force-dynamic";

export default async function NewProfilePage() {
  if (!canWrite(await pageContext())) notFound();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">New listening profile</h1>
      <p className="mb-6 text-sm text-muted">Five quick steps. You can change anything later; every save keeps the previous version.</p>
      <Builder />
    </>
  );
}
