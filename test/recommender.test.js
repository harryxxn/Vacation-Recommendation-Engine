const test = require("node:test");
const assert = require("node:assert/strict");
const { recommend, scoreDestination } = require("../server/recommender");
const { destinations } = require("../server/destinations");
const { buildGroundedExplanation } = require("../server/rag");
const { extractOutputText } = require("../server/itinerary");

test("returns recommendations sorted by score", () => {
  const results = recommend({
    budget: 180,
    days: 6,
    month: "Sep",
    pace: "balanced",
    travelerType: "couple",
    interests: ["food", "culture", "beach"],
    climate: "warm",
    safetyPriority: 60,
    popularityPreference: 70
  });

  assert.equal(results.length, 5);
  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index - 1].score >= results[index].score);
  }
});

test("adds explanation reasons and confidence", () => {
  const kyoto = destinations.find((destination) => destination.id === "kyoto");
  const scored = scoreDestination(kyoto, {
    interests: ["culture", "food"],
    month: "Apr",
    budget: 200,
    pace: "balanced"
  });

  assert.ok(scored.score > 70);
  assert.ok(scored.reasons.length >= 4);
  assert.match(scored.confidence, /High|Medium|Exploratory/);
});

test("formats retrieved RAG context as cited explanation", () => {
  const destination = { name: "Lisbon", matchedInterests: ["food"], confidence: "High", safety: 0.86 };
  const rag = buildGroundedExplanation(destination, {}, [{
    id: "guide-lisbon", source: "Guide", sourceUrl: "https://example.com", freshnessDate: "2026-06-01",
    trustTier: "curated", similarity: 0.91, text: "Lisbon supports food-focused travel."
  }]);
  assert.match(rag.groundedAnswer, /Lisbon supports/);
  assert.equal(rag.citations[0].similarity, 0.91);
});

test("extracts text from a Responses API REST payload", () => {
  const text = extractOutputText({
    output: [{ type: "message", content: [{ type: "output_text", text: '{"title":"Trip"}' }] }]
  });
  assert.equal(text, '{"title":"Trip"}');
});
