"use strict";

const IS_EXTENSION = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const modeEl = document.getElementById("mode");
const voiceEl = document.getElementById("voice");
const speedEl = document.getElementById("speed");
const speedValueEl = document.getElementById("speedValue");
const autoScrollEl = document.getElementById("autoScroll");
const statusEl = document.getElementById("status");

const DEFAULTS = { mode: "article", voiceName: "", speed: 1, autoScroll: true };

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function saveSettings() {
    if (!IS_EXTENSION) return;
    chrome.storage.sync.set({
        mode: modeEl.value,
        voiceName: voiceEl.value,
        speed: Number(speedEl.value),
        autoScroll: autoScrollEl.checked,
    });
}

function loadSettings() {
    chrome.storage.sync.get(DEFAULTS, (settings) => {
        modeEl.value = settings.mode;
        speedEl.value = String(settings.speed);
        speedValueEl.textContent = String(settings.speed);
        autoScrollEl.checked = settings.autoScroll;
        loadVoices(settings.voiceName);
    });
}

function loadVoices(savedVoiceName = "") {
    chrome.tts.getVoices((voices) => {
        if (chrome.runtime.lastError) {
            setStatus("No text-to-speech voice is available in Chrome.", true);
            return;
        }

        voiceEl.replaceChildren(new Option("Default system voice", ""));
        for (const voice of voices || []) {
            voiceEl.add(new Option(`${voice.voiceName} (${voice.lang})`, voice.voiceName));
        }
        voiceEl.value = savedVoiceName;
    });
}

function sendAction(action) {
    if (!IS_EXTENSION) {
        setStatus("Preview mode does not include text-to-speech.", true);
        return;
    }

    setStatus(action === "read" ? "Preparing page text…" : "Working…");
    chrome.runtime.sendMessage({
        action,
        settings: {
            mode: modeEl.value,
            voiceName: voiceEl.value,
            speed: Number(speedEl.value),
            autoScroll: autoScrollEl.checked,
        },
    }, (response) => {
        if (chrome.runtime.lastError) {
            setStatus(`Could not start the reader: ${chrome.runtime.lastError.message}`, true);
        } else if (!response?.ok) {
            setStatus(response?.error || "The reader could not complete that action.", true);
        } else {
            setStatus(response.message || "Reading aloud.");
        }
    });
}

if (IS_EXTENSION) {
    loadSettings();
    speedEl.addEventListener("input", () => {
        speedValueEl.textContent = speedEl.value;
        saveSettings();
    });
    modeEl.addEventListener("change", saveSettings);
    voiceEl.addEventListener("change", saveSettings);
    autoScrollEl.addEventListener("change", saveSettings);
}

document.getElementById("read").addEventListener("click", () => sendAction("read"));
document.getElementById("pause").addEventListener("click", () => sendAction("pause"));
document.getElementById("resume").addEventListener("click", () => sendAction("resume"));
document.getElementById("stop").addEventListener("click", () => sendAction("stop"));
