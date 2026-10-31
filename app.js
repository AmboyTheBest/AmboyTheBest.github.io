const STORAGE_KEYS = { entries: 'securehub.entries.v1', guesses: 'securehub.guesses.v1' };
const ID_RE = /^\d{9}$/;
const state = { selectedMode: 'timeIn', cameraStream: null, scannerActive: false, guessTimeIn: null, guessRecordDate: null, guessRecordId: null, deleteMode: null, confirmDeletion: false };
const navLinks = [...document.querySelectorAll('.sidebar a[href^="#"]:not(.logout-link)')];
const contentViews = [...document.querySelectorAll('.content-view')];
const ui = {
  menuToggle: document.getElementById('menu-toggle'),
  sidebar: document.getElementById('main-sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  scanStatus: document.getElementById('scan-status'),
  entryId: document.getElementById('entry-id'),
  timeHistory: document.getElementById('time-history'),
  historyDate: document.getElementById('history-date'),
  historyStatus: document.getElementById('history-status'),
  guessHistoryStatus: document.getElementById('guess-history-status'),
  timeHistoryTab: document.getElementById('time-history-tab'),
  guessHistoryTab: document.getElementById('guess-history-tab'),
  timeHistoryPanel: document.getElementById('time-history-panel'),
  guessHistoryPanel: document.getElementById('guess-history-panel'),
  guessStatus: document.getElementById('guess-status'),
  guessTimeInDisplay: document.getElementById('guess-time-in-display'),
  guessTimeInButton: document.getElementById('guess-time-in-button'),
  startCamera: document.getElementById('start-camera'),
  stopCamera: document.getElementById('stop-camera'),
  scannerVideo: document.getElementById('scanner-video'),
  downloadHistory: document.getElementById('download-history'),
  downloadGuessHistory: document.getElementById('download-guess-history'),
  selectEntriesButton: document.getElementById('select-entries-button'),
  deleteSelectedButton: document.getElementById('delete-selected-button'),
  confirmDeleteEntriesButton: document.getElementById('confirm-delete-entries-button'),
  cancelDeleteButton: document.getElementById('cancel-delete-button'),
  selectGuessesButton: document.getElementById('select-guesses-button'),
  deleteSelectedGuessesButton: document.getElementById('delete-selected-guesses-button'),
  confirmDeleteGuessesButton: document.getElementById('confirm-delete-guesses-button'),
  cancelGuessDeleteButton: document.getElementById('cancel-guess-delete-button'),
};
const deleteControls = {
  entries: {
    key: STORAGE_KEYS.entries, collection: 'entries', selector: '#history-entries .entry-select:checked',
    status: ui.historyStatus, select: ui.selectEntriesButton, remove: ui.deleteSelectedButton,
    confirm: ui.confirmDeleteEntriesButton, cancel: ui.cancelDeleteButton,
  },
  guesses: {
    key: STORAGE_KEYS.guesses, collection: 'guesses', selector: '#guess-history-entries .guess-select:checked',
    status: ui.guessHistoryStatus, select: ui.selectGuessesButton, remove: ui.deleteSelectedGuessesButton,
    confirm: ui.confirmDeleteGuessesButton, cancel: ui.cancelGuessDeleteButton,
  },
};

function closeMobileMenu() {
  ui.sidebar.classList.remove('is-open');
  ui.sidebarBackdrop.hidden = true;
  document.body.classList.remove('sidebar-open');
  ui.menuToggle.setAttribute('aria-expanded', 'false');
  ui.menuToggle.setAttribute('aria-label', 'Open navigation menu');
}

function toggleMobileMenu() {
  const open = ui.menuToggle.getAttribute('aria-expanded') !== 'true';
  ui.sidebar.classList.toggle('is-open', open);
  ui.sidebarBackdrop.hidden = !open;
  document.body.classList.toggle('sidebar-open', open);
  ui.menuToggle.setAttribute('aria-expanded', String(open));
  ui.menuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
}

ui.menuToggle.addEventListener('click', toggleMobileMenu);
ui.sidebarBackdrop.addEventListener('click', closeMobileMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.menuToggle.getAttribute('aria-expanded') === 'true') {
    closeMobileMenu();
    ui.menuToggle.focus();
  }
});

