/**
 * Web Content Reader — Content Script
 *
 * Injected into every page. Extracts text based on the chosen
 * reading mode, then reads it aloud using the Web Speech API.
 */

"use strict";

/* ── State ── */
let utterances   = [];
let currentIndex = 0;
let isPaused     = false;
let isReading    = false;

let activeSettings = {
    mode: "article",
    voiceName: "",
    speed: 1,
    autoScroll: true,
};

/* ============================================
   Text Extraction
   ============================================ */

/** Collapse excessive whitespace and trim. */
function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/(\n\s*){2,}/g, "\n\n")
        .trim();
}

/**
 * Extract the main article / content text from the page,
 * stripping away navigation, ads, scripts, etc.
 */
function getMainText() {
    const root =
        document.querySelector("article") ||
        document.querySelector('[role="main"]') ||
        document.querySelector("main") ||
        document.body;

    const clone = root.cloneNode(true);

    // Elements that should never be read aloud
    const NOISE_SELECTORS = [
        "nav", "header", "footer", "aside",
        "script", "style", "noscript",
        "form", "button", "input", "textarea",
        "svg", "canvas", "iframe",
        "[aria-hidden='true']",
        ".ad", ".advertisement", ".sidebar",
    ];

    NOISE_SELECTORS.forEach((sel) => {
        clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    return cleanText(clone.innerText || clone.textContent || "");
}

/** Return the user's current text selection. */
function getSelectionText() {
    return cleanText(window.getSelection().toString());
}

/** Return the full visible text of the page body. */
function getPageText() {
    return cleanText(document.body.innerText || "");
}

/* ============================================
   Chunking & Scrolling
   ============================================ */

/**
 * Split text into sentence-sized chunks so the speech engine
 * can provide smoother playback and better scroll tracking.
 */
function splitIntoChunks(text) {
    const parts = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    return parts.length ? parts : [text];
}

/** Smoothly scroll the page to the top. */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Scroll the paragraph matching the current reading index into view. */
function scrollCurrentIntoView(index) {
    const elements = document.querySelectorAll(
        "p, li, h1, h2, h3, h4, h5, h6"
    );
    if (!elements.length) return;

    const target = elements[Math.min(index, elements.length - 1)];
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

/* ============================================
   Playback Controls
   ============================================ */

/** Cancel all speech and reset state. */
function stopReading() {
    speechSynthesis.cancel();
    utterances   = [];
    currentIndex = 0;
    isPaused     = false;
    isReading    = false;
}

/** Pause the current utterance. */
function pauseReading() {
    if (isReading) {
        speechSynthesis.pause();
        isPaused = true;
    }
}

/** Resume a paused utterance. */
function resumeReading() {
    if (isPaused) {
        speechSynthesis.resume();
        isPaused = false;
    }
}

/**
 * Build an array of SpeechSynthesisUtterance objects from
 * the given text, then begin speaking.
 */
function readText(text) {
    if (!text) return;

    stopReading();
    isReading    = true;
    currentIndex = 0;

    const voices        = speechSynthesis.getVoices();
    const selectedVoice = voices.find((v) => v.name === activeSettings.voiceName);

    utterances = splitIntoChunks(text).map((chunk, index) => {
        const utt  = new SpeechSynthesisUtterance(chunk);
        utt.rate   = activeSettings.speed || 1;

        if (selectedVoice) {
            utt.voice = selectedVoice;
            utt.lang  = selectedVoice.lang;
        }

        /* Auto-scroll on utterance start */
        utt.onstart = () => {
            if (activeSettings.autoScroll) scrollCurrentIntoView(index);
        };

        /* Advance index when an utterance finishes and chain to next */
        utt.onend = () => {
            currentIndex = index + 1;
            if (activeSettings.autoScroll) scrollCurrentIntoView(currentIndex);
            if (currentIndex >= utterances.length) {
                isReading = false;
                isPaused  = false;
            } else if (!isPaused) {
                speakNext();
            }
        };

        /* Reset on error */
        utt.onerror = () => {
            isReading = false;
            isPaused  = false;
        };

        return utt;
    });

    speakNext();
}

/** Speak the next queued utterance. */
function speakNext() {
    if (currentIndex >= utterances.length) return;
    speechSynthesis.speak(utterances[currentIndex]);
}

/* ============================================
   Message Listener (from popup)
   ============================================ */

chrome.runtime.onMessage.addListener((message) => {
    if (!message?.action) return;

    // Update active settings when provided
    if (message.settings) {
        activeSettings = { ...activeSettings, ...message.settings };
    }

    switch (message.action) {
        case "read": {
            let text = "";

            switch (activeSettings.mode) {
                case "selection":
                    text = getSelectionText();
                    if (!text) {
                        alert("Please select some text on the page first.");
                        return;
                    }
                    break;
                case "article":
                    text = getMainText();
                    break;
                default:
                    text = getPageText();
            }

            readText(text);
            break;
        }

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