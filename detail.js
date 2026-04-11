// Use the local server on your computer, or the live site online.
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

// Socket connection and a flag that says if it is connected.
let socket;
let socketConnected = false;

// Data and pictures used by the page.
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

// Each color belongs to one data variable.
const indicatorConfig = [
  { key: "v2x_libdem", label: "Liberal Democracy", image: "pictures/forgetmenot_blue.png" },
  { key: "v2x_polyarchy", label: "Polyarchy", image: "pictures/forgetmenot_pink.png" },
  { key: "v2x_partipdem", label: "Participatory Democracy", image: "pictures/forgetmenot_green.png" },
  { key: "v2x_delibdem", label: "Deliberative Democracy", image: "pictures/forgetmenot_yellow.png" },
];

// TREE SETTINGS (easy to tweak)
// trunkMin / trunkMax: make the whole tree shorter or taller.
// depthMin / depthMax: controls how many branch levels are drawn.
// spreadMin / spreadMax: controls how wide branches open.
const TREE_SETTINGS = {
  trunkMin: 95,
  trunkMax: 125,
  depthMin: 2,
  depthMax: 3,
  spreadMin: 11,
  spreadMax: 16,
};

function preload() {
  // Load the data file and the flower pictures first.
  countryData = loadJSON("ess_vdem_country_year_variables 2.json");

  for (let i = 0; i < indicatorConfig.length; i++) {
    flowerImages.push(loadImage(indicatorConfig[i].image));
  }
}

// Make sure the data is in an array.
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
  // Make the drawing area and center the images.
  createCanvas(980, 760);
  imageMode(CENTER);
  angleMode(DEGREES);

  // Make the data ready to use.
  countryData = toCountryArray(countryData);

  // Make all flower pictures the same size.
  for (let i = 0; i < flowerImages.length; i++) {
    flowerImages[i].resize(54, 0);
  }

  // Draw the first view and connect to the socket.
  applyFilterAndResetIndex();
  connectSocket();
}

function draw() {
  // Clear the screen each time it draws.
  background("#101015");

  // Show this while the data is loading.
  if (!countryData || countryData.length === 0) {
    drawLoadingState();
    return;
  }

  // Show this if nothing matches the current filters.
  if (filteredCountries.length === 0) {
    drawNoMatchState();
    return;
  }

  // Pick the current country and newest year.
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
  // Draw the tree first, then draw the flowers.
  const counts = indicatorConfig.map((conf) => getFlowerCount(latest, conf.key));
  drawRecursiveTree(counts);

  for (let i = 0; i < flowerCloud.length; i++) {
    const flower = flowerCloud[i];
    push();
    translate(flower.x, flower.y);
    rotate(flower.rotation);
    image(flowerImages[flower.flowerIndex], 0, 0);
    pop();
  }
}

function drawRecursiveTree(counts) {
  // Draw one white tree. More flowers = bigger tree and more branches.
  const totalFlowers = counts.reduce((sum, value) => sum + value, 0);
  const leftFlowers = counts[0] + counts[2];
  const rightFlowers = counts[1] + counts[3];
  const sideBalance = constrain((leftFlowers - rightFlowers) / 20, -1, 1);

  // 1) Main size of the tree.
  const trunkLength = map(totalFlowers, 0, 40, TREE_SETTINGS.trunkMin, TREE_SETTINGS.trunkMax);

  // 2) Amount of branches (depth of recursion).
  const branchDepth = constrain(
    Math.ceil(map(totalFlowers, 0, 40, TREE_SETTINGS.depthMin, TREE_SETTINGS.depthMax)),
    TREE_SETTINGS.depthMin,
    TREE_SETTINGS.depthMax,
  );

  // 3) How much branches spread left/right.
  const branchSpread = map(totalFlowers, 0, 40, TREE_SETTINGS.spreadMin, TREE_SETTINGS.spreadMax);

  push();
  translate(width / 2, height - 120);
  // Small lean so the trunk does not feel perfectly centered/cone-like.
  rotate(sideBalance * 2.2);
  stroke(255);
  noFill();
  drawBranch(trunkLength, branchDepth, branchSpread, counts, sideBalance);
  pop();
}

