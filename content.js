// content.js
// Runs inside each web page (content script). Responsible for detecting risky sites and injecting
// an emotionally-aware redirect clause UI. All lines below include comments explaining purpose.
//
// NOTE: This content script is intentionally lightweight and reads configuration from chrome.storage.sync/local.
// It does NOT execute privileged network requests. Any backend integration should be done via a server or extension popup/background.
(function() {
  'use strict';

  // --- Configuration: default monitored sites and default clause ---
  // Each site fragment should be small and unique (e.g., "tiktok.com" will match subpages).
  const DEFAULT_RISKY_SITES = ["tiktok.com", "snapchat.com", "roblox.com"];
  const DEFAULT_CLAUSE = "This space might not honor your dignity. Want to redirect?";

  // Utility: safe query for whether the current URL matches any risky site fragment.
  function isRiskySite(url, riskySites) {
    // url may include protocol/params - use simple substring checks so it's robust across hosts.
    return riskySites.some(site => url.includes(site));
  }

  // Build a human-friendly clause element with a redirect button and optional dismiss
  function createClauseElement(clauseText, redirectUrl) {
    // Create container
    const container = document.createElement('div');
    container.setAttribute('role', 'dialog'); // accessibility hint
    container.setAttribute('aria-live', 'polite');
    container.className = 'guardian-override-clause';

    // Inline minimal styling to avoid collisions with page CSS.
    container.style.cssText = [
      'position: fixed',
      'top: 20px',
      'left: 20px',
      'max-width: 360px',
      'background: #fff3cd',   // warm, gentle background
      'color: #3b3b3b',
      'padding: 14px',
      'border-radius: 8px',
      'border: 1px solid #ffeeba',
      'box-shadow: 0 8px 20px rgba(0,0,0,0.08)',
      'z-index: 2147483647',   // very high so it appears above most page content
      'font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      'font-size: 14px',
      'line-height: 1.25'
    ].join(';');

    // Clause message
    const p = document.createElement('p');
    p.style.margin = '0 0 8px 0';
    p.innerText = clauseText;
    container.appendChild(p);

    // Buttons wrapper
    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '8px';

    // Redirect button - takes user to a safe page
    const redirectBtn = document.createElement('button');
    redirectBtn.type = 'button';
    redirectBtn.innerText = 'Redirect Me';
    redirectBtn.style.cssText = 'padding:8px 10px; border-radius:6px; border:none; cursor:pointer; background:#0d6efd; color:white; flex:1;';

    // Dismiss button - closes the clause
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.innerText = 'Dismiss';
    dismissBtn.style.cssText = 'padding:8px 10px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); background:white; cursor:pointer; flex:1;';

    btnWrap.appendChild(redirectBtn);
    btnWrap.appendChild(dismissBtn);
    container.appendChild(btnWrap);

    // Small note about what was blocked (optional)
    const note = document.createElement('small');
    note.style.display = 'block';
    note.style.marginTop = '8px';
    note.style.color = '#6b6b6b';
    note.innerText = 'Protected by Guardian Override';
    container.appendChild(note);

    // Redirect behavior - attempt to use configured redirect URL, else default to extension dashboard.
    redirectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // read redirect url from storage then navigate
      chrome.storage.sync.get(['redirectUrl'], (d) => {
        const dest = (d && d.redirectUrl) ? d.redirectUrl : 'https://example.com/safe';
        // Log the override event and then navigate
        try { window.location.href = dest; } catch(err) { window.open(dest, '_blank'); }
      });
    });

    // Dismiss behavior - remove the UI and do not redirect
    dismissBtn.addEventListener('click', () => {
      container.remove();
    });

    return container;
  }

  // Lightweight logging: persist override events to chrome.storage.local via ledger API
  function logSabotageEvent(site, clauseText) {
    const timestamp = new Date().toISOString();
    const event = { site, clauseText, timestamp };
    // Merge into existing log stored at 'sabotageLog'
    chrome.storage.local.get(['sabotageLog'], (data) => {
      const log = data && data.sabotageLog ? data.sabotageLog : [];
      log.push(event);
      chrome.storage.local.set({ sabotageLog: log });
    });
  }

  // Main entrypoint: runs when background asks to check the site OR on initial script injection.
  function mainCheck(currentUrlFromMessage) {
    const currentUrl = currentUrlFromMessage || window.location.href;
    // Load configured settings: monitoredSites array, overrideEnabled flag, clauseText
    chrome.storage.sync.get(['monitoredSites', 'overrideEnabled', 'clauseText', 'redirectUrl', 'lockoutUntil'], (cfg) => {
      const monitoredSites = cfg.monitoredSites && Array.isArray(cfg.monitoredSites) && cfg.monitoredSites.length ? cfg.monitoredSites : DEFAULT_RISKY_SITES;
      const overrideEnabled = cfg.overrideEnabled === true;
      const clause = cfg.clauseText && cfg.clauseText.length ? cfg.clauseText : DEFAULT_CLAUSE;

      // Respect lockout period (if lockoutUntil is in future, show locked message and DON'T redirect)
      if (cfg.lockoutUntil && Date.now() < cfg.lockoutUntil) {
        // Create a special clause informing about lockout
        const locked = createClauseElement('Redirect locked: emotional fatigue threshold reached. Try again later.', cfg.redirectUrl);
        document.body.appendChild(locked);
        return;
      }

      if (!overrideEnabled) return;
      if (isRiskySite(currentUrl, monitoredSites)) {
        // inject the clause UI
        const clauseEl = createClauseElement(clause, cfg.redirectUrl);
        document.body.appendChild(clauseEl);
        // log the event for sabotage ledger (non-blocking)
        logSabotageEvent(currentUrl, clause);
      }
    });
  }

  // Listen to background.js messages (tab updates)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'checkSite') {
      mainCheck(request.url);
    }
  });

  // Also run on initial load, in case background message missed (defensive)
  try { mainCheck(); } catch (e) { /* fail silently in page context */ }

})();