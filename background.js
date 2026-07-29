/**
 * Web Content Reader — Background Service Worker
 *
 * Handles all text-to-speech using the chrome.tts API.
 * Extracts page text via chrome.scripting.executeScript.
 * Sends scroll commands to the content script for auto-scroll.
 */

"use strict";

/* ── State ── */
let currentChunks = [];
let currentIndex  = 0;
let isReading     = false;
let isPaused      = false;
let activeTabId   = null;

let activeSettings = {
    mode: "article",
    voiceName: "",
    speed: 1,
    autoScroll: true,
};

/* ============================================
   Text Extraction (injected into page context)
   ============================================ */

/**
 * This function is injected into the web page via
 * chrome.scripting.executeScript. It must be fully
 * self-contained — no closures over external variables.
 */
function extractPageText(mode) {
    function cleanText(text) {
        return text
            .replace(/\s+/g, " ")
            .replace(/(\n\s*){2,}/g, "\n\n")
            .trim();
    }

    function getMainText() {
        const root =
            document.querySelector("article") ||
            document.querySelector('[role="main"]') ||
            document.querySelector("main") ||
            document.body;

        const clone = root.cloneNode(true);

        const NOISE = [
            "nav", "header", "footer", "aside",
            "script", "style", "noscript",
            "form", "button", "input", "textarea",
            "svg", "canvas", "iframe",
            "[aria-hidden='true']",
            ".ad", ".advertisement", ".sidebar",
        ];
        NOISE.forEach((sel) => {
            clone.querySelectorAll(sel).forEach((el) => el.remove());
        });

        return cleanText(clone.innerText || clone.textContent || "");
    }

    function getSelectionText() {
        return cleanText(window.getSelection().toString());
    }

    function getPageText() {
        return cleanText(document.body.innerText || "");
    }

    switch (mode) {
        case "selection":
            return getSelectionText();
        case "article":
            return getMainText();
        default:
            return getPageText();
    }
}

/* ============================================
   Chunking
   ============================================ */

/**
 * Split text into sentence-sized chunks for smoother
 * playback and scroll tracking.
 */
function splitIntoChunks(text) {
    const parts = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    return parts.length ? parts : [text];
}

/* ============================================
   TTS Playback
   ============================================ */

/** Cancel all speech and reset state. */
function stopReading() {
    chrome.tts.stop();
    currentChunks = [];
    currentIndex  = 0;
    isReading     = false;
    isPaused      = false;
    activeTabId   = null;
}

/** Pause the current utterance. */
function pauseReading() {
    if (isReading) {
        chrome.tts.pause();
        isPaused = true;
    }
}

/** Resume a paused utterance. */
function resumeReading() {
    if (isPaused) {
        chrome.tts.resume();
        isPaused = false;
    }
}

/** Speak the chunk at the given index, then chain to the next. */
function speakChunk(index) {
    if (index >= currentChunks.length) {
        isReading = false;
        isPaused  = false;
        return;
    }

    currentIndex = index;

    /* Ask content script to scroll to the matching paragraph */
    if (activeSettings.autoScroll && activeTabId) {
        chrome.tabs.sendMessage(activeTabId, {
            action: "scroll",
            index,
        }).catch(() => { /* tab may have closed */ });
    }

    /* Build TTS options */
    const ttsOptions = {
        rate: activeSettings.speed || 1,
        enqueue: false,
        onEvent: (event) => {
            if (event.type === "end") {
                speakChunk(index + 1);
            } else if (event.type === "error") {
                console.error("TTS error:", event.errorMessage);
                isReading = false;
                isPaused  = false;
            }
            // "interrupted" / "cancelled" → do not chain
        },
    };

    if (activeSettings.voiceName) {
        ttsOptions.voiceName = activeSettings.voiceName;
    }

    chrome.tts.speak(currentChunks[index], ttsOptions);
}

/**
 * Main entry: extract text from the active tab, then start
 * reading it aloud chunk by chunk.
 */
async function startReading(tabId) {
    stopReading();
    activeTabId = tabId;

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractPageText,
            args: [activeSettings.mode],
        });

        const text = results?.[0]?.result;

        /* Handle "selected text" mode with nothing selected */
        if (activeSettings.mode === "selection" && (!text || !text.trim())) {
            chrome.scripting.executeScript({
                target: { tabId },
                func: () => alert("Please select some text on the page first."),
            }).catch(() => {});
            return;
        }

        if (!text || !text.trim()) {
            console.warn("No text extracted from page.");
            return;
        }

        currentChunks = splitIntoChunks(text);
        isReading     = true;
        isPaused      = false;
        currentIndex  = 0;

        /* Scroll page to top before reading */
        if (activeSettings.autoScroll) {
            chrome.scripting.executeScript({
                target: { tabId },
                func: () => window.scrollTo({ top: 0, behavior: "smooth" }),
            }).catch(() => {});
        }

        speakChunk(0);

    } catch (err) {
        console.error("Failed to extract text or start TTS:", err);
    }
}

/* ============================================
   Message Listener (from popup)
   ============================================ */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.action) return;

    /* Merge incoming settings */
    if (message.settings) {
        activeSettings = { ...activeSettings, ...message.settings };
    }

    switch (message.action) {
        case "read":
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab?.id) return;
                startReading(tab.id);
            });
            break;

        case "pause":
            pauseReading();
            break;

        case "resume":
            resumeReading();
            break;

        case "stop":
            stopReading();
            break;
    }
});

/* ============================================
   Installation log
   ============================================ */

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        console.log("✅ Web Content Reader installed successfully.");
    } else if (details.reason === "update") {
        console.log(
            `🔄 Web Content Reader updated to v${chrome.runtime.getManifest().version}.`
        );
    }
});