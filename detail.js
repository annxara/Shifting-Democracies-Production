// Detect environment and choose the correct Socket.IO server URL.
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

// Live socket instance + connection status for UI feedback.
let socket;
let socketConnected = false;

// Main app state: all countries, filtered countries, current visible index, and icon assets.
let countryData = [];
let filteredCountries = [];
let countryIndex = 0;
let flowerImages = [];

// Current shared filter values (synced from gui.html through Socket.IO events).
const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

// Visual mapping for each democracy indicator row.
const indicatorConfig = [
  { key: "v2x_libdem", label: "Liberal Democracy", image: "pictures/forgetmenot_blue.png" },
  { key: "v2x_polyarchy", label: "Polyarchy", image: "pictures/forgetmenot_pink.png" },
  { key: "v2x_partipdem", label: "Participatory Democracy", image: "pictures/forgetmenot_green.png" },
  { key: "v2x_delibdem", label: "Deliberative Democracy", image: "pictures/forgetmenot_yellow.png" },
];

function preload() {
  // Load country data and indicator images before setup/draw runs.
  countryData = loadJSON("ess_vdem_country_year_variables 2.json");

  for (let i = 0; i < indicatorConfig.length; i++) {
    flowerImages.push(loadImage(indicatorConfig[i].image));
  }
}

// this function makes possible to use different reorganize the data without changing the rest of the code, as long as it can be transformed into an array of { country, years } objects.
function toCountryArray(rawData) {
  // Handle direct array format: [{ country, years }, ...]
  if (Array.isArray(rawData)) {
    return rawData;
  }

  // Handle wrapped format: { data: [...] }
  if (rawData && Array.isArray(rawData.data)) {
    return rawData.data;
  }

  // Handle object-map format: { "0": {...}, "1": {...} }
  if (rawData && typeof rawData === "object") {
    const values = Object.values(rawData);
    if (values.length > 0 && values.every((v) => v && typeof v === "object" && "country" in v && "years" in v)) {
      return values;
    }
  }

  // Unknown format -> safe fallback.
  return [];
}

function setup() {
  // Create drawing surface and ensure flower placement uses center anchors.
  createCanvas(980, 760);
  imageMode(CENTER);

  // Normalize JSON shape once at startup.
  countryData = toCountryArray(countryData);

  // Resize flower icons once to avoid resizing every frame.
  for (let i = 0; i < flowerImages.length; i++) {
    flowerImages[i].resize(42, 0);
  }

  // Build initial filtered list and start real-time syncing.
  applyFilterAndResetIndex();
  connectSocket();
}

function draw() {
  // Redraw full frame each tick.
  background("#101015");

  // State 1: data still unavailable.
  if (!countryData || countryData.length === 0) {
    drawLoadingState();
    return;
  }

  // State 2: no countries match selected filter values.
  if (filteredCountries.length === 0) {
    drawNoMatchState();
    return;
  }

  // State 3: render current country card.
  const country = filteredCountries[countryIndex];
  const latest = getLatestYearEntry(country.years);

  drawHeader(country, latest);
  drawIndicators(latest);
  drawFooter();
}

function drawHeader(country, latest) {
  // Country name + most recent year label.
  fill("#f7f7f7");
  noStroke();
  textAlign(LEFT, TOP);

  textSize(34);
  text(country.country, 40, 28);

  textSize(18);
  fill("#b8bcc8");
  text("Jahr: " + latest.year + " (neuester Wert)", 40, 74);
}

function drawIndicators(latest) {
  // Layout constants for indicator rows and flower icon positions.
  const startY = 150;
  const rowGap = 132;
  const flowerStartX = 390;
  const flowerGap = 52;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const y = startY + i * rowGap;

    // Convert 0..1 democracy value into 0..10 score and flower count.
    const rawValue = Number(latest[conf.key]);
    const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
    const score10 = score01 * 10;
    const flowerCount = Math.round(score10);

    fill("#e8eaf0");
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(20);
    text(conf.label, 40, y);

    textSize(16);
    fill("#a8adbb");
    text(conf.key + ": " + nf(score10, 1, 1) + " / 10", 40, y + 30);

    // Draw one flower per rounded score point.
    for (let n = 0; n < flowerCount; n++) {
      const x = flowerStartX + n * flowerGap;
      image(flowerImages[i], x, y + 8);
    }
  }
}

