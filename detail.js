// Socket, auto-detects local vs Render
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;
let socket;
let socketConnected = false;

let countryData = [];
let filteredCountries = [];
let countryIndex = 0;
let flowerImages = [];

const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

const indicatorConfig = [
  { key: "v2x_libdem", label: "Liberal Democracy", image: "pictures/forgetmenot_blue.png" },
  { key: "v2x_polyarchy", label: "Polyarchy", image: "pictures/forgetmenot_pink.png" },
  { key: "v2x_partipdem", label: "Participatory Democracy", image: "pictures/forgetmenot_green.png" },
  { key: "v2x_delibdem", label: "Deliberative Democracy", image: "pictures/forgetmenot_yellow.png" },
];

function preload() {
  countryData = loadJSON("ess_vdem_country_year_variables 2.json");

  for (let i = 0; i < indicatorConfig.length; i++) {
    flowerImages.push(loadImage(indicatorConfig[i].image));
  }
}

function setup() {
  createCanvas(980, 760);
  imageMode(CENTER);

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
  drawIndicators(latest);
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

function drawIndicators(latest) {
  const startY = 150;
  const rowGap = 132;
  const flowerStartX = 390;
  const flowerGap = 52;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const y = startY + i * rowGap;
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

    for (let n = 0; n < flowerCount; n++) {
      const x = flowerStartX + n * flowerGap;
      image(flowerImages[i], x, y + 8);
    }
  }
}

function drawFooter() {
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
  if (!country || !country.years) {
    return null;
  }

  const tolerance = 0;
  return (
    country.years.find((details) => {
      if (Number(details.year) === 2025) {
        return false;
      }

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
  if (!countryData || countryData.length === 0) {
    filteredCountries = [];
    countryIndex = 0;
    return;
  }

  filteredCountries = countryData.filter((country) => findMatchingYear(country, params));
  countryIndex = 0;
}

function keyPressed() {
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
