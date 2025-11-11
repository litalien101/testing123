// admin.js - Polished admin UI interactions
(async function(){
  'use strict';
  // Helper: DOM
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // Elements
  const loginOverlay = $('#loginOverlay');
  const loginBtn = $('#loginBtn');
  const adminKey = $('#adminKey');
  const loginMsg = $('#loginMsg');

  const refreshBtn = $('#refreshBtn');
  const logoutBtn = $('#logoutBtn');
  const createInviteBtnTop = $('#createInviteBtnTop');
  const inviteModal = $('#inviteModal');
  const modalCreate = $('#modalCreate');
  const modalCancel = $('#modalCancel');
  const modalEmail = $('#modalEmail');
  const modalName = $('#modalName');
  const modalResult = $('#modalResult');
  const usersTableBody = $('#usersTable tbody');
  const searchInput = $('#searchInput');

  const totalUsersEl = $('#totalUsers');
  const activeUsersEl = $('#activeUsers');
  const premiumPctEl = $('#premiumPct');
  const verifiedPctEl = $('#verifiedPct');
  const toastContainer = $('#toastContainer');

  // Toast helper
  function toast(msg, type='info') {
    const d = document.createElement('div');
    d.className = 'toast'; d.innerText = msg;
    toastContainer.appendChild(d);
    setTimeout(()=>{ d.style.opacity = '0'; setTimeout(()=> d.remove(), 400); }, 3500);
  }

  // Check admin session by attempting to fetch /admin/users (will 401 if not)
  async function hasAdminSession() {
    try {
      const r = await fetch('/admin/users', { credentials: 'same-origin' });
      return r.status === 200;
    } catch(e) { return false; }
  }

  async function showLoginIfNeeded() {
    const ok = await hasAdminSession();
    if (!ok) {
      loginOverlay.style.display = 'flex';
      loginOverlay.setAttribute('aria-hidden','false');
    } else {
      loginOverlay.style.display = 'none';
      loginOverlay.setAttribute('aria-hidden','true');
      await loadUsers();
    }
  }

  // Login flow
  loginBtn.addEventListener('click', async () => {
    const key = adminKey.value.trim();
    if (!key) { loginMsg.innerText = 'Enter admin key'; return; }
    try {
      const r = await fetch('/admin-login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key }) , credentials: 'same-origin' });
      const j = await r.json();
      if (r.ok && j.ok) {
        loginOverlay.style.display='none'; loginOverlay.setAttribute('aria-hidden','true');
        adminKey.value='';
        toast('Logged in');
        await loadUsers();
      } else { loginMsg.innerText = 'Login failed'; }
    } catch(e) { loginMsg.innerText = 'Network error'; }
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await fetch('/admin-logout', { method:'POST', credentials:'same-origin' });
    toast('Logged out');
    showLoginIfNeeded();
  });

  // Invite modal controls
  createInviteBtnTop.addEventListener('click', ()=> openModal());
  modalCancel.addEventListener('click', ()=> closeModal());
  async function openModal(){ inviteModal.setAttribute('aria-hidden','false'); inviteModal.style.display='flex'; modalResult.innerText=''; modalEmail.value=''; modalName.value=''; modalEmail.focus(); }
  function closeModal(){ inviteModal.setAttribute('aria-hidden','true'); inviteModal.style.display='none'; }

  modalCreate.addEventListener('click', async () => {
    const email = modalEmail.value.trim();
    const name = modalName.value.trim();
    if (!email) return modalResult.innerText = 'Email required';
    modalResult.innerText = 'Creating…';
    try {
      const r = await fetch('/admin/create-invite', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ email, name }) });
      const j = await r.json();
      if (r.ok) {
        modalResult.innerText = 'Invite created. URL copied to clipboard.';
        navigator.clipboard.writeText(j.inviteUrl || j.token).catch(()=>{});
        toast('Invite created and URL copied');
        closeModal();
        await loadUsers();
      } else {
        modalResult.innerText = j.error || 'Failed to create invite';
      }
    } catch(e){ modalResult.innerText = 'Network error'; }
  });

  // Fetch users and render table
  async function loadUsers() {
    try {
      const r = await fetch('/admin/users', { credentials:'same-origin' });
      if (!r.ok) { if (r.status === 401) return showLoginIfNeeded(); toast('Failed to load users'); return; }
      const j = await r.json();
      const users = Array.isArray(j.users) ? j.users : [];
      renderUsers(users);
      updateSummary(users);
    } catch(e){ toast('Network error'); }
  }

  function updateSummary(users) {
    const total = users.length;
    const active = users.filter(u => u.premium || (u.trial_end && u.trial_end > Math.floor(Date.now()/1000))).length;
    const premiumCount = users.filter(u => u.premium).length;
    const verifiedCount = users.filter(u => u.verified).length;
    totalUsersEl.innerText = total;
    activeUsersEl.innerText = active;
    premiumPctEl.innerText = total ? Math.round((premiumCount/total)*100) + '%' : '—';
    verifiedPctEl.innerText = total ? Math.round((verifiedCount/total)*100) + '%' : '—';
  }

  function renderUsers(users) {
    usersTableBody.innerHTML = '';
    const q = searchInput.value.trim().toLowerCase();
    const filtered = users.filter(u => {
      if (!q) return true;
      return (u.email||'').toLowerCase().includes(q) || (u.name||'').toLowerCase().includes(q);
    });
    filtered.forEach(u => {
      const tr = document.createElement('tr');
      const premiumBadge = u.premium ? '<span class="badge premium">Premium</span>' : '';
      const verifiedBadge = u.verified ? '<span class="badge verified">Verified</span>' : '';
      tr.innerHTML = `
        <td><div class="small">${u.email||''}</div></td>
        <td>${u.name||''}</td>
        <td>${premiumBadge}</td>
        <td>${verifiedBadge}</td>
        <td><div class="small">${u.stripe_customer_id||''}</div></td>
        <td>
          <button class="action-btn" data-email="${u.email}" data-action="toggle">${u.premium? 'Revoke':'Grant'}</button>
        </td>`;
      usersTableBody.appendChild(tr);
    });
    // wire action buttons
    $$('.action-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      const email = e.target.dataset.email;
      const makePremium = e.target.innerText === 'Grant';
      try {
        await fetch('/admin/set-premium', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ email, premium: makePremium }) });
        toast('Updated premium status for ' + email);
        await loadUsers();
      } catch(e){ toast('Error updating user'); }
    }));
  }

  // Search input debounce
  let searchTimer = null;
  searchInput.addEventListener('input', ()=> {
    clearTimeout(searchTimer); searchTimer = setTimeout(()=> loadUsers(), 300);
  });

  // Refresh button
  refreshBtn.addEventListener('click', ()=> loadUsers());

  // Initial check
  await showLoginIfNeeded();

  // Expose small keyboard shortcut: "n" to open invite modal when logged in
  document.addEventListener('keydown', (e) => { if (e.key === 'n' && loginOverlay.style.display === 'none') openModal(); });

})();
