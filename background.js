/**
 * Web Content Reader — Background Service Worker
 *
 * Runs once when the extension is installed or updated.
 * Can be extended to handle context menus, alarms, etc.
 */

"use strict";

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        console.log("✅ Web Content Reader installed successfully.");
    } else if (details.reason === "update") {
        console.log(`🔄 Web Content Reader updated to v${chrome.runtime.getManifest().version}.`);
    }
});