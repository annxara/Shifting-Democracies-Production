const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

let socket;
let data;
let countries = [];
let filteredCountries = [];
let countryIndex = 0;
let highlightedCountryName = "";

const ALL_YEARS = [2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2023];

const gui = new lil.GUI();
const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

function preload() {
  loadJSON("ess_vdem_country_year_variables 2.json", (loaded) => {
    data = loaded;
  });
}

function setup() {
  createCanvas(3840, 2160);

  for (const entry of data) {
    countries.push(new Node(entry.country, entry.years));
  }

  for (const key of Object.keys(params)) {
    gui.add(params, key, 0, 10, 1).onChange(() => {
      onParamsChange();
      if (socket) {
        socket.emit("params", { ...params });
      }
    });
  }

  onParamsChange();
  connectSocket();
}

function draw() {
  background(0);

  const matchingCountries = filteredCountries;
  const topMargin = 100;
  const gutter = 110;
  const posX = 650;

  if (matchingCountries.length === 0) {
    fill(200);
    textAlign(CENTER, CENTER);
    textSize(32);
    text("No countries match these parameters", width / 2, 200);
    return;
  }

  countryIndex = Math.max(0, Math.min(countryIndex, matchingCountries.length - 1));
  const activeCountry = matchingCountries[countryIndex];
  highlightedCountryName = activeCountry.country;

  let posY = topMargin;
  for (const country of matchingCountries) {
    country.setPosition(posX, posY);
    country.render(ALL_YEARS, { highlighted: country.country === highlightedCountryName });
    posY += gutter;
  }
}

function onParamsChange() {
  countries.forEach((node) => {
    node.findMatchingYear(params);
  });

  filteredCountries = countries.filter((country) => country.closest && country.closest.year !== null);

  if (filteredCountries.length === 0) {
    countryIndex = 0;
    highlightedCountryName = "";
    publishCountryState();
    console.log(`stfeco: ${params.stfeco}, stflife: ${params.stflife}, stfgov: ${params.stfgov} → 0 countries`);
    return;
  }

  const selectedIndex = filteredCountries.findIndex((country) => country.country === highlightedCountryName);
  if (selectedIndex >= 0) {
    countryIndex = selectedIndex;
  } else {
    countryIndex = 0;
    highlightedCountryName = filteredCountries[0].country;
  }

  publishCountryState();

  const matchingCount = filteredCountries.length;
  console.log(
    `stfeco: ${params.stfeco}, stflife: ${params.stflife}, stfgov: ${params.stfgov} → ${matchingCount} countries`,
  );
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
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
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

    const selectedIndex = filteredCountries.findIndex((country) => country.country === incoming.country);
    if (selectedIndex >= 0) {
      countryIndex = selectedIndex;
      highlightedCountryName = incoming.country;
      publishCountryState();
    }
  });
}