// ---------- Config ----------

const DEFAULT_NAME = "Quode Palette";
const BDAY_SEEN_KEY = "quode_bday_seen";
const BDAY_MONTH = 10; // November (0-indexed)
const BDAY_DAY = 18;
const BDAY_LABEL = "🎂 Developer's Birthday";
const NAME_KEY = "quode_name";
const STORAGE_KEY = "quode_shortcuts";
const NOTES_KEY = "quode_notes";
const WEATHER_LOC_KEY = "quode_weather_loc";
const WEATHER_CACHE_KEY = "quode_weather_cache";
const WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 min
const NEWS_CACHE_KEY = "quode_news_cache";

const FALLBACK_LINES = [
  "Ghana was the first sub-Saharan African country to gain independence, on March 6, 1957.",
  "Kwame Nkrumah became Ghana's first president in 1960, after leading it to independence in 1957.",
  "Accra, Ghana's capital, sits right on the Gulf of Guinea coastline.",
  "The Ashanti Kingdom, centered in Kumasi, was one of West Africa's most powerful pre-colonial states.",
  "Ghana was formerly known as the Gold Coast under British colonial rule.",
  "Cape Coast Castle stands today as a preserved reminder of the trans-Atlantic slave trade's history.",
  "The Akosombo Dam on the Volta River created Lake Volta, one of the world's largest man-made lakes.",
  "Ghana's national football team, the Black Stars, has reached the FIFA World Cup four times.",
  "Independence Square in Accra hosts Ghana's Independence Day celebrations every March 6th.",
  "Ghana is one of the world's leading producers of cocoa, a cornerstone of its economy.",
];

const GHANA_KEYWORDS = [
  "ghana", "ghanaian", "accra", "kumasi", "tamale", "sekondi", "takoradi",
  "tema", "cape coast", "gold coast", "ashanti", "asante", "kwame nkrumah",
  "nkrumah", "volta", "akosombo", "elmina", "koforidua", "bolgatanga",
];

// ---------- Storage helpers ----------

function getStorage(key = STORAGE_KEY) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (res) => resolve(res[key]));
    } else {
      // Fallback for previewing outside the extension context
      try {
        resolve(JSON.parse(localStorage.getItem(key)));
      } catch {
        resolve(undefined);
      }
    }
  });
}

function setStorage(value, key = STORAGE_KEY) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: value }, resolve);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
      resolve();
    }
  });
}

// ---------- State ----------

let shortcuts = [];
let pendingDeleteId = null;
let userName = DEFAULT_NAME;
let notesText = "";

// ---------- Clock & greeting ----------

function pad(n) {
  return n.toString().padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  document.getElementById("time").textContent = `${hours}:${minutes}:${seconds} ${ampm}`;

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  document.getElementById("date").textContent = dateStr;
}

function updateGreeting() {
  if (document.querySelector("#greetingName input")) return; // mid-edit
  const hour = new Date().getHours();
  let greeting;
  if (hour < 5) greeting = "Still up, ";
  else if (hour < 12) greeting = "Good morning, ";
  else if (hour < 17) greeting = "Good afternoon, ";
  else if (hour < 22) greeting = "Good evening, ";
  else greeting = "Good night, ";
  document.getElementById("greetingPrefix").textContent = greeting;
  document.getElementById("greetingName").textContent = userName;
}