function showView(id) {
  const view = document.getElementById(id);
  if (!view || !view.classList.contains('content-view')) return;

  window.history.replaceState(null, '', `#${id}`);
  contentViews.forEach((v) => (v.hidden = v !== view));
  navLinks.forEach((link) => {
    const active = link.getAttribute('href') === `#${id}`;
    link.classList.toggle('active', active);
    active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
  });
  if (id === 'time-history') renderHistory();
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    const view = document.getElementById(id);
    if (view && view.classList.contains('content-view')) {
      e.preventDefault();
      showView(id);
      closeMobileMenu();
    }
  });
});

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readStorage(key, itemName) {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};
  const parsed = JSON.parse(raw);
  const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.values(parsed).every((day) => day && typeof day === 'object' && Array.isArray(day[itemName]));
  if (!valid) throw new Error(`Saved ${itemName} data has an unexpected format.`);
  return parsed;
}

const readEntries = () => readStorage(STORAGE_KEYS.entries, 'entries');
const readGuesses = () => readStorage(STORAGE_KEYS.guesses, 'guesses');

function setScanStatus(msg) {
  ui.scanStatus.textContent = msg;
}

function setMode(mode) {
  state.selectedMode = mode;
  const inMode = mode === 'timeIn';
  document.querySelectorAll('.mode-button').forEach((btn) => {
    const active = btn.id === `${inMode ? 'time-in' : 'time-out'}-mode`;
    btn.classList.toggle('selected', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  setScanStatus(`${inMode ? 'Time In' : 'Time Out'} mode selected. Ready to scan.`);
}

document.getElementById('time-in-mode').addEventListener('click', () => setMode('timeIn'));
document.getElementById('time-out-mode').addEventListener('click', () => setMode('timeOut'));

function refreshHistoryAfterSave() {
  if (!ui.timeHistory.hidden) renderHistory();
}

function recordEntry(rawId) {
  const id = rawId.trim();
  if (!ID_RE.test(id)) {
    setScanStatus('Invalid QR code.');
    return;
  }

  try {
    const rows = readEntries();
    const today = localDateKey();
    const todayDay = rows[today] || { date: today, entries: [] };
    let entry = todayDay.entries.find((item) => item.id === id);

    if (state.selectedMode === 'timeIn') {
      if (entry && entry.timeIn) {
        setScanStatus(`ID ${id} already has a Time In recorded for today.`);
        return;
      }
      if (!entry) {
        entry = { id, timeIn: null, timeOut: null };
        todayDay.entries.push(entry);
      }
      entry.timeIn = new Date().toISOString();
    } else {
      if (!entry || !entry.timeIn) {
        setScanStatus(`ID ${id} needs a Time In before Time Out can be recorded.`);
        return;
      }
      if (entry.timeOut) {
        setScanStatus(`ID ${id} already has a Time Out recorded for today.`);
        return;
      }
      entry.timeOut = new Date().toISOString();
    }

    rows[today] = todayDay;
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(rows));
    setScanStatus(`${state.selectedMode === 'timeIn' ? 'Time In' : 'Time Out'} recorded for ID ${id} at ${new Date().toLocaleTimeString()}.`);
    ui.entryId.value = '';
    refreshHistoryAfterSave();
  } catch (error) {
    setScanStatus(`Could not save this entry in browser storage: ${error.message}`);
  }
}

document.getElementById('manual-entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  recordEntry(ui.entryId.value);
});

function stopCamera() {
  state.scannerActive = false;
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  ui.scannerVideo.srcObject = null;
  ui.scannerVideo.hidden = true;
  ui.stopCamera.hidden = true;
  ui.startCamera.hidden = false;
}

ui.stopCamera.addEventListener('click', () => {
  stopCamera();
  setScanStatus('Camera stopped.');
});

async function startCamera() {
  const hasNative = typeof window.BarcodeDetector === 'function';
  const hasJsQr = typeof window.jsQR === 'function';
  const mediaDevices = navigator.mediaDevices;
  const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  const getUserMedia = mediaDevices && mediaDevices.getUserMedia
    ? (constraints) => mediaDevices.getUserMedia(constraints)
    : legacyGetUserMedia && ((constraints) => new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    }));
  let detector = null;

  if (hasNative) {
    try {
      const formats = typeof window.BarcodeDetector.getSupportedFormats === 'function' ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (error) {
      if (!hasJsQr) {
        setScanStatus(`Could not initialize QR scanning: ${error.message}`);
        return;
      }
    }
  }

  if (!detector && !hasJsQr) {
    setScanStatus('QR scanning could not load its decoder. Check your internet connection, reload the page, or enter the 9-digit number below.');
    return;
  }

  if (!getUserMedia) {
    setScanStatus('Camera access is unavailable. Open this site over HTTPS (or localhost), allow camera access, or enter the 9-digit number below.');
    return;
  }

  try {
    setScanStatus('Requesting camera permission...');
    const cameraOptions = [
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      { audio: false, video: true },
    ];
    for (const constraints of cameraOptions) {
      try {
        state.cameraStream = await getUserMedia(constraints);
        break;
      } catch (error) {
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError'].includes(error.name)) throw error;
      }
    }
    if (!state.cameraStream) throw new Error('No usable camera was found.');
    ui.scannerVideo.srcObject = state.cameraStream;
    ui.scannerVideo.hidden = false;
    await ui.scannerVideo.play();
    state.scannerActive = true;
    ui.stopCamera.hidden = false;
    ui.startCamera.hidden = true;
    setScanStatus('Camera is on. Point it at the QR code.');
  } catch (error) {
    stopCamera();
    const msg = error.name === 'NotAllowedError'
      ? 'Camera permission is blocked. Allow camera access for this website in Settings, then reload and try again.'
      : error.name === 'NotFoundError'
        ? 'No camera was found on this device.'
        : `Could not start the QR scanner: ${error.message}`;
    setScanStatus(msg);
    return;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    stopCamera();
    setScanStatus('Could not initialize QR scanning on this device.');
    return;
  }

  const scanLoop = async () => {
    if (!state.scannerActive) return;

    try {
      let rawValue = null;
      if (detector) {
        try {
          const codes = await detector.detect(ui.scannerVideo);
          rawValue = codes.length > 0 ? codes[0].rawValue : null;
        } catch (error) {
          if (!hasJsQr) throw error;
          detector = null;
        }
      }
      if (!detector && hasJsQr && ui.scannerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ui.scannerVideo.videoWidth > 0) {
        const scale = Math.min(1, 960 / ui.scannerVideo.videoWidth);
        canvas.width = Math.round(ui.scannerVideo.videoWidth * scale);
        canvas.height = Math.round(ui.scannerVideo.videoHeight * scale);
        context.drawImage(ui.scannerVideo, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
        rawValue = code ? code.data : null;
      }

      if (rawValue !== null) {
        stopCamera();
        recordEntry(rawValue);
        return;
      }
    } catch (error) {
      stopCamera();
      setScanStatus(`QR scanning stopped because of an error: ${error.message}`);
      return;
    }

    window.setTimeout(scanLoop, 200);
  };

  scanLoop();
}

ui.startCamera.addEventListener('click', startCamera);

function formatTimestamp(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
}

function formatGuessTime(ts) {
  if (!ts) return '—';
  if (/^\d{2}:\d{2}$/.test(ts)) return ts;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? 'Invalid time' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderHistory() {
  try {
    const entriesByDate = readEntries();
    const guessesByDate = readGuesses();
    const dates = [...new Set([...Object.keys(entriesByDate), ...Object.keys(guessesByDate)])].sort((a, b) => b.localeCompare(a));
    const prev = ui.historyDate.value;
    ui.historyDate.replaceChildren();

    if (!dates.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No saved dates';
      ui.historyDate.append(option);
      ui.historyDate.disabled = true;
    } else {
      ui.historyDate.disabled = false;
      dates.forEach((date) => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = date;
        ui.historyDate.append(option);
      });
      ui.historyDate.value = dates.includes(prev) ? prev : dates[0];
    }

    renderTimeHistory(entriesByDate[ui.historyDate.value]);
    renderGuessHistory(guessesByDate[ui.historyDate.value]);
  } catch (error) {
    ui.historyDate.replaceChildren();
    ui.historyDate.disabled = true;
    ui.historyStatus.textContent = `Could not read saved time history: ${error.message}`;
    ui.guessHistoryStatus.textContent = `Could not read saved Guest history: ${error.message}`;
  }
}

function renderTimeHistory(day) {
  const tbody = document.getElementById('history-entries');
  tbody.replaceChildren();
  const entries = day ? day.entries.map((entry, index) => ({ entry, index })).reverse() : [];
  entries.forEach(({ entry, index }) => {
    const row = document.createElement('tr');
    const selectCell = createDeleteCell('entries', index, `Select ID ${entry.id} for deletion`);
    if (selectCell) row.append(selectCell);

    [entry.id, formatTimestamp(entry.timeIn), formatTimestamp(entry.timeOut)].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    tbody.append(row);
  });

  ui.historyStatus.textContent = entries.length === 0
    ? 'There are no time entries for this date.'
    : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} for ${day.date}.`;
  ui.downloadHistory.disabled = entries.length === 0;
  document.getElementById('entry-select-heading').hidden = state.deleteMode !== 'entries';
  renderDeleteControls('entries', entries.length);
}

function createDeleteCell(type, index, label) {
  if (state.deleteMode !== type) return null;
  const cell = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = type === 'entries' ? 'entry-select' : 'guess-select';
  checkbox.dataset.index = String(index);
  checkbox.setAttribute('aria-label', label);
  cell.append(checkbox);
  return cell;
}

function renderDeleteControls(type, count) {
  const controls = deleteControls[type];
  const active = state.deleteMode === type;
  const confirming = active && state.confirmDeletion;
  controls.select.hidden = active;
  controls.select.disabled = count === 0;
  controls.remove.hidden = !active || count === 0 || confirming;
  controls.confirm.hidden = !confirming;
  controls.cancel.hidden = !active;
}

function deletionLabel(type, count) {
  return type === 'guesses'
    ? `Guest ${count === 1 ? 'entry' : 'entries'}`
    : count === 1 ? 'entry' : 'entries';
}

function beginDeleteMode(type) {
  state.deleteMode = type;
  state.confirmDeletion = false;
  renderHistory();
}

function requestDeletion(type) {
  const controls = deleteControls[type];
  const selected = document.querySelectorAll(controls.selector).length;
  if (!selected) {
    controls.status.textContent = `Select at least one ${deletionLabel(type, 1)} to delete.`;
    return;
  }
  state.confirmDeletion = true;
  controls.status.textContent = `Delete ${selected} selected ${deletionLabel(type, selected)}? Confirm or cancel.`;
  controls.remove.hidden = true;
  controls.confirm.hidden = false;
}

function confirmDeletion(type) {
  const controls = deleteControls[type];
  const selected = [...document.querySelectorAll(controls.selector)]
    .map((checkbox) => Number(checkbox.dataset.index))
    .sort((a, b) => b - a);
  if (!selected.length) {
    controls.status.textContent = `Select at least one ${deletionLabel(type, 1)} to delete.`;
    state.confirmDeletion = false;
    renderHistory();
    return;
  }

  try {
    const rows = readStorage(controls.key, controls.collection);
    const date = ui.historyDate.value;
    const day = rows[date];
    if (!day) throw new Error(`No ${type === 'guesses' ? 'Guest ' : ''}entries are saved for this date.`);
    const removesActiveGuest = type === 'guesses' && date === state.guessRecordDate
      && selected.some((index) => day.guesses[index]?.recordedAt === state.guessRecordId);
    selected.forEach((index) => day[controls.collection].splice(index, 1));
    if (day[controls.collection].length === 0) delete rows[date];
    localStorage.setItem(controls.key, JSON.stringify(rows));
    if (removesActiveGuest) resetGuestCheckIn();
    state.deleteMode = null;
    state.confirmDeletion = false;
    renderHistory();
    controls.status.textContent = `Deleted ${selected.length} ${deletionLabel(type, selected.length)}.`;
  } catch (error) {
    controls.status.textContent = `Could not delete the selected ${type === 'guesses' ? 'Guest entries' : 'entries'}: ${error.message}`;
  }
}

function cancelDeletion() {
  state.deleteMode = null;
  state.confirmDeletion = false;
  renderHistory();
}

ui.selectEntriesButton.addEventListener('click', () => beginDeleteMode('entries'));
ui.selectGuessesButton.addEventListener('click', () => beginDeleteMode('guesses'));
ui.deleteSelectedButton.addEventListener('click', () => requestDeletion('entries'));
ui.deleteSelectedGuessesButton.addEventListener('click', () => requestDeletion('guesses'));
ui.confirmDeleteEntriesButton.addEventListener('click', () => confirmDeletion('entries'));
ui.confirmDeleteGuessesButton.addEventListener('click', () => confirmDeletion('guesses'));
ui.cancelDeleteButton.addEventListener('click', cancelDeletion);
ui.cancelGuessDeleteButton.addEventListener('click', cancelDeletion);

function renderGuessHistory(day) {
  const tbody = document.getElementById('guess-history-entries');
  tbody.replaceChildren();
  const guesses = day ? day.guesses.map((guess, index) => ({ guess, index })).reverse() : [];
  guesses.forEach(({ guess, index }) => {
    const row = document.createElement('tr');
    const selectCell = createDeleteCell('guesses', index, `Select Guest entry for ${guess.name} for deletion`);
    if (selectCell) row.append(selectCell);

    [
      guess.name,
      guess.reason,
      guess.associatedStudent?.trim() || 'N/A',
      guess.checker?.trim() || 'N/A',
      formatGuessTime(guess.timeIn),
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });

    const timeOutCell = document.createElement('td');
    if (guess.timeOut) {
      timeOutCell.textContent = formatGuessTime(guess.timeOut);
    } else if (guess.timeIn) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary-button';
      button.dataset.guessTimeOutIndex = String(index);
      button.textContent = 'Time Out';
      button.setAttribute('aria-label', `Record Time Out for ${guess.name}`);
      timeOutCell.append(button);
    } else {
      timeOutCell.textContent = '—';
    }
    row.append(timeOutCell);
    tbody.append(row);
  });

  ui.guessHistoryStatus.textContent = guesses.length === 0
    ? 'There are no Guest records for this date.'
    : `${guesses.length} ${guesses.length === 1 ? 'Guest record' : 'Guest records'} for ${day.date}.`;
  ui.downloadGuessHistory.disabled = guesses.length === 0;
  document.getElementById('guess-select-heading').hidden = state.deleteMode !== 'guesses';
  renderDeleteControls('guesses', guesses.length);
}

document.getElementById('guess-history-entries').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-guess-time-out-index]');
  if (!button) return;

  try {
    const rows = readGuesses();
    const date = ui.historyDate.value;
    const day = rows[date];
    const index = Number(button.dataset.guessTimeOutIndex);
    const guess = day && day.guesses[index];
    if (!guess || !guess.timeIn || guess.timeOut) {
      throw new Error('This Guest entry cannot be checked out.');
    }
    guess.timeOut = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.guesses, JSON.stringify(rows));
    if (date === state.guessRecordDate && guess.recordedAt === state.guessRecordId) {
      resetGuestCheckIn();
    }
    renderHistory();
  } catch (error) {
    ui.guessHistoryStatus.textContent = `Could not record Guest Time Out: ${error.message}`;
  }
});

ui.historyDate.addEventListener('change', renderHistory);

function downloadHistoryJson(readFn, name, statusId) {
  try {
    const date = ui.historyDate.value;
    const day = readFn()[date];
    if (!day) {
      document.getElementById(statusId).textContent = `No saved ${name} are available to download for this date.`;
      return;
    }

    const file = new Blob([JSON.stringify(day, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(file);
    link.href = url;
    link.download = `${name}-${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
    document.getElementById(statusId).textContent = `Downloaded ${name}-${date}.json.`;
  } catch (error) {
    document.getElementById(statusId).textContent = `Could not download the JSON file: ${error.message}`;
  }
}

