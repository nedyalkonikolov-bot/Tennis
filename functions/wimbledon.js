import { renderTournamentResponse } from "./tournaments/[slug].js";

export async function onRequestGet({ request, env }) {
  return renderTournamentResponse({ slug: "wimbledon", request, env, canonicalPath: "/wimbledon/" });
}
