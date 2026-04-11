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
    flowerCloudKey = currentKey;
    flowerCloud = [];
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
  // Instead of a strict tree, we now draw a drifting flower field.
  // The flowers behave like a soft cloud that moves over time.

  if (flowerCloud.length === 0) {
    flowerCloud = buildMemoryField(latest);
  }

  drawFieldBackground();
  updateAndDrawFlowers();
}
function buildMemoryField(latest) {
  // Create a soft cluster of flowers starting near the center.
  // Each flower will later drift depending on its data type.

  const flowers = [];

  const centerX = width / 2;
  const centerY = height / 2 + 40;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const count = getFlowerCount(latest, conf.key);

    // Use more flowers than before to create density and layering.
    for (let n = 0; n < count * 3; n++) {
      flowers.push({
        x: centerX + random(-20, 20),
        y: centerY + random(-20, 20),

        vx: 0,
        vy: 0,

        flowerIndex: i,
        size: random(28, 72),
        rotation: random(-1, 1),

        life: random(200, 600),
        age: 0,
      });
    }
  }

  return flowers;
}

function updateAndDrawFlowers() {
  // Update position and draw each flower.
  // Movement is driven by noise + directional bias.

  // Draw smaller flowers first so bigger ones sit visually on top.
  flowerCloud.sort((a, b) => a.size - b.size);

  for (let f of flowerCloud) {
    f.age++;

    // Each data type has a subtle directional pull.
    const bias = [
      { x: -0.15, y: 0 },   // blue → left
      { x: 0.15, y: 0 },    // pink → right
      { x: 0, y: -0.15 },   // green → up
      { x: 0, y: 0.15 },    // yellow → down
    ][f.flowerIndex];

    // Organic drifting using Perlin noise.
    const n = noise(f.x * 0.003, f.y * 0.003, frameCount * 0.003);

    f.vx += (n - 0.5) * 0.4;
    f.vy += (n - 0.5) * 0.4;

    // Apply the data-driven direction.
    f.vx += bias.x;
    f.vy += bias.y;

    // Soft damping keeps movement smooth and floaty.
    f.vx *= 0.96;
    f.vy *= 0.96;

    f.x += f.vx;
    f.y += f.vy;

    // Slight upward drift for a "memory / evaporation" feeling.
    f.y -= 0.05;

    drawSingleFlower(f);
  }
}

function drawSingleFlower(f) {
  // Draw one flower with soft motion and fading over time.

  push();

  translate(f.x, f.y);

  // Small rotation movement so flowers feel alive.
  rotate(f.rotation + sin(f.age * 0.02) * 0.2);

  // Fade out slowly over lifetime.
  const alpha = map(f.age, 0, f.life, 220, 40);

  tint(255, alpha);

  // Subtle pulsing size.
  const pulse = 1 + sin(f.age * 0.05) * 0.08;

  image(
    flowerImages[f.flowerIndex],
    0,
    0,
    f.size * pulse,
    f.size * pulse
  );

  pop();
}

function drawFieldBackground() {
  // Dark background with soft glow and grain texture.

  background("#0e0e12");

  // Soft light bloom in the center.
  noStroke();
  for (let i = 0; i < 80; i++) {
    fill(255, 6);
    ellipse(width / 2, height / 2 + 40, 200 + i * 10);
  }

  // Light grain texture to avoid flat digital look.
  for (let i = 0; i < 1200; i++) {
    stroke(255, 8);
    point(random(width), random(height));
  }
}