// Click the pencil to rename; Enter / blur saves, Escape cancels.
function startNameEdit() {
  const nameEl = document.getElementById("greetingName");
  const editBtn = document.getElementById("nameEdit");
  if (nameEl.querySelector("input")) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "name-input";
  input.value = userName;
  input.maxLength = 30;
  input.setAttribute("aria-label", "Your name");
  nameEl.textContent = "";
  nameEl.appendChild(input);
  editBtn.style.display = "none";
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (save) {
      userName = input.value.trim() || DEFAULT_NAME;
      await setStorage(userName, NAME_KEY);
    }
    input.remove();
    editBtn.style.display = "";
    updateGreeting();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") { e.stopPropagation(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

document.getElementById("nameEdit").addEventListener("click", startNameEdit);

// ---------- Birthday surprise ----------

function isBirthdayToday() {
  const n = new Date();
  return n.getMonth() === BDAY_MONTH && n.getDate() === BDAY_DAY;
}

const CONFETTI_COLORS = ["#ff6ec7", "#8b7cff", "#4ee1e8", "#ffd27a", "#ff8a5c", "#7dff9b", "#ffffff"];
const confettiCanvas = document.getElementById("confettiCanvas");
const confettiCtx = confettiCanvas.getContext("2d");
let confettiPieces = [];
let confettiRunning = false;
let confettiDeadline = 0; // everything fades out and stops by this time
const CONFETTI_MS = 3000;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sizeConfetti() {
  confettiCanvas.width = window.innerWidth * devicePixelRatio;
  confettiCanvas.height = window.innerHeight * devicePixelRatio;
}
window.addEventListener("resize", sizeConfetti);
sizeConfetti();

function spawnConfetti(x, y, count, angle, spread, power) {
  const dpr = devicePixelRatio;
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = (Math.random() * 0.6 + 0.4) * power * dpr;
    confettiPieces.push({
      x: x * dpr, y: y * dpr,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: (Math.random() * 7 + 5) * dpr, h: (Math.random() * 4 + 3) * dpr,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 0,
    });
  }
  startConfettiLoop();
}

function confettiBurst() {
  const w = window.innerWidth, h = window.innerHeight;
  spawnConfetti(0, h, 110, -Math.PI / 3, 0.9, 24);
  spawnConfetti(w, h, 110, -Math.PI * 2 / 3, 0.9, 24);
  spawnConfetti(w / 2, h * 0.4, 70, -Math.PI / 2, 6.28, 14);
}

function startConfettiLoop() {
  confettiDeadline = Math.max(confettiDeadline, Date.now() + CONFETTI_MS);
  if (confettiRunning) return;
  confettiRunning = true;
  requestAnimationFrame(confettiTick);
}

function confettiTick() {
  const W = confettiCanvas.width, H = confettiCanvas.height;
  const left = confettiDeadline - Date.now();
  confettiCtx.clearRect(0, 0, W, H);
  if (left <= 0) {
    confettiPieces = [];
    confettiRunning = false;
    return;
  }
  confettiCtx.globalAlpha = Math.min(1, left / 700); // fade out over the last 0.7s
  for (const p of confettiPieces) {
    p.vy += 0.17 * devicePixelRatio;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
    confettiCtx.restore();
  }
  confettiCtx.globalAlpha = 1;
  requestAnimationFrame(confettiTick);
}

const WISH_TEXT = "Here's to the Developer! Great code, bright colors, big wins. 🎨";
const WISH_SENT_KEY = "quode_wish_sent";

const bdayOverlay = document.getElementById("birthdayOverlay");

function closeBirthdayCard() {
  bdayOverlay.classList.remove("open");
}

async function playBirthday({ showCard }) {
  document.body.classList.add("birthday");
  document.title = "🎂 Quode Palette Home";
  if (!prefersReducedMotion) {
    confettiBurst();
    startConfettiLoop();
  }
  if (showCard) {
    // The wish is only offered on the real day, and only once per year.
    const wishBtn = document.getElementById("bdayWishBtn");
    const wishEl = document.getElementById("bdayWish");
    const realDay = isBirthdayToday();
    const sent = (await getStorage(WISH_SENT_KEY)) === new Date().getFullYear();
    wishBtn.hidden = !realDay || sent;
    wishEl.textContent = realDay && sent ? WISH_TEXT : "";
    bdayOverlay.classList.add("open");
  }
}

document.getElementById("bdayClose").addEventListener("click", closeBirthdayCard);
bdayOverlay.addEventListener("click", (e) => { if (e.target === bdayOverlay) closeBirthdayCard(); });
document.getElementById("bdayWishBtn").addEventListener("click", async (e) => {
  e.currentTarget.hidden = true;
  document.getElementById("bdayWish").textContent = WISH_TEXT;
  await setStorage(new Date().getFullYear(), WISH_SENT_KEY);
  if (!prefersReducedMotion) confettiBurst();
});
document.getElementById("bdayPreviewBtn").addEventListener("click", () => {
  settingsOverlay.classList.remove("open");
  playBirthday({ showCard: true });
});

