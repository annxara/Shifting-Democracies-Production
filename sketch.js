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

// Survey years available in the dataset
const ALL_YEARS = [
  2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2023,
];

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

  // data is now an array of { country, years: [...] }
  for (const entry of data) {
    let c = new Node(entry.country, entry.years);
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
  stroke(255, 100);
  strokeWeight(2);
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
    country.render(ALL_YEARS, params, hasAnyMatch);
  }

  // Draw legend in top right corner
  drawLegend();
}

function onParamsChange() {
  countries.forEach((node) => {
    node.findMatchingYear(params);
  });

  filteredCountries = countries.filter(
    (country) => country.closest && country.closest.year !== null,
  );

  console.log(
    `Params: stfeco=${params.stfeco}, stflife=${params.stflife}, stfgov=${params.stfgov}`,
  );

  publishCountryState();
}

function publishCountryState() {
  if (!socket) {
    return;
  }

  socket.emit("country-state", {
    countries: filteredCountries.map((country) => country.country),
    activeCountry: highlightedCountryName,
    activeIndex: countryIndex,
  });
}

// Draw the legend box in the bottom right corner explaining the visualization elements
function drawLegend() {
  const legendX = width - 470;
  const legendY = height - 165;
  const legendW = 300;
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
  textSize(13);
  textStyle(BOLD);
  text("Legende", legendX + 123, legendY + 15);

  // Example rectangle with divisions and colors
  const exampleX = legendX + 10;
  const exampleY = legendY + 25;
  const exampleW = 280;
  const exampleH = 30;
  const sectionW = exampleW / 11; // Show 11 sections as example

  // Draw all 11 sections
  for (let i = 0; i < 11; i++) {
    const x = exampleX + i * sectionW;

    // Alternate between different colors for visual variety
    if (i === 0 || i === 10 || i === 1 || i === 7) {
      fill(170); // End sections - gray (missing)
    } else if (i === 5) {
      fill(255, 255, 150, 255); // Middle - yellow (matching highlight)
    } else if (i === 8) {
      fill(255, 200, 150, 255); // Middle - lighter orange (matching highlight)
    } else {
      fill(255); // Middle sections - white (matching)
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

  // Draw sample data line across sections
  // stroke(255, 100, 100);
  // strokeWeight(1);
  // line(
  //   exampleX + sectionW * 0.5,
  //   exampleY + 10,
  //   exampleX + sectionW * 10.5,
  //   exampleY + 10,
  // );

  // Legend text (split into 2 rows)
  fill(200);
  textSize(9);
  textStyle(NORMAL);
  text("1 Block = 1 Year ", legendX + 10, exampleY + exampleH + 11);

  // Gray rectangle for missing data
  fill(170);
  rect(legendX + 125, exampleY + exampleH + 3, 12, 10, 2);
  fill(200);
  text("= Missing ESS Data", legendX + 140, exampleY + exampleH + 11);

  // Yellow rectangle for exact match
  fill(255, 255, 150, 255);
  rect(legendX + 10, exampleY + exampleH + 15, 12, 10, 2);
  fill(200);
  text("= exact Match", legendX + 25, exampleY + exampleH + 23);

  // Orange rectangle for closest year
  fill(255, 200, 150, 255);
  rect(legendX + 125, exampleY + exampleH + 15, 12, 10, 2);
  fill(200);
  text("= closest year to Parameters", legendX + 140, exampleY + exampleH + 23);

  // Draw colored circles for data dimensions
  const vdemLabels = [
    "v2x_polyarchy",
    "v2x_libdem",
    "v2x_egaldem",
    "v2x_delibdem",
    "v2x_partipdem",
    "stfdem",
  ];
  const vdemColors = [
    "orange",
    "blue",
    "cornflowerblue",
    "green",
    "violet",
    "red",
  ];

  const circleRadius = 4;
  const circleSpacing = 18;
  const columnSpacing = 115; // Space between columns

  for (let i = 0; i < vdemLabels.length; i++) {
    const column = i % 2;
    const row = Math.floor(i / 2);
    const circleX = legendX + 15 + column * columnSpacing;
    const circleY = legendY + 35 + exampleH + 30 + row * circleSpacing;

    // Draw circle
    fill(vdemColors[i]);
    noStroke();
    circle(circleX, circleY, circleRadius * 2);

    // Draw label
    fill(150);
    textAlign(LEFT);
    textSize(5);
    textStyle(NORMAL);
    text(vdemLabels[i], circleX + 6, circleY + 2);
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
    if (gui) {
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
