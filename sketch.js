// ============================================================================
// SHIFTING DEMOCRACIES - MAIN SKETCH VISUALIZATION
// ============================================================================
// This is the main p5.js sketch that displays the data visualization.
// It receives parameter updates from gui.html via Socket.io and renders
// country data cards in a 3-column grid layout.
// ============================================================================

// Detect if running locally or on cloud deployment
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

// Socket.io connection for real-time parameter updates
let socket;
let data;
let countries = [];
let filteredCountries = [];
let countryIndex = 0;
let highlightedCountryName = "";
const MAX_FILTERED_COUNTRIES = 50;

// Survey years available in the dataset
const ALL_YEARS = [
  2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2023,
];

// Country name translations (English to German)
const countryTranslations = {
  "Albania": "Albanien",
  "Austria": "Österreich",
  "Belgium": "Belgien",
  "Bulgaria": "Bulgarien",
  "Croatia": "Kroatien",
  "Cyprus": "Zypern",
  "Czechia": "Tschechien",
  "Denmark": "Dänemark",
  "Estonia": "Estland",
  "Finland": "Finnland",
  "France": "Frankreich",
  "Germany": "Deutschland",
  "Greece": "Griechenland",
  "Hungary": "Ungarn",
  "Iceland": "Island",
  "Ireland": "Irland",
  "Israel": "Israel",
  "Italy": "Italien",
  "Kosovo": "Kosovo",
  "Latvia": "Lettland",
  "Lithuania": "Litauen",
  "Luxembourg": "Luxemburg",
  "Montenegro": "Montenegro",
  "Netherlands": "Niederlande",
  "North Macedonia": "Nordmazedonien",
  "Norway": "Norwegen",
  "Poland": "Polen",
  "Portugal": "Portugal",
  "Romania": "Rumänien",
  "Serbia": "Serbien",
  "Slovakia": "Slowakei",
  "Slovenia": "Slowenien",
  "Spain": "Spanien",
  "Sweden": "Schweden",
  "Switzerland": "Schweiz",
  "Ukraine": "Ukraine",
  "United Kingdom": "UK"
};

// Current filter parameters (controlled by gui.html)
// stfeco: satisfaction with economy (0-10)
// stflife: satisfaction with life (0-10)
// stfgov: satisfaction with government (0-10)
const params = {
  stfeco: 5, // Default: middle value
  stflife: 5,
  stfgov: 5,
};

function preload() {
  loadJSON("ess_vdem_country_year_variables 2.json", (loaded) => {
    data = loaded;
  });
}

function setup() {
  createCanvas(1920, 1080);

  // Improve text rendering quality
  pixelDensity(3); // Render at 3x resolution for ultra-crisp text
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.textRendering = 'geometricPrecision';
  drawingContext.font = '700 16px "Open Sauce One", sans-serif';

  // data is now an array of { country, years: [...] }
  for (const entry of data) {
    const translatedName = countryTranslations[entry.country] || entry.country;
    let c = new Node(translatedName, entry.years);
    countries.push(c);
  }

  console.log(`Loaded ${countries.length} countries`);

  // Assign fixed positions to all countries in 3 columns
  const numCols = 3;
  const countriesPerCol = Math.ceil(countries.length / numCols);
  const colWidth = width / numCols;
  const topMargin = 35;
  const bottomMargin = 30;
  const countrySeparation = 82; // Space between each country (top to top)
  const verticalGap = countrySeparation;

  console.log(
    `Countries per column: ${countriesPerCol}, Column width: ${colWidth}, Vertical gap: ${verticalGap}`,
  );

  for (let i = 0; i < countries.length; i++) {
    const col = Math.floor(i / countriesPerCol);
    const row = i % countriesPerCol;
    const posX = colWidth * col + colWidth / 2;
    const posY = topMargin + row * verticalGap;
    countries[i].setPosition(posX, posY);
    console.log(
      `${countries[i].country}: col=${col}, row=${row}, pos=(${posX}, ${posY})`,
    );
  }

  onParamsChange(); // Initialize closest years for all countries

  connectSocket();
}

