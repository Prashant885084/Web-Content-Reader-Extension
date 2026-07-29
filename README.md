# 📖 Web Content Reader — Chrome Extension

A lightweight Chrome extension that reads web page content aloud using Chrome's built-in **Text-to-Speech API**. Choose between reading just the article, the full page, or selected text — with customisable voice, speed, and auto-scroll.

---

## ✨ Features

| Feature            | Description                                              |
| ------------------ | -------------------------------------------------------- |
| **3 Reading Modes**| Article only · Full page · Selected text                 |
| **Voice Selection**| Pick from all system-installed voices                    |
| **Speed Control**  | Adjustable 0.5× – 2× with a range slider                |
| **Auto Scroll**    | Automatically scrolls the page as it reads               |
| **Persistent Settings** | Your preferences are saved between sessions         |

---

## 🚀 Installation

1. Clone or download this repository.
2. Open **Chrome** → navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `Web-Content-Reader-Extension` folder.
5. The extension icon will appear in your toolbar — click it to start reading!

---

## 🗂️ Project Structure

```
Web-Content-Reader-Extension/
├── manifest.json      # Extension configuration (MV3)
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic & settings
├── content.js         # Legacy page helper (not injected)
├── background.js      # Service worker — text extraction and Chrome TTS
├── icon16.png         # Toolbar icon (16×16)
├── icon48.png         # Extensions page icon (48×48)
├── icon128.png        # Chrome Web Store icon (128×128)
├── index.html         # Live Server redirect (dev only)
└── README.md          # This file
```

---

## 🎮 Usage

1. Navigate to any web page.
2. Click the **Web Content Reader** icon in the toolbar.
3. Choose a **Mode** (Article / Full page / Selected text).
4. Pick a **Voice** and adjust **Speed**.
5. Press **▶ Read** to start, **⏸ Pause** / **⏯ Resume** / **⏹ Stop** to control playback.

---

## 🛠️ Tech Stack

- **Manifest V3** — Chrome Extensions API
- **Chrome TTS API** — extension-managed text-to-speech
- **Chrome Storage** — `chrome.storage.sync` for persistent settings
- **Vanilla JS / CSS / HTML** — zero dependencies

---

## 📄 License

This project is open-source and available under the [MIT License](https://opensource.org/licenses/MIT).
