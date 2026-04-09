// Socket, auto-detects local vs Render
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;
let socket;

// GUI
let data;
let countries = [];
//let sortedCountries = [];
const ALL_YEARS = [2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2023];

const gui = new lil.GUI();
const params = {
  //: 5,
  stfeco: 5,
  //stfedu: 5,
  //stfhlth: 5,
  stflife: 5,
  //trstprl: 5,
  stfgov: 5,
};

function preload() {
  loadJSON("ess_vdem_country_year_variables 2.json", (d) => {
    data = d;
  });
}

function setup() {
  createCanvas(3840, 2160);

  // data is now an array of { country, years: [...] }
  for (const entry of data) {
    let c = new Node(entry.country, entry.years);
    countries.push(c);
  }
  for (const key of Object.keys(params)) {
    gui.add(params, key, 0, 10, 1).onChange(() => {
      onParamsChange();
      socket.emit("params", { ...params }); // ← add this
    });
  }
  onParamsChange(); // Initialize closest years for all countries

  connectSocket();
}

function draw() {
  background(0);

  let topMargin = 100; // Top margin
  let gutter = 110; // Vertical spacing between rectangles

  // Fixed positions for 4 columns (centered on canvas)
  let columnPositions = [650];
  let posY = topMargin;
  let column = 0;
  let posX = columnPositions[column];

  // Filter to only countries with matching years
  const matchingCountries = countries.filter((country) => country.closest && country.closest.year !== null);

  if (matchingCountries.length === 0) {
    fill(200);
    textAlign(CENTER, CENTER);
    textSize(32);
    text("No countries match these parameters", width / 2, 200);
    return;
  }

  // Position matching countries tightly together
  for (let i = 0; i < matchingCountries.length; i++) {
    const country = matchingCountries[i];
    country.setPosition(posX, posY);
    country.render(ALL_YEARS);
    posY += gutter;
  }
}

function onParamsChange() {
  countries.forEach((node) => {
    node.findMatchingYear(params);
  });

  // Count and log matching countries
  const matchingCount = countries.filter((country) => country.closest && country.closest.year !== null).length;

  console.log(
    `stfeco: ${params.stfeco}, stflife: ${params.stflife}, stfgov: ${params.stfgov} → ${matchingCount} countries`,
  );
}

// Connect to socket
function connectSocket() {
  socket = io(SERVER_URL);
  socket.on("connect", () => console.log("[socket] connected"));
  socket.on("disconnect", () => console.warn("[socket] disconnected"));

  // receive params from gui.html and apply them
  socket.on("params", (incoming) => {
    Object.assign(params, incoming); // merge into local params
   // gui.controllersRecursive().forEach((c) => c.updateDisplay()); // sync GUI
    onParamsChange(); // re-run with new values
  });
}
