const test = require("node:test");
const assert = require("node:assert/strict");
const { buildItinerary } = require("../server/itineraries");

test("builds a paced itinerary with a bounded duration", () => {
  const itinerary = buildItinerary({
    destinationId: "lisbon",
    days: 4,
    pace: "balanced",
    interests: ["food", "culture"],
    budget: 150
  });

  assert.equal(itinerary.itineraryDays.length, 4);
  assert.equal(itinerary.destination.name, "Lisbon");
  assert.ok(itinerary.estimatedTripSpend > 0);
  assert.equal(itinerary.itineraryDays[0].activities.length, 2);
});

test("rejects an unknown destination", () => {
  assert.throws(() => buildItinerary({ destinationId: "nowhere" }), { message: "Unknown destination" });
});