async function checkBirthday() {
  if (!isBirthdayToday()) return;
  const year = new Date().getFullYear();
  const seen = await getStorage(BDAY_SEEN_KEY);
  // Full card once per year; confetti on every new tab that day.
  playBirthday({ showCard: seen !== year });
  if (seen !== year) await setStorage(year, BDAY_SEEN_KEY);
}

// ---------- Day line: today-in-history / quote ----------

async function updateDayLine() {
  const el = document.getElementById("dayLine");
  if (isBirthdayToday()) {
    el.textContent = "🎂 Today is the Developer's birthday!";
    return;
  }
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`
    );
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    const allEvents = (data.events || []).filter((e) => e.year && e.text);

    const ghanaEvents = allEvents.filter((e) => {
      const haystack = e.text.toLowerCase();
      return GHANA_KEYWORDS.some((kw) => haystack.includes(kw));
    });

    if (ghanaEvents.length === 0) throw new Error("no ghana events today");
    const pick = ghanaEvents[Math.floor(Math.random() * ghanaEvents.length)];
    el.textContent = `On this day, ${pick.year}: ${pick.text}`;
  } catch {
    const pick = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
    el.textContent = pick;
  }
}

// ---------- Weather ----------

const WEATHER_CODES = {
  0: "☀️ Clear",
  1: "🌤️ Mostly clear",
  2: "⛅ Partly cloudy",
  3: "☁️ Overcast",
  45: "🌫️ Foggy",
  48: "🌫️ Foggy",
  51: "🌦️ Drizzle",
  53: "🌦️ Drizzle",
  55: "🌦️ Drizzle",
  61: "🌧️ Rain",
  63: "🌧️ Rain",
  65: "🌧️ Heavy rain",
  71: "🌨️ Snow",
  73: "🌨️ Snow",
  75: "❄️ Heavy snow",
  80: "🌦️ Showers",
  81: "🌦️ Showers",
  82: "🌧️ Heavy showers",
  95: "⛈️ Thunderstorm",
  96: "⛈️ Thunderstorm",
  99: "⛈️ Thunderstorm",
};

function weatherLabel(code) {
  return WEATHER_CODES[code] || "🌡️ Weather";
}

async function fetchWeather(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
  );
  if (!res.ok) throw new Error("weather fetch failed");
  const data = await res.json();
  return {
    temp: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    fetchedAt: Date.now(),
  };
}

function renderWeather(weather) {
  const pill = document.getElementById("weatherPill");
  const content = document.getElementById("weatherContent");
  pill.classList.add("active");
  const [icon, ...rest] = weatherLabel(weather.code).split(" ");
  content.textContent = `${icon} ${weather.temp}°C`;
}

async function loadWeather(forceRefresh = false) {
  const loc = await getStorage(WEATHER_LOC_KEY);
  if (!loc) return; // not granted yet

  const cached = await getStorage(WEATHER_CACHE_KEY);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS) {
    renderWeather(cached);
    return;
  }

  try {
    const weather = await fetchWeather(loc.lat, loc.lon);
    await setStorage(weather, WEATHER_CACHE_KEY);
    renderWeather(weather);
  } catch {
    if (cached) renderWeather(cached);
  }
}

function requestWeatherLocation() {
  const content = document.getElementById("weatherContent");
  if (!navigator.geolocation) {
    content.textContent = "Unsupported";
    return;
  }
  content.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      await setStorage(loc, WEATHER_LOC_KEY);
      await loadWeather(true);
    },
    () => {
      content.textContent = "Add weather";
    },
    { timeout: 8000 }
  );
}

document.getElementById("weatherPill").addEventListener("click", () => {
  requestWeatherLocation();
});

document.getElementById("weatherResetBtn").addEventListener("click", () => {
  requestWeatherLocation();
});

// ---------- URL helpers ----------

function normalizeUrl(raw) {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Ordered fallback chain for favicon sources. Third-party favicon aggregators
// (Google's s2/favicons, DuckDuckGo's ip3) get blocked outright by some
// ad/privacy blockers since favicon lookups are a known tracking vector — so
// a site's own /favicon.ico goes first since it's a first-party request no
// blocker has a reason to touch, then we fall back to aggregators, then a
// monogram if every source fails.
function faviconSources(url) {
  const host = getHostname(url);
  return [
    `https://${host}/favicon.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ];
}

