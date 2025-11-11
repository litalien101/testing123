// fatigue.js
// Computes a weekly emotional fatigue score and, when threshold exceeded, fires a Chrome notification.
// This file is intended to be lightweight and reusable from dashboard/settings pages.
(function() {
  'use strict';

  // read sabotageLog and compute fatigue for last 7 days
  function computeFatigueScore(callback) {
    chrome.storage.local.get(['sabotageLog'], (data) => {
      const log = data && data.sabotageLog ? data.sabotageLog : [];
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let high = 0, moderate = 0, mild = 0;
      log.forEach(ev => {
        const t = new Date(ev.timestamp).getTime();
        if (t >= oneWeekAgo) {
          if (ev.impact === 'High') high++;
          else if (ev.impact === 'Moderate') moderate++;
          else mild++;
        }
      });
      const score = high * 3 + moderate * 2 + mild * 1;
      callback({ high, moderate, mild, score });
    });
  }

  // optional: create a notification if threshold exceeded (caller must ensure notification permission)
  function checkAndNotify(threshold) {
    computeFatigueScore((summary) => {
      if (summary.score >= threshold) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'Guardian Alert',
          message: `High emotional fatigue detected: ${summary.score} points this week.`,
          priority: 2
        });
      }
    });
  }

  // Expose helpers on window for dashboard pages
  window.__guardian_computeFatigueScore = computeFatigueScore;
  window.__guardian_checkAndNotify = checkAndNotify;
})();