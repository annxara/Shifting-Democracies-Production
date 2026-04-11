// Pick the right server address for local use or the live site.
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

// Socket connection and a small status flag for the page.
let socket;
let socketConnected = false;

// Data and assets used by the page.
let countryData = [];
let filteredCountries = [];
let countryIndex = 0;
let flowerImages = [];
let flowerCloud = [];
let flowerCloudKey = "";

// These values come from the control page.
const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

// Each color goes with one data variable.
const indicatorConfig = [
  { key: "v2x_libdem", label: "Liberal Democracy", image: "pictures/forgetmenot_blue.png" },
  { key: "v2x_polyarchy", label: "Polyarchy", image: "pictures/forgetmenot_pink.png" },
  { key: "v2x_partipdem", label: "Participatory Democracy", image: "pictures/forgetmenot_green.png" },
  { key: "v2x_delibdem", label: "Deliberative Democracy", image: "pictures/forgetmenot_yellow.png" },
];

function preload() {
  // Load the JSON data and the flower pictures first.
  countryData = loadJSON("ess_vdem_country_year_variables 2.json");

  for (let i = 0; i < indicatorConfig.length; i++) {
    flowerImages.push(loadImage(indicatorConfig[i].image));
  }
}

// Turn the loaded data into a simple array if needed.
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
  // Make the canvas and tell p5 to center images.
  createCanvas(980, 760);
  imageMode(CENTER);

  // Clean the data shape before using it.
  countryData = toCountryArray(countryData);

  // Make the flower images the same size.
  for (let i = 0; i < flowerImages.length; i++) {
    flowerImages[i].resize(42, 0);
  }

  // Build the first view and connect to the socket.
  applyFilterAndResetIndex();
  connectSocket();
}

function draw() {
  // Clear the screen every frame.
  background("#101015");

  // Show a loading message until the data is ready.
  if (!countryData || countryData.length === 0) {
    drawLoadingState();
    return;
  }

  // Show a message if nothing matches the current filters.
  if (filteredCountries.length === 0) {
    drawNoMatchState();
    return;
  }

  // Pick the current country and its newest year.
  const country = filteredCountries[countryIndex];
  const latest = getLatestYearEntry(country.years);

  // Rebuild the flower layout when the country changes.
  const currentKey = country.country + "-" + latest.year;
  if (currentKey !== flowerCloudKey) {
    buildFlowerCloud(latest);
    flowerCloudKey = currentKey;
  }

  drawHeader(country, latest);
  drawTree(latest);
  drawLegend();
  drawFooter();
}

function drawHeader(country, latest) {
  // Show the country name and year at the top.
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
  // Draw the trunk and branches, then place the flowers.
  const trunkBaseX = width / 2;
  const trunkTopY = 155;
  const trunkBaseY = height - 150;
  const canopyCenterX = width / 2;
  const canopyCenterY = height / 2 - 50;

  drawOrganicTrunk(trunkBaseX, trunkTopY, trunkBaseY);
  drawOrganicBranches(trunkBaseX, trunkTopY, canopyCenterX, canopyCenterY);

  for (let i = 0; i < flowerCloud.length; i++) {
    const flower = flowerCloud[i];
    push();
    translate(flower.x, flower.y);
    rotate(flower.rotation);
    image(flowerImages[flower.flowerIndex], 0, 0);
    pop();
  }
}

function drawOrganicTrunk(baseX, topY, baseY) {
  // Draw the tree trunk with a soft curve.
  const midY1 = lerp(topY, baseY, 0.33);
  const midY2 = lerp(topY, baseY, 0.68);

  const offsets = [-18, -10, -4, 0, 3, 6, 4, 0, -3, -1];
  const points = [
    { x: baseX + offsets[0], y: baseY },
    { x: baseX + offsets[1], y: midY2 },
    { x: baseX + offsets[2], y: midY1 },
    { x: baseX + offsets[3], y: topY },
  ];

  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);

  stroke("#2f241f");
  strokeWeight(34);
  beginShape();
  curveVertex(points[0].x, points[0].y + 30);
  for (let i = 0; i < points.length; i++) {
    curveVertex(points[i].x, points[i].y);
  }
  curveVertex(points[points.length - 1].x + 2, points[points.length - 1].y - 20);
  endShape();

  stroke("#5a4638");
  strokeWeight(16);
  beginShape();
  curveVertex(points[0].x + 8, points[0].y + 18);
  for (let i = 0; i < points.length; i++) {
    curveVertex(points[i].x + 8, points[i].y);
  }
  curveVertex(points[points.length - 1].x + 12, points[points.length - 1].y - 18);
  endShape();
}

function drawBranchPath(startX, startY, endX, endY, curl) {
  // Draw one branch with a small bend.
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);

  stroke("#2d211b");
  strokeWeight(12);
  beginShape();
  curveVertex(startX, startY + 20);
  curveVertex(startX, startY + 20);
  curveVertex(lerp(startX, endX, 0.35) + curl, lerp(startY, endY, 0.32));
  curveVertex(lerp(startX, endX, 0.68) - curl * 0.7, lerp(startY, endY, 0.72));
  curveVertex(endX, endY);
  endShape();

  stroke("#6a523f");
  strokeWeight(5);
  beginShape();
  curveVertex(startX + 1, startY + 16);
  curveVertex(startX + 1, startY + 16);
  curveVertex(lerp(startX, endX, 0.35) + curl * 0.5, lerp(startY, endY, 0.32) - 2);
  curveVertex(lerp(startX, endX, 0.68) - curl * 0.35, lerp(startY, endY, 0.72) - 2);
  curveVertex(endX, endY);
  endShape();
}

