import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Where Whop sends people after the free "Fit communities" join (Whop only accepts https return addresses).
 * It hands them straight back to the app, which then sees their access and opens their rooms.
 */
http.route({
  path: "/whop/joined",
  method: "GET",
  handler: httpAction(async () => new Response(null, { status: 302, headers: { Location: "fitscanner://joined" } })),
});

export default http;
