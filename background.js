// background.js - updated to enforce server-driven premium checks before injecting scripts
'use strict';
function ensureDeviceUUID(callback) {
  chrome.storage.local.get(['deviceUUID'], (res) => {
    if (res && res.deviceUUID) return callback(res.deviceUUID);
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    chrome.storage.local.set({ deviceUUID: uuid }, () => callback(uuid));
  });
}

function isDeviceAuthorized(deviceUUID, config, cb) {
  const adminMode = config.adminMode === true;
  if (!adminMode) return cb(true);
  const admins = Array.isArray(config.adminDeviceIds) ? config.adminDeviceIds : [];
  cb(admins.includes(deviceUUID));
}

function urlMatchesMonitored(url, monitoredSites) {
  if (!monitoredSites || monitoredSites.length === 0) return false;
  try {
    const u = new URL(url);
    const host = u.hostname;
    for (const s of monitoredSites) {
      if (s.startsWith('*.')) {
        const frag = s.slice(2);
        if (host === frag || host.endsWith('.' + frag)) return true;
      } else if (host.includes(s) || url.includes(s)) {
        return true;
      }
    }
  } catch (e) {
    return monitoredSites.some(s => url.includes(s));
  }
  return false;
}

function injectScripts(tabId) {
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js', 'ledger.js', 'fatigue.js'] }, () => {});
}

// Query server for user status (strict check). serverUrl is configurable in chrome.storage.sync
function fetchUserStatus(email, serverUrl, callback) {
  if (!serverUrl) return callback(null); // no server configured -> cannot validate
  const url = serverUrl.replace(/\/$/, '') + '/user-status?email=' + encodeURIComponent(email);
  fetch(url, { method: 'GET' }).then(r => r.json()).then(json => callback(json)).catch(err => {
    console.warn('user-status fetch failed', err);
    callback(null);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab || !tab.url) return;
  chrome.storage.sync.get(['monitoredSites','adminMode','adminDeviceIds','serverUrl','userEmail'], (cfg) => {
    const monitoredSites = Array.isArray(cfg.monitoredSites) && cfg.monitoredSites.length ? cfg.monitoredSites : ['tiktok.com','snapchat.com','roblox.com'];
    ensureDeviceUUID((deviceUUID) => {
      isDeviceAuthorized(deviceUUID, cfg, (authorized) => {
        if (!authorized) return;
        if (!urlMatchesMonitored(tab.url, monitoredSites)) return;
        // If serverUrl and userEmail are configured, perform strict check
        if (cfg.serverUrl && cfg.userEmail) {
          fetchUserStatus(cfg.userEmail, cfg.serverUrl, (status) => {
            // If server responded and isActive true -> allow injection
            if (status && status.isActive) {
              injectScripts(tabId);
              chrome.tabs.sendMessage(tabId, { action: 'guardianInjected', deviceUUID }, () => {});
            } else {
              // not active -> do not inject; optionally log locally
              console.log('User not active according to server; skipping injection for', cfg.userEmail);
            }
          });
        } else {
          // no server/user configured -> default to local overrideEnabled flag (soft degrade)
          chrome.storage.sync.get(['overrideEnabled'], (d) => {
            if (d && d.overrideEnabled) {
              injectScripts(tabId);
              chrome.tabs.sendMessage(tabId, { action: 'guardianInjected', deviceUUID }, () => {});
            }
          });
        }
      });
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'getDeviceUUID') {
    chrome.storage.local.get(['deviceUUID'], (r) => sendResponse({ deviceUUID: r && r.deviceUUID }));
    return true;
  }
});