function setTileIcon(img, iconWrap, name, sources, i = 0) {
  if (i >= sources.length) {
    iconWrap.classList.add("monogram");
    iconWrap.textContent = name.trim().charAt(0).toUpperCase() || "?";
    img.remove();
    return;
  }
  img.onerror = () => setTileIcon(img, iconWrap, name, sources, i + 1);
  img.src = sources[i];
}

// ---------- Rendering ----------

function sortedShortcuts() {
  return [...shortcuts].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function renderShortcuts() {
  const grid = document.getElementById("shortcutsGrid");
  grid.innerHTML = "";

  sortedShortcuts().forEach((sc, i) => {
    const tile = document.createElement("a");
    tile.className = "tile" + (sc.pinned ? " is-pinned" : "");
    tile.href = sc.url;
    tile.style.animationDelay = `${Math.min(i * 0.03, 0.4)}s`;
    tile.setAttribute("data-id", sc.id);

    const iconWrap = document.createElement("div");
    iconWrap.className = "tile-icon";
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    iconWrap.appendChild(img);
    setTileIcon(img, iconWrap, sc.name, faviconSources(sc.url));

    const label = document.createElement("div");
    label.className = "tile-label";
    label.textContent = sc.name;

    const actions = document.createElement("div");
    actions.className = "tile-actions";

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "tile-action-btn pin" + (sc.pinned ? " pinned" : "");
    pinBtn.title = sc.pinned ? "Unpin" : "Pin to top";
    pinBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="${sc.pinned ? "currentColor" : "none"}"><path d="M12 2l2.5 6.5L21 10l-5.5 4 1.5 8-5-4.5-5 4.5 1.5-8L3 10l6.5-1.5L12 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    pinBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = shortcuts.findIndex((s) => s.id === sc.id);
      if (idx !== -1) {
        shortcuts[idx] = { ...shortcuts[idx], pinned: !shortcuts[idx].pinned };
        await setStorage(shortcuts);
        renderShortcuts();
      }
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "tile-action-btn edit";
    editBtn.title = "Edit";
    editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(sc);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "tile-action-btn delete";
    delBtn.title = "Delete";
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    delBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      askDelete(sc);
    });

    actions.appendChild(pinBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    tile.appendChild(iconWrap);
    tile.appendChild(label);
    tile.appendChild(actions);
    grid.appendChild(tile);
  });

  // Add tile always last
  const addTile = document.createElement("button");
  addTile.type = "button";
  addTile.className = "tile add-tile";
  addTile.innerHTML = `
    <div class="tile-icon">+</div>
    <div class="tile-label">Add</div>
  `;
  addTile.addEventListener("click", () => openModal(null));
  grid.appendChild(addTile);
}

// ---------- Modal (add / edit) ----------

const modalOverlay = document.getElementById("modalOverlay");
const shortcutForm = document.getElementById("shortcutForm");
const nameInput = document.getElementById("shortcutName");
const urlInput = document.getElementById("shortcutUrl");
const idInput = document.getElementById("shortcutId");
const modalTitle = document.getElementById("modalTitle");

function openModal(existing) {
  modalOverlay.classList.add("open");
  if (existing) {
    modalTitle.textContent = "Edit shortcut";
    nameInput.value = existing.name;
    urlInput.value = existing.url;
    idInput.value = existing.id;
  } else {
    modalTitle.textContent = "Add shortcut";
    shortcutForm.reset();
    idInput.value = "";
  }
  setTimeout(() => nameInput.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove("open");
}

document.getElementById("modalCancel").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

shortcutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value);
  const id = idInput.value;

  if (id) {
    const idx = shortcuts.findIndex((s) => s.id === id);
    if (idx !== -1) shortcuts[idx] = { ...shortcuts[idx], name, url };
  } else {
    shortcuts.push({ id: "s" + Date.now(), name, url });
  }

  await setStorage(shortcuts);
  renderShortcuts();
  closeModal();
});

// ---------- Delete confirm ----------

const confirmToast = document.getElementById("confirmToast");
const confirmText = document.getElementById("confirmText");

function askDelete(sc) {
  pendingDeleteId = sc.id;
  confirmText.textContent = `Delete "${sc.name}"?`;
  confirmToast.classList.add("open");
}

