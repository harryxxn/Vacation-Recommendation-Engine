# AtlasMind Travel AI

AtlasMind is a working full-stack travel recommendation prototype. It includes a
dependency-free Node backend, a browser frontend, an explainable recommender,
mock RAG, feedback capture, model registry metadata, MLOps monitoring, retraining
simulation, and tests.

## Run locally

```bash
npm start
```

Open `http://localhost:4173`.

Run tests:

```bash
npm test
```

## API

- `GET /api/health` returns service status.
- `GET /api/destinations` returns the local destination catalog.
- `GET /api/defaults` returns default traveler preferences.
- `POST /api/recommendations?limit=5` returns scored destination matches with
  RAG explanations, citations, model metadata, and MLOps health.
- `POST /api/rag/query?limit=5` searches the mock vector knowledge base.
- `POST /api/feedback` records click, save, hide, booked, thumbs-up, or
  thumbs-down events for future model training.
- `GET /api/model-registry` returns mock production and staging model records.
- `GET /api/mlops/dashboard` returns monitoring, drift, feedback, and registry
  status.
- `POST /api/mlops/retrain` simulates a retraining run and promotion gate.

Example request:

```json
{
  "budget": 180,
  "days": 6,
  "month": "Sep",
  "pace": "balanced",
  "travelerType": "couple",
  "interests": ["food", "culture", "nature"],
  "climate": "any",
  "safetyPriority": 60,
  "popularityPreference": 50
}
```

## Current limitations and caution points

- The production ranker is still heuristic. The model registry and retraining
  endpoints are mock MLOps scaffolding, not real model training infrastructure.
- The RAG layer uses an in-memory bag-of-words vector search over mock documents.
  Replace it with real embeddings, source ingestion, and a durable vector
  database before production.
- Destination cost, safety, popularity, and seasonality values are static demo
  data. They need freshness checks and trusted external data sources before
  users rely on them.
- Travel recommendations can create safety, accessibility, visa, health, and
  budget risks. Add clear source dates, confidence messaging, and links to
  official advisories when this moves beyond a prototype.
- The backend has simple JSON parsing and static serving only. Add auth,
  rate-limiting, request validation, logging, observability, and persistent
  storage for a deployed service.
- Personalization should avoid sensitive attributes unless there is a clear,
  consented, user-benefiting reason to collect them.

## Strong next improvements

- Replace the static catalog and mock RAG documents with scheduled ingestion from
  travel APIs, official advisory data, events, weather, and price feeds.
- Swap the in-memory vector index for pgvector, Qdrant, Pinecone, Weaviate, or
  another vector database.
- Train a learning-to-rank model once enough feedback exists, while preserving
  citation-backed explanations for each recommendation.
- Connect experiment tracking and registry records to MLflow or Weights & Biases.
- Add model evaluation CI, data validation, bias checks, canary deploys, and
  production observability.
- Add itinerary generation, map clustering, accessibility filters, visa checks,
  and carbon-aware routing.
- Add CI on GitHub Actions for tests, linting, dependency review, and deployment.

## Implemented architecture

```text
Frontend
  |
Backend API
  |
Recommendation Service
  |-- heuristic production ranker
  |-- mock trained-model registry metadata
  |-- RAG explanation service
  |
Data Layer
  |-- destination catalog
  |-- feedback event log
  |-- in-memory mock vector store
  |-- mock model registry
```
