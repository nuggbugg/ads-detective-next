import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleCallback } from "./shopify";

const http = httpRouter();
auth.addHttpRoutes(http);

// Shopify OAuth callback
http.route({
  path: "/shopify/callback",
  method: "GET",
  handler: handleCallback,
});

export default http;
