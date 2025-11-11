// ledger.js
// Responsible for writing simple override events (sabotage log) into chrome.storage.local.
// Includes a simple impact rating heuristic based on clause text.
(function() {
  'use strict';

  // Compute naive emotional impact based on presence of keywords.
  function computeImpact(clauseText) {
    const t = clauseText ? clauseText.toLowerCase() : '';
    if (t.includes('trauma') || t.includes('rescue')) return 'High';
    if (t.includes('redirect') || t.includes('dignity')) return 'Moderate';
    return 'Mild';
  }

  // Append an event to the sabotageLog
  function logSabotageEvent(site, clauseText) {
    const timestamp = new Date().toISOString();
    const impact = computeImpact(clauseText);
    const event = { site, clauseText, impact, timestamp };
    chrome.storage.local.get(['sabotageLog'], (data) => {
      const log = data && data.sabotageLog ? data.sabotageLog : [];
      log.push(event);
      chrome.storage.local.set({ sabotageLog: log });
    });
  }

  // Expose to other content scripts (simple, non-namespaced)
  window.__guardian_logSabotageEvent = logSabotageEvent;
})();