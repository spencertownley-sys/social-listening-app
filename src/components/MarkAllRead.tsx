"use client";

import { useRouter } from "next/navigation";

export function MarkAllRead() {
  const router = useRouter();
  return (
    <button
      className="btn"
      onClick={async () => {
        await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
        router.refresh();
      }}
    >
      Mark all read
    </button>
  );
}
