const ITINERARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "dailyPlan", "budgetNote", "practicalNotes"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    dailyPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "theme", "morning", "afternoon", "evening"],
        properties: {
          day: { type: "integer" }, theme: { type: "string" }, morning: { type: "string" },
          afternoon: { type: "string" }, evening: { type: "string" }
        }
      }
    },
    budgetNote: { type: "string" },
    practicalNotes: { type: "array", items: { type: "string" } }
  }
};

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  return (payload.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text || "")
    .join("");
}

async function generateItinerary(destination, preferences) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Itinerary generation is not configured. Set OPENAI_API_KEY for the app service.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      store: false,
      instructions: "You are a thoughtful travel planner. Create a practical, flexible itinerary using only the supplied catalog facts. Do not invent opening hours, reservations, prices, safety guarantees, visas, or current events. Keep activities geographically coherent where possible. State uncertainty in practical notes.",
      input: `Destination catalog entry:\n${JSON.stringify(destination)}\n\nTraveler preferences:\n${JSON.stringify(preferences)}\n\nCreate exactly one day per requested day.`,
      text: { format: { type: "json_schema", name: "travel_itinerary", strict: true, schema: ITINERARY_SCHEMA } }
    })
  });

  if (!response.ok) {
    const error = new Error("OpenAI could not generate an itinerary right now. Please try again.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 502 : 503;
    throw error;
  }
  const payload = await response.json();
  try {
    const itinerary = JSON.parse(extractOutputText(payload));
    if (!Array.isArray(itinerary.dailyPlan) || itinerary.dailyPlan.length !== Number(preferences.days)) throw new Error();
    return { itinerary, model: payload.model || process.env.OPENAI_MODEL || "gpt-4.1-mini" };
  } catch {
    const error = new Error("OpenAI returned an unusable itinerary. Please try again.");
    error.statusCode = 502;
    throw error;
  }
}

module.exports = { extractOutputText, generateItinerary };