ui.downloadHistory.addEventListener('click', () => downloadHistoryJson(readEntries, 'Entry', 'history-status'));
ui.downloadGuessHistory.addEventListener('click', () => downloadHistoryJson(readGuesses, 'Guest', 'guess-history-status'));

function selectHistoryTab(tab) {
  const isTime = tab === 'time';
  const url = new URL(window.location.href);
  if (isTime) url.searchParams.delete('historyTab');
  else url.searchParams.set('historyTab', 'guess');

  window.history.replaceState(null, '', url);
  ui.timeHistoryTab.classList.toggle('selected', isTime);
  ui.timeHistoryTab.setAttribute('aria-selected', String(isTime));
  ui.timeHistoryPanel.hidden = !isTime;
  ui.guessHistoryTab.classList.toggle('selected', !isTime);
  ui.guessHistoryTab.setAttribute('aria-selected', String(!isTime));
  ui.guessHistoryPanel.hidden = isTime;
  renderHistory();
}

ui.timeHistoryTab.addEventListener('click', () => selectHistoryTab('time'));
ui.guessHistoryTab.addEventListener('click', () => selectHistoryTab('guess'));

function updateGuestTimeInDisplay() {
  ui.guessTimeInDisplay.textContent = state.guessTimeIn
    ? `Time In recorded at ${formatGuessTime(state.guessTimeIn)}`
    : 'Not recorded';
}

