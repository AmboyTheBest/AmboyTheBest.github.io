const navigationLinks = document.querySelectorAll(
  ".sidebar a[href^='#']:not(.logout-link)"
);
const contentViews = document.querySelectorAll(".content-view");
const storageKey = "securehub.entries.v1";
const guessStorageKey = "securehub.guesses.v1";

let selectedMode = "timeIn";
let cameraStream = null;
let scannerActive = false;
let guessTimeIn = null;
let guessTimeOut = null;

const menuToggle = document.getElementById("menu-toggle");
const sidebar = document.getElementById("main-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function closeMobileMenu() {
  sidebar.classList.remove("is-open");
  sidebarBackdrop.hidden = true;
  document.body.classList.remove("sidebar-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation menu");
}

function toggleMobileMenu() {
  const isOpen = menuToggle.getAttribute("aria-expanded") !== "true";

  sidebar.classList.toggle("is-open", isOpen);
  sidebarBackdrop.hidden = !isOpen;
  document.body.classList.toggle("sidebar-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute(
    "aria-label",
    isOpen ? "Close navigation menu" : "Open navigation menu"
  );
}

menuToggle.addEventListener("click", toggleMobileMenu);
sidebarBackdrop.addEventListener("click", closeMobileMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    closeMobileMenu();
    menuToggle.focus();
  }
});

