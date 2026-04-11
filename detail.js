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
const ROTATE_CANVAS_90 = true;

function getCanvasSize() {
  // If the canvas is rotated by 90deg, swap dimensions so it still fits the window.
  return ROTATE_CANVAS_90
    ? { width: windowHeight, height: windowWidth }
    : { width: windowWidth, height: windowHeight };
}

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
  { key: "stfdem", label: "Satisfaction with Democracy", image: "pictures/forgetmenot_red.png" },
  { key: "stfeco", label: "Satisfaction with Economy", image: "pictures/forgetmenot_babyblue.png" },
  { key: "stflife", label: "Satisfaction with Life", image: "pictures/forgetmenot_magenta.png" },
  { key: "stfgov", label: "Satisfaction with Government", image: "pictures/forgetmenot_grassgreen.png" },
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
  const canvasSize = getCanvasSize();
  const canvas = createCanvas(canvasSize.width, canvasSize.height);
  if (ROTATE_CANVAS_90) {
    canvas.elt.style.transform = "rotate(90deg)";
    canvas.elt.style.transformOrigin = "center center";
  }
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

function windowResized() {
  const canvasSize = getCanvasSize();
  resizeCanvas(canvasSize.width, canvasSize.height);
  flowerCloud = [];
  flowerCloudKey = "";
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
  drawLegend(latest);
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

  updateAndDrawFlowers();
}
function buildMemoryField(latest) {
  // Create flowers that start near the center and settle into a garden.

  const flowers = [];
  const totalFlowerCount = indicatorConfig.reduce((sum, conf) => sum + getFlowerCount(latest, conf.key), 0);
  const flowerSize = getFlowerVisualSize(totalFlowerCount);
  const clusterRadius = constrain(map(totalFlowerCount, 20, 80, 112, 90), 86, 116);

  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const bounds = {
    minX: 70,
    maxX: width - 70,
    minY: 150,
    maxY: height - 290,
  };

  // Build evenly spaced anchors for all indicators inside the flower area.
  const anchors = buildGridAnchors(indicatorConfig.length, bounds);

  for (let i = 0; i < indicatorConfig.length; i++) {
    const conf = indicatorConfig[i];
    const count = getFlowerCount(latest, conf.key);
    const anchor = anchors[i % anchors.length];

    // One flower per rounded score point (0..10), same mapping as before.
    for (let n = 0; n < count; n++) {
      const size = flowerSize;
      const target = pickGardenPositionNearAnchor(flowers, size, bounds, anchor, clusterRadius);

      flowers.push({
        x: centerX + random(-20, 20),
        y: centerY + random(-20, 20),
        tx: target.x,
        ty: target.y,
        ax: anchor.x,
        ay: anchor.y,

        flowerIndex: i,
        size,
        rotation: random(-1, 1),
        settled: false,
      });
    }
  }

  resolveTargetOverlaps(flowers, bounds);

  return flowers;
}

function getFlowerVisualSize(totalFlowerCount) {
  // More flowers => smaller size, so everything fits in portrait layout.
  return constrain(map(totalFlowerCount, 20, 80, 64, 42), 40, 66);
}

function buildGridAnchors(anchorCount, bounds) {
  const columns = 2;
  const rows = Math.ceil(anchorCount / columns);
  const anchors = [];
  const horizontalStep = (bounds.maxX - bounds.minX) / (columns + 1);
  const verticalStep = (bounds.maxY - bounds.minY) / (rows + 1);

  for (let i = 0; i < anchorCount; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    anchors.push({
      x: bounds.minX + horizontalStep * (column + 1),
      y: bounds.minY + verticalStep * (row + 1),
    });
  }

  return anchors;
}

function pickGardenPositionNearAnchor(existingFlowers, size, bounds, anchor, clusterRadius) {
  // Keep each variable near its own anchor and prevent overlaps.
  const margin = size * 0.48;
  const minX = bounds.minX + margin;
  const maxX = bounds.maxX - margin;
  const minY = bounds.minY + margin;
  const maxY = bounds.maxY - margin;
  const rings = 9;
  const triesPerRing = 70;
  const ringStep = Math.max(12, size * 0.32);
  let bestX = anchor.x;
  let bestY = anchor.y;
  let bestClearance = -Infinity;

  for (let ring = 0; ring < rings; ring++) {
    const currentRadius = clusterRadius + ring * ringStep;

    for (let attempt = 0; attempt < triesPerRing; attempt++) {
      const a = random(TWO_PI);
      const r = currentRadius * sqrt(random());
      const x = constrain(anchor.x + cos(a) * r, minX, maxX);
      const y = constrain(anchor.y + sin(a) * r, minY, maxY);

      let hasOverlap = false;
      let nearestClearance = Infinity;

      for (const f of existingFlowers) {
        const required = (size + f.size) * 0.6;
        const clearance = dist(x, y, f.tx, f.ty) - required;
        if (clearance < 0) {
          hasOverlap = true;
        }
        if (clearance < nearestClearance) {
          nearestClearance = clearance;
        }
      }

      if (!hasOverlap) {
        return { x, y };
      }

      if (nearestClearance > bestClearance) {
        bestClearance = nearestClearance;
        bestX = x;
        bestY = y;
      }
    }
  }

  // If very crowded, keep best local position near the cluster.
  return { x: bestX, y: bestY };
}

