export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.SCHEDULER === "off") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
