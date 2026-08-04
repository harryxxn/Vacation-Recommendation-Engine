const { destinations } = require("./destinations");

const DAY_THEMES = [
  "Arrival & orientation",
  "Local highlights",
  "A slower local day",
  "Signature experience",
  "Flexible favorites",
  "Departure & reflection"
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function buildItinerary({ destinationId, days, pace = "balanced", interests = [], budget } = {}) {
  const destination = destinations.find((item) => item.id === destinationId);
  if (!destination) {
    const error = new Error("Unknown destination");
    error.statusCode = 404;
    throw error;
  }

  const tripDays = clamp(Number(days) || destination.idealDays, 2, 21);
  const tags = [...new Set([...(Array.isArray(interests) ? interests : []), ...destination.tags].filter(Boolean))];
  const dailyBudget = Number(budget) || destination.averageDailyCost;
  const activitiesPerDay = pace === "active" ? 3 : pace === "relaxed" ? 1 : 2;

  const itineraryDays = Array.from({ length: tripDays }, (_, index) => {
    const day = index + 1;
    const activities = Array.from({ length: activitiesPerDay }, (_, activityIndex) => {
      const tag = tags[(index * activitiesPerDay + activityIndex) % tags.length];
      return {
        time: activityIndex === 0 ? "Morning" : activityIndex === activitiesPerDay - 1 ? "Evening" : "Afternoon",
        title: `${pace === "relaxed" ? "Enjoy" : "Explore"} ${destination.name}'s ${tag} scene`,
        category: tag
      };
    });
    return {
      day,
      title: DAY_THEMES[index % DAY_THEMES.length],
      area: day % 2 ? "central neighborhoods" : "a nearby district or day-trip area",
      activities,
      estimatedSpend: Math.round(dailyBudget * (day === 1 || day === tripDays ? 0.8 : 1))
    };
  });

  return {
    id: `trip_${destination.id}_${Date.now()}`,
    destination: { id: destination.id, name: destination.name, country: destination.country },
    days: tripDays,
    pace,
    estimatedDailyBudget: dailyBudget,
    estimatedTripSpend: itineraryDays.reduce((total, day) => total + day.estimatedSpend, 0),
    generatedAt: new Date().toISOString(),
    planningNotes: [
      "Treat this as a flexible starting point; confirm opening hours, transit times, prices, and reservations before booking.",
      `Build in weather and rest buffers for a ${pace} itinerary.`
    ],
    itineraryDays
  };
}

module.exports = { buildItinerary };
