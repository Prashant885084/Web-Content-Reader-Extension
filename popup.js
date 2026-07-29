const modeEl = document.getElementById("mode");
const voiceEl = document.getElementById("voice");
const speedEl = document.getElementById("speed");
const speedValueEl = document.getElementById("speedValue");
const autoScrollEl = document.getElementById("autoScroll");

const readBtn = document.getElementById("read");
const pauseBtn = document.getElementById("pause");
const resumeBtn = document.getElementById("resume");
const stopBtn = document.getElementById("stop");

let voices = [];

function loadSettings() {
    chrome.storage.sync.get(
        {
            mode: "article",
            voiceName: "",
            speed: 1,
            autoScroll: true
        },
        (data) => {
            modeEl.value = data.mode;
            speedEl.value = String(data.speed);
            speedValueEl.textContent = String(data.speed);
            autoScrollEl.checked = data.autoScroll;

            const applyVoiceSelection = () => {
                if (!voices.length) return;
                const selected = voices.find(v => v.name === data.voiceName);
                if (selected) voiceEl.value = selected.name;
            };

            applyVoiceSelection();
        }
    );
}

function saveSettings() {
    chrome.storage.sync.set({
        mode: modeEl.value,
        voiceName: voiceEl.value,
        speed: Number(speedEl.value),
        autoScroll: autoScrollEl.checked
    });
}

function loadVoices() {
    voices = speechSynthesis.getVoices();

    voiceEl.innerHTML = "";
    for (const voice of voices) {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceEl.appendChild(option);
    }

    chrome.storage.sync.get({ voiceName: "" }, (data) => {
        if (data.voiceName) {
            voiceEl.value = data.voiceName;
        }
    });
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
loadSettings();

speedEl.addEventListener("input", () => {
    speedValueEl.textContent = speedEl.value;
    saveSettings();
});

modeEl.addEventListener("change", saveSettings);
voiceEl.addEventListener("change", saveSettings);
autoScrollEl.addEventListener("change", saveSettings);

function sendAction(action) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) return;

        chrome.tabs.sendMessage(tab.id, {
            action,
            settings: {
                mode: modeEl.value,
                voiceName: voiceEl.value,
                speed: Number(speedEl.value),
                autoScroll: autoScrollEl.checked
            }
        });
    });
}

readBtn.addEventListener("click", () => sendAction("read"));
pauseBtn.addEventListener("click", () => sendAction("pause"));
resumeBtn.addEventListener("click", () => sendAction("resume"));
stopBtn.addEventListener("click", () => sendAction("stop"));