document.getElementById("confirmCancel").addEventListener("click", () => {
  pendingDeleteId = null;
  confirmToast.classList.remove("open");
});

document.getElementById("confirmDelete").addEventListener("click", async () => {
  if (pendingDeleteId) {
    shortcuts = shortcuts.filter((s) => s.id !== pendingDeleteId);
    await setStorage(shortcuts);
    renderShortcuts();
  }
  pendingDeleteId = null;
  confirmToast.classList.remove("open");
});

// ---------- Mini calendar ----------

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const today = new Date();
let calViewYear = today.getFullYear();
let calViewMonth = today.getMonth(); // 0-indexed

// ---------- Holidays ----------
// Ghana + USA public holidays, merged into one list (no country labels).
// Computed for any year, so no yearly updates are needed.

function nthWeekday(year, month, weekday, n) {
  // n-th (1-based) given weekday of month; n = -1 means the last one
  if (n > 0) {
    const first = new Date(year, month, 1).getDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const last = new Date(year, month + 1, 0);
  return last.getDate() - ((last.getDay() - weekday + 7) % 7);
}

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Islamic holidays via the Umm al-Qura calendar (can differ by ~1 day from
// local moon-sighting announcements).
function islamicHolidays(year) {
  const out = [];
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric",
    });
  } catch { return out; }
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const parts = {};
    fmt.formatToParts(d).forEach((p) => { parts[p.type] = parseInt(p.value, 10); });
    if (parts.month === 10 && parts.day === 1) {
      out.push({ m: d.getMonth(), d: d.getDate(), name: "Eid al-Fitr" });
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      out.push({ m: next.getMonth(), d: next.getDate(), name: "Shaqq Day" });
    }
    if (parts.month === 12 && parts.day === 10) {
      out.push({ m: d.getMonth(), d: d.getDate(), name: "Eid al-Adha" });
    }
  }
  return out;
}

const holidayCache = {};

function holidaysForYear(year) {
  if (holidayCache[year]) return holidayCache[year];
  const list = [];
  const add = (m, d, name) => list.push({ m, d, name });

  // Fixed dates
  add(0, 1, "New Year's Day");
  add(0, 7, "Constitution Day");
  add(2, 6, "Independence Day");
  add(4, 1, "Labour Day");
  add(5, 19, "Juneteenth");
  add(6, 1, "Republic Day");
  add(6, 4, "Independence Day");
  add(8, 21, "Founders' Day");
  add(10, 11, "Veterans Day");
  add(BDAY_MONTH, BDAY_DAY, BDAY_LABEL);
  add(11, 25, "Christmas Day");
  add(11, 26, "Boxing Day");

  // Weekday-based
  add(0, nthWeekday(year, 0, 1, 3), "Martin Luther King Jr. Day");
  add(1, nthWeekday(year, 1, 1, 3), "Presidents' Day");
  add(4, nthWeekday(year, 4, 1, -1), "Memorial Day");
  add(8, nthWeekday(year, 8, 1, 1), "Labor Day");
  add(9, nthWeekday(year, 9, 1, 2), "Columbus Day");
  add(10, nthWeekday(year, 10, 4, 4), "Thanksgiving");
  add(11, nthWeekday(year, 11, 5, 1), "Farmers' Day");

  // Easter-based
  const easter = easterSunday(year);
  const offset = (days) => new Date(year, easter.getMonth(), easter.getDate() + days);
  const gf = offset(-2), em = offset(1);
  add(gf.getMonth(), gf.getDate(), "Good Friday");
  add(em.getMonth(), em.getDate(), "Easter Monday");

  islamicHolidays(year).forEach((h) => add(h.m, h.d, h.name));

  // Merge names that fall on the same day
  const byDay = {};
  list.forEach((h) => {
    const key = `${h.m}-${h.d}`;
    (byDay[key] = byDay[key] || []);
    if (!byDay[key].includes(h.name)) byDay[key].push(h.name);
  });
  holidayCache[year] = byDay;
  return byDay;
}

