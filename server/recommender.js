const { destinations } = require("./destinations");

const DEFAULT_PREFERENCES = {
  budget: 180,
  days: 6,
  month: "Sep",
  pace: "balanced",
  travelerType: "couple",
  interests: ["food", "culture", "nature"],
  climate: "any",
  safetyPriority: 60,
  popularityPreference: 50
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizePreferences(raw = {}) {
  const preferences = { ...DEFAULT_PREFERENCES, ...raw };
  preferences.budget = Number(preferences.budget) || DEFAULT_PREFERENCES.budget;
  preferences.days = Number(preferences.days) || DEFAULT_PREFERENCES.days;
  preferences.safetyPriority = Number(preferences.safetyPriority) || DEFAULT_PREFERENCES.safetyPriority;
  preferences.popularityPreference =
    Number(preferences.popularityPreference) || DEFAULT_PREFERENCES.popularityPreference;
  preferences.interests = Array.isArray(preferences.interests)
    ? preferences.interests.filter(Boolean)
    : String(preferences.interests || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return preferences;
}

function scoreDestination(destination, rawPreferences = {}) {
  const preferences = normalizePreferences(rawPreferences);
  const interestMatches = preferences.interests.filter((interest) => destination.tags.includes(interest));
  const interestScore = preferences.interests.length
    ? interestMatches.length / preferences.interests.length
    : 0.5;
  const budgetScore = clamp(1 - Math.max(0, destination.averageDailyCost - preferences.budget) / preferences.budget);
  const durationScore = clamp(1 - Math.abs(destination.idealDays - preferences.days) / 10);
  const monthScore = destination.bestMonths.includes(preferences.month) ? 1 : 0.42;
  const paceScore = destination.pace === preferences.pace ? 1 : destination.pace === "balanced" ? 0.72 : 0.46;
  const travelerScore = destination.travelerTypes.includes(preferences.travelerType) ? 1 : 0.58;
  const climateScore =
    preferences.climate === "any" || destination.climate === preferences.climate ? 1 : 0.5;
  const safetyWeight = clamp(preferences.safetyPriority / 100);
  const popularityTarget = clamp(preferences.popularityPreference / 100);
  const popularityScore = 1 - Math.abs(destination.popularity - popularityTarget);

  const weighted =
    interestScore * 0.24 +
    budgetScore * 0.15 +
    durationScore * 0.11 +
    monthScore * 0.13 +
    paceScore * 0.1 +
    travelerScore * 0.08 +
    climateScore * 0.07 +
    destination.safety * 0.08 * safetyWeight +
    popularityScore * 0.04;

  const score = Math.round(clamp(weighted, 0, 1) * 100);
  const reasons = [
    interestMatches.length
      ? `Matches ${interestMatches.join(", ")} interests`
      : "Has fewer direct interest matches",
    destination.bestMonths.includes(preferences.month)
      ? `${preferences.month} is a strong month to visit`
      : `${preferences.month} is possible, but not peak season`,
    destination.averageDailyCost <= preferences.budget
      ? `Fits the $${preferences.budget}/day budget`
      : `Runs above the $${preferences.budget}/day budget`,
    destination.pace === preferences.pace
      ? `Good fit for a ${preferences.pace} pace`
      : `Pace is ${destination.pace}, which may need itinerary tuning`
  ];

  return {
    ...destination,
    score,
    confidence: score >= 84 ? "High" : score >= 70 ? "Medium" : "Exploratory",
    reasons,
    matchedInterests: interestMatches
  };
}

function recommend(rawPreferences = {}, limit = 5) {
  return destinations
    .map((destination) => scoreDestination(destination, rawPreferences))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  recommend,
  scoreDestination
};
