const client = require("prom-client");

client.collectDefaultMetrics({ prefix: "atlasmind_" });

const httpRequests = new client.Counter({ name: "atlasmind_http_requests_total", help: "Total HTTP requests", labelNames: ["method", "route", "status"] });
const httpDuration = new client.Histogram({ name: "atlasmind_http_request_duration_seconds", help: "HTTP request duration in seconds", labelNames: ["method", "route", "status"], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] });

function recordRequest(method, route, status, durationSeconds) {
  const labels = { method, route, status: String(status) };
  httpRequests.inc(labels);
  httpDuration.observe(labels, durationSeconds);
}

async function metricsResponse(response) {
  response.writeHead(200, { "Content-Type": client.register.contentType, "Cache-Control": "no-store" });
  response.end(await client.register.metrics());
}

module.exports = { metricsResponse, recordRequest };
