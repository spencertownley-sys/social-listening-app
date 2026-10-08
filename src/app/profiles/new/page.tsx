import { Builder } from "@/components/Builder";

export default function NewProfilePage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">New listening profile</h1>
      <p className="mb-6 text-sm text-muted">Five quick steps. You can change anything later; every save keeps the previous version.</p>
      <Builder />
    </>
  );
}
