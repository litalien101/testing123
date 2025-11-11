// utils_for_tests.js - contains urlMatchesMonitored exported for unit tests (NodeJS compatible)
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
module.exports = { urlMatchesMonitored };
