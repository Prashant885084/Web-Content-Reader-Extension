/**
 * Web Content Reader — Popup Script
 *
 * Handles user settings, voice selection, and sends
 * playback commands to the content script.
 * Works both as a Chrome extension and on localhost for UI preview.
 */

"use strict";

/* ── Chrome API availability check ── */
const IS_EXTENSION = typeof chrome !== "undefined" && !!chrome.storage;

/* ── DOM References ── */
const modeEl       = document.getElementById("mode");
const voiceEl      = document.getElementById("voice");
const speedEl      = document.getElementById("speed");
const speedValueEl = document.getElementById("speedValue");
const autoScrollEl = document.getElementById("autoScroll");

const readBtn   = document.getElementById("read");
const pauseBtn  = document.getElementById("pause");
const resumeBtn = document.getElementById("resume");
const stopBtn   = document.getElementById("stop");

/* ── Default settings ── */
const DEFAULTS = {
    mode: "article",
    voiceName: "",
    speed: 1,
    autoScroll: true,
};

/* ── Voice list cache ── */
let voices = [];

/* ── Settings persistence ── */

/** Load saved settings from Chrome storage and apply to UI. */
function loadSettings() {
    if (!IS_EXTENSION) return;

    chrome.storage.sync.get(DEFAULTS, (data) => {
        modeEl.value              = data.mode;
        speedEl.value             = String(data.speed);
        speedValueEl.textContent  = String(data.speed);
        autoScrollEl.checked      = data.autoScroll;

        // Restore voice selection if voices are already loaded
        if (voices.length && data.voiceName) {
            const match = voices.find((v) => v.name === data.voiceName);
            if (match) voiceEl.value = match.name;
        }
    });
}

/** Persist current UI settings to Chrome storage. */
function saveSettings() {
    if (!IS_EXTENSION) return;

    chrome.storage.sync.set({
        mode: modeEl.value,
        voiceName: voiceEl.value,
        speed: Number(speedEl.value),
        autoScroll: autoScrollEl.checked,
    });
}

/* ── Voice loading ── */

/** Populate the voice dropdown with available system voices. */
function loadVoices() {
    voices = speechSynthesis.getVoices();
    voiceEl.innerHTML = "";

    for (const voice of voices) {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceEl.appendChild(option);
    }

    // Restore previously selected voice (extension only)
    if (IS_EXTENSION) {
        chrome.storage.sync.get({ voiceName: "" }, (data) => {
            if (data.voiceName) voiceEl.value = data.voiceName;
        });
    }
}

/* ── Initialisation ── */
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
loadSettings();

/* ── Event listeners ── */

speedEl.addEventListener("input", () => {
    speedValueEl.textContent = speedEl.value;
    saveSettings();
});

modeEl.addEventListener("change", saveSettings);
voiceEl.addEventListener("change", saveSettings);
autoScrollEl.addEventListener("change", saveSettings);

/* ── Messaging ── */

/**
 * Send an action (read / pause / resume / stop) along with
 * the current settings to the active tab's content script.
 */
function sendAction(action) {
    if (!IS_EXTENSION) {
        console.log(`[Preview] Action: ${action}`);
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) return;

        chrome.tabs.sendMessage(tab.id, {
            action,
            settings: {
                mode: modeEl.value,
                voiceName: voiceEl.value,
                speed: Number(speedEl.value),
                autoScroll: autoScrollEl.checked,
            },
        });
    });
}

readBtn.addEventListener("click",   () => sendAction("read"));
pauseBtn.addEventListener("click",  () => sendAction("pause"));
resumeBtn.addEventListener("click", () => sendAction("resume"));
stopBtn.addEventListener("click",   () => sendAction("stop"));