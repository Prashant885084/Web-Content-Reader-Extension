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
let playbackId    = 0;

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
    playbackId += 1;
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
function speakChunk(index, sessionId) {
    if (sessionId !== playbackId) return;
    if (index >= currentChunks.length) {
        isReading = false;
        isPaused  = false;
        return;
    }

    currentIndex = index;

    /* Scroll in the page context; no permanently injected script is needed. */
    if (activeSettings.autoScroll && activeTabId) {
        chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: (paragraphIndex) => {
                const elements = document.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6");
                elements[Math.min(paragraphIndex, elements.length - 1)]?.scrollIntoView({
                    behavior: "smooth", block: "center",
                });
            },
            args: [index],
        }).catch(() => {});
    }

    /* Build TTS options */
    const ttsOptions = {
        rate: activeSettings.speed || 1,
        enqueue: false,
        onEvent: (event) => {
            if (event.type === "end") {
                speakChunk(index + 1, sessionId);
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
    const sessionId = playbackId;
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
            return { ok: false, error: "Select text on the page before choosing Selected text." };
        }

        if (!text || !text.trim()) {
            console.warn("No text extracted from page.");
            return { ok: false, error: "No readable text was found on this page." };
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

        speakChunk(0, sessionId);
        return { ok: true, message: "Reading aloud." };

    } catch (err) {
        console.error("Failed to extract text or start TTS:", err);
        const message = String(err?.message || err);
        return {
            ok: false,
            error: /Cannot access|chrome:\/\//i.test(message)
                ? "Chrome does not allow extensions to read this internal page. Open a normal website instead."
                : "Could not read this page. Refresh it and try again.",
        };
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
                if (!tab?.id) {
                    sendResponse({ ok: false, error: "No active tab is available to read." });
                    return;
                }
                startReading(tab.id).then(sendResponse);
            });
            return true;

        case "pause":
            pauseReading();
            sendResponse({ ok: true, message: "Reading paused." });
            break;

        case "resume":
            resumeReading();
            sendResponse({ ok: true, message: "Reading resumed." });
            break;

        case "stop":
            stopReading();
            sendResponse({ ok: true, message: "Reading stopped." });
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
