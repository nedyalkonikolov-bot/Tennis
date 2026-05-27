const RESPONSES_URL = "https://api.openai.com/v1/responses";

function extractOutputText(payload) {
  if (payload?.output_text) return payload.output_text;
  return (payload?.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n");
}

export async function generatePostVariants({ apiKey, model = "gpt-5.4-mini", matchData }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to generate posts.");

  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            "You create human tennis-fan Threads posts for TennisTipz.",
            "Write like a real fan watching the match, not a betting ad and not an AI assistant.",
            "Return strict JSON only: {\"variants\":[{\"type\":\"hot_take|stat_angle|live_match_reaction|debate_question|soft_prediction\",\"text\":\"...\"}]}",
            "Create exactly 5 variants, one of each type.",
            "Rules for every text: max 450 characters, opinionated, reply-worthy, no direct link, no spammy betting language, no guaranteed/lock/sure win, no hashtags unless they feel very natural.",
            "Mention tennistipz.win only occasionally and naturally. It is acceptable for most variants to omit it.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ matchData }, null, 2),
        },
      ],
      text: { format: { type: "text" } },
      max_output_tokens: 900,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  const raw = extractOutputText(payload);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.variants)) throw new Error("Missing variants array.");
    return parsed.variants;
  } catch (error) {
    throw new Error(`OpenAI returned invalid JSON: ${error.message}. Raw output: ${raw.slice(0, 500)}`);
  }
}
