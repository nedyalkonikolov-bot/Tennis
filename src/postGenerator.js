import { generatePostVariants } from "./openaiClient.js";
import { selectBestPost } from "./postScorer.js";

function validateVariant(variant) {
  const text = String(variant?.text || "").trim();
  if (!text) return null;
  return {
    type: String(variant.type || "variant"),
    text: text.slice(0, 450),
  };
}

function fallbackVariants(matchData) {
  const player1 = matchData.player1 || "Player one";
  const player2 = matchData.player2 || "Player two";
  const surface = matchData.surface || "this surface";
  const lean = matchData.prediction?.lean || "this match gets tight late";
  const reason = matchData.prediction?.reason || "both players have enough tools to make it uncomfortable";

  return [
    { type: "hot_take", text: `${player1} vs ${player2} feels way more dangerous than the pre-match noise suggests. One momentum swing and this gets messy fast. Am I overthinking it?` },
    { type: "stat_angle", text: `The ${surface} angle matters here. If the first-serve numbers dip even a little, this match can flip quickly. Which player handles pressure better today?` },
    { type: "live_match_reaction", text: `This has that tense tennis energy where every loose service game suddenly feels huge. Whoever protects momentum better probably controls the whole story.` },
    { type: "debate_question", text: `${player1} or ${player2}: who is actually more underrated in this matchup? I can see the case both ways, especially if the rallies get longer.` },
    { type: "soft_prediction", text: `Soft lean: ${lean}. Not because it is obvious, but because ${reason}. This looks like one of those matches where patience matters more than highlight shots.` },
  ];
}

export async function generateAndSelectPost({ env, matchData }) {
  let source = "openai";
  let generationError = null;
  let variants;

  try {
    variants = await generatePostVariants({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      matchData,
    });
  } catch (error) {
    source = "fallback";
    generationError = error.message;
    variants = fallbackVariants(matchData);
  }

  const normalizedVariants = variants.map(validateVariant).filter(Boolean);
  if (!normalizedVariants.length) throw new Error("No valid post variants were generated.");

  const { selected, scored } = selectBestPost(normalizedVariants);
  return { source, variants: scored, selected, generationError };
}