/*function drawRecursiveTree(counts) {
  // Draw one white tree. More flowers = bigger tree and more branch levels.
  const totalFlowers = counts.reduce((sum, value) => sum + value, 0);
  const desiredTips = Math.max(40, totalFlowers);
  const leftFlowers = counts[0] + counts[2];
  const rightFlowers = counts[1] + counts[3];
  const sideBalance = constrain((leftFlowers - rightFlowers) / 20, -1, 1);

  // 1) Main size of the tree.
  const trunkLength = map(totalFlowers, 0, 40, TREE_SETTINGS.trunkMin, TREE_SETTINGS.trunkMax);

  // 2) Amount of branches (depth of recursion).
  const requiredDepth = Math.ceil(Math.log2(desiredTips)) + 1;
  const branchDepth = constrain(requiredDepth, TREE_SETTINGS.depthMin, TREE_SETTINGS.depthMax);

  // 3) First split spacing (small at trunk, then grows by layer).
  const branchSpread = map(totalFlowers, 0, 40, TREE_SETTINGS.spreadMin, TREE_SETTINGS.spreadMax);

  const tips = [];
  const startX = width / 2;
  const startY = height - 120;
  const startAngle = -90 + sideBalance * 0.8;

  stroke(255);
  noFill();
  drawBranch(startX, startY, trunkLength, startAngle, branchDepth, branchSpread, counts, sideBalance, 0, tips, desiredTips);

  return tips;
}

function drawBranch(x, y, len, angle, depth, spread, counts, sideBalance, level, tips, desiredTips) {
  // len: current branch size (smaller each level)
  // depth: how many split levels are left (higher = more branches)
  // spread: left/right branch angle
  // counts: flower totals used to shape left vs right side
  if (len < 4 || depth <= 0 || tips.length >= Math.min(TREE_SETTINGS.maxTips, desiredTips)) {
    return;
  }

  const nx = x + cos(angle) * len;
  const ny = y + sin(angle) * len;

  // Branch thickness follows branch length so twigs are thin.
  strokeWeight(map(len, 10, TREE_SETTINGS.trunkMax, 1, 10));
  line(x, y, nx, ny);

  // Last level: stop splitting here.
  if (depth === 1) {
    const tipSize = constrain(map(len, 4, TREE_SETTINGS.trunkMax * 0.45, 38, 62), 34, 64);
    tips.push({ x: nx, y: ny, tipSize });
    return;
  }

  // Left side uses blue+green flowers, right side uses pink+yellow.
  const leftFlowers = counts[0] + counts[2];
  const rightFlowers = counts[1] + counts[3];

  // More flowers on a side -> that side opens a bit wider.
  const leftAngle = map(leftFlowers, 0, 20, spread * 0.9, spread * 1.08);
  const rightAngle = map(rightFlowers, 0, 20, spread * 0.9, spread * 1.08);

  // Branch size rule: every next layer is about 3/4 of the previous one.
  const leftLen = len * TREE_SETTINGS.childScale;
  const rightLen = len * TREE_SETTINGS.childScale;

  // Spacing rule: each deeper layer has wider spacing than the previous one.
  const nextSpread = Math.min(spread * TREE_SETTINGS.spreadGrowth, TREE_SETTINGS.spreadCap);

  // Alternate tiny turn offsets to avoid perfectly mirrored branching.
  const alt = level % 2 === 0 ? TREE_SETTINGS.altTurnBoost : -TREE_SETTINGS.altTurnBoost;
  const leftTurn = constrain(leftAngle + alt + sideBalance * 0.8, 6, TREE_SETTINGS.spreadCap);
  const rightTurn = constrain(rightAngle - alt - sideBalance * 0.8, 6, TREE_SETTINGS.spreadCap);


  drawBranch(nx, ny, leftLen, angle - leftTurn, depth - 1, nextSpread, counts, sideBalance, level + 1, tips, desiredTips);
  drawBranch(nx, ny, rightLen, angle + rightTurn, depth - 1, nextSpread, counts, sideBalance, level + 1, tips, desiredTips);
}
*/

function getFlowerCount(latest, indicatorKey) {
  // Turn a value from 0 to 1 into a flower count from 0 to 10.
  const rawValue = Number(latest[indicatorKey]);
  const score01 = Number.isFinite(rawValue) ? constrain(rawValue, 0, 1) : 0;
  return Math.round(score01 * 10);
}

/*function buildFlowerCloud(latest, tips) {
  // Place flowers only at branch ends.
  flowerCloud = [];

  if (!tips || tips.length === 0) {
    return;
  }

  // Keep flowers near tip points; extra flowers stack in tiny rings around the same tip.
  const perTipCount = new Array(tips.length).fill(0);
  let globalPlaced = 0;

  for (let i = 0; i < indicatorConfig.length; i++) {
    const count = getFlowerCount(latest, indicatorConfig[i].key);

    for (let n = 0; n < count; n++) {
      const tipIndex = globalPlaced % tips.length;
      const tip = tips[tipIndex];
      const ringIndex = perTipCount[tipIndex];
      const radius = ringIndex * (tip.tipSize * 0.38 + 2);
      const angle = (ringIndex * 137) % 360;
      const size = constrain(tip.tipSize * random(0.9, 1.1), 34, 66);

      flowerCloud.push({
        x: tip.x + cos(angle) * radius,
        y: tip.y + sin(angle) * radius,
        flowerIndex: i,
        rotation: random(-0.45, 0.45),
        size,
      });

      perTipCount[tipIndex] += 1;
      globalPlaced += 1;
    }
  }
}
*/
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