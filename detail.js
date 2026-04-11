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

// Reorganize data without changing the rest of the code.
function toCountryArray(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && Array.isArray(rawData.data)) return rawData.data;
  if (rawData && typeof rawData === "object") {
    const values = Object.values(rawData);
    if (values.length > 0 && values.every((v) => v && typeof v === "object" && "country" in v && "years" in v)) {
      return values;
    }
  }
  return [];
}

function setup() {
  createCanvas(980, 760);
  imageMode(CENTER);

  countryData = toCountryArray(countryData);

  for (let i = 0; i < flowerImages.length; i++) {
    flowerImages[i].resize(42, 0);
  }

  applyFilterAndResetIndex();
  connectSocket();
}

function draw() {
  background("#101015");

  if (!countryData || countryData.length === 0) {
    drawLoadingState();
    return;
  }

  if (filteredCountries.length === 0) {
    drawNoMatchState();
    return;
  }

  const country = filteredCountries[countryIndex];
  const latest = getLatestYearEntry(country.years);

  drawHeader(country, latest);
  drawTree(latest);      // Replaces drawIndicators
  drawLegend(latest);    // New legend function
  drawFooter();
}

function drawHeader(country, latest) {
  fill("#f7f7f7");
  noStroke();
  textAlign(LEFT, TOP);

  textSize(34);
  text(country.country, 40, 28);

  textSize(18);
  fill("#b8bcc8");
  text("Jahr: " + latest.year + " (neuester Wert)", 40, 74);
}

function drawTree(latest) {
  const cx = width / 2;
  const cy = height / 2 - 60; // Center of the tree canopy
  const canopyRadius = 170;   // How wide the flowers spread

  // 1. Draw the Trunk
  stroke("#3d312b"); 
  strokeWeight(24);
  strokeCap(ROUND);
  line(cx, cy + 80, cx, height - 160);

  // 2. Draw a few stylized branches under the flowers
  strokeWeight(12);
  line(cx, cy + 60, cx - 70, cy - 20);
  line(cx, cy + 80, cx + 80, cy - 10);
  line(cx, cy + 20, cx - 40, cy + 60);
  line(cx, cy + 40, cx + 60, cy + 50);

  // 3. Draw the Flowers
  // We use a fixed randomSeed so the random positions don't jump around every frame.
  randomSeed(42); 

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    
    const rawValue = Number(latest[conf.key]);
    const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
    const score10 = score01 * 10;
    const flowerCount = Math.round(score10);

    // Draw the calculated amount of flowers for this category
    for (let n = 0; n < flowerCount; n++) {
      // Pick a random angle and distance within the circular canopy
      const angle = random(TWO_PI);
      const radius = canopyRadius * sqrt(random(1)); // sqrt ensures even distribution
      
      const x = cx + radius * cos(angle);
      const y = cy + radius * sin(angle);

      image(flowerImages[i], x, y);
    }
  }
}

function drawLegend(latest) {
  const legendY = height - 110;
  const totalWidth = 860;
  const startX = (width - totalWidth) / 2; // Center the legend horizontally
  const spacing = totalWidth / indicatorConfig.length;

  textAlign(LEFT, CENTER);
  noStroke();

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const x = startX + i * spacing;

    // Calculate score for display
    const rawValue = Number(latest[conf.key]);
    const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
    const score10 = score01 * 10;

    // Draw example flower
    image(flowerImages[i], x, legendY);

    // Draw the indicator label
    fill("#e8eaf0");
    textSize(15);
    text(conf.label, x + 30, legendY - 10);

    // Draw the exact score text below the label
    fill("#a8adbb");
    textSize(13);
    text(nf(score10, 1, 1) + " / 10", x + 30, legendY + 12);
  }
}

function drawFooter() {
  fill("#8d93a3");
  noStroke();
  textAlign(LEFT, BOTTOM);
  textSize(15);
  text("<- / -> : Land wechseln", 40, height - 32);

  const statusText = socketConnected ? "Socket: verbunden" : "Socket: getrennt";
  fill(socketConnected ? "#7ee787" : "#ff7b72");
  textAlign(RIGHT, BOTTOM);
  text(statusText, width - 40, height - 32);
}

function drawLoadingState() {
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Daten werden geladen...", width / 2, height / 2);
}

function drawNoMatchState() {
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
  if (!years || years.length === 0) {
    return {
      year: "n/a",
      v2x_libdem: 0,
      v2x_polyarchy: 0,
      v2x_partipdem: 0,
      v2x_delibdem: 0,
    };
  }

  let latest = years[0];
  for (let i = 1; i < years.length; i++) {
    if (Number(years[i].year) > Number(latest.year)) {
      latest = years[i];
    }
  }
  return latest;
}

function findMatchingYear(country, activeParams) {
  if (!country || !country.years) return null;

  const tolerance = 0;
  return (
    country.years.find((details) => {
      if (Number(details.year) === 2025) return false;

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
  const countries = toCountryArray(countryData);
  if (countries.length === 0) {
    filteredCountries = [];
    countryIndex = 0;
    return;
  }

  countryData = countries;
  filteredCountries = countryData.filter((country) => findMatchingYear(country, params));
  countryIndex = 0;
}

function keyPressed() {
  if (filteredCountries.length === 0) return;

  if (keyCode === RIGHT_ARROW) {
    countryIndex = (countryIndex + 1) % filteredCountries.length;
  }

  if (keyCode === LEFT_ARROW) {
    countryIndex = (countryIndex - 1 + filteredCountries.length) % filteredCountries.length;
  }
}

function connectSocket() {
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
    Object.assign(params, {
      stfeco: Number(incoming.stfeco),
      stflife: Number(incoming.stflife),
      stfgov: Number(incoming.stfgov),
    });
    applyFilterAndResetIndex();
  });
}