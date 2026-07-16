const http = require("http");
const fs = require("fs");
const path = require("path");
const { destinations } = require("./destinations");
const { DEFAULT_PREFERENCES, recommend } = require("./recommender");
const {
  enrichRecommendationsWithRag,
  getKnowledgeStats,
  queryKnowledgeBase
} = require("./rag");
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
      const recommendations = enrichRecommendationsWithRag(baseRecommendations, preferences);
      sendJson(response, 200, {
        preferences,
        recommendations,
        model: {
          ...getActiveModel(),
          caution:
            "Scores blend heuristic ranking with mock RAG context. Validate with user feedback, source freshness checks, and responsible ML evaluation before production use."
        },
        rag: getKnowledgeStats(),
        mlops: evaluateOperationalHealth(),
        architecture: {
          frontend: "Vanilla HTML/CSS/JS",
          backendApi: "Node HTTP API",
          recommendationService: "Hybrid weighted ranker with active model metadata",
          ragService: "Mock in-memory vector retrieval plus grounded explanation synthesis",
          mlops: "Feedback logging, model registry, monitoring, drift checks, retraining simulation"
        }
      });
    } catch (error) {
      sendJson(response, 400, { error: "Invalid JSON request body" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rag/query") {
    try {
      const body = await readJsonBody(request);
      const limit = Number(url.searchParams.get("limit")) || 5;
      sendJson(response, 200, {
        query: body.query || "",
        results: queryKnowledgeBase(body.query || "", limit),
        stats: getKnowledgeStats()
      });
    } catch (error) {
      sendJson(response, 400, { error: "Invalid JSON request body" });
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
      health: evaluateOperationalHealth(),
      feedback: summarizeFeedback(),
      registry: getModelRegistry()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/mlops/retrain") {
    sendJson(response, 200, simulateRetrainingRun());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        event: recordFeedback(body),
        feedback: summarizeFeedback(),
        health: evaluateOperationalHealth()
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
  route(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, { error: "Unexpected server error" });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Travel AI Recommender running at http://localhost:${PORT}`);
  });
}

module.exports = { server };
