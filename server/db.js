const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set to use PostgreSQL persistence.");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_trips (
      id BIGSERIAL PRIMARY KEY,
      destination_id TEXT NOT NULL,
      destination_name TEXT NOT NULL,
      preferences JSONB NOT NULL,
      itinerary JSONB NOT NULL,
      model TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS feedback_events (
      id BIGSERIAL PRIMARY KEY,
      trip_id BIGINT REFERENCES saved_trips(id) ON DELETE SET NULL,
      destination_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('click', 'save', 'hide', 'booked', 'thumbs_up', 'thumbs_down')),
      score NUMERIC,
      model_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS saved_trips_created_at_idx ON saved_trips (created_at DESC);
    CREATE INDEX IF NOT EXISTS feedback_events_created_at_idx ON feedback_events (created_at DESC);
  `);
}

async function saveTrip({ destination, preferences, itinerary, model }) {
  const result = await pool.query(
    `INSERT INTO saved_trips (destination_id, destination_name, preferences, itinerary, model)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, destination_id, destination_name, preferences, itinerary, model, created_at`,
    [destination.id, destination.name, preferences, itinerary, model]
  );
  return mapTrip(result.rows[0]);
}

async function listTrips(limit = 12) {
  const result = await pool.query(
    `SELECT id, destination_id, destination_name, preferences, itinerary, model, created_at
     FROM saved_trips ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 12, 1), 50)]
  );
  return result.rows.map(mapTrip);
}

async function saveFeedback(event) {
  const result = await pool.query(
    `INSERT INTO feedback_events (trip_id, destination_id, action, score, model_id, session_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, trip_id, destination_id, action, score, model_id, session_id, created_at`,
    [event.tripId || null, event.destinationId, event.action, event.score, event.modelId, event.sessionId]
  );
  return mapFeedback(result.rows[0]);
}

async function getFeedbackSummary() {
  const [counts, recent] = await Promise.all([
    pool.query(`SELECT action, COUNT(*)::int AS count FROM feedback_events GROUP BY action`),
    pool.query(`SELECT id, trip_id, destination_id, action, score, model_id, session_id, created_at
                FROM feedback_events ORDER BY created_at DESC LIMIT 8`)
  ]);
  const byAction = Object.fromEntries(counts.rows.map((row) => [row.action, row.count]));
  const totalEvents = Object.values(byAction).reduce((total, count) => total + count, 0);
  return { totalEvents, byAction, recentEvents: recent.rows.map(mapFeedback) };
}

function mapTrip(row) {
  return { id: Number(row.id), destinationId: row.destination_id, destinationName: row.destination_name,
    preferences: row.preferences, itinerary: row.itinerary, model: row.model, createdAt: row.created_at };
}

function mapFeedback(row) {
  return { id: Number(row.id), tripId: row.trip_id ? Number(row.trip_id) : null,
    destinationId: row.destination_id, action: row.action, score: row.score === null ? null : Number(row.score),
    modelId: row.model_id, sessionId: row.session_id, createdAt: row.created_at };
}

module.exports = { getFeedbackSummary, initializeDatabase, listTrips, pool, saveFeedback, saveTrip };