function resolveTargetOverlaps(flowers, bounds) {
  // Final pass: separate any remaining collisions but keep flowers near their cluster center.
  const iterations = 80;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    for (let i = 0; i < flowers.length; i++) {
      for (let j = i + 1; j < flowers.length; j++) {
        const a = flowers[i];
        const b = flowers[j];
        const required = (a.size + b.size) * 0.6;
        const dx = b.tx - a.tx;
        const dy = b.ty - a.ty;
        let d = Math.sqrt(dx * dx + dy * dy);

        if (d < 0.0001) {
          d = 0.0001;
        }

        if (d < required) {
          const push = (required - d) * 0.52;
          const nx = dx / d;
          const ny = dy / d;

          a.tx -= nx * push;
          a.ty -= ny * push;
          b.tx += nx * push;
          b.ty += ny * push;
          moved = true;
        }
      }
    }

    // Gentle pull back to each variable cluster center.
    for (const f of flowers) {
      f.tx += (f.ax - f.tx) * 0.05;
      f.ty += (f.ay - f.ty) * 0.05;
      f.tx = constrain(f.tx, bounds.minX + f.size * 0.5, bounds.maxX - f.size * 0.5);
      f.ty = constrain(f.ty, bounds.minY + f.size * 0.5, bounds.maxY - f.size * 0.5);
    }

    if (!moved) {
      break;
    }
  }
}

function updateAndDrawFlowers() {
  // Move flowers toward their target and stop there.

  // Draw smaller flowers first so bigger ones sit visually on top.
  flowerCloud.sort((a, b) => a.size - b.size);

  for (let f of flowerCloud) {
    if (!f.settled) {
      const dx = f.tx - f.x;
      const dy = f.ty - f.y;

      f.x += dx * 0.08;
      f.y += dy * 0.08;

      if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) {
        f.x = f.tx;
        f.y = f.ty;
        f.settled = true;
      }
    }

    drawSingleFlower(f);
  }
}

function drawSingleFlower(f) {
  // Draw one flower.

  push();

  translate(f.x, f.y);

  rotate(f.rotation);

  noTint();

  image(
    flowerImages[f.flowerIndex],
    0,
    0,
    f.size,
    f.size
  );

  pop();
}


function getFlowerCount(latest, indicatorKey) {
  // Support two scales:
  // - 0..1 (democracy index scores)
  // - 0..10 (survey satisfaction scores)
  // Both become a flower count from 0 to 10.
  const rawValue = Number(latest[indicatorKey]);
  if (!Number.isFinite(rawValue)) return 0;

  if (rawValue <= 1) {
    return Math.round(constrain(rawValue, 0, 1) * 10);
  }

  return Math.round(constrain(rawValue, 0, 10));
}

function drawLegend(latest) {
  // Show V-Dem indicators on the left and ESS indicators on the right.
  const vDemIndicators = indicatorConfig.filter((item) => item.key.startsWith("v2x_"));
  const essIndicators = indicatorConfig.filter((item) => item.key.startsWith("stf"));

  const legendTop = height - 250;
  const startX = 60;
  const contentWidth = width - 120;
  const columnWidth = contentWidth / 2;
  const rowHeight = 48;

  textAlign(LEFT, CENTER);
  noStroke();

  fill("#f0f3fa");
  textSize(15);
  text("V-Dem Values", startX, legendTop - 26);
  text("ESS Values", startX + columnWidth, legendTop - 26);

  const rows = Math.max(vDemIndicators.length, essIndicators.length);

  for (let row = 0; row < rows; row++) {
    drawLegendRow(vDemIndicators[row], startX, row, rowHeight, latest);
    drawLegendRow(essIndicators[row], startX + columnWidth, row, rowHeight, latest);
  }
}

function drawLegendRow(configItem, baseX, row, rowHeight, latest) {
  if (!configItem) return;

  const y = (height - 250) + row * rowHeight;
  const index = indicatorConfig.findIndex((item) => item.key === configItem.key);
  const flowerCount = getFlowerCount(latest, configItem.key);

  // Draw one example flower.
  image(flowerImages[index], baseX + 12, y, 30, 30);

  // Show label.
  fill("#e8eaf0");
  textSize(13);
  text(configItem.label, baseX + 34, y - 9);

  // Show real flower count currently rendered in the garden.
  fill("#9ea4b4");
  textSize(12);
  text(String(flowerCount), baseX + 34, y + 10);
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