function renderCalendar() {
  document.getElementById("calMonthLabel").textContent =
    `${MONTH_LABELS[calViewMonth]} ${calViewYear}`;

  const weekdaysEl = document.getElementById("calWeekdays");
  weekdaysEl.innerHTML = WEEKDAY_LABELS.map((d) => `<span>${d}</span>`).join("");

  const gridEl = document.getElementById("calGrid");
  gridEl.innerHTML = "";

  const firstOfMonth = new Date(calViewYear, calViewMonth, 1);
  // Convert JS Sunday-first (0-6) to Monday-first offset (0-6)
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  for (let i = 0; i < leadingBlanks; i++) {
    const span = document.createElement("span");
    span.className = "other-month";
    span.textContent = "•";
    gridEl.appendChild(span);
  }

  const isCurrentMonth =
    calViewYear === today.getFullYear() && calViewMonth === today.getMonth();
  const holidays = holidaysForYear(calViewYear);
  const listEl = document.getElementById("holidayList");
  listEl.innerHTML = "";

  for (let d = 1; d <= daysInMonth; d++) {
    const span = document.createElement("span");
    span.textContent = d;
    if (isCurrentMonth && d === today.getDate()) {
      span.classList.add("is-today");
    }
    const names = holidays[`${calViewMonth}-${d}`];
    if (names) {
      const isBday = names.includes(BDAY_LABEL);
      span.classList.add(isBday ? "is-birthday" : "is-holiday");
      span.title = names.join(" / ");
      const row = document.createElement("div");
      row.className = "holiday-item" + (isBday ? " birthday" : "");
      row.innerHTML = `<b>${d}</b><span></span>`;
      row.lastChild.textContent = names.join(" / ");
      listEl.appendChild(row);
    }
    gridEl.appendChild(span);
  }
}

document.getElementById("calPrev").addEventListener("click", () => {
  calViewMonth--;
  if (calViewMonth < 0) {
    calViewMonth = 11;
    calViewYear--;
  }
  renderCalendar();
});

document.getElementById("calNext").addEventListener("click", () => {
  calViewMonth++;
  if (calViewMonth > 11) {
    calViewMonth = 0;
    calViewYear++;
  }
  renderCalendar();
});

// ---------- World news ----------

async function fetchNews() {
  // Fetched directly — the "https://feeds.bbci.co.uk/*" host_permission in
  // manifest.json lets the extension bypass CORS for this origin, so no
  // third-party proxy (which was the old, flaky failure point) is needed.
  const feedUrl = "https://feeds.bbci.co.uk/news/world/rss.xml";
  const res = await fetch(feedUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("news fetch failed");
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");

  if (doc.querySelector("parsererror")) throw new Error("bad XML payload");

  const items = Array.from(doc.querySelectorAll("item"))
    .slice(0, 5)
    .map((item) => ({
      title: item.querySelector("title")?.textContent?.trim() || "Untitled",
      link: item.querySelector("link")?.textContent?.trim() || "#",
    }));

  if (items.length === 0) throw new Error("no items found");

  return { items, fetchedAt: Date.now() };
}

function headlinesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((item, i) => item.title === b[i].title && item.link === b[i].link);
}

function renderNews(news) {
  const list = document.getElementById("newsList");
  list.innerHTML = "";
  news.items.forEach((item) => {
    const a = document.createElement("a");
    a.className = "news-item";
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = item.title;
    list.appendChild(a);
  });
  updateNewsTimestamp(news.fetchedAt);
}

function renderNewsError(message) {
  const list = document.getElementById("newsList");
  list.innerHTML = `<div class="news-empty">Couldn't load headlines — <a href="https://news.google.com" target="_blank" rel="noopener">open Google News</a></div>`;
  const updatedEl = document.getElementById("newsUpdated");
  updatedEl.textContent = message || "Couldn't refresh";
  updatedEl.classList.add("error");
}

