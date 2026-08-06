const { Document } = require("@langchain/core/documents");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { QdrantVectorStore } = require("@langchain/qdrant");

const knowledgeBase = [
  { id: "guide-lisbon-september", destinationId: "lisbon", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/lisbon-september", freshnessDate: "2026-06-12", trustTier: "curated", text: "Lisbon is a strong September destination for food, coastal walks, viewpoints, tiled streets, and neighborhood exploration. Shoulder-season weather is usually warm, and restaurant and hotel demand is easier to manage than peak summer." },
  { id: "advisory-lisbon", destinationId: "lisbon", source: "Mock official advisory feed", sourceUrl: "https://example.com/advisories/portugal", freshnessDate: "2026-06-20", trustTier: "official-mock", text: "Portugal has a strong general safety profile for travelers. Pickpocketing can occur in crowded tourist areas and transit hubs, so itinerary suggestions should include basic city-safety reminders." },
  { id: "guide-barcelona-september", destinationId: "barcelona", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/barcelona-september", freshnessDate: "2026-06-10", trustTier: "curated", text: "Barcelona in September is good for architecture, food, beach time, and nightlife. It can be busy and slightly above mid-range budgets, so travelers should book timed-entry cultural sites and tune the itinerary pace." },
  { id: "advisory-barcelona", destinationId: "barcelona", source: "Mock official advisory feed", sourceUrl: "https://example.com/advisories/spain", freshnessDate: "2026-06-18", trustTier: "official-mock", text: "Barcelona has excellent tourism infrastructure, but petty theft risk is higher around major attractions and public transit. Recommendations should avoid overstating safety confidence." },
  { id: "guide-kyoto-spring-fall", destinationId: "kyoto", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/kyoto-seasons", freshnessDate: "2026-05-29", trustTier: "curated", text: "Kyoto fits culture, food, temples, gardens, and romantic walking routes. Spring and fall are strongest, while September can still be warm and humid with occasional storm disruption." },
  { id: "guide-costa-rica-dry-season", destinationId: "costa-rica", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/costa-rica-dry-season", freshnessDate: "2026-06-03", trustTier: "curated", text: "Costa Rica works well for nature, wildlife, beach, wellness, and family adventure. Dry-season months are easier for road travel, while green-season planning should allow weather buffers." },
  { id: "guide-bali-wellness", destinationId: "bali", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/bali-wellness", freshnessDate: "2026-06-01", trustTier: "curated", text: "Bali is a strong fit for wellness, beaches, rice terraces, food, and relaxed trips. Popular areas can be crowded, and travel times between regions should be modeled conservatively." },
  { id: "guide-banff-adventure", destinationId: "banff", source: "AtlasMind destination guide", sourceUrl: "https://example.com/travel-guides/banff-adventure", freshnessDate: "2026-05-22", trustTier: "curated", text: "Banff is best for alpine scenery, hiking, photography, lakes, and outdoor adventure. Summer and winter are strongest, but lodging cost can exceed moderate daily budgets." },
  { id: "mlops-policy", destinationId: "global", source: "AtlasMind responsible recommendation policy", sourceUrl: "https://example.com/policies/recommendation-quality", freshnessDate: "2026-06-25", trustTier: "internal-policy", text: "Travel recommendations should show source freshness, uncertainty, safety caveats, and avoid making definitive claims about visa, medical, legal, or security conditions without official source links." }
];

let vectorStore;
let initializationError;

function preferenceQuery(preferences = {}, destination = {}) {
  const interests = Array.isArray(preferences.interests) ? preferences.interests.join(" ") : "";
  return [destination.name, destination.country, destination.region, destination.climate, destination.tags?.join(" "), preferences.month, preferences.pace, preferences.travelerType, interests, `budget ${preferences.budget}`, `safety ${preferences.safetyPriority}`].join(" ");
}

function documents() {
  return knowledgeBase.map(({ text, ...metadata }) => new Document({ pageContent: text, metadata }));
}

async function initializeKnowledgeBase() {
  if (vectorStore) return vectorStore;
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for semantic retrieval.");
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
    });
    const candidate = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: process.env.QDRANT_URL || "http://localhost:6333",
      collectionName: process.env.QDRANT_COLLECTION || "travel_knowledge"
    });
    const count = await candidate.client.count(candidate.collectionName, { exact: true });
    if (!count.count) await candidate.addDocuments(documents());
    vectorStore = candidate;
    initializationError = undefined;
    return vectorStore;
  } catch (error) {
    initializationError = error;
    throw error;
  }
}

async function retrieveContext(preferences = {}, destination = {}, limit = 3) {
  const store = await initializeKnowledgeBase();
  const filter = { should: [
    { key: "metadata.destinationId", match: { value: destination.id } },
    { key: "metadata.destinationId", match: { value: "global" } }
  ] };
  const matches = await store.similaritySearchWithScore(preferenceQuery(preferences, destination), limit, filter);
  return matches.map(([document, score]) => ({ ...document.metadata, text: document.pageContent, similarity: Number(score.toFixed(3)) }));
}

function buildGroundedExplanation(destination, preferences = {}, context = []) {
  const strongest = context[0];
  const caveat = destination.safety < 0.8
    ? "Use extra care with safety-sensitive itinerary choices and verify official advisories before booking."
    : "Still verify official advisories, entry rules, closures, and current prices before booking.";
  return {
    summary: `${destination.name} is recommended because it aligns with ${destination.matchedInterests.join(", ") || "several"} preferences, has a ${destination.confidence.toLowerCase()} model confidence score, and retrieved travel context supports the fit.`,
    groundedAnswer: strongest ? `${strongest.text} ${caveat}` : `${destination.name} has limited retrieved context. ${caveat}`,
    citations: context.map(({ id, source, sourceUrl, freshnessDate, trustTier, similarity }) => ({ id, source, sourceUrl, freshnessDate, trustTier, similarity })),
    sourceSummary: context.map((document) => document.source).join("; ") || "No citations available",
    uncertainty: "This response is retrieved from a local Qdrant collection. Verify travel details against current, trusted sources before booking."
  };
}

async function enrichRecommendationsWithRag(recommendations, preferences = {}) {
  return Promise.all(recommendations.map(async (destination) => ({
    ...destination,
    rag: buildGroundedExplanation(destination, preferences, await retrieveContext(preferences, destination, 3))
  })));
}

async function queryKnowledgeBase(query, limit = 5) {
  const store = await initializeKnowledgeBase();
  const matches = await store.similaritySearchWithScore(query, Math.min(Math.max(Number(limit) || 5, 1), 10));
  return matches.map(([document, score]) => ({ ...document.metadata, text: document.pageContent, similarity: Number(score.toFixed(3)) }));
}

function getKnowledgeStats() {
  return {
    documents: knowledgeBase.length,
    destinationsCovered: new Set(knowledgeBase.map((document) => document.destinationId)).size,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    vectorStore: "Qdrant via LangChain",
    status: vectorStore ? "ready" : initializationError ? "unavailable" : "initializing",
    latestFreshnessDate: knowledgeBase.map((document) => document.freshnessDate).sort().at(-1)
  };
}

module.exports = { buildGroundedExplanation, enrichRecommendationsWithRag, getKnowledgeStats, initializeKnowledgeBase, knowledgeBase, queryKnowledgeBase, retrieveContext };
