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
let highlightedYearIndex = 0;
let flowerImages = [];
let interpretationCsvLines = [];
let interpretationLookup = new Map();
let flowerCloud = [];
let flowerCloudKey = "";
let randomPhaseStartsAt = 0;
let clusterAnimationStartsAt = 0;
const ROTATE_CANVAS_90 = true;
const CLUSTER_DELAY_MS = 2000;
const CLUSTER_MOVE_DURATION_MS = 4200;
const HEADER_BLOCK_HEIGHT = 80;
const INTERPRETATION_BLOCK_HEIGHT = 83;
const INTERPRETATION_MARGIN_TOP = 8;
const LEGEND_BLOCK_HEIGHT = 205;
const LEGEND_MARGIN = 22;
const FLOWER_TO_LEGEND_GAP = 40;
const BINARY_HIGH_THRESHOLD = 0.5;
const FONT_SIZE_TITLE = 32;
const FONT_SIZE_SECTION = 20;
const FONT_SIZE_BODY = 16;
const LEGEND_FONT_SIZE_TITLE = 16;
const LEGEND_FONT_SIZE_LABEL = 12;
const LEGEND_FONT_SIZE_VALUE = 11;
const LEGEND_FLOWER_SIZE = 25;
const FLOWER_RENDER_SCALE = 1.0;
const HEADER_TITLE_TO_SUBTEXT_GAP = 39;
const INTERPRETATION_TITLE_TO_BODY_GAP = 14;
const LEGEND_TITLE_TO_ROWS_GAP = 54;

function getCanvasSize() {
  // If the canvas is rotated by 90deg, swap dimensions so it still fits the window.
  return ROTATE_CANVAS_90
    ? { width: 720, height: 1280 }
    : { width: 1280, height: 720 };
}

// These values come from the control page.
const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

// Country name translations (English to German), kept in sync with sketch 1.
const countryTranslations = {
  Albania: "Albanien",
  Austria: "Österreich",
  Belgium: "Belgien",
  Bulgaria: "Bulgarien",
  Croatia: "Kroatien",
  Cyprus: "Zypern",
  Czechia: "Tschechien",
  Denmark: "Dänemark",
  Estonia: "Estland",
  Finland: "Finnland",
  France: "Frankreich",
  Germany: "Deutschland",
  Greece: "Griechenland",
  Hungary: "Ungarn",
  Iceland: "Island",
  Ireland: "Irland",
  Israel: "Israel",
  Italy: "Italien",
  Kosovo: "Kosovo",
  Latvia: "Lettland",
  Lithuania: "Litauen",
  Luxembourg: "Luxemburg",
  Montenegro: "Montenegro",
  Netherlands: "Niederlande",
  "North Macedonia": "Nordmazedonien",
  Norway: "Norwegen",
  Poland: "Polen",
  Portugal: "Portugal",
  Romania: "Rumänien",
  Serbia: "Serbien",
  Slovakia: "Slowakei",
  Slovenia: "Slowenien",
  Spain: "Spanien",
  Sweden: "Schweden",
  Switzerland: "Schweiz",
  Ukraine: "Ukraine",
  "United Kingdom": "UK",
};

// Each color belongs to one data variable.
const indicatorConfig = [
  {
    key: "v2x_libdem",
    label: "Liberale Demokratie",
    image: "pictures/forgetmenot_indigo.png",
  },
  {
    key: "v2x_polyarchy",
    label: "Elektorale Demokratie",
    image: "pictures/forgetmenot_brightcyan.png",
  },
  {
    key: "v2x_partipdem",
    label: "Partizipative Demokratie",
    image: "pictures/forgetmenot_dodgerblue.png",
  },
  {
    key: "v2x_delibdem",
    label: "Deliberative Demokratie",
    image: "pictures/forgetmenot_brightpurple.png",
  },
  {
    key: "v2x_egaldem",
    label: "Egalitäre Demokratie",
    image: "pictures/forgetmenot_teal.png",
  },
  {
    key: "stfdem",
    label: "Zufriedenheit mit Demokratie",
    image: "pictures/forgetmenot_magenta.png",
  },
  {
    key: "stfeco",
    label: "Zufriedenheit mit der Wirtschaft",
    image: "pictures/forgetmenot_red.png",
  },
  {
    key: "stflife",
    label: "Zufriedenheit mit dem Leben",
    image: "pictures/forgetmenot_orange.png",
  },
  {
    key: "stfgov",
    label: "Zufriedenheit mit der Regierung",
    image: "pictures/forgetmenot_yellow.png",
  },
];

