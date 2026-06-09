import assert from "node:assert/strict";
import { canonicalTournamentSlug, dedupeCandidates, linkArticleBody, relatedArticleLinks, slugify } from "../functions/lib/internal-links.js";

const candidates = [
  { label: "Alexander Zverev", url: "/players/atp/alexander-zverev/", type: "player" },
  { label: "French Open, Men Singles", url: "/tournaments/french-open/", type: "tournament" },
  { label: "Flavio Cobolli vs Alexander Zverev", url: "/predictions/atp-flavio-cobolli-vs-alexander-zverev/", type: "prediction" },
];

{
  const html = [
    "<h2>Alexander Zverev headline should stay plain</h2>",
    "<p>Alexander Zverev meets Flavio Cobolli vs Alexander Zverev at French Open, Men Singles.</p>",
    "<p>Alexander Zverev is mentioned again but should not receive a duplicate URL.</p>",
  ].join("");
  const linked = linkArticleBody(html, candidates);
  assert.match(linked, /<h2>Alexander Zverev headline should stay plain<\/h2>/);
  assert.match(linked, /<a href="\/predictions\/atp-flavio-cobolli-vs-alexander-zverev\/">Flavio Cobolli vs Alexander Zverev<\/a>/);
  assert.match(linked, /<a href="\/tournaments\/french-open\/">French Open, Men Singles<\/a>/);
  assert.equal((linked.match(/\/players\/atp\/alexander-zverev\//g) || []).length, 1);
}

{
  const html = '<p><a href="/players/atp/alexander-zverev/">Alexander Zverev</a> already linked, then Alexander Zverev appears.</p>';
  const linked = linkArticleBody(html, candidates);
  assert.equal((linked.match(/\/players\/atp\/alexander-zverev\//g) || []).length, 1);
}

{
  const deduped = dedupeCandidates([
    { label: "Alexander Zverev", url: "/players/atp/alexander-zverev/" },
    { label: "Alexander Zverev", url: "/players/atp/alexander-zverev/" },
    { label: "Bad", url: "/tennis-news/" },
    { label: "French Open", url: "/tournaments/french-open/" },
  ]);
  assert.deepEqual(deduped.map((item) => item.url), ["/players/atp/alexander-zverev/", "/tournaments/french-open/"]);
}

{
  assert.equal(slugify("Flavio Cobolli vs Alexander Zverev"), "flavio-cobolli-vs-alexander-zverev");
  assert.equal(canonicalTournamentSlug("Roland Garros, Men Singles"), "french-open");
  assert.equal(canonicalTournamentSlug("US Open, Men Singles"), "us-open");
}

{
  const related = relatedArticleLinks("current", [
    { slug: "current", title: "Current article" },
    { slug: "zverev-form", title: "Alexander Zverev form guide" },
  ]);
  assert.deepEqual(related, [{ label: "Alexander Zverev form guide", url: "/articles/zverev-form/", type: "article" }]);
}

console.log("internal link generation tests passed");
