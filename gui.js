const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

const socket = io(SERVER_URL);

const params = {
  stfeco: 5,
  stflife: 5,
  stfgov: 5,
};

let countries = [];
let selectedCountryIndex = 0;

const statusEl = document.getElementById("status");
const countryDisplayEl = document.getElementById("country-display");
const countryNameEl = document.getElementById("country-name");
const countryMetaEl = document.getElementById("country-meta");
const prevCountryButton = document.getElementById("prev-country");
const nextCountryButton = document.getElementById("next-country");

function setConnectionStatus(connected) {
  statusEl.textContent = connected ? "connected" : "disconnected";
  statusEl.classList.toggle("connected", connected);
  statusEl.classList.toggle("disconnected", !connected);
}

function updateSliderDisplay(key) {
  document.getElementById(`${key}-val`).textContent = params[key];
  document.getElementById(key).value = params[key];
}

function syncSliders() {
  ["stfeco", "stflife", "stfgov"].forEach(updateSliderDisplay);
}

function renderCountry(direction = "none") {
  if (countries.length === 0) {
    countryNameEl.textContent = "No matching countries";
    countryMetaEl.textContent = "0 / 0";
    prevCountryButton.disabled = true;
    nextCountryButton.disabled = true;
    return;
  }

  selectedCountryIndex = Math.max(0, Math.min(selectedCountryIndex, countries.length - 1));
  const selectedCountry = countries[selectedCountryIndex];

  countryNameEl.textContent = selectedCountry;
  countryMetaEl.textContent = `${selectedCountryIndex + 1} / ${countries.length}`;
  prevCountryButton.disabled = countries.length <= 1;
  nextCountryButton.disabled = countries.length <= 1;

  countryDisplayEl.classList.remove("move-left", "move-right");
  void countryDisplayEl.offsetWidth;

  if (direction === "prev") {
    countryDisplayEl.classList.add("move-left");
  }

  if (direction === "next") {
    countryDisplayEl.classList.add("move-right");
  }
}

function applyCountryState(state, direction = "none") {
  countries = Array.isArray(state?.countries) ? state.countries : [];

  if (countries.length === 0) {
    selectedCountryIndex = 0;
    renderCountry();
    return;
  }

  if (typeof state?.activeIndex === "number" && state.activeIndex >= 0) {
    selectedCountryIndex = state.activeIndex;
  } else if (typeof state?.activeCountry === "string") {
    const activeIndex = countries.indexOf(state.activeCountry);
    selectedCountryIndex = activeIndex >= 0 ? activeIndex : 0;
  } else {
    selectedCountryIndex = Math.max(0, Math.min(selectedCountryIndex, countries.length - 1));
  }

  renderCountry(direction);
}

function emitCountrySelection(direction) {
  if (countries.length === 0) return;

  if (direction === "prev") {
    selectedCountryIndex = (selectedCountryIndex - 1 + countries.length) % countries.length;
  }

  if (direction === "next") {
    selectedCountryIndex = (selectedCountryIndex + 1) % countries.length;
  }

  renderCountry(direction);
  socket.emit("country-selection", {
    country: countries[selectedCountryIndex],
    index: selectedCountryIndex,
  });
}

Object.keys(params).forEach((key) => {
  const slider = document.getElementById(key);

  slider.addEventListener("input", function () {
    params[key] = Number(this.value);
    updateSliderDisplay(key);
    socket.emit("params", { ...params });
  });
});

prevCountryButton.addEventListener("click", () => emitCountrySelection("prev"));
nextCountryButton.addEventListener("click", () => emitCountrySelection("next"));

socket.on("connect", () => {
  setConnectionStatus(true);
  socket.emit("params", { ...params });
  socket.emit("request-country-state");
});

socket.on("disconnect", () => setConnectionStatus(false));

socket.on("params", (incoming) => {
  Object.assign(params, incoming);
  syncSliders();
});

socket.on("country-state", (incoming) => {
  applyCountryState(incoming);
});

syncSliders();
renderCountry();