function updateGuestActionLabel() {
  const form = document.getElementById('guess-form');
  const hasGuestDetails = form.elements.name.value.trim() || form.elements.reason.value.trim();
  ui.guessTimeInButton.textContent = hasGuestDetails || !state.guessRecordId ? 'Time In' : 'Time Out';
}

function resetGuestCheckIn() {
  state.guessTimeIn = null;
  state.guessRecordDate = null;
  state.guessRecordId = null;
  document.getElementById('guess-form').reset();
  updateGuestTimeInDisplay();
  updateGuestActionLabel();
}

function saveGuestRecord(guess, date, recordId) {
  const rows = readGuesses();
  const day = rows[date] || { date, guesses: [] };
  const existingIndex = day.guesses.findIndex((item) => item.recordedAt === recordId);

  if (existingIndex === -1) day.guesses.push(guess);
  else day.guesses[existingIndex] = { ...day.guesses[existingIndex], ...guess };

  rows[date] = day;
  localStorage.setItem(STORAGE_KEYS.guesses, JSON.stringify(rows));
}

document.getElementById('guess-form').addEventListener('input', updateGuestActionLabel);
document.getElementById('guess-checker').addEventListener('change', updateGuestActionLabel);

ui.guessTimeInButton.addEventListener('click', () => {
  const form = document.getElementById('guess-form');
  const name = form.elements.name.value.trim();
  const reason = form.elements.reason.value.trim();

  if (!name && !reason && state.guessTimeIn && state.guessRecordDate && state.guessRecordId) {
    const timeOut = new Date().toISOString();
    try {
      saveGuestRecord({ timeOut }, state.guessRecordDate, state.guessRecordId);
      resetGuestCheckIn();
      ui.guessStatus.textContent = '';
      if (!ui.timeHistory.hidden) renderHistory();
    } catch (error) {
      ui.guessStatus.textContent = `Could not save Time Out: ${error.message}`;
    }
    return;
  }

  if (!name || !reason) {
    ui.guessStatus.textContent = 'Enter the guest name and reason before recording Time In.';
    return;
  }

  const timeIn = new Date().toISOString();
  const date = localDateKey();
  const guess = {
    name,
    reason,
    associatedStudent: document.getElementById('associated-student').value.trim(),
    checker: document.getElementById('guess-checker').value,
    timeIn,
    timeOut: null,
    recordedAt: timeIn,
  };

  try {
    saveGuestRecord(guess, date, timeIn);
    state.guessTimeIn = timeIn;
    state.guessRecordDate = date;
    state.guessRecordId = timeIn;
    form.reset();
    updateGuestTimeInDisplay();
    updateGuestActionLabel();
    ui.guessStatus.textContent = '';
    if (!ui.timeHistory.hidden) renderHistory();
  } catch (error) {
    ui.guessStatus.textContent = `Could not save this Guest record: ${error.message}`;
  }
});

document.getElementById('guess-form').addEventListener('submit', (e) => e.preventDefault());

window.addEventListener('beforeunload', stopCamera);
renderHistory();
const initialHash = window.location.hash.slice(1);
const initialViewId = initialHash === 'guess' ? 'guest' : initialHash;
const initialView = document.getElementById(initialViewId);
const defaultView = initialView && initialView.classList.contains('content-view') ? initialViewId : 'scan';
showView(defaultView);
if (defaultView === 'time-history') {
  selectHistoryTab(new URLSearchParams(window.location.search).get('historyTab') === 'guess' ? 'guess' : 'time');
}
