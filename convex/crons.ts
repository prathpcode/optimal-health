import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep the list of Whop people who can be invited to a race current (convex/invites.ts).
crons.interval("sync whop people", { minutes: 10 }, internal.invites.syncDirectory, {});

export default crons;