function draw() {
  background(0);

  // Draw 3 simple vertical guide lines at column centers
  stroke(70);
  strokeWeight(300);
  const numCols = 3;
  const colWidth = width / numCols;
  for (let col = 0; col < numCols; col++) {
    const centerX = colWidth * col + colWidth / 2;
    line(centerX, 0, centerX, height);
  }

  // Check if any country has a matching year
  let hasAnyMatch = false;
  for (let i = 0; i < countries.length; i++) {
    for (const yearData of countries[i].years) {
      if (countries[i].yearMatchesParams(yearData, params)) {
        hasAnyMatch = true;
        break;
      }
    }
    if (hasAnyMatch) break;
  }

  // Draw each country
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const isSelected = country.country === highlightedCountryName;
    country.render(ALL_YEARS, params, hasAnyMatch, isSelected);
  }

  // Draw legend in top right corner
  drawLegend();
}

function onParamsChange() {
  countries.forEach((node) => {
    node.findMatchingYear(params);
  });

  // Filter countries that have exact matching parameters in any year
  // Maintain sketch 1 column order by keeping countries in their original positions
  filteredCountries = countries.filter(
    (country) => country.closest && country.closest.hasExactMatch === true,
  ).slice(0, MAX_FILTERED_COUNTRIES);

  if (filteredCountries.length === 0) {
    countryIndex = 0;
    highlightedCountryName = "";
  } else {
    const highlightedIndex = filteredCountries.findIndex(
      (country) => country.country === highlightedCountryName,
    );

    if (highlightedIndex >= 0) {
      countryIndex = highlightedIndex;
    } else {
      countryIndex = Math.max(
        0,
        Math.min(countryIndex, filteredCountries.length - 1),
      );
      highlightedCountryName = filteredCountries[countryIndex].country;
    }
  }

  console.log(
    `Params: stfeco=${params.stfeco}, stflife=${params.stflife}, stfgov=${params.stfgov}`,
  );
  console.log(`Filtered countries with exact matches: ${filteredCountries.length}`);

  publishCountryState();
}

function publishCountryState() {
  if (!socket) {
    return;
  }

  socket.emit("country-state", {
    source: "sketch",
    countries: filteredCountries.map((country) => country.country),
    activeCountry: highlightedCountryName,
    activeIndex: countryIndex,
  });
}

