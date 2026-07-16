const test = require("node:test");
const assert = require("node:assert/strict");
const { recommend, scoreDestination } = require("../server/recommender");
const { destinations } = require("../server/destinations");
const { enrichRecommendationsWithRag, queryKnowledgeBase } = require("../server/rag");
const { evaluateOperationalHealth, simulateRetrainingRun } = require("../server/mlops");

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

test("enriches recommendations with RAG citations", () => {
  const preferences = {
    interests: ["food", "culture", "beach"],
    month: "Sep",
    budget: 180,
    pace: "balanced"
  };
  const recommendations = recommend(preferences, 2);
  const enriched = enrichRecommendationsWithRag(recommendations, preferences);

  assert.ok(enriched[0].rag.groundedAnswer.length > 50);
  assert.ok(enriched[0].rag.citations.length > 0);
  assert.ok(enriched[0].rag.citations[0].freshnessDate);
});

test("queries mock vector knowledge base", () => {
  const results = queryKnowledgeBase("September food beach safety", 3);

  assert.equal(results.length, 3);
  assert.ok(results[0].similarity >= results[1].similarity);
});

test("reports MLOps health and retraining simulation", () => {
  const health = evaluateOperationalHealth();
  const run = simulateRetrainingRun();

  assert.match(health.status, /healthy|watch/);
  assert.equal(run.status, "completed");
  assert.ok(run.candidateModel.metrics.ndcgAt5 >= 0.71);
});
