const http = require("http");
const fs = require("fs");
const path = require("path");
const { destinations } = require("./destinations");
const { DEFAULT_PREFERENCES, recommend } = require("./recommender");
const { initializeDatabase, listTrips, saveTrip } = require("./db");
const { generateItinerary } = require("./itinerary");
const {
  enrichRecommendationsWithRag,
  getKnowledgeStats,
  initializeKnowledgeBase,
  queryKnowledgeBase
} = require("./rag");
const { metricsResponse, recordRequest } = require("./metrics");
const {
  evaluateOperationalHealth,
  getActiveModel,
  getModelRegistry,
  recordFeedback,
  simulateRetrainingRun,
  summarizeFeedback
} = require("./mlops");

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveStatic(request, response) {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const extension = path.extname(filePath);
    const shouldSkipCache = [".html", ".js", ".css"].includes(extension);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": shouldSkipCache ? "no-store" : "public, max-age=3600"
    });
    response.end(content);
  });
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/metrics") {
    await metricsResponse(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "travel-ai-recommender",
      architecture: "frontend -> backend api -> recommendation service -> rag service -> mlops"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/destinations") {
    sendJson(response, 200, { destinations });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/defaults") {
    sendJson(response, 200, { preferences: DEFAULT_PREFERENCES });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/recommendations") {
    try {
      const preferences = await readJsonBody(request);
      const limit = Number(url.searchParams.get("limit")) || 5;
      const baseRecommendations = recommend(preferences, limit);
      const recommendations = await enrichRecommendationsWithRag(baseRecommendations, preferences);
      sendJson(response, 200, {
        preferences,
        recommendations,
        model: {
          ...getActiveModel(),
          caution:
            "Scores blend heuristic ranking with mock RAG context. Validate with user feedback, source freshness checks, and responsible ML evaluation before production use."
        },
        rag: getKnowledgeStats(),
        mlops: await evaluateOperationalHealth(),
        architecture: {
          frontend: "Vanilla HTML/CSS/JS",
          backendApi: "Node HTTP API",
          recommendationService: "Hybrid weighted ranker with active model metadata",
          ragService: "Mock in-memory vector retrieval plus grounded explanation synthesis",
          mlops: "Feedback logging, model registry, monitoring, drift checks, retraining simulation"
        }
      });
    } catch (error) {
      sendJson(response, error.statusCode || 503, { error: error.message || "Semantic retrieval is temporarily unavailable" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rag/query") {
    try {
      const body = await readJsonBody(request);
      const limit = Number(url.searchParams.get("limit")) || 5;
      sendJson(response, 200, {
        query: body.query || "",
        results: await queryKnowledgeBase(body.query || "", limit),
        stats: getKnowledgeStats()
      });
    } catch (error) {
      sendJson(response, error.statusCode || 503, { error: error.message || "Semantic retrieval is temporarily unavailable" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/model-registry") {
    sendJson(response, 200, {
      activeModel: getActiveModel(),
      models: getModelRegistry()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/mlops/dashboard") {
    sendJson(response, 200, {
      health: await evaluateOperationalHealth(),
      feedback: await summarizeFeedback(),
      registry: getModelRegistry()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/mlops/retrain") {
    sendJson(response, 200, await simulateRetrainingRun());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/trips") {
    sendJson(response, 200, { trips: await listTrips(url.searchParams.get("limit")) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/itineraries") {
    try {
      const body = await readJsonBody(request);
      const destination = destinations.find((item) => item.id === body.destinationId);
      if (!destination) {
        sendJson(response, 400, { error: "Choose a destination from the recommendation list." });
        return;
      }
      const preferences = { ...DEFAULT_PREFERENCES, ...(body.preferences || {}) };
      preferences.days = Math.min(Math.max(Number(preferences.days) || DEFAULT_PREFERENCES.days, 1), 14);
      const generated = await generateItinerary(destination, preferences);
      const trip = await saveTrip({ destination, preferences, ...generated });
      sendJson(response, 201, { trip });
    } catch (error) {
      sendJson(response, error.statusCode || 400, { error: error.message || "Could not create itinerary" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        event: await recordFeedback(body),
        feedback: await summarizeFeedback(),
        health: await evaluateOperationalHealth()
      });
    } catch (error) {
      sendJson(response, error.statusCode || 400, {
        error: error.statusCode ? error.message : "Invalid JSON request body"
      });
    }
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

const server = http.createServer((request, response) => {
  const startedAt = process.hrtime.bigint();
  route(request, response)
    .catch((error) => {
      console.error(error);
      sendJson(response, 500, { error: "Unexpected server error" });
    })
    .finally(() => recordRequest(request.method, new URL(request.url, `http://${request.headers.host}`).pathname, response.statusCode || 500, Number(process.hrtime.bigint() - startedAt) / 1e9));
});

if (require.main === module) {
  initializeDatabase()
    .then(async () => {
      try {
        await initializeKnowledgeBase();
      } catch (error) {
        console.error("Semantic retrieval unavailable at startup:", error.message);
      }
      server.listen(PORT, () => console.log(`Travel AI Recommender running at http://localhost:${PORT}`));
    })
    .catch((error) => {
      console.error("Could not initialize PostgreSQL:", error.message);
      process.exit(1);
    });
}

module.exports = { server };