function preload() {
  // Load the data file and the flower pictures first.
  countryData = loadJSON("ess_vdem_country_year_variables 2.json");
  interpretationCsvLines = loadStrings("vdem_48_kombinationen.csv");

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
    if (
      values.length > 0 &&
      values.every(
        (v) => v && typeof v === "object" && "country" in v && "years" in v,
      )
    ) {
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
  countryData = countryData.map((entry) => ({
    ...entry,
    country: countryTranslations[entry.country] || entry.country,
  }));
  interpretationLookup = buildInterpretationLookup(interpretationCsvLines);

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
  background("#000000");

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

  // Pick the current country and currently selected highlighted year.
  const country = filteredCountries[countryIndex];
  const latest = getSelectedHighlightedYearEntry(country);

  if (!latest) {
    drawNoMatchState();
    return;
  }

  // Rebuild the flower layout when the country changes.
  const currentKey = country.country + "-" + latest.year;
  if (currentKey !== flowerCloudKey) {
    flowerCloudKey = currentKey;
    flowerCloud = [];
  }

  const regimeInfo = getRegimeInterpretation(latest);

  drawHeader(country, latest, regimeInfo);
  drawInterpretationPanel(regimeInfo);
  drawTree(latest);
  drawLegend(latest);
  //drawFooter();
}

function drawHeader(country, latest, regimeInfo) {
  // Structured top area: country/year on left, democracy type on right.
  const panelX = 24;
  const panelY = 20;
  const panelW = width - 48;
  const panelH = HEADER_BLOCK_HEIGHT;
  const panelPadding = 16;

  const typeCardW = Math.min(390, panelW * 0.42);
  const typeCardX = panelX + panelW - typeCardW - panelPadding;
  const typeCardY = panelY + panelPadding;
  const typeCardH = panelH - panelPadding * 2;

  const leftX = panelX + 22;
  const leftY = panelY + 14;
  const leftW = typeCardX - leftX - 16;

  fill("#f7f9ff");
  noStroke();
  textAlign(LEFT, TOP);
  textStyle(BOLD);

  let titleSize = FONT_SIZE_TITLE;
  while (titleSize > 38 && textWidth(country.country) > leftW) {
    titleSize -= 2;
    textSize(titleSize);
  }
  textSize(titleSize);
  text(country.country, leftX, leftY);

  textStyle(NORMAL);
  textSize(FONT_SIZE_BODY);
  fill("#b6bfd4");
  text("Jahr: " + latest.year, leftX + 2, leftY + HEADER_TITLE_TO_SUBTEXT_GAP);

  noStroke();
  fill("#98a1b7");
  textStyle(NORMAL);
  textSize(16);
  text("Demokratietyp", typeCardX + 14, typeCardY + 12);

  fill("#f1f5ff");
  textStyle(BOLD);
  textSize(24);
  text(
    regimeInfo.regimeType,
    typeCardX + 14,
    typeCardY + 34,
    typeCardW - 28,
    typeCardH - 40,
  );
}

function drawTree(latest) {
  // Instead of a strict tree, we now draw a drifting flower field.
  // The flowers behave like a soft cloud that moves over time.

  if (flowerCloud.length === 0) {
    flowerCloud = buildMemoryField(latest);
    randomPhaseStartsAt = millis();
    clusterAnimationStartsAt = randomPhaseStartsAt + CLUSTER_DELAY_MS;
  }

  updateAndDrawFlowers();
}

function buildMemoryField(latest) {
  // Create flowers that start at random positions, then settle into clusters.

  const flowers = [];
  const totalFlowerCount = indicatorConfig.reduce(
    (sum, conf) => sum + getFlowerCount(latest, conf.key),
    0,
  );
  const flowerSize = getFlowerVisualSize(totalFlowerCount);
  const clusterRadius = constrain(
    map(totalFlowerCount, 20, 80, 112, 90),
    86,
    116,
  );

  const bounds = {
    minX: 70,
    maxX: width - 70,
    minY:
      HEADER_BLOCK_HEIGHT +
      INTERPRETATION_MARGIN_TOP +
      INTERPRETATION_BLOCK_HEIGHT +
      28,
    maxY: height - LEGEND_BLOCK_HEIGHT - LEGEND_MARGIN - FLOWER_TO_LEGEND_GAP,
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
      const target = pickGardenPositionNearAnchor(
        flowers,
        size,
        bounds,
        anchor,
        clusterRadius,
      );
      const randomStartX = random(bounds.minX, bounds.maxX);
      const randomStartY = random(bounds.minY, bounds.maxY);

      flowers.push({
        x: randomStartX,
        y: randomStartY,
        sx: randomStartX,
        sy: randomStartY,
        tx: target.x,
        ty: target.y,
        ax: anchor.x,
        ay: anchor.y,
        flowerIndex: i,
        size,
        rotateInViz: true,
        rotation: random(-25, 25),
        growDelay: random(0, 700),
        growDuration: random(550, 1050),
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
  // Match legend order:
  // - left column: first half of indicators (V-Dem)
  // - right column: second half (ESS)
  const half = Math.ceil(anchorCount / 2);
  const leftCount = half;
  const rightCount = anchorCount - half;
  const maxRows = Math.max(leftCount, rightCount);
  const anchors = [];
  const leftX = bounds.minX + (bounds.maxX - bounds.minX) * 0.32;
  const rightX = bounds.minX + (bounds.maxX - bounds.minX) * 0.68;
  const verticalStep = (bounds.maxY - bounds.minY) / (maxRows + 1);

  for (let i = 0; i < anchorCount; i++) {
    const isLeftColumn = i < half;
    const row = isLeftColumn ? i : i - half;
    anchors.push({
      x: isLeftColumn ? leftX : rightX,
      y: bounds.minY + verticalStep * (row + 1),
    });
  }

  return anchors;
}

function pickGardenPositionNearAnchor(
  existingFlowers,
  size,
  bounds,
  anchor,
  clusterRadius,
) {
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
      f.tx = constrain(
        f.tx,
        bounds.minX + f.size * 0.5,
        bounds.maxX - f.size * 0.5,
      );
      f.ty = constrain(
        f.ty,
        bounds.minY + f.size * 0.5,
        bounds.maxY - f.size * 0.5,
      );
    }

    if (!moved) {
      break;
    }
  }
}

function updateAndDrawFlowers() {
  // Show random start positions first, then move toward clusters.
  const now = millis();
  const shouldStartClustering = now >= clusterAnimationStartsAt;
  const moveProgress = constrain(
    (now - clusterAnimationStartsAt) / CLUSTER_MOVE_DURATION_MS,
    0,
    1,
  );
  const easedMoveProgress = easeInOutCubic(moveProgress);

  // Draw smaller flowers first so bigger ones sit visually on top.
  flowerCloud.sort((a, b) => a.size - b.size);

  for (let f of flowerCloud) {
    if (shouldStartClustering && !f.settled) {
      f.x = lerp(f.sx, f.tx, easedMoveProgress);
      f.y = lerp(f.sy, f.ty, easedMoveProgress);

      if (moveProgress >= 1) {
        f.settled = true;
      }
    }

    drawSingleFlower(f);
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawSingleFlower(f) {
  // Draw one flower with a short grow-in animation at the start.
  const elapsedSinceRandomStart = millis() - randomPhaseStartsAt;
  const growProgress = constrain(
    (elapsedSinceRandomStart - f.growDelay) / f.growDuration,
    0,
    1,
  );
  const smoothGrow = growProgress * growProgress * (3 - 2 * growProgress);
  const drawSize = f.size * smoothGrow * FLOWER_RENDER_SCALE;

  if (drawSize <= 0.5) return;

  push();

  translate(f.x, f.y);

  if (f.rotateInViz) {
    rotate(f.rotation);
  }

  noTint();

  image(flowerImages[f.flowerIndex], 0, 0, drawSize, drawSize);

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

function isEssDataAvailable(latest, indicatorKey) {
  if (!indicatorKey.startsWith("stf")) return true;
  const value = latest[indicatorKey];
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "" ||
      normalized === "na" ||
      normalized === "n/a" ||
      normalized === "nan" ||
      normalized === "null"
    ) {
      return false;
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue);
}

function drawLegend(latest) {
  // Show V-Dem indicators on the left and ESS indicators on the right.
  const vDemIndicators = indicatorConfig.filter((item) =>
    item.key.startsWith("v2x_"),
  );
  const essIndicators = indicatorConfig.filter((item) =>
    item.key.startsWith("stf"),
  );

  const panelX = 24;

  const panelY = height - LEGEND_BLOCK_HEIGHT - LEGEND_MARGIN;
  const panelW = width - 48;
  const panelH = LEGEND_BLOCK_HEIGHT;
  const startX = panelX + 18;
  const contentWidth = panelW - 36;
  const columnWidth = contentWidth / 2;
  const titlesY = panelY + 28;
  const rowsStartY = titlesY + LEGEND_TITLE_TO_ROWS_GAP;
  const rowHeight = 48;

  drawUiPanel(panelX, panelY, panelW, panelH, 18, "#000000", "#ffffff");

  stroke("#2f3850");
  strokeWeight(1);
  line(
    startX + columnWidth - 12,
    panelY + 16,
    startX + columnWidth - 12,
    panelY + panelH - 16,
  );

  textAlign(LEFT, CENTER);
  noStroke();

  fill("#f1f5ff");
  textStyle(BOLD);
  textSize(LEGEND_FONT_SIZE_TITLE);
  text("Wissenschfliche Beurteilungen", startX, titlesY);
  text("Volksempfinden", startX + columnWidth, titlesY);
  textStyle(NORMAL);

  const rows = Math.max(vDemIndicators.length, essIndicators.length);

  for (let row = 0; row < rows; row++) {
    drawLegendRow(
      vDemIndicators[row],
      startX,
      rowsStartY,
      row,
      rowHeight,
      latest,
    );
    drawLegendRow(
      essIndicators[row],
      startX + columnWidth,
      rowsStartY,
      row,
      rowHeight,
      latest,
    );
  }
}

function parseSemicolonCsvLine(line) {
  const result = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ";" && !inQuotes) {
      result.push(value.trim());
      value = "";
      continue;
    }

    value += ch;
  }

  result.push(value.trim());
  return result;
}

function buildInterpretationLookup(lines) {
  const lookup = new Map();
  if (!Array.isArray(lines)) return lookup;

  for (const rawLine of lines) {
    if (!rawLine || !rawLine.includes(";")) continue;

    const cols = parseSemicolonCsvLine(rawLine);
    if (cols.length < 7) continue;

    const edi = cols[0];
    const liberal = cols[1];
    const participatory = cols[2];
    const egalitarian = cols[3];
    const deliberative = cols[4];

    if (!["N", "M", "H"].includes(edi)) continue;
    if (!["N", "H"].includes(liberal)) continue;
    if (!["N", "H"].includes(participatory)) continue;
    if (!["N", "H"].includes(egalitarian)) continue;
    if (!["N", "H"].includes(deliberative)) continue;

    const regimeType = cols[5] || "Unbekannter Regimetyp";
    const interpretation = cols[6] || "Keine Interpretation vorhanden.";
    const key = [edi, liberal, participatory, egalitarian, deliberative].join("|");

    lookup.set(key, {
      regimeType,
      interpretation,
    });
  }

  return lookup;
}

function classifyEdi(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N";
  if (numericValue < 0.4) return "N";
  if (numericValue <= 0.6) return "M";
  return "H";
}

function classifyBinary(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N";
  return numericValue >= BINARY_HIGH_THRESHOLD ? "H" : "N";
}

function getRegimeInterpretation(latest) {
  const scores = {
    edi: classifyEdi(latest.v2x_polyarchy),
    liberal: classifyBinary(latest.v2x_libdem),
    participatory: classifyBinary(latest.v2x_partipdem),
    egalitarian: classifyBinary(latest.v2x_egaldem),
    deliberative: classifyBinary(latest.v2x_delibdem),
  };

  const key = [
    scores.edi,
    scores.liberal,
    scores.participatory,
    scores.egalitarian,
    scores.deliberative,
  ].join("|");

  const matched = interpretationLookup.get(key);

  if (!matched) {
    return {
      key,
      scores,
      regimeType: "Keine passende Kategorie gefunden",
      interpretation:
        "Die Scores konnten keiner Zeile aus der 48-Kombinationen-Tabelle zugeordnet werden.",
    };
  }

  return {
    key,
    scores,
    regimeType: matched.regimeType,
    interpretation: matched.interpretation,
  };
}

function drawInterpretationPanel(result) {
  const panelX = 24;
  const panelY = HEADER_BLOCK_HEIGHT + INTERPRETATION_MARGIN_TOP;
  const panelW = width - 48;
  const panelH = INTERPRETATION_BLOCK_HEIGHT;

  noStroke();
  textAlign(LEFT, TOP);

  fill("#e8ecf8");
  textStyle(BOLD);
  textSize(28);
  const interpretationBodyY = panelY + 14;
  text(
    result.interpretation,
    panelX + 16,
    interpretationBodyY,
    panelW - 32,
    panelH - 16,
  );
}

function drawLegendRow(configItem, baseX, rowsStartY, row, rowHeight, latest) {
  if (!configItem) return;

  const y = rowsStartY + row * rowHeight;
  const index = indicatorConfig.findIndex(
    (item) => item.key === configItem.key,
  );
  const isEss = configItem.key.startsWith("stf");
  const hasEssData = isEssDataAvailable(latest, configItem.key);
  const flowerCount = getFlowerCount(latest, configItem.key);

  // Draw one example flower.
  image(
    flowerImages[index],
    baseX + 12,
    y,
    LEGEND_FLOWER_SIZE,
    LEGEND_FLOWER_SIZE,
  );

  // Show label.
  fill("#e8ecf8");
  textStyle(BOLD);
  textSize(LEGEND_FONT_SIZE_LABEL);
  text(configItem.label, baseX + 34, y - 9);

  // Show real flower count currently rendered in the garden.
  fill("#98a1b7");
  textStyle(NORMAL);
  textSize(LEGEND_FONT_SIZE_VALUE);
  text(
    isEss && !hasEssData ? "Keine Daten" : String(flowerCount),
    baseX + 34,
    y + 10,
  );
}

function drawFooter() {
  // Subtle footer for navigation and socket status.
  fill("#a2a9bc");
  noStroke();
  textAlign(LEFT, BOTTOM);
  textSize(FONT_SIZE_BODY);
  text("<- / -> : Land wechseln", 34, height - 12);

  const statusText = socketConnected ? "Socket: verbunden" : "Socket: getrennt";
  fill(socketConnected ? "#7ee787" : "#ff7b72");
  textAlign(RIGHT, BOTTOM);
  text(statusText, width - 34, height - 12);
}

function drawUiPanel(x, y, w, h, radius, fillColor, strokeColor) {
  push();
  stroke(strokeColor);
  strokeWeight(1);
  fill(fillColor);
  rect(x, y, w, h, radius);
  pop();
}

function drawLoadingState() {
  // Message while the file is still loading.
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(FONT_SIZE_SECTION);
  text("Daten werden geladen...", width / 2, height / 2);
}

function drawNoMatchState() {
  // Message when no country fits the filter values.
  fill(220);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(FONT_SIZE_SECTION);
  text(
    "Keine Länder entsprechen den aktuellen Parametern.",
    width / 2,
    height / 2 - 24,
  );

  textSize(18);
  fill("#b8bcc8");
  text(
    "Zufriedenheit mit der Wirtschaft: " +
      params.stfeco +
      " | Zufriedenheit mit dem Leben: " +
      params.stflife +
      " | Zufriedenheit mit der Regierung: " +
      params.stfgov,
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

function findMatchingYears(country, activeParams) {
  // Skip broken data.
  if (!country || !country.years) return [];

  // Match only when all three numbers are the same.
  const tolerance = 0;

  return country.years
    .filter((details) => {
      if (Number(details.year) === 2025) return false;

      return (
        details.stfeco !== undefined &&
        Math.abs(Number(details.stfeco) - activeParams.stfeco) <= tolerance &&
        details.stflife !== undefined &&
        Math.abs(Number(details.stflife) - activeParams.stflife) <= tolerance &&
        details.stfgov !== undefined &&
        Math.abs(Number(details.stfgov) - activeParams.stfgov) <= tolerance
      );
    })
    .sort((a, b) => Number(a.year) - Number(b.year));
}

function getSelectedHighlightedYearEntry(country) {
  if (!country || !Array.isArray(country.highlightedYears)) {
    return null;
  }

  if (country.highlightedYears.length === 0) {
    return null;
  }

  highlightedYearIndex = constrain(
    highlightedYearIndex,
    0,
    country.highlightedYears.length - 1,
  );

  return country.highlightedYears[highlightedYearIndex] || null;
}

function applyFilterAndResetIndex() {
  // Make sure the data is still an array.
  const countries = toCountryArray(countryData);
  if (countries.length === 0) {
    filteredCountries = [];
    countryIndex = 0;
    highlightedYearIndex = 0;
    return;
  }

  // Keep only countries with one or more exact matching years,
  // and store all highlighted years in chronological order.
  countryData = countries;
  filteredCountries = countryData
    .map((country) => {
      const highlightedYears = findMatchingYears(country, params);
      return {
        ...country,
        highlightedYears,
      };
    })
    .filter((country) => country.highlightedYears.length > 0);

  countryIndex = 0;
  highlightedYearIndex = 0;
  flowerCloud = [];
  flowerCloudKey = "";
  emitCountryState();
}

function emitCountryState() {
  if (!socket || filteredCountries.length === 0) {
    if (socket) {
      socket.emit("country-state", {
        source: "detail",
        countries: [],
        activeCountry: "",
        activeIndex: 0,
        activeYear: null,
        activeYearIndex: 0,
        totalYearCount: 0,
      });
      socket.emit("year-state", {
        source: "detail",
        activeYear: null,
        activeYearIndex: 0,
        totalYearCount: 0,
      });
    }
    return;
  }

  countryIndex = constrain(countryIndex, 0, filteredCountries.length - 1);
  const currentCountry = filteredCountries[countryIndex];
  const currentYears = currentCountry.highlightedYears || [];
  const currentYear = getSelectedHighlightedYearEntry(currentCountry);

  socket.emit("country-state", {
    source: "detail",
    countries: filteredCountries.map((country) => country.country),
    activeCountry: currentCountry.country,
    activeIndex: countryIndex,
    activeYear: currentYear ? Number(currentYear.year) : null,
    activeYearIndex: highlightedYearIndex,
    totalYearCount: currentYears.length,
  });

  socket.emit("year-state", {
    source: "detail",
    activeYear: currentYear ? Number(currentYear.year) : null,
    activeYearIndex: highlightedYearIndex,
    totalYearCount: currentYears.length,
  });
}

function stepSelection(direction) {
  if (filteredCountries.length === 0) return;

  const currentCountry = filteredCountries[countryIndex];
  const currentYears = currentCountry.highlightedYears || [];
  const currentYearCount = currentYears.length;

  if (direction > 0) {
    if (currentYearCount > 0 && highlightedYearIndex < currentYearCount - 1) {
      highlightedYearIndex += 1;
    } else {
      countryIndex = (countryIndex + 1) % filteredCountries.length;
      highlightedYearIndex = 0;
    }
  } else {
    if (currentYearCount > 0 && highlightedYearIndex > 0) {
      highlightedYearIndex -= 1;
    } else {
      countryIndex =
        (countryIndex - 1 + filteredCountries.length) % filteredCountries.length;

      const previousCountry = filteredCountries[countryIndex];
      const previousCount = (previousCountry.highlightedYears || []).length;
      highlightedYearIndex = Math.max(0, previousCount - 1);
    }
  }

  flowerCloud = [];
  flowerCloudKey = "";
  emitCountryState();
}

function keyPressed() {
  // Arrow navigation iterates highlighted years first, then moves country.
  if (filteredCountries.length === 0) return;

  if (keyCode === RIGHT_ARROW) {
    stepSelection(1);
  }

  if (keyCode === LEFT_ARROW) {
    stepSelection(-1);
  }
}

function connectSocket() {
  // Connect to the control page.
  socket = io(SERVER_URL);

  socket.on("connect", () => {
    socketConnected = true;
    console.log("[socket] connected");
    emitCountryState();
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

  socket.on("request-country-state", () => {
    emitCountryState();
  });

  socket.on("request-year-state", () => {
    emitCountryState();
  });

  socket.on("country-selection", (incoming) => {
    if (filteredCountries.length === 0 || !incoming) return;

    if (incoming.yearDirection === "next") {
      stepSelection(1);
      return;
    }

    if (incoming.yearDirection === "prev") {
      stepSelection(-1);
      return;
    }

    if (typeof incoming.index === "number" && Number.isFinite(incoming.index)) {
      const len = filteredCountries.length;
      countryIndex = ((Math.floor(incoming.index) % len) + len) % len;
      highlightedYearIndex = 0;
      flowerCloud = [];
      flowerCloudKey = "";
      emitCountryState();
      return;
    }

    if (typeof incoming.country === "string") {
      const selectedIndex = filteredCountries.findIndex(
        (country) => country.country === incoming.country,
      );
      if (selectedIndex >= 0) {
        countryIndex = selectedIndex;
        highlightedYearIndex = 0;
        flowerCloud = [];
        flowerCloudKey = "";
        emitCountryState();
      }
    }
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
