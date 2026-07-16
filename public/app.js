const form = document.querySelector("#preference-form");
const list = document.querySelector("#recommendations");
const safetyOutput = document.querySelector("#safety-output");
const popularityOutput = document.querySelector("#popularity-output");
const dashboard = document.querySelector("#mlops-dashboard");
const ragForm = document.querySelector("#rag-form");
const ragResults = document.querySelector("#rag-results");
const retrainButton = document.querySelector("#retrain-button");

let activeModelId = "ranker-baseline-v1";

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value);
}

function readPreferences() {
  return {
    interests: selectedValues(document.querySelector("#interests")),
    budget: Number(document.querySelector("#budget").value),
    days: Number(document.querySelector("#days").value),
    month: document.querySelector("#month").value,
    travelerType: document.querySelector("#travelerType").value,
    pace: document.querySelector("input[name='pace']:checked").value,
    climate: document.querySelector("#climate").value,
    safetyPriority: Number(document.querySelector("#safetyPriority").value),
    popularityPreference: Number(document.querySelector("#popularityPreference").value)
  };
}

function cardTemplate(destination) {
  const chips = destination.tags
    .slice(0, 6)
    .map((tag) => `<span class="chip">${tag}</span>`)
    .join("");
  const reasons = destination.reasons.map((reason) => `<li>${reason}</li>`).join("");
  const citations = destination.rag.citations
    .map(
      (citation) => `
        <li>
          <a href="${citation.sourceUrl}" target="_blank" rel="noreferrer">${citation.source}</a>
          <span>${citation.freshnessDate} | ${citation.trustTier} | sim ${citation.similarity}</span>
        </li>
      `
    )
    .join("");
  return `
    <article class="card">
      <div class="score" style="--score: ${destination.score}%"><span>${destination.score}</span></div>
      <div>
        <div class="card-header">
          <h3>${destination.name}, ${destination.country}</h3>
          <span class="meta">${destination.confidence} confidence</span>
        </div>
        <p class="meta">
          ${destination.region} | ${destination.climate} climate | ~$${destination.averageDailyCost}/day |
          ideal ${destination.idealDays} days
        </p>
        <div class="chips">${chips}</div>
        <ol class="reason-list">${reasons}</ol>
        <details class="rag-details" open>
          <summary>RAG explanation and citations</summary>
          <p>${destination.rag.groundedAnswer}</p>
          <ul class="citation-list">${citations}</ul>
          <p class="uncertainty">${destination.rag.uncertainty}</p>
        </details>
        <div class="feedback-actions" aria-label="Feedback actions for ${destination.name}">
          <button type="button" data-action="save" data-destination="${destination.id}" data-score="${destination.score}">Save</button>
          <button type="button" data-action="thumbs_up" data-destination="${destination.id}" data-score="${destination.score}">Useful</button>
          <button type="button" data-action="hide" data-destination="${destination.id}" data-score="${destination.score}">Hide</button>
        </div>
      </div>
    </article>
  `;
}

function dashboardTemplate(payload) {
  const health = payload.health;
  const monitors = health.monitors
    .map(
      (monitor) => `
        <div class="metric-row">
          <span>${monitor.name}</span>
          <strong>${monitor.value}</strong>
          <em>${monitor.status}</em>
        </div>
      `
    )
    .join("");
  return `
    <div class="ops-summary">
      <span class="status-pill ${health.status}">${health.status}</span>
      <span>${health.feedbackEvents} feedback events</span>
      <span>${health.averageLatencyMs}ms avg latency</span>
      <span>${Math.round(health.ragCitationCoverage * 100)}% citation coverage</span>
    </div>
    ${monitors}
    <p class="uncertainty">${health.alerts.join(" ")}</p>
  `;
}

async function loadMlopsDashboard() {
  const response = await fetch("/api/mlops/dashboard");
  const payload = await response.json();
  dashboard.innerHTML = dashboardTemplate(payload);
}

async function loadRecommendations() {
  list.innerHTML = `<div class="empty">Scoring destinations...</div>`;
  try {
    const response = await fetch("/api/recommendations?limit=5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readPreferences())
    });
    if (!response.ok) {
      throw new Error("Recommendation request failed");
    }
    const payload = await response.json();
    activeModelId = payload.model.id;
    list.innerHTML = payload.recommendations.map(cardTemplate).join("");
    dashboard.innerHTML = dashboardTemplate({ health: payload.mlops });
  } catch (error) {
    list.innerHTML = `<div class="error">Could not load recommendations. Confirm the backend is running and try again.</div>`;
  }
}

async function submitFeedback(button) {
  button.disabled = true;
  const payload = {
    destinationId: button.dataset.destination,
    action: button.dataset.action,
    score: Number(button.dataset.score),
    modelId: activeModelId
  };
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Feedback failed");
    }
    const result = await response.json();
    dashboard.innerHTML = dashboardTemplate({ health: result.health });
    button.textContent = "Logged";
  } catch (error) {
    button.textContent = "Retry";
    button.disabled = false;
  }
}

async function searchKnowledge(event) {
  event.preventDefault();
  ragResults.innerHTML = `<div class="empty">Retrieving context...</div>`;
  const response = await fetch("/api/rag/query?limit=4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: document.querySelector("#rag-query").value })
  });
  const payload = await response.json();
  ragResults.innerHTML = payload.results
    .map(
      (document) => `
        <article class="ops-item">
          <strong>${document.source}</strong>
          <span>${document.destinationId} | ${document.freshnessDate} | sim ${document.similarity}</span>
          <p>${document.text}</p>
        </article>
      `
    )
    .join("");
}

async function simulateRetraining() {
  retrainButton.disabled = true;
  retrainButton.textContent = "Running";
  const response = await fetch("/api/mlops/retrain", { method: "POST" });
  const payload = await response.json();
  dashboard.innerHTML = `
    <div class="ops-summary">
      <span class="status-pill healthy">${payload.status}</span>
      <span>${payload.runId}</span>
      <span>${payload.promotionGate}</span>
    </div>
    <div class="metric-row"><span>NDCG@5</span><strong>${payload.candidateModel.metrics.ndcgAt5}</strong><em>candidate</em></div>
    <div class="metric-row"><span>Precision@5</span><strong>${payload.candidateModel.metrics.precisionAt5}</strong><em>candidate</em></div>
    <p class="uncertainty">${payload.nextSteps.join(" ")}</p>
  `;
  retrainButton.disabled = false;
  retrainButton.textContent = "Retrain";
}

function bindRangeOutput(inputSelector, outputElement) {
  const input = document.querySelector(inputSelector);
  input.addEventListener("input", () => {
    outputElement.textContent = input.value;
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadRecommendations();
});

list.addEventListener("click", (event) => {
  if (event.target.matches("[data-action]")) {
    submitFeedback(event.target);
  }
});

ragForm.addEventListener("submit", searchKnowledge);
retrainButton.addEventListener("click", simulateRetraining);
bindRangeOutput("#safetyPriority", safetyOutput);
bindRangeOutput("#popularityPreference", popularityOutput);
loadMlopsDashboard();
loadRecommendations();
