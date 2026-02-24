import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync all active accounts + auto-analyze every 6 hours
crons.interval(
  "sync-and-analyze",
  { hours: 6 },
  internal.sync._syncAllImpl,
  {}
);

export default crons;