// Draw the legend box in the bottom right corner explaining the visualization elements
function drawLegend() {
  const legendX = width - 520;
  const legendY = height - 165;
  const legendW = 380;
  const legendH = 160;

  // Background box
  fill(30);
  stroke(255);
  strokeWeight(1);
  rect(legendX, legendY, legendW, legendH, 15);

  // Title
  fill(255);
  noStroke();
  textAlign(LEFT);
  textSize(16);
  textStyle(BOLD);
  textFont("Open Sauce One");
  text("Legende", legendX + 168, legendY + 17);

  // Example rectangle with divisions and colors
  const exampleX = legendX + (legendW - 280) / 2; // Center horizontally
  const exampleY = legendY + 25;
  const exampleW = 280;
  const exampleH = 30;
  const sectionW = exampleW / 11; // Show 11 sections as example

  // Draw all 11 sections
  for (let i = 0; i < 11; i++) {
    const x = exampleX + i * sectionW;

    // Alternate between different colors for visual variety
    if (i === 0 || i === 10 || i === 1 || i === 7) {
      fill(130); // End sections - gray (missing)
    } else if (i === 5) {
      fill("#E8FA5F"); // Middle - yellow (matching highlight)
    } else if (i === 8) {
      fill("#FFFECB"); // Middle - lighter orange (matching highlight)
    } else {
      fill(170); // Middle sections - white (matching)
    }

    // Draw with rounded corners on edges
    if (i === 0) {
      rect(x, exampleY, sectionW, exampleH, 5, 0, 0, 5);
    } else if (i === 10) {
      rect(x, exampleY, sectionW, exampleH, 0, 5, 5, 0);
    } else {
      rect(x, exampleY, sectionW, exampleH);
    }
  }

  // Draw dividers between all sections
  stroke(0);
  strokeWeight(0.5);
  for (let i = 1; i < 11; i++) {
    line(
      exampleX + i * sectionW,
      exampleY,
      exampleX + i * sectionW,
      exampleY + exampleH,
    );
  }

  // Legend text (split into 2 rows)
  fill(255);
  textSize(11);
  textStyle(NORMAL);
  textFont("Open Sauce One");
  text("1 Block = 1 Jahr ", legendX + 30, exampleY + 5 + exampleH + 11);

  // Gray rectangle for missing data
  fill(130);
  rect(legendX + 190, exampleY + 5 + exampleH + 3, 12, 10, 2);
  fill(255);
  textFont("Open Sauce One");
  text("= Fehlende ESS-Daten", legendX + 205, exampleY + 5 + exampleH + 11);

  // green rectangle for exact match
  fill("#E8FA5F");
  rect(legendX + 30, exampleY + 5 + exampleH + 15, 12, 10, 2);
  fill(255);
  textFont("Open Sauce One");
  text("= exakte Übereinstimmung", legendX + 45, exampleY + 5 + exampleH + 23);

  // yellow rectangle for closest year
  fill("#FFFECB");
  rect(legendX + 190, exampleY + 5 + exampleH + 15, 12, 10, 2);
  fill(255);
  textFont("Open Sauce One");
  text(
    "= nächstgelegenes Jahr zu\n   den Parameteren",
    legendX + 205,
    exampleY + 5 + exampleH + 23,
  );

  // Draw colored circles for data dimensions
  const vdemLabels = [
    "Elektorale Demokratie",
    "Liberale Demokratie",
    "Egalitäre Demokratie",
    "Deliberative Demokratie",
    "Partizipative Demokratie",
    "Zufriedenheit mit Demokratie",
  ];
  const vdemColors = [
    "#00D9FF", // v2x_polyarchy - bright cyan
    "#4B0082", // v2x_libdem - indigo (deep)
    "#a5f7e0", // v2x_egaldem - teal
    "#8B3DFF", // v2x_delibdem - bright purple
    "#1E90FF", // v2x_partipdem - dodger blue
    "#FF00F2", // stfdem - magenta
  ];

  const circleRadius = 4;
  const circleSpacing = 18;
  const columnSpacing = 161; // Space between columns

  for (let i = 0; i < vdemLabels.length; i++) {
    const column = i % 2;
    const row = Math.floor(i / 2);
    const circleX = legendX + 35 + column * columnSpacing;
    const circleY = legendY + 45 + exampleH + 35 + row * circleSpacing;

    // Draw circle
    fill(vdemColors[i]);
    noStroke();
    circle(circleX, circleY, circleRadius * 2);

    // Draw label
    fill(255);
    textAlign(LEFT);
    textSize(11);
    textStyle(NORMAL);
    textFont("Open Sauce One");
    text(vdemLabels[i], circleX + 8, circleY + 2);
  }
}

function connectSocket() {
  socket = io(SERVER_URL);

  socket.on("connect", () => {
    console.log("[socket] connected");
    publishCountryState();
  });

  socket.on("disconnect", () => console.warn("[socket] disconnected"));

  socket.on("params", (incoming) => {
    Object.assign(params, incoming);
    if (typeof gui !== "undefined" && gui) {
      gui
        .controllersRecursive()
        .forEach((controller) => controller.updateDisplay());
    }
    onParamsChange();
  });

  socket.on("request-country-state", () => {
    publishCountryState();
  });

  socket.on("country-selection", (incoming) => {
    if (!incoming || typeof incoming.country !== "string") {
      return;
    }

    const selectedIndex = filteredCountries.findIndex(
      (country) => country.country === incoming.country,
    );
    if (selectedIndex >= 0) {
      countryIndex = selectedIndex;
      highlightedCountryName = incoming.country;
      publishCountryState();
    }
  });
}


