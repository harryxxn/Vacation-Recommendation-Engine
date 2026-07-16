const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const FEEDBACK_PATH = path.join(DATA_DIR, "feedback-events.json");

const modelRegistry = [
  {
    id: "ranker-baseline-v1",
    version: "1.0.0",
    stage: "production",
    type: "weighted hybrid ranker",
    createdAt: "2026-06-24T09:00:00.000Z",
    metrics: {
      ndcgAt5: 0.71,
      precisionAt5: 0.64,
      coverage: 0.88,
      explanationGrounding: 0.76
    },
    artifactUri: "mock://models/ranker-baseline-v1",
    notes: "Dependency-free baseline ranker with explicit feature weights."
  },
  {
    id: "rag-explainer-v1",
    version: "1.0.0",
    stage: "production",
    type: "retrieval augmented explanation",
    createdAt: "2026-06-24T09:10:00.000Z",
    metrics: {
      citationCoverage: 0.92,
      freshnessPassRate: 0.86,
      unsupportedClaimRate: 0.08
    },
    artifactUri: "mock://models/rag-explainer-v1",
    notes: "Mock embedding retrieval plus template-grounded explanation synthesis."
  },
  {
    id: "ranker-ltr-candidate-v2",
    version: "2.0.0-rc1",
    stage: "staging",
    type: "learning-to-rank candidate",
    createdAt: "2026-06-28T16:30:00.000Z",
    metrics: {
      ndcgAt5: 0.77,
      precisionAt5: 0.68,
      coverage: 0.84,
      explanationGrounding: 0.73
    },
    artifactUri: "mock://models/ranker-ltr-candidate-v2",
    notes: "Mock candidate representing a future trained ranking model."
  }
];

const baselineMetrics = {
  requestCount24h: 1840,
  clickThroughRate: 0.31,
  saveRate: 0.18,
  hideRate: 0.06,
  averageLatencyMs: 84,
  p95LatencyMs: 142,
  dataFreshnessHours: 22,
  driftScore: 0.12,
  ragCitationCoverage: 0.92,
  modelErrorRate: 0.004
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFeedbackEvents() {
  ensureDataDir();
  if (!fs.existsSync(FEEDBACK_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_PATH, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeFeedbackEvents(events) {
  ensureDataDir();
  fs.writeFileSync(FEEDBACK_PATH, `${JSON.stringify(events, null, 2)}\n`);
}

function recordFeedback(event = {}) {
  const acceptedActions = ["click", "save", "hide", "booked", "thumbs_up", "thumbs_down"];
  if (!acceptedActions.includes(event.action)) {
    const error = new Error("Unsupported feedback action");
    error.statusCode = 400;
    throw error;
  }
  const events = readFeedbackEvents();
  const storedEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    destinationId: event.destinationId,
    action: event.action,
    score: Number(event.score) || null,
    modelId: event.modelId || "ranker-baseline-v1",
    sessionId: event.sessionId || "anonymous-demo-session",
    createdAt: new Date().toISOString()
  };
  events.push(storedEvent);
  writeFeedbackEvents(events.slice(-500));
  return storedEvent;
}

function summarizeFeedback() {
  const events = readFeedbackEvents();
  const byAction = events.reduce((summary, event) => {
    summary[event.action] = (summary[event.action] || 0) + 1;
    return summary;
  }, {});
  const byDestination = events.reduce((summary, event) => {
    summary[event.destinationId] = (summary[event.destinationId] || 0) + 1;
    return summary;
  }, {});
  return {
    totalEvents: events.length,
    byAction,
    byDestination,
    recentEvents: events.slice(-8).reverse()
  };
}

function getActiveModel() {
  return modelRegistry.find((model) => model.stage === "production" && model.id.startsWith("ranker"));
}

function getModelRegistry() {
  return modelRegistry;
}

function evaluateOperationalHealth() {
  const feedback = summarizeFeedback();
  const negativeSignals = (feedback.byAction.hide || 0) + (feedback.byAction.thumbs_down || 0);
  const positiveSignals = (feedback.byAction.save || 0) + (feedback.byAction.thumbs_up || 0) + (feedback.byAction.booked || 0);
  const feedbackDrift = feedback.totalEvents ? negativeSignals / feedback.totalEvents : 0;
  const driftScore = Number(Math.min(1, baselineMetrics.driftScore + feedbackDrift * 0.35).toFixed(3));

  return {
    ...baselineMetrics,
    driftScore,
    feedbackEvents: feedback.totalEvents,
    positiveFeedbackSignals: positiveSignals,
    negativeFeedbackSignals: negativeSignals,
    status: driftScore > 0.35 ? "watch" : "healthy",
    alerts:
      driftScore > 0.35
        ? ["Preference drift is elevated. Review recent feedback and retrain candidate ranker."]
        : ["No active MLOps alerts."],
    monitors: [
      { name: "ranking_quality", status: "healthy", value: getActiveModel().metrics.ndcgAt5, threshold: 0.65 },
      { name: "rag_grounding", status: "healthy", value: baselineMetrics.ragCitationCoverage, threshold: 0.85 },
      { name: "data_freshness_hours", status: "healthy", value: baselineMetrics.dataFreshnessHours, threshold: 48 },
      { name: "drift_score", status: driftScore > 0.35 ? "watch" : "healthy", value: driftScore, threshold: 0.35 }
    ]
  };
}

function simulateRetrainingRun() {
  const feedback = summarizeFeedback();
  const active = getActiveModel();
  const lift = Math.min(0.06, feedback.totalEvents * 0.004);
  return {
    runId: `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    status: "completed",
    triggeredAt: new Date().toISOString(),
    trainingData: {
      feedbackEvents: feedback.totalEvents,
      destinationRows: 10,
      ragDocuments: 9
    },
    baselineModelId: active.id,
    candidateModel: {
      id: "ranker-ltr-candidate-v2",
      stage: "staging",
      metrics: {
        ndcgAt5: Number((active.metrics.ndcgAt5 + lift).toFixed(3)),
        precisionAt5: Number((active.metrics.precisionAt5 + lift * 0.7).toFixed(3)),
        coverage: 0.84,
        fairnessReview: "required-before-promotion"
      }
    },
    promotionGate:
      feedback.totalEvents >= 20
        ? "candidate-ready-for-human-review"
        : "blocked-insufficient-feedback-volume",
    nextSteps: [
      "Review offline metrics and destination coverage.",
      "Run bias and freshness checks before promotion.",
      "Deploy as shadow traffic before replacing production."
    ]
  };
}

module.exports = {
  evaluateOperationalHealth,
  getActiveModel,
  getModelRegistry,
  recordFeedback,
  simulateRetrainingRun,
  summarizeFeedback
};
