let utterances = [];
let currentIndex = 0;
let isPaused = false;
let isReading = false;
let activeSettings = {
    mode: "article",
    voiceName: "",
    speed: 1,
    autoScroll: true
};

function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/(\n\s*){2,}/g, "\n\n")
        .trim();
}

function getMainText() {
    const article =
        document.querySelector("article") ||
        document.querySelector("main") ||
        document.body;

    let clone = article.cloneNode(true);

    const removeSelectors = [
        "nav",
        "header",
        "footer",
        "aside",
        "script",
        "style",
        "noscript",
        "form",
        "button",
        "input",
        "svg",
        "canvas",
        "iframe"
    ];

    removeSelectors.forEach((selector) => {
        clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    return cleanText(clone.innerText || clone.textContent || "");
}

function getSelectionText() {
    const text = window.getSelection().toString();
    return cleanText(text);
}

function getPageText() {
    return cleanText(document.body.innerText || "");
}

function splitIntoChunks(text) {
    const parts = text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

    return parts.length ? parts : [text];
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollCurrentIntoView(index) {
    const paragraphs = document.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6");
    if (!paragraphs.length) return;

    const target = paragraphs[Math.min(index, paragraphs.length - 1)];
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function stopReading() {
    speechSynthesis.cancel();
    utterances = [];
    currentIndex = 0;
    isPaused = false;
    isReading = false;
}

function pauseReading() {
    if (isReading) {
        speechSynthesis.pause();
        isPaused = true;
    }
}

function resumeReading() {
    if (isPaused) {
        speechSynthesis.resume();
        isPaused = false;
    }
}

function readText(text) {
    if (!text) return;

    stopReading();
    isReading = true;
    currentIndex = 0;

    utterances = splitIntoChunks(text).map((chunk, index) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.rate = activeSettings.speed || 1;

        const voices = speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === activeSettings.voiceName);
        if (selectedVoice) {
            u.voice = selectedVoice;
            u.lang = selectedVoice.lang;
        }

        u.onstart = () => {
            if (activeSettings.autoScroll) {
                scrollCurrentIntoView(index);
            }
        };

        u.onend = () => {
            currentIndex = index + 1;
            if (activeSettings.autoScroll) {
                scrollCurrentIntoView(currentIndex);
            }
            if (currentIndex >= utterances.length) {
                isReading = false;
                isPaused = false;
            }
        };

        u.onerror = () => {
            isReading = false;
            isPaused = false;
        };

        return u;
    });

    speakNext();
}

function speakNext() {
    if (currentIndex >= utterances.length) return;
    speechSynthesis.speak(utterances[currentIndex]);
}

speechSynthesis.addEventListener("end", () => {
    currentIndex += 1;
    if (currentIndex < utterances.length && !isPaused) {
        speakNext();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (!message?.action) return;

    if (message.settings) {
        activeSettings = message.settings;
    }

    if (message.action === "read") {
        let text = "";

        if (activeSettings.mode === "selection") {
            text = getSelectionText();
            if (!text) {
                alert("Please select some text first.");
                return;
            }
        } else if (activeSettings.mode === "article") {
            text = getMainText();
        } else {
            text = getPageText();
        }

        readText(text);
    }

    if (message.action === "pause") {
        pauseReading();
    }

    if (message.action === "resume") {
        resumeReading();
    }

    if (message.action === "stop") {
        stopReading();
    }
});