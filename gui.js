// ============================================================================
// GUI CONTROLLER - Interactive interface for Shifting Democracies
// ============================================================================
// This script handles the controller UI in gui.html
// Features: parameter sliders, country navigation, socket communication
// ============================================================================

// Detect local vs cloud deployment
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;

// Connect to Socket.io server
const socket = io(SERVER_URL);

// Current filter parameters (synced with sketch.js)
const params = {
  stfeco: 5, // Satisfaction with economy
  stflife: 5, // Satisfaction with life
  stfgov: 5, // Satisfaction with government
};

// Array of countries from sketch (synced via socket)
let countries = [];

// Currently selected country index
let selectedCountryIndex = 0;

// ==== DOM REFERENCES ====
const statusEl = document.getElementById("status");
const countryDisplayEl = document.getElementById("country-display");
const countryNameEl = document.getElementById("country-name");
const countryMetaEl = document.getElementById("country-meta");
const prevCountryButton = document.getElementById("prev-country");
const nextCountryButton = document.getElementById("next-country");

// Update connection status display
function setConnectionStatus(connected) {
  statusEl.textContent = connected ? "connected" : "disconnected";
  statusEl.classList.toggle("connected", connected);
  statusEl.classList.toggle("disconnected", !connected);
}

// Update slider value display
function updateSliderDisplay(key) {
  document.getElementById(`${key}-val`).textContent = params[key];
  document.getElementById(key).value = params[key];
}

// Sync all sliders to match current params
function syncSliders() {
  ["stfeco", "stflife", "stfgov"].forEach(updateSliderDisplay);
}

// Render currently selected country in the display area
// direction: "prev", "next", or "none" - triggers slide animation
function renderCountry(direction = "none") {
  if (countries.length === 0) {
    countryNameEl.textContent = "No matching countries";
    countryMetaEl.textContent = "0 / 0";
    prevCountryButton.disabled = true;
    nextCountryButton.disabled = true;
    return;
  }

  // Ensure selected index is valid
  selectedCountryIndex = Math.max(
    0,
    Math.min(selectedCountryIndex, countries.length - 1),
  );
  const selectedCountry = countries[selectedCountryIndex];

  // Update display
  countryNameEl.textContent = selectedCountry;
  countryMetaEl.textContent = `${selectedCountryIndex + 1} / ${countries.length}`;
  prevCountryButton.disabled = countries.length <= 1;
  nextCountryButton.disabled = countries.length <= 1;

  // Trigger slide animation
  countryDisplayEl.classList.remove("move-left", "move-right");
  void countryDisplayEl.offsetWidth; // Force reflow to restart animation

  if (direction === "prev") {
    countryDisplayEl.classList.add("move-left");
  }

  if (direction === "next") {
    countryDisplayEl.classList.add("move-right");
  }
}

// Apply country state received from sketch via socket
function applyCountryState(state, direction = "none") {
  countries = Array.isArray(state?.countries) ? state.countries : [];

  if (countries.length === 0) {
    selectedCountryIndex = 0;
    renderCountry();
    return;
  }

  // Sync selection from sketch if available
  if (typeof state?.activeIndex === "number" && state.activeIndex >= 0) {
    selectedCountryIndex = state.activeIndex;
  } else if (typeof state?.activeCountry === "string") {
    const activeIndex = countries.indexOf(state.activeCountry);
    selectedCountryIndex = activeIndex >= 0 ? activeIndex : 0;
  } else {
    selectedCountryIndex = Math.max(
      0,
      Math.min(selectedCountryIndex, countries.length - 1),
    );
  }

  renderCountry(direction);
}

// Handle country selection navigation (prev/next buttons)
function emitCountrySelection(direction) {
  if (countries.length === 0) return;

  // Update index based on direction
  if (direction === "prev") {
    selectedCountryIndex =
      (selectedCountryIndex - 1 + countries.length) % countries.length;
  }

  if (direction === "next") {
    selectedCountryIndex = (selectedCountryIndex + 1) % countries.length;
  }

  renderCountry(direction);

  // Send selection to sketch via socket
  socket.emit("country-selection", {
    country: countries[selectedCountryIndex],
    index: selectedCountryIndex,
  });
}

// Handle arrow key navigation (ArrowLeft, ArrowRight)
function handleCountryKeydown(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  // Don't navigate if typing in input field
  const target = event.target;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }

  event.preventDefault();
  emitCountrySelection(event.key === "ArrowLeft" ? "prev" : "next");
}

// ==== SLIDER EVENT LISTENERS ====
// When user adjusts slider, update params and send to sketch
Object.keys(params).forEach((key) => {
  const slider = document.getElementById(key);

  slider.addEventListener("input", function () {
    params[key] = Number(this.value);
    updateSliderDisplay(key);
    socket.emit("params", { ...params }); // Broadcast to sketch
  });
});

// ==== COUNTRY NAVIGATION BUTTONS ====
prevCountryButton.addEventListener("click", () => emitCountrySelection("prev"));
nextCountryButton.addEventListener("click", () => emitCountrySelection("next"));

// ==== KEYBOARD NAVIGATION ====
window.addEventListener("keydown", handleCountryKeydown);

// ==== SOCKET EVENT HANDLERS ====
// When connecting to server
socket.on("connect", () => {
  setConnectionStatus(true);
  socket.emit("params", { ...params }); // Send initial params
  socket.emit("request-country-state"); // Request current country state
});

// When disconnecting from server
socket.on("disconnect", () => setConnectionStatus(false));

// When receiving parameter updates (from other clients)
socket.on("params", (incoming) => {
  Object.assign(params, incoming);
  syncSliders(); // Update UI to reflect new params
});

// When receiving country state (from sketch)
socket.on("country-state", (incoming) => {
  applyCountryState(incoming);
});

// ==== INITIALIZATION ====
syncSliders();
renderCountry();