function drawBranch(len, depth, spread, counts, sideBalance) {
  // len: current branch size (smaller each level)
  // depth: how many split levels are left (higher = more branches)
  // spread: left/right branch angle
  // counts: flower totals used to shape left vs right side
  if (len < 9 || depth <= 0) {
    return;
  }

  // Branch thickness follows branch length so twigs are thin.
  strokeWeight(map(len, 10, TREE_SETTINGS.trunkMax, 1, 10));
  line(0, 0, 0, -len);
  translate(0, -len);

  // Last level: stop splitting here.
  if (depth === 1) {
    return;
  }

  // Left side uses blue+green flowers, right side uses pink+yellow.
  const leftFlowers = counts[0] + counts[2];
  const rightFlowers = counts[1] + counts[3];

  // More flowers on a side -> that side opens a bit wider.
  const leftAngle = map(leftFlowers, 0, 20, spread - 5, spread + 7);
  const rightAngle = map(rightFlowers, 0, 20, spread - 5, spread + 7);

  // Child branch length controls how dense/full the tree looks.
  const leftLen = len * map(leftFlowers, 0, 20, 0.67, 0.82);
  const rightLen = len * map(rightFlowers, 0, 20, 0.67, 0.82);

  // Angle gets a little smaller at each level for natural tapering.
  const nextSpread = spread * 0.9;

  // Give deeper levels a gentle alternating bend to avoid a strict cone shape.
  const wobble = (depth % 2 === 0 ? 1 : -1) * 3.2;
  const leftTurn = leftAngle + wobble + sideBalance * 2;
  const rightTurn = rightAngle - wobble - sideBalance * 2;

  push();
  rotate(leftTurn);
  drawBranch(leftLen, depth - 1, nextSpread, counts, sideBalance);
  pop();

  push();
  rotate(-rightTurn);
  drawBranch(rightLen, depth - 1, nextSpread, counts, sideBalance);
  pop();
}

function getFlowerCount(latest, indicatorKey) {
  // Turn a value from 0 to 1 into a flower count from 0 to 10.
  const rawValue = Number(latest[indicatorKey]);
  const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
  return Math.round(score01 * 10);
}

function buildFlowerCloud(latest) {
  // Put flowers in the middle without letting them touch.
  flowerCloud = [];

  const totalFlowers = indicatorConfig.reduce((sum, conf) => sum + getFlowerCount(latest, conf.key), 0);

  const bounds = {
    minX: width * 0.36,
    maxX: width * 0.64,
    minY: height * 0.22,
    maxY: height * 0.56,
  };

  // More flowers -> allow slightly tighter spacing so canopy looks full.
  const minDistance = map(totalFlowers, 0, 40, 34, 26);
  const maxAttemptsPerFlower = 700;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const count = getFlowerCount(latest, indicatorConfig[i].key);

    for (let n = 0; n < count; n++) {
      let placed = false;

      for (let attempt = 0; attempt < maxAttemptsPerFlower; attempt++) {
        const x = random(bounds.minX, bounds.maxX);
        const y = random(bounds.minY, bounds.maxY);

        // Keep only a small open area so flowers are clustered closer together.
        if (x > width * 0.47 && x < width * 0.53 && y > height * 0.24 && y < height * 0.41) {
          continue;
        }

        // Do not place a flower too close to another one.
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
        // Skip this flower when there is no free room, to avoid overlap.
        continue;
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

    // Draw one example flower.
    image(flowerImages[i], x, legendY);

    // Show the full name.
    fill("#e8eaf0");
    textSize(15);
    text(conf.label, x + 30, legendY - 10);

    // Show the short variable name.
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
  // Skip broken data.
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
  // Use the arrow keys to move through the countries.
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
    // Save the new values and redraw the page.
    Object.assign(params, {
      stfeco: Number(incoming.stfeco),
      stflife: Number(incoming.stflife),
      stfgov: Number(incoming.stfgov),
    });
    applyFilterAndResetIndex();
  });
}