function relativeTime(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 minute ago";
  if (mins < 60) return `Updated ${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "Updated 1 hour ago" : `Updated ${hrs} hours ago`;
}

function updateNewsTimestamp(fetchedAt) {
  const updatedEl = document.getElementById("newsUpdated");
  updatedEl.classList.remove("error");
  updatedEl.textContent = relativeTime(fetchedAt);
  updatedEl.dataset.fetchedAt = fetchedAt;
}

// Briefly shows a status message (e.g. "No new headlines"), then reverts
// to the normal relative-time display once it expires.
function flashNewsStatus(text) {
  const updatedEl = document.getElementById("newsUpdated");
  updatedEl.classList.remove("error");
  updatedEl.textContent = text;
  const fetchedAt = Number(updatedEl.dataset.fetchedAt) || Date.now();
  clearTimeout(flashNewsStatus._t);
  flashNewsStatus._t = setTimeout(() => {
    updatedEl.textContent = relativeTime(fetchedAt);
  }, 2500);
}

async function loadNews(forceRefresh = false) {
  const refreshBtn = document.getElementById("newsRefresh");
  const cached = await getStorage(NEWS_CACHE_KEY);

  // Instant paint from cache so the panel never sits empty while we fetch.
  if (cached) renderNews(cached);

  // Avoid duplicate network calls on back-to-back reloads within a few seconds,
  // but otherwise always fetch fresh — cache is only a fast first-paint, not a gate.
  const MIN_REFETCH_MS = 20 * 1000;
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MIN_REFETCH_MS) {
    return;
  }

  refreshBtn.classList.add("spinning");
  refreshBtn.disabled = true;

  try {
    const news = await fetchNews();

    if (cached && headlinesEqual(cached.items, news.items)) {
      // Content is identical to what's already shown — don't claim an
      // "update" happened. Keep the original fetchedAt (content age) and
      // just flash a status confirming the check ran.
      flashNewsStatus("No new headlines");
    } else {
      await setStorage(news, NEWS_CACHE_KEY);
      renderNews(news);
    }
  } catch (err) {
    console.error("News refresh failed:", err);
    if (cached) {
      const updatedEl = document.getElementById("newsUpdated");
      updatedEl.textContent = "Refresh failed — showing cached headlines";
      updatedEl.classList.add("error");
    } else {
      renderNewsError();
    }
  } finally {
    refreshBtn.classList.remove("spinning");
    refreshBtn.disabled = false;
  }
}

// Keep the "Updated X ago" label fresh without a full refetch
setInterval(() => {
  const updatedEl = document.getElementById("newsUpdated");
  if (updatedEl && updatedEl.dataset.fetchedAt && !updatedEl.classList.contains("error")) {
    updatedEl.textContent = relativeTime(Number(updatedEl.dataset.fetchedAt));
  }
}, 60 * 1000);

document.getElementById("newsRefresh").addEventListener("click", () => loadNews(true));

// ---------- Notes panel ----------

const notesPanel = document.getElementById("notesPanel");
const notesArea = document.getElementById("notesArea");
const notesSaved = document.getElementById("notesSaved");
const notesToggle = document.getElementById("notesToggle");
let notesSaveTimer = null;

async function initNotes() {
  const saved = await getStorage(NOTES_KEY);
  if (typeof saved === "string") {
    notesText = saved;
    notesArea.value = saved;
  }
}

notesArea.addEventListener("input", () => {
  clearTimeout(notesSaveTimer);
  notesSaved.classList.remove("show");
  notesSaveTimer = setTimeout(async () => {
    notesText = notesArea.value;
    await setStorage(notesText, NOTES_KEY);
    notesSaved.classList.add("show");
    setTimeout(() => notesSaved.classList.remove("show"), 1200);
  }, 500);
});

notesToggle.addEventListener("click", () => {
  const isOpen = notesPanel.classList.toggle("open");
  notesToggle.classList.toggle("active", isOpen);
  if (isOpen) setTimeout(() => notesArea.focus(), 150);
});

function closeNotes() {
  notesPanel.classList.remove("open");
  notesToggle.classList.remove("active");
}

document.getElementById("notesClose").addEventListener("click", closeNotes);

document.addEventListener("click", (e) => {
  if (!notesPanel.classList.contains("open")) return;
  const clickedInsidePanel = notesPanel.contains(e.target);
  const clickedToggle = notesToggle.contains(e.target);
  if (!clickedInsidePanel && !clickedToggle) closeNotes();
});

// ---------- Settings panel (import / export) ----------

const settingsOverlay = document.getElementById("settingsOverlay");
const settingsToggle = document.getElementById("settingsToggle");

settingsToggle.addEventListener("click", () => {
  settingsOverlay.classList.add("open");
});
document.getElementById("settingsClose").addEventListener("click", () => {
  settingsOverlay.classList.remove("open");
});
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = {
    app: "Quode Palette Home",
    version: 2,
    exportedAt: new Date().toISOString(),
    name: userName,
    shortcuts,
    notes: notesText,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quode-palette-home-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    // Accepts full backups, and older shortcuts-only files (array or {shortcuts})
    const data = Array.isArray(parsed) ? { shortcuts: parsed } : parsed;
    if (!data || typeof data !== "object") throw new Error("Invalid file format");

    const hasShortcuts = Array.isArray(data.shortcuts);
    const hasNotes = typeof data.notes === "string";
    const hasName = typeof data.name === "string" && data.name.trim();
    if (!hasShortcuts && !hasNotes && !hasName) throw new Error("No Quode Palette Home data found");

    if (!confirm("Importing will replace your current shortcuts and notes with the data in this file. Continue?")) return;

    if (hasShortcuts) {
      shortcuts = data.shortcuts
        .filter((s) => s && typeof s.name === "string" && typeof s.url === "string")
        .map((s) => ({
          id: s.id || "s" + Date.now() + Math.random().toString(36).slice(2, 7),
          name: s.name,
          url: s.url,
          pinned: !!s.pinned,
        }));
      await setStorage(shortcuts);
      renderShortcuts();
    }
    if (hasNotes) {
      notesText = data.notes;
      notesArea.value = notesText;
      await setStorage(notesText, NOTES_KEY);
    }
    if (hasName) {
      userName = data.name.trim().slice(0, 30);
      await setStorage(userName, NAME_KEY);
      updateGreeting();
    }
    settingsOverlay.classList.remove("open");
  } catch (err) {
    alert("Couldn't import that file: " + err.message);
  } finally {
    e.target.value = "";
  }
});

// ---------- Ambient particle animation ----------

function initParticles() {
  const canvas = document.getElementById("particleCanvas");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width, height, particles;
  const COLORS = ["139,124,255", "78,225,232", "255,110,199"];

  function resize() {
    width = canvas.width = window.innerWidth * devicePixelRatio;
    height = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }

  function makeParticles() {
    const count = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 22000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: (Math.random() * 1.6 + 0.6) * devicePixelRatio,
      speed: (Math.random() * 0.15 + 0.04) * devicePixelRatio,
      drift: (Math.random() - 0.5) * 0.12 * devicePixelRatio,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.006 + 0.002,
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.y -= p.speed;
      p.x += p.drift;
      p.phase += p.twinkleSpeed;
      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      const twinkle = (Math.sin(p.phase) + 1) / 2; // 0..1
      const alpha = 0.15 + twinkle * 0.35;

      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  makeParticles();
  window.addEventListener("resize", () => {
    resize();
    makeParticles();
  });

  if (!reduceMotion) {
    requestAnimationFrame(tick);
  } else {
    // draw a single static frame
    tick.__drawnOnce = true;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},0.25)`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- Keyboard shortcuts ----------

document.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement.tagName;
  const typingInField = activeTag === "INPUT" || activeTag === "TEXTAREA";

  if (modalOverlay.classList.contains("open")) {
    if (e.key === "Escape") closeModal();
    return;
  }

  if (bdayOverlay.classList.contains("open")) {
    if (e.key === "Escape") closeBirthdayCard();
    return;
  }

  if (settingsOverlay.classList.contains("open")) {
    if (e.key === "Escape") settingsOverlay.classList.remove("open");
    return;
  }

  if (e.key === "Escape") {
    confirmToast.classList.remove("open");
    closeNotes();
    return;
  }

  if (typingInField) return;

  if (e.key === "/") {
    e.preventDefault();
    document.getElementById("searchInput").focus();
  } else if (e.key.toLowerCase() === "n") {
    e.preventDefault();
    openModal(null);
  }
});

// ---------- Init ----------

async function init() {
  const storedName = await getStorage(NAME_KEY);
  if (typeof storedName === "string" && storedName.trim()) userName = storedName;

  updateClock();
  updateGreeting();
  updateDayLine();
  setInterval(updateClock, 1000);
  setInterval(updateGreeting, 60 * 1000);

  const stored = await getStorage();
  shortcuts = Array.isArray(stored) ? stored : [];
  renderShortcuts();

  initNotes();
  initParticles();
  loadWeather();
  renderCalendar();
  loadNews();
  checkBirthday();
}

init();
