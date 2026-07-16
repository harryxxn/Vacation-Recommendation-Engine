const { destinations } = require("./destinations");

const knowledgeBase = [
  {
    id: "guide-lisbon-september",
    destinationId: "lisbon",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/lisbon-september",
    freshnessDate: "2026-06-12",
    trustTier: "curated",
    text:
      "Lisbon is a strong September destination for food, coastal walks, viewpoints, tiled streets, and neighborhood exploration. Shoulder-season weather is usually warm, and restaurant and hotel demand is easier to manage than peak summer."
  },
  {
    id: "advisory-lisbon",
    destinationId: "lisbon",
    source: "Mock official advisory feed",
    sourceUrl: "https://example.com/advisories/portugal",
    freshnessDate: "2026-06-20",
    trustTier: "official-mock",
    text:
      "Portugal has a strong general safety profile for travelers. Pickpocketing can occur in crowded tourist areas and transit hubs, so itinerary suggestions should include basic city-safety reminders."
  },
  {
    id: "guide-barcelona-september",
    destinationId: "barcelona",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/barcelona-september",
    freshnessDate: "2026-06-10",
    trustTier: "curated",
    text:
      "Barcelona in September is good for architecture, food, beach time, and nightlife. It can be busy and slightly above mid-range budgets, so travelers should book timed-entry cultural sites and tune the itinerary pace."
  },
  {
    id: "advisory-barcelona",
    destinationId: "barcelona",
    source: "Mock official advisory feed",
    sourceUrl: "https://example.com/advisories/spain",
    freshnessDate: "2026-06-18",
    trustTier: "official-mock",
    text:
      "Barcelona has excellent tourism infrastructure, but petty theft risk is higher around major attractions and public transit. Recommendations should avoid overstating safety confidence."
  },
  {
    id: "guide-kyoto-spring-fall",
    destinationId: "kyoto",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/kyoto-seasons",
    freshnessDate: "2026-05-29",
    trustTier: "curated",
    text:
      "Kyoto fits culture, food, temples, gardens, and romantic walking routes. Spring and fall are strongest, while September can still be warm and humid with occasional storm disruption."
  },
  {
    id: "guide-costa-rica-dry-season",
    destinationId: "costa-rica",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/costa-rica-dry-season",
    freshnessDate: "2026-06-03",
    trustTier: "curated",
    text:
      "Costa Rica works well for nature, wildlife, beach, wellness, and family adventure. Dry-season months are easier for road travel, while green-season planning should allow weather buffers."
  },
  {
    id: "guide-bali-wellness",
    destinationId: "bali",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/bali-wellness",
    freshnessDate: "2026-06-01",
    trustTier: "curated",
    text:
      "Bali is a strong fit for wellness, beaches, rice terraces, food, and relaxed trips. Popular areas can be crowded, and travel times between regions should be modeled conservatively."
  },
  {
    id: "guide-banff-adventure",
    destinationId: "banff",
    source: "AtlasMind destination guide",
    sourceUrl: "https://example.com/travel-guides/banff-adventure",
    freshnessDate: "2026-05-22",
    trustTier: "curated",
    text:
      "Banff is best for alpine scenery, hiking, photography, lakes, and outdoor adventure. Summer and winter are strongest, but lodging cost can exceed moderate daily budgets."
  },
  {
    id: "mlops-policy",
    destinationId: "global",
    source: "AtlasMind responsible recommendation policy",
    sourceUrl: "https://example.com/policies/recommendation-quality",
    freshnessDate: "2026-06-25",
    trustTier: "internal-policy",
    text:
      "Travel recommendations should show source freshness, uncertainty, safety caveats, and avoid making definitive claims about visa, medical, legal, or security conditions without official source links."
  }
];

const vocabulary = [
  "food",
  "culture",
  "nature",
  "beach",
  "safety",
  "budget",
  "september",
  "warm",
  "adventure",
  "wellness",
  "family",
  "nightlife",
  "architecture",
  "history",
  "weather",
  "popular",
  "quiet",
  "romantic",
  "walking",
  "visa"
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function embed(text) {
  const tokens = tokenize(text);
  return vocabulary.map((term) => tokens.filter((token) => token.includes(term)).length);
}

function cosineSimilarity(left, right) {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }
  return dot / (leftMagnitude * rightMagnitude);
}

function preferenceQuery(preferences = {}, destination = {}) {
  const interests = Array.isArray(preferences.interests) ? preferences.interests.join(" ") : "";
  return [
    destination.name,
    destination.country,
    destination.region,
    destination.climate,
    destination.tags?.join(" "),
    preferences.month,
    preferences.pace,
    preferences.travelerType,
    interests,
    `budget ${preferences.budget}`,
    `safety ${preferences.safetyPriority}`
  ].join(" ");
}

function retrieveContext(preferences = {}, destination = {}, limit = 3) {
  const queryEmbedding = embed(preferenceQuery(preferences, destination));
  return knowledgeBase
    .filter((document) => document.destinationId === destination.id || document.destinationId === "global")
    .map((document) => ({
      ...document,
      similarity: Number(cosineSimilarity(queryEmbedding, embed(document.text)).toFixed(3))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function buildGroundedExplanation(destination, preferences = {}, context = []) {
  const sourceList = context.map((document) => document.source).join("; ");
  const strongest = context[0];
  const caveat =
    destination.safety < 0.8
      ? "Use extra care with safety-sensitive itinerary choices and verify official advisories before booking."
      : "Still verify official advisories, entry rules, closures, and current prices before booking.";
  return {
    summary: `${destination.name} is recommended because it aligns with ${destination.matchedInterests.join(", ") || "several"} preferences, has a ${destination.confidence.toLowerCase()} model confidence score, and retrieved travel context supports the fit.`,
    groundedAnswer: strongest
      ? `${strongest.text} ${caveat}`
      : `${destination.name} has limited retrieved context in the mock knowledge base. ${caveat}`,
    citations: context.map((document) => ({
      id: document.id,
      source: document.source,
      sourceUrl: document.sourceUrl,
      freshnessDate: document.freshnessDate,
      trustTier: document.trustTier,
      similarity: document.similarity
    })),
    sourceSummary: sourceList || "No citations available",
    uncertainty:
      "This RAG response is grounded in mock documents. Production should use trusted, current sources and block unsupported claims."
  };
}

function enrichRecommendationsWithRag(recommendations, preferences = {}) {
  return recommendations.map((destination) => {
    const context = retrieveContext(preferences, destination, 3);
    return {
      ...destination,
      rag: buildGroundedExplanation(destination, preferences, context)
    };
  });
}

function queryKnowledgeBase(query, limit = 5) {
  const queryEmbedding = embed(query);
  return knowledgeBase
    .map((document) => ({
      ...document,
      similarity: Number(cosineSimilarity(queryEmbedding, embed(document.text)).toFixed(3))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function getKnowledgeStats() {
  const destinationsCovered = new Set(knowledgeBase.map((document) => document.destinationId)).size;
  return {
    documents: knowledgeBase.length,
    destinationsCovered,
    embeddingModel: "mock-bow-v1",
    vectorStore: "in-memory mock vector index",
    latestFreshnessDate: knowledgeBase
      .map((document) => document.freshnessDate)
      .sort()
      .at(-1)
  };
}

module.exports = {
  buildGroundedExplanation,
  enrichRecommendationsWithRag,
  getKnowledgeStats,
  knowledgeBase,
  queryKnowledgeBase,
  retrieveContext
};