function showView(viewId) {
  const selectedView = document.getElementById(viewId);

  if (!selectedView || !selectedView.classList.contains("content-view")) {
    return;
  }

  window.history.replaceState(null, "", `#${viewId}`);

  contentViews.forEach((view) => {
    view.hidden = view !== selectedView;
  });

  navigationLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${viewId}`;
    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (viewId === "time-history") {
    renderHistory();
  }
}

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const viewId = link.getAttribute("href").slice(1);
    const view = document.getElementById(viewId);

    if (view && view.classList.contains("content-view")) {
      event.preventDefault();
      showView(viewId);
      closeMobileMenu();
    }
  });
});

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readEntries() {
  const storedEntries = localStorage.getItem(storageKey);

  if (storedEntries === null) {
    return {};
  }

  const entriesByDate = JSON.parse(storedEntries);
  const isValid =
    entriesByDate !== null &&
    typeof entriesByDate === "object" &&
    !Array.isArray(entriesByDate) &&
    Object.values(entriesByDate).every(
      (day) =>
        day !== null &&
        typeof day === "object" &&
        Array.isArray(day.entries)
    );

  if (!isValid) {
    throw new Error("Saved entry data has an unexpected format.");
  }

  return entriesByDate;
}

function readGuesses() {
  const storedGuesses = localStorage.getItem(guessStorageKey);

  if (storedGuesses === null) {
    return {};
  }

  const guessesByDate = JSON.parse(storedGuesses);
  const isValid =
    guessesByDate !== null &&
    typeof guessesByDate === "object" &&
    !Array.isArray(guessesByDate) &&
    Object.values(guessesByDate).every(
      (day) =>
        day !== null &&
        typeof day === "object" &&
        Array.isArray(day.guesses)
    );

  if (!isValid) {
    throw new Error("Saved Guess data has an unexpected format.");
  }

  return guessesByDate;
}

function setScanStatus(message) {
  document.getElementById("scan-status").textContent = message;
}

function setMode(mode) {
  selectedMode = mode;

  document.querySelectorAll(".mode-button").forEach((button) => {
    const isSelected = button.id === `${mode === "timeIn" ? "time-in" : "time-out"}-mode`;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  setScanStatus(`${mode === "timeIn" ? "Time In" : "Time Out"} mode selected. Ready to scan.`);
}

document.getElementById("time-in-mode").addEventListener("click", () => {
  setMode("timeIn");
});

document.getElementById("time-out-mode").addEventListener("click", () => {
  setMode("timeOut");
});

function refreshHistoryAfterSave() {
  if (!document.getElementById("time-history").hidden) {
    renderHistory();
  }
}

function recordEntry(rawId) {
  const id = rawId.trim();

  if (!/^\d{9}$/.test(id)) {
    setScanStatus("Invalid QR code: the code must contain exactly 9 digits.");
    return;
  }

  try {
    const entriesByDate = readEntries();
    const date = localDateKey();
    const day = entriesByDate[date] || { date, entries: [] };
    let entry = day.entries.find((item) => item.id === id);

    if (!entry) {
      entry = { id, timeIn: null, timeOut: null };
      day.entries.push(entry);
    }

    if (selectedMode === "timeIn") {
      if (entry.timeIn) {
        setScanStatus(`ID ${id} already has a Time In recorded for today.`);
        return;
      }

      entry.timeIn = new Date().toISOString();
    } else {
      if (!entry.timeIn) {
        setScanStatus(`ID ${id} needs a Time In before Time Out can be recorded.`);
        return;
      }

      if (entry.timeOut) {
        setScanStatus(`ID ${id} already has a Time Out recorded for today.`);
        return;
      }

      entry.timeOut = new Date().toISOString();
    }

    entriesByDate[date] = day;
    localStorage.setItem(storageKey, JSON.stringify(entriesByDate));
    setScanStatus(
      `${selectedMode === "timeIn" ? "Time In" : "Time Out"} recorded for ID ${id} at ${new Date().toLocaleTimeString()}.`
    );
    document.getElementById("entry-id").value = "";
    refreshHistoryAfterSave();
  } catch (error) {
    setScanStatus(`Could not save this entry in browser storage: ${error.message}`);
  }
}

document.getElementById("manual-entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  recordEntry(document.getElementById("entry-id").value);
});

function stopCamera() {
  scannerActive = false;

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  const video = document.getElementById("scanner-video");
  video.srcObject = null;
  video.hidden = true;
  document.getElementById("stop-camera").hidden = true;
  document.getElementById("start-camera").hidden = false;
}

document.getElementById("stop-camera").addEventListener("click", () => {
  stopCamera();
  setScanStatus("Camera stopped.");
});

document.getElementById("start-camera").addEventListener("click", async () => {
  if (!("BarcodeDetector" in window)) {
    setScanStatus("QR scanning is not supported by this browser. Try a current version of Chrome or Edge, or enter the 9-digit number below.");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScanStatus("Camera access is unavailable. Open this site on localhost or HTTPS, or enter the 9-digit number below.");
    return;
  }

  let detector;
  try {
    detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });

    const video = document.getElementById("scanner-video");
    video.srcObject = cameraStream;
    video.hidden = false;
    await video.play();

    scannerActive = true;
    document.getElementById("stop-camera").hidden = false;
    document.getElementById("start-camera").hidden = true;
    setScanStatus("Camera is on. Point it at a QR code containing exactly 9 digits.");
  } catch (error) {
    stopCamera();
    setScanStatus(`Could not start the QR scanner: ${error.message}`);
    return;
  }

  const video = document.getElementById("scanner-video");
  const detectQrCode = async () => {
    if (!scannerActive) {
      return;
    }

    try {
      const codes = await detector.detect(video);

      if (codes.length > 0) {
        stopCamera();
        recordEntry(codes[0].rawValue);
        return;
      }
    } catch (error) {
      stopCamera();
      setScanStatus(`QR scanning stopped because of an error: ${error.message}`);
      return;
    }

    window.setTimeout(detectQrCode, 250);
  };

  detectQrCode();
});

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
}

function renderHistory() {
  const dateSelect = document.getElementById("history-date");

  try {
    const entriesByDate = readEntries();
    const guessesByDate = readGuesses();
    const dates = [...new Set([
      ...Object.keys(entriesByDate),
      ...Object.keys(guessesByDate),
    ])].sort((a, b) => b.localeCompare(a));
    const previousDate = dateSelect.value;
    dateSelect.replaceChildren();

    if (dates.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved dates";
      dateSelect.append(option);
      dateSelect.disabled = true;
    } else {
      dateSelect.disabled = false;
      dates.forEach((date) => {
        const option = document.createElement("option");
        option.value = date;
        option.textContent = date;
        dateSelect.append(option);
      });

      dateSelect.value = dates.includes(previousDate) ? previousDate : dates[0];
    }

    renderTimeHistory(entriesByDate[dateSelect.value]);
    renderGuessHistory(guessesByDate[dateSelect.value]);
  } catch (error) {
    dateSelect.replaceChildren();
    dateSelect.disabled = true;
    document.getElementById("history-status").textContent =
      `Could not read saved time history: ${error.message}`;
    document.getElementById("guess-history-status").textContent =
      `Could not read saved Guess history: ${error.message}`;
  }
}

function renderTimeHistory(selectedDay) {
  const tableBody = document.getElementById("history-entries");
  const status = document.getElementById("history-status");
  tableBody.replaceChildren();

  const entries = selectedDay ? selectedDay.entries : [];
  entries.forEach((entry) => {
    const row = document.createElement("tr");
    [entry.id, formatTimestamp(entry.timeIn), formatTimestamp(entry.timeOut)].forEach(
      (value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
    );
    tableBody.append(row);
  });

  status.textContent =
    entries.length === 0
      ? "There are no time entries for this date."
      : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} for ${selectedDay.date}.`;
  document.getElementById("download-history").disabled = entries.length === 0;
}

