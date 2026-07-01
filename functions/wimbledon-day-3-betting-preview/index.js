import { renderWimbledonSeoPage } from "../lib/wimbledon-pages.js";

export async function onRequestGet({ request, env }) {
  return renderWimbledonSeoPage({ request, env, page: "dayPreview" });
}

