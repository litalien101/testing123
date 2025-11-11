// popup.js - updated to configure server URL and user email and to show server validation status
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['overrideEnabled','clauseText','redirectUrl','adminMode','adminDeviceIds','serverUrl','userEmail'], (data) => {
    document.getElementById('overrideToggle').checked = !!data.overrideEnabled;
    document.getElementById('clausePreview').value = data.clauseText || '';
    document.getElementById('redirectUrl').value = data.redirectUrl || '';
    document.getElementById('adminMode').checked = !!data.adminMode;
    document.getElementById('adminDeviceIds').value = (Array.isArray(data.adminDeviceIds) ? data.adminDeviceIds.join(',') : '');
    document.getElementById('serverUrl').value = data.serverUrl || '';
    document.getElementById('userEmail').value = data.userEmail || '';
  });

  chrome.runtime.sendMessage({ action: 'getDeviceUUID' }, (resp) => {
    const el = document.getElementById('deviceUUID');
    el.innerText = resp && resp.deviceUUID ? resp.deviceUUID : 'n/a';
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const overrideEnabled = document.getElementById('overrideToggle').checked;
    const clauseText = document.getElementById('clausePreview').value;
    const redirectUrl = document.getElementById('redirectUrl').value;
    const adminMode = document.getElementById('adminMode').checked;
    const adminDeviceIdsRaw = document.getElementById('adminDeviceIds').value || '';
    const adminDeviceIds = adminDeviceIdsRaw.split(',').map(s=>s.trim()).filter(Boolean);
    const serverUrl = document.getElementById('serverUrl').value;
    const userEmail = document.getElementById('userEmail').value;

    chrome.storage.sync.set({ overrideEnabled, clauseText, redirectUrl, adminMode, adminDeviceIds, serverUrl, userEmail }, () => {
      alert('Settings saved.');
    });
  });

  document.getElementById('trialBtn').addEventListener('click', () => {
    const now = Date.now();
    const trialEnd = now + 7 * 24 * 60 * 60 * 1000;
    chrome.storage.sync.set({ isPremium: true, trialActive: true, trialEnd }, () => {
      alert('7-day trial activated locally.');
    });
  });

  document.getElementById('copyUUID').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getDeviceUUID' }, (resp) => {
      const id = resp && resp.deviceUUID;
      if (!id) return alert('No device UUID available.');
      navigator.clipboard.writeText(id).then(()=> alert('Device UUID copied to clipboard.'));
    });
  });

  document.getElementById('addCurrentAsAdmin').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getDeviceUUID' }, (resp) => {
      const id = resp && resp.deviceUUID;
      if (!id) return alert('No device UUID available.');
      chrome.storage.sync.get(['adminDeviceIds'], (d) => {
        const current = Array.isArray(d.adminDeviceIds) ? d.adminDeviceIds : [];
        if (!current.includes(id)) current.push(id);
        chrome.storage.sync.set({ adminDeviceIds: current }, () => {
          document.getElementById('adminDeviceIds').value = current.join(',');
          alert('This device added to admin list.');
        });
      });
    });
  });

  // Server validation check
  document.getElementById('serverUrl').addEventListener('change', updateServerStatus);
  document.getElementById('userEmail').addEventListener('change', updateServerStatus);

  function updateServerStatus() {
    const serverUrl = document.getElementById('serverUrl').value;
    const email = document.getElementById('userEmail').value;
    const statusEl = document.getElementById('serverStatus');
    if (!serverUrl || !email) { statusEl.innerText = 'server URL or email missing'; return; }
    fetch(serverUrl.replace(/\/$/, '') + '/user-status?email=' + encodeURIComponent(email))
      .then(r=>r.json()).then(json => {
        if (json && json.isActive) statusEl.innerText = 'Active (premium or trial)';
        else statusEl.innerText = 'Inactive';
      }).catch(err => { statusEl.innerText = 'validation failed'; });
  }

  // run initial server status check shortly after load
  setTimeout(updateServerStatus, 800);
});