function drawFooter() {
  // Help text + live socket status indicator.
  fill("#8d93a3");
  noStroke();
  textAlign(LEFT, BOTTOM);
  textSize(15);
  text("<- / -> : Land wechseln", 40, height - 56);
  text("Skala: 0.0-1.0 wird auf 0-10 umgerechnet, dann gerundet", 40, height - 32);

  const statusText = socketConnected ? "Socket: verbunden" : "Socket: getrennt";
  fill(socketConnected ? "#7ee787" : "#ff7b72");
  textAlign(RIGHT, BOTTOM);
  text(statusText, width - 40, height - 32);
}

function drawLoadingState() {
  // Fallback UI while waiting for JSON preload.
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Daten werden geladen...", width / 2, height / 2);
}

function drawNoMatchState() {
  // Message shown when no country matches current parameter combination.
  fill(220);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Keine Laender entsprechen den aktuellen Parametern.", width / 2, height / 2 - 24);

  textSize(18);
  fill("#b8bcc8");
  text(
    "stfeco: " + params.stfeco + " | stflife: " + params.stflife + " | stfgov: " + params.stfgov,
    width / 2,
    height / 2 + 20,
  );
}

function getLatestYearEntry(years) {
  // Return safe defaults if year data is missing.
  if (!years || years.length === 0) {
    return {
      year: "n/a",
      v2x_libdem: 0,
      v2x_polyarchy: 0,
      v2x_partipdem: 0,
      v2x_delibdem: 0,
    };
  }

  // Find the entry with the largest year value.
  let latest = years[0];
  for (let i = 1; i < years.length; i++) {
    if (Number(years[i].year) > Number(latest.year)) {
      latest = years[i];
    }
  }
  return latest;
}

function findMatchingYear(country, activeParams) {
  // Guard against malformed country records.
  if (!country || !country.years) {
    return null;
  }

  // Exact matching for now; increase tolerance for fuzzy matching.
  const tolerance = 0;
  return (
    country.years.find((details) => {
      // Explicitly skip 2025 values.
      if (Number(details.year) === 2025) {
        return false;
      }

      // Country is considered a match when all three ESS params align.
      return (
        details.stfeco !== undefined &&
        Math.abs(Number(details.stfeco) - activeParams.stfeco) <= tolerance &&
        details.stflife !== undefined &&
        Math.abs(Number(details.stflife) - activeParams.stflife) <= tolerance &&
        details.stfgov !== undefined &&
        Math.abs(Number(details.stfgov) - activeParams.stfgov) <= tolerance
      );
    }) || null
  );
}

function applyFilterAndResetIndex() {
  // Re-normalize to stay robust even if data source shape changes.
  const countries = toCountryArray(countryData);
  if (countries.length === 0) {
    filteredCountries = [];
    countryIndex = 0;
    return;
  }

  // Keep only countries with at least one matching year; restart at first result.
  countryData = countries;
  filteredCountries = countryData.filter((country) => findMatchingYear(country, params));
  countryIndex = 0;
}

function keyPressed() {
  // Keyboard navigation through filtered countries.
  if (filteredCountries.length === 0) {
    return;
  }

  if (keyCode === RIGHT_ARROW) {
    countryIndex = (countryIndex + 1) % filteredCountries.length;
  }

  if (keyCode === LEFT_ARROW) {
    countryIndex = (countryIndex - 1 + filteredCountries.length) % filteredCountries.length;
  }
}

function connectSocket() {
  // Create socket and react to connection lifecycle.
  socket = io(SERVER_URL);

  socket.on("connect", () => {
    socketConnected = true;
    console.log("[socket] connected");
  });

  socket.on("disconnect", () => {
    socketConnected = false;
    console.warn("[socket] disconnected");
  });

  socket.on("params", (incoming) => {
    // Update local filters from controller, then refresh results.
    Object.assign(params, {
      stfeco: Number(incoming.stfeco),
      stflife: Number(incoming.stflife),
      stfgov: Number(incoming.stfgov),
    });
    applyFilterAndResetIndex();
  });
}
