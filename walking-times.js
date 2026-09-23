(() => {
  // Saved OSRM/FOSSGIS foot-routing table, queried 2026-09-23. No runtime request
  // or personal agenda is sent to the service. Coordinates match app.js venues.
  // https://routing.openstreetmap.de/routed-foot/table/v1/foot/1.82392,41.2367;1.82436,41.23664;1.81062,41.23794;1.81581,41.2371;1.81166,41.23522?annotations=duration,distance
  const venueIds = ["auditori", "tramuntana", "prado", "escorxador", "mercat"];
  const seconds = [
    [0, 193.9, 995.8, 612.2, 1001.6],
    [193.9, 0, 1162.6, 769.8, 1083.4],
    [995.8, 1162.6, 0, 481.8, 347.8],
    [612.2, 769.8, 481.8, 0, 417.5],
    [1001.6, 1083.4, 347.8, 417.5, 0],
  ];
  const meters = [
    [0, 242.4, 1244.4, 764.8, 1252.2],
    [242.4, 0, 1453.4, 962, 1354.7],
    [1244.4, 1453.4, 0, 602.1, 434.7],
    [764.8, 962, 602.1, 0, 521.8],
    [1252.2, 1354.7, 434.7, 521.8, 0],
  ];
  const estimate = (fromId, toId) => {
    // Llevant is on floor −1 of the same hotel. Use the hotel entrance route
    // plus an explicit five-minute indoor allowance, not a claimed measured route.
    if (fromId === "llevant" || toId === "llevant") {
      if (fromId === toId) return { minutes: 0, distanceMeters: 0, withinMelia: false };
      const other = fromId === "llevant" ? toId : fromId;
      if (["auditori", "tramuntana"].includes(other)) return { minutes: 5, distanceMeters: null, withinMelia: true };
      const route = estimate("auditori", other);
      return route ? { ...route, minutes: route.minutes + 5, hotelAllowance: true } : null;
    }
    const from = venueIds.indexOf(fromId), to = venueIds.indexOf(toId);
    if (from < 0 || to < 0) return null;
    const withinMelia = from !== to && from < 2 && to < 2;
    // Indoor circulation is not mapped: reserve five minutes for a room change
    // within the hotel, explicitly labelled as a planning estimate in the UI.
    return {
      minutes: withinMelia ? 5 : Math.ceil(seconds[from][to] / 60),
      distanceMeters: withinMelia ? null : meters[from][to],
      withinMelia,
    };
  };
  const transfer = (fromId, toId, previousEnd, nextStart) => {
    const walk = estimate(fromId, toId);
    const gapMinutes = Math.floor((Date.parse(nextStart) - Date.parse(previousEnd)) / 60000);
    if (!walk || !Number.isFinite(gapMinutes)) return null;
    const marginMinutes = gapMinutes - walk.minutes;
    return { ...walk, gapMinutes, marginMinutes, status: marginMinutes < 0 ? "conflict" : marginMinutes === 0 ? "tight" : "ok" };
  };
  const api = { estimate, transfer };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.SitgesWalking = api;
})();