function renderGuessHistory(selectedDay) {
  const tableBody = document.getElementById("guess-history-entries");
  const status = document.getElementById("guess-history-status");
  tableBody.replaceChildren();

  const guesses = selectedDay ? selectedDay.guesses : [];
  guesses.forEach((guess) => {
    const row = document.createElement("tr");
    [
      guess.name,
      guess.reason,
      guess.associatedStudent,
      guess.checker,
      formatGuessTime(guess.timeIn),
      formatGuessTime(guess.timeOut),
      formatTimestamp(guess.recordedAt),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    tableBody.append(row);
  });

  status.textContent =
    guesses.length === 0
      ? "There are no Guess records for this date."
      : `${guesses.length} ${guesses.length === 1 ? "Guess record" : "Guess records"} for ${selectedDay.date}.`;
  document.getElementById("download-guess-history").disabled = guesses.length === 0;
}

function formatGuessTime(timestamp) {
  if (!timestamp) {
    return "—";
  }

  if (/^\d{2}:\d{2}$/.test(timestamp)) {
    return timestamp;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "Invalid time"
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

document.getElementById("history-date").addEventListener("change", renderHistory);

function downloadHistoryJson(storageReader, collectionName, statusId) {
  try {
    const date = document.getElementById("history-date").value;
    const day = storageReader()[date];

    if (!day) {
      document.getElementById(statusId).textContent =
        `No saved ${collectionName} are available to download for this date.`;
      return;
    }

    const file = new Blob([JSON.stringify(day, null, 2)], {
      type: "application/json",
    });
    const downloadLink = document.createElement("a");
    const objectUrl = URL.createObjectURL(file);
    downloadLink.href = objectUrl;
    downloadLink.download = `${collectionName}-${date}.json`;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);
    document.getElementById(statusId).textContent =
      `Downloaded ${collectionName}-${date}.json.`;
  } catch (error) {
    document.getElementById(statusId).textContent =
      `Could not download the JSON file: ${error.message}`;
  }
}

document.getElementById("download-history").addEventListener("click", () => {
  downloadHistoryJson(readEntries, "Entry", "history-status");
});

document.getElementById("download-guess-history").addEventListener("click", () => {
  downloadHistoryJson(
    readGuesses,
    "Guess",
    "guess-history-status"
  );
});

function selectHistoryTab(tabName) {
  const isTimeTab = tabName === "time";
  const url = new URL(window.location.href);

  if (isTimeTab) {
    url.searchParams.delete("historyTab");
  } else {
    url.searchParams.set("historyTab", "guess");
  }

  window.history.replaceState(null, "", url);
  document.getElementById("time-history-tab").classList.toggle("selected", isTimeTab);
  document.getElementById("time-history-tab").setAttribute("aria-selected", String(isTimeTab));
  document.getElementById("time-history-panel").hidden = !isTimeTab;
  document.getElementById("guess-history-tab").classList.toggle("selected", !isTimeTab);
  document.getElementById("guess-history-tab").setAttribute("aria-selected", String(!isTimeTab));
  document.getElementById("guess-history-panel").hidden = isTimeTab;
  renderHistory();
}

document.getElementById("time-history-tab").addEventListener("click", () => {
  selectHistoryTab("time");
});

document.getElementById("guess-history-tab").addEventListener("click", () => {
  selectHistoryTab("guess");
});

function updateGuessTimeDisplay(type, timestamp) {
  const name = type === "timeIn" ? "Time In" : "Time Out";
  const displayId =
    type === "timeIn" ? "guess-time-in-display" : "guess-time-out-display";
  const display = document.getElementById(displayId);
  display.textContent = timestamp
    ? `${name} recorded at ${formatGuessTime(timestamp)}`
    : "Not recorded";
}

document.getElementById("guess-time-in-button").addEventListener("click", () => {
  guessTimeIn = new Date().toISOString();
  guessTimeOut = null;
  updateGuessTimeDisplay("timeIn", guessTimeIn);
  updateGuessTimeDisplay("timeOut", guessTimeOut);
  document.getElementById("guess-time-out-button").disabled = false;
  document.getElementById("guess-status").textContent =
    "Time In recorded automatically.";
});

document.getElementById("guess-time-out-button").addEventListener("click", () => {
  if (!guessTimeIn) {
    document.getElementById("guess-status").textContent =
      "Record Time In before Time Out.";
    return;
  }

  guessTimeOut = new Date().toISOString();
  updateGuessTimeDisplay("timeOut", guessTimeOut);
  document.getElementById("guess-status").textContent =
    "Time Out recorded automatically.";
});

document.getElementById("guess-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const guess = {
    name: document.getElementById("guess-name").value.trim(),
    reason: document.getElementById("guess-reason").value.trim(),
    associatedStudent: document.getElementById("associated-student").value.trim(),
    checker: document.getElementById("guess-checker").value,
    timeIn: guessTimeIn,
    timeOut: guessTimeOut,
    recordedAt: new Date().toISOString(),
  };

  if (
    !guess.name ||
    !guess.reason ||
    !guess.associatedStudent ||
    !guess.checker ||
    !guess.timeIn
  ) {
    document.getElementById("guess-status").textContent =
      "Please complete all required fields, including Time In.";
    return;
  }

  if (guess.timeOut && guess.timeOut <= guess.timeIn) {
    document.getElementById("guess-status").textContent =
      "Time Out must be later than Time In.";
    return;
  }

  try {
    const guessesByDate = readGuesses();
    const date = localDateKey();
    const day = guessesByDate[date] || { date, guesses: [] };
    day.guesses.push(guess);
    guessesByDate[date] = day;
    localStorage.setItem(guessStorageKey, JSON.stringify(guessesByDate));
    document.getElementById("guess-form").reset();
    guessTimeIn = null;
    guessTimeOut = null;
    updateGuessTimeDisplay("timeIn", guessTimeIn);
    updateGuessTimeDisplay("timeOut", guessTimeOut);
    document.getElementById("guess-time-out-button").disabled = true;
    document.getElementById("guess-status").textContent =
      `Guess record for ${guess.name} saved.`;
    if (!document.getElementById("time-history").hidden) {
      renderHistory();
    }
  } catch (error) {
    document.getElementById("guess-status").textContent =
      `Could not save this Guess record: ${error.message}`;
  }
});

window.addEventListener("beforeunload", stopCamera);
renderHistory();
const initialViewId = window.location.hash.slice(1);
const initialView = document.getElementById(initialViewId);
const viewToShow =
  initialView && initialView.classList.contains("content-view")
    ? initialViewId
    : "scan";
showView(viewToShow);

if (viewToShow === "time-history") {
  selectHistoryTab(
    new URLSearchParams(window.location.search).get("historyTab") === "guess"
      ? "guess"
      : "time"
  );
}