function drawOrganicBranches(baseX, topY, canopyCenterX, canopyCenterY) {
  // Draw several branches that go in different directions.
  const branches = [
    { x: baseX - 10, y: topY + 190, ex: canopyCenterX - 150, ey: canopyCenterY + 90, curl: -28 },
    { x: baseX + 6, y: topY + 165, ex: canopyCenterX + 140, ey: canopyCenterY + 55, curl: 24 },
    { x: baseX - 8, y: topY + 120, ex: canopyCenterX - 110, ey: canopyCenterY - 10, curl: -18 },
    { x: baseX + 4, y: topY + 95, ex: canopyCenterX + 100, ey: canopyCenterY - 25, curl: 16 },
    { x: baseX - 3, y: topY + 60, ex: canopyCenterX - 55, ey: canopyCenterY - 75, curl: -12 },
    { x: baseX + 1, y: topY + 45, ex: canopyCenterX + 55, ey: canopyCenterY - 82, curl: 10 },
  ];

  for (let i = 0; i < branches.length; i++) {
    drawBranchPath(branches[i].x, branches[i].y, branches[i].ex, branches[i].ey, branches[i].curl);
  }
}

function getFlowerCount(latest, indicatorKey) {
  // Turn the 0 to 1 value into a 0 to 10 flower count.
  const rawValue = Number(latest[indicatorKey]);
  const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
  return Math.round(score01 * 10);
}

function buildFlowerCloud(latest) {
  // Place flowers in the middle area without letting them touch.
  flowerCloud = [];

  const bounds = {
    minX: width * 0.28,
    maxX: width * 0.72,
    minY: height * 0.16,
    maxY: height * 0.63,
  };

  const minDistance = 34;
  const maxAttemptsPerFlower = 220;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const count = getFlowerCount(latest, indicatorConfig[i].key);

    for (let n = 0; n < count; n++) {
      let placed = false;

      for (let attempt = 0; attempt < maxAttemptsPerFlower; attempt++) {
        const x = random(bounds.minX, bounds.maxX);
        const y = random(bounds.minY, bounds.maxY);

        // Keep the center a little open so the tree is easier to read.
        if (x > width * 0.43 && x < width * 0.57 && y > height * 0.18 && y < height * 0.46) {
          continue;
        }

        // Skip spots that are too close to another flower.
        const overlaps = flowerCloud.some((flower) => dist(x, y, flower.x, flower.y) < minDistance);
        if (!overlaps) {
          flowerCloud.push({
            x,
            y,
            flowerIndex: i,
            rotation: random(-0.45, 0.45),
          });
          placed = true;
          break;
        }
      }

      if (!placed) {
        flowerCloud.push({
          x: random(bounds.minX, bounds.maxX),
          y: random(bounds.minY, bounds.maxY),
          flowerIndex: i,
          rotation: random(-0.45, 0.45),
        });
      }
    }
  }
}

function drawLegend() {
  // Show which flower color belongs to which variable.
  const legendY = height - 110;
  const totalWidth = 860;
  const startX = (width - totalWidth) / 2;
  const spacing = totalWidth / indicatorConfig.length;

  textAlign(LEFT, CENTER);
  noStroke();

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const x = startX + i * spacing;

    // Draw one sample flower.
    image(flowerImages[i], x, legendY);

    // Show the long name.
    fill("#e8eaf0");
    textSize(15);
    text(conf.label, x + 30, legendY - 10);

    // Show the variable key.
    fill("#a8adbb");
    textSize(13);
    text(conf.key, x + 30, legendY + 12);
  }
}

function drawFooter() {
  // Show the key help text and socket status.
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
  // Message while the file is still loading.
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Daten werden geladen...", width / 2, height / 2);
}

function drawNoMatchState() {
  // Message when no country fits the filter values.
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
  // Give safe values if there is no data.
  if (!years || years.length === 0) {
    return {
      year: "n/a",
      v2x_libdem: 0,
      v2x_polyarchy: 0,
      v2x_partipdem: 0,
      v2x_delibdem: 0,
    };
  }

  // Find the newest year in the list.
  let latest = years[0];
  for (let i = 1; i < years.length; i++) {
    if (Number(years[i].year) > Number(latest.year)) {
      latest = years[i];
    }
  }
  return latest;
}

function findMatchingYear(country, activeParams) {
  // Skip bad data.
  if (!country || !country.years) return null;

  // Match only when all three numbers are the same.
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
  // Make sure the data is still an array.
  const countries = toCountryArray(countryData);
  if (countries.length === 0) {
    filteredCountries = [];
    countryIndex = 0;
    return;
  }

  // Keep only the countries that match the current settings.
  countryData = countries;
  filteredCountries = countryData.filter((country) => findMatchingYear(country, params));
  countryIndex = 0;
  flowerCloud = [];
  flowerCloudKey = "";
}

function keyPressed() {
  // Use arrow keys to move through the countries.
  if (filteredCountries.length === 0) return;

  if (keyCode === RIGHT_ARROW) {
    countryIndex = (countryIndex + 1) % filteredCountries.length;
  }

  if (keyCode === LEFT_ARROW) {
    countryIndex = (countryIndex - 1 + filteredCountries.length) % filteredCountries.length;
  }
}

function connectSocket() {
  // Connect to the control page.
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
    // Save the new values and refresh the view.
    Object.assign(params, {
      stfeco: Number(incoming.stfeco),
      stflife: Number(incoming.stflife),
      stfgov: Number(incoming.stfgov),
    });
    applyFilterAndResetIndex();
  });
}