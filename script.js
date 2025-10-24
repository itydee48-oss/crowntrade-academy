/* script.js
   Full client-side logic for Crown Trade Academy referral system (localStorage-based)
   Works with:
    - referral-register.html
    - referral-pending.html
    - referral-dashboard.html
    - admin-dashboard.html
   NOTE: Add <script src="script.js"></script> to bottom of each page (before </body>)
*/

/* ---------------- Configuration & Storage Keys ---------------- */
const KEYS = {
  APPS: 'cta_referral_applications',
  USERS: 'cta_users',
  SETTINGS: 'cta_program_settings',
  WITHDRAWALS: 'cta_withdrawal_requests',
  CURRENT_USER: 'cta_current_user_email',
  ADMIN_AUTH: 'cta_admin_auth' // stores {username, password} as JSON
};

/* Default program settings (will be persisted on first run) */
const DEFAULT_SETTINGS = {
  registrationFee: 500,
  referralEarnings: 300, // goes to referrer when referred approved
  businessShare: 200,    // goes to business when referred approved
  minWithdrawal: 100,
  startingBalanceOnApproval: 500,
  totalBusinessEarnings: 0, // tracked
  totalReferralPayouts: 0   // tracked
};

/* Default admin credentials (only localStorage-stored) */
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin' // you asked for default admin = 'admin'
};

/* ----------------- Helpers: storage get/set ----------------- */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('readJSON error', key, e);
    return fallback;
  }
}
function writeJSON(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

/* Initialize settings and admin if not present */
if (!readJSON(KEYS.SETTINGS, null)) writeJSON(KEYS.SETTINGS, DEFAULT_SETTINGS);
if (!readJSON(KEYS.ADMIN_AUTH, null)) writeJSON(KEYS.ADMIN_AUTH, DEFAULT_ADMIN);

/* Convenience getters/setters */
function getSettings() { return readJSON(KEYS.SETTINGS, DEFAULT_SETTINGS); }
function setSettings(obj) { writeJSON(KEYS.SETTINGS, obj); }
function getApplications() { return readJSON(KEYS.APPS, []); }
function setApplications(list) { writeJSON(KEYS.APPS, list); }
function getUsers() { return readJSON(KEYS.USERS, []); }
function setUsers(list) { writeJSON(KEYS.USERS, list); }
function getWithdrawals() { return readJSON(KEYS.WITHDRAWALS, []); }
function setWithdrawals(list) { writeJSON(KEYS.WITHDRAWALS, list); }
function getAdminAuth() { return readJSON(KEYS.ADMIN_AUTH, DEFAULT_ADMIN); }
function setAdminAuth(obj) { writeJSON(KEYS.ADMIN_AUTH, obj); }

/* ----------------- Utility Functions ----------------- */
function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

/* ----------------- Referral link detection ----------------- */
/* If referral-register.html is opened with ?ref=USERID, store temporary ref info */
function captureReferralFromQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get('ref') || q.get('referrer') || null;
    if (ref) {
      // store temporary ref id for this browser session
      sessionStorage.setItem('cta_referrer_temp', ref);
    }
  } catch (e) { /* ignore */ }
}

/* Used on referral-register: returns stored referrer id (if any) */
function getTempReferrer() {
  return sessionStorage.getItem('cta_referrer_temp') || null;
}

/* ----------------- Registration & Referral Application Flow -----------------
   The site is split:
   - Users create an account (we assume register.html or similar) OR directly apply.
   - referral-register.html -> multi-step application including screenshot
   - After submit, an application saved and a user record (pending) added.
   - referral-pending.html polls to detect approval (checked against user record)
   - admin-dashboard approves -> credits referrer + business and updates user
   - referral-dashboard shows user info and unique referral link
*/

/* Multi-step application data holder (keeps form state if needed) */
const MultiApp = {
  data: {
    fullName: '',
    email: '',
    phone: '',
    password: '', // if you choose to capture password at registration
    referredBy: null, // will be set from query param (USER ID)
    proofBase64: ''
  }
};

/* Initialize capture (useful if referral-register page opened directly) */
document.addEventListener('DOMContentLoaded', () => {
  captureReferralFromQuery();
});

/* --------- File handling for screenshot upload (called from referral-register page) --------- */
function handleAppFileInput(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return alert('No file selected');
  if (!file.type.match('image.*')) return alert('Please upload an image file (png/jpg/jpeg)');
  if (file.size > 5 * 1024 * 1024) return alert('File must be less than 5MB');

  const reader = new FileReader();
  reader.onload = e => {
    MultiApp.data.proofBase64 = e.target.result;
    // update UI if needed: show preview container with preview image id="previewImage"
    const img = document.getElementById('previewImage');
    if (img) img.src = e.target.result;
    const preview = document.getElementById('filePreview');
    const content = document.getElementById('fileUploadContent');
    if (content) content.style.display = 'none';
    if (preview) preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

/* Allow drag/drop */
function initDragDrop(uploadAreaId = 'fileUploadArea', inputId = 'paymentProof') {
  const area = document.getElementById(uploadAreaId);
  const input = document.getElementById(inputId);
  if (!area || !input) return;
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', e => { area.classList.remove('dragover'); });
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      input.files = files;
      handleAppFileInput(input);
    }
  });
  input.addEventListener('change', () => handleAppFileInput(input));
}

/* ---------- Submit application (called by referral-register.html submit) ---------- */
function submitReferralApplicationFromForm(formElId = 'applicationForm') {
  try {
    // Read input values from DOM (fall back to MultiApp.data)
    const fullName = (document.getElementById('fullName')?.value || MultiApp.data.fullName || '').trim();
    const email = (document.getElementById('email')?.value || MultiApp.data.email || '').trim();
    const phone = (document.getElementById('phone')?.value || MultiApp.data.phone || '').trim();
    const pwd = (document.getElementById('password')?.value || MultiApp.data.password || '').trim();
    const referralCodeInput = (document.getElementById('referralCode')?.value || '').trim();

    if (!fullName || !email || !phone) {
      return alert('Please fill name, email and phone.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return alert('Please enter a valid email address');

    // Proof must be present (we moved upload to payment step)
    if (!MultiApp.data.proofBase64) {
      return alert('Please upload payment proof in payment step.');
    }

    // Detect referrer: prefer session stored ref, else allow optional referral input (user typed referrer id)
    const tempRef = getTempReferrer();
    const referredBy = tempRef || (referralCodeInput ? referralCodeInput : null);

    // Check existing applications or users with same email
    const apps = getApplications();
    const users = getUsers();
    if (apps.find(a => a.email === email) || users.find(u => u.email === email)) {
      return alert('An application or account with that email already exists. Please login or use another email.');
    }

    // Build application object
    const appId = uid('APP-');
    const app = {
      id: appId,
      fullName,
      email,
      phone,
      password: pwd || null,
      referredBy, // can be null or userId string
      proofBase64: MultiApp.data.proofBase64,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      rejectionReason: null
    };
    apps.push(app);
    setApplications(apps);

    // Create user record (pending)
    const userId = uid('USER-');
    const user = {
      id: userId,
      fullName,
      email,
      phone,
      password: pwd || null,
      status: 'pending', // pending until admin approves
      referredBy, // store who referred them (userId)
      userReferralLink: null, // generated on approved or available on dashboard after approval
      balance: 0,
      totalEarnings: 0,
      pendingEarnings: 0, // e.g., referral credits pending until processed
      referrals: [], // list of referred users
      joinedAt: new Date().toISOString(),
      approvedAt: null,
      applicationId: appId
    };
    users.push(user);
    setUsers(users);

    // store current user email in session-local storage so waiting page can detect
    localStorage.setItem(KEYS.CURRENT_USER, email);

    // show success and redirect to pending page
    alert('Application submitted successfully! Redirecting to waiting page...');
    window.location.href = 'referral-pending.html';
  } catch (e) {
    console.error('submitReferralApplicationFromForm error', e);
    alert('An error occurred when submitting application. Check console.');
  }
}

/* ---------------- Waiting / Pending page auto-check ---------------- */
function startPendingAutoCheck(pollInterval = 4000) {
  const email = localStorage.getItem(KEYS.CURRENT_USER);
  if (!email) return;
  let checks = 0;
  const maxChecks = 300; // safety
  const elCounter = document.getElementById('counter');

  function checkNow() {
    checks++;
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (user) {
      if (user.status === 'approved') {
        // show approve UI briefly then redirect
        const spinner = document.getElementById('loadingSpinner');
        const badge = document.getElementById('statusBadge');
        const title = document.getElementById('statusTitle');
        const msg = document.getElementById('statusMessage');
        if (spinner) spinner.style.display = 'none';
        if (badge) { badge.textContent = 'APPROVED'; badge.style.background = '#28a745'; badge.style.color = '#fff'; }
        if (title) title.textContent = 'Application Approved!';
        if (msg) msg.textContent = 'You have been approved — redirecting to your dashboard...';
        setTimeout(() => {
          window.location.href = 'referral-dashboard.html';
        }, 1500);
        return;
      } else if (user.status === 'rejected') {
        const spinner = document.getElementById('loadingSpinner');
        const badge = document.getElementById('statusBadge');
        const title = document.getElementById('statusTitle');
        const msg = document.getElementById('statusMessage');
        if (spinner) spinner.style.display = 'none';
        if (badge) { badge.textContent = 'REJECTED'; badge.style.background = '#dc3545'; badge.style.color = '#fff'; }
        if (title) title.textContent = 'Application Not Approved';
        if (msg) msg.textContent = user.rejectionReason || 'Your application was not approved.';
        return;
      }
    }
    if (elCounter) elCounter.textContent = Math.max(0, 5 - Math.floor(checks % 5));

    if (checks < maxChecks) {
      setTimeout(checkNow, pollInterval);
    } else {
      const countdown = document.getElementById('countdown');
      if (countdown) countdown.innerHTML = 'Status check timeout. Please refresh the page or contact support.';
    }
  }
  setTimeout(checkNow, 1000);
}

/* ---------------- Admin: Authentication & Dashboard ---------------- */
function adminLoginPromptIfNeeded() {
  const auth = getAdminAuth();
  const logged = sessionStorage.getItem('cta_admin_logged_in');
  if (logged === 'true') return true;
  // show prompt
  const user = prompt('Enter admin username:');
  const pass = prompt('Enter admin password:');
  if (!user || !pass) { alert('Auth canceled'); window.location.href = 'index.html'; return false; }
  if (user === auth.username && pass === auth.password) {
    sessionStorage.setItem('cta_admin_logged_in', 'true');
    return true;
  } else {
    alert('Invalid admin credentials');
    window.location.href = 'index.html';
    return false;
  }
}

/* Admin logout */
function adminLogout() {
  sessionStorage.removeItem('cta_admin_logged_in');
  window.location.href = 'index.html';
}

/* Admin: load dashboard data into DOM (if present) */
function adminLoadDashboard() {
  try {
    const apps = getApplications();
    const users = getUsers();
    const settings = getSettings();
    const pending = apps.filter(a => !a.status || a.status === 'pending');
    const approved = apps.filter(a => a.status === 'approved');
    const rejected = apps.filter(a => a.status === 'rejected');

    // Stats DOM updates
    const elTotalRevenue = document.getElementById('totalRevenue');
    const elPending = document.getElementById('pendingApprovals');
    const elTotalUsers = document.getElementById('totalUsers');
    const elConversion = document.getElementById('conversionRate');
    const elBusinessEarnings = document.getElementById('businessEarnings');
    const elTotalReferralPayouts = document.getElementById('totalReferralPayouts');

    if (elTotalRevenue) elTotalRevenue.textContent = `KES ${approved.length * settings.registrationFee}`;
    if (elPending) elPending.textContent = pending.length;
    if (elTotalUsers) elTotalUsers.textContent = approved.length;
    if (elConversion) elConversion.textContent = apps.length ? `${Math.round((approved.length / apps.length) * 100)}%` : '0%';
    if (elBusinessEarnings) elBusinessEarnings.textContent = `KES ${settings.totalBusinessEarnings || 0}`;
    if (elTotalReferralPayouts) elTotalReferralPayouts.textContent = `KES ${settings.totalReferralPayouts || 0}`;

    // List pending applications
    const listEl = document.getElementById('applicationsList');
    if (listEl) {
      if (!pending.length) {
        listEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem;">No pending applications.</div>`;
      } else {
        listEl.innerHTML = pending.map(a => {
          // find referer user display
          const refUser = users.find(u => u.id === a.referredBy);
          const refLabel = refUser ? `${escapeHtml(refUser.fullName)} (${escapeHtml(refUser.email)})` : (a.referredBy ? escapeHtml(a.referredBy) : 'None');
          return `
            <div class="application-card" style="background:var(--off-white); padding:1rem; border-radius:10px; margin-bottom:1rem;">
              <h3 style="margin:0 0 0.25rem 0; color:var(--dark-brown);">${escapeHtml(a.fullName)}</h3>
              <p style="margin:0;"><strong>Email:</strong> ${escapeHtml(a.email)}</p>
              <p style="margin:0;"><strong>Phone:</strong> ${escapeHtml(a.phone)}</p>
              <p style="margin:0;"><strong>Referred By:</strong> ${escapeHtml(refLabel)}</p>
              <p style="margin-top:0.5rem;">
                <a href="#" onclick="viewPaymentProofAdmin('${a.id}'); return false;" style="color:var(--warm-beige); text-decoration:none;">📎 View Payment Proof</a>
              </p>
              <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
                <button class="luxury-btn btn-success" onclick="adminApproveApplication('${a.id}')">Approve</button>
                <button class="luxury-btn btn-danger" onclick="adminRejectApplication('${a.id}')">Reject</button>
                <button class="luxury-btn" onclick="alertApplicationDetails('${a.id}')">Details</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Load withdrawals list
    const withdrawals = getWithdrawals();
    const wEl = document.getElementById('withdrawalsList');
    if (wEl) {
      if (!withdrawals.length) {
        wEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem;">No withdrawal requests.</div>`;
      } else {
        wEl.innerHTML = withdrawals.map((w, idx) => `
          <div class="application-card" style="background:var(--off-white); padding:1rem; border-radius:10px; margin-bottom:1rem;">
            <h3 style="margin:0 0 .25rem 0; color:var(--dark-brown);">${escapeHtml(w.userName)}</h3>
            <p style="margin:0;"><strong>Amount:</strong> KES ${w.amount}</p>
            <p style="margin:0;"><strong>MPesa:</strong> ${escapeHtml(w.phone)}</p>
            <p style="margin:0;"><strong>Requested:</strong> ${new Date(w.requestedAt).toLocaleString()}</p>
            <div style="margin-top:.75rem; display:flex; gap:.5rem;">
              <button class="luxury-btn btn-success" onclick="adminApproveWithdrawal(${idx})">Approve</button>
              <button class="luxury-btn btn-danger" onclick="adminRejectWithdrawal(${idx})">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    // Load settings into input fields (if present on admin page)
    const regFeeInput = document.getElementById('registrationFee');
    const refEarningsInput = document.getElementById('referralEarnings');
    const bizShareInput = document.getElementById('businessShare');
    const minWithdrawalInput = document.getElementById('minWithdrawal');
    const startBalInput = document.getElementById('startBalance');

    if (regFeeInput) regFeeInput.value = settings.registrationFee || DEFAULT_SETTINGS.registrationFee;
    if (refEarningsInput) refEarningsInput.value = settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings;
    if (bizShareInput) bizShareInput.value = settings.businessShare || DEFAULT_SETTINGS.businessShare;
    if (minWithdrawalInput) minWithdrawalInput.value = settings.minWithdrawal || DEFAULT_SETTINGS.minWithdrawal;
    if (startBalInput) startBalInput.value = settings.startingBalanceOnApproval || DEFAULT_SETTINGS.startingBalanceOnApproval;

    // Admin password change UI element: current admin auth
    const adminAuth = getAdminAuth();
    const adminUserEl = document.getElementById('currentAdminUser');
    if (adminUserEl) adminUserEl.textContent = adminAuth.username;

  } catch (e) {
    console.error('adminLoadDashboard error', e);
  }
}

/* Admin: view proof */
function viewPaymentProofAdmin(appId) {
  const apps = getApplications();
  const a = apps.find(x => x.id === appId);
  if (!a || !a.proofBase64) return alert('No proof found for this application');
  const w = window.open();
  w.document.write(`
    <html><head><title>Payment Proof</title></head>
    <body style="margin:0;padding:20px;text-align:center;background:#f7f5f2;">
      <h2>${escapeHtml(a.fullName)} - Payment Proof</h2>
      <img src="${a.proofBase64}" style="max-width:100%; max-height:80vh; border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,0.12);" />
      <br/><br/><button onclick="window.close()" style="padding:10px 18px;background:#3A2D28;color:white;border:none;border-radius:6px;cursor:pointer;">Close</button>
    </body></html>
  `);
}

/* Admin: Approve application (credits referrer & business on approval) */
function adminApproveApplication(appId) {
  if (!confirm('Approve this application?')) return;
  const apps = getApplications();
  const idx = apps.findIndex(a => a.id === appId);
  if (idx === -1) return alert('Application not found');

  apps[idx].status = 'approved';
  apps[idx].reviewedAt = new Date().toISOString();
  setApplications(apps);

  // Update user status, set starting balance, generate referral link for the user
  const users = getUsers();
  const user = users.find(u => u.applicationId === appId);
  if (!user) return alert('Linked user record not found (data mismatch)');

  user.status = 'approved';
  user.approvedAt = new Date().toISOString();
  user.balance = (user.balance || 0) + (getSettings().startingBalanceOnApproval || DEFAULT_SETTINGS.startingBalanceOnApproval);
  user.userReferralLink = `referral-register.html?ref=${user.id}`;
  setUsers(users);

  // Credit referrer and business earnings if referrer exists
  const settings = getSettings();
  if (user.referredBy) {
    const refUsers = getUsers();
    const refIndex = refUsers.findIndex(u => u.id === user.referredBy);
    if (refIndex !== -1) {
      // credit referrer AFTER approval
      refUsers[refIndex].balance = (refUsers[refIndex].balance || 0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings);
      refUsers[refIndex].totalEarnings = (refUsers[refIndex].totalEarnings || 0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings);
      // record referral entry
      refUsers[refIndex].referrals = refUsers[refIndex].referrals || [];
      refUsers[refIndex].referrals.push({ id: user.id, name: user.fullName, joinedAt: new Date().toISOString(), amount: settings.referralEarnings });

      // update stored users
      setUsers(refUsers);

      // update settings totals for business & referral payouts
      const s = getSettings();
      s.totalReferralPayouts = (s.totalReferralPayouts || 0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings);
      s.totalBusinessEarnings = (s.totalBusinessEarnings || 0) + (settings.businessShare || DEFAULT_SETTINGS.businessShare);
      setSettings(s);
    } else {
      // If referrer id referenced but not found, just add business share
      const s = getSettings();
      s.totalBusinessEarnings = (s.totalBusinessEarnings || 0) + (settings.businessShare || DEFAULT_SETTINGS.businessShare);
      setSettings(s);
    }
  } else {
    // no referrer — only business gets registration fee maybe
    const s = getSettings();
    s.totalBusinessEarnings = (s.totalBusinessEarnings || 0) + (settings.businessShare || DEFAULT_SETTINGS.businessShare);
    setSettings(s);
  }

  alert('Application approved and payouts credited (if applicable).');
  // Refresh admin UI
  adminLoadDashboard();
}

/* Admin: Reject application */
function adminRejectApplication(appId) {
  const reason = prompt('Enter rejection reason (optional):') || 'Rejected by admin';
  if (!confirm('Are you sure you want to reject this application?')) return;
  const apps = getApplications();
  const idx = apps.findIndex(a => a.id === appId);
  if (idx === -1) return alert('Application not found');
  apps[idx].status = 'rejected';
  apps[idx].rejectionReason = reason;
  apps[idx].reviewedAt = new Date().toISOString();
  setApplications(apps);

  // Update user's status too
  const users = getUsers();
  const uidx = users.findIndex(u => u.applicationId === appId);
  if (uidx !== -1) {
    users[uidx].status = 'rejected';
    users[uidx].approvedAt = null;
    setUsers(users);
  }

  alert('Application rejected.');
  adminLoadDashboard();
}

/* Admin: Approve withdrawal request (this will mark request removed / processed) */
function adminApproveWithdrawal(index) {
  if (!confirm('Approve and process this withdrawal?')) return;
  const withdrawals = getWithdrawals();
  if (index < 0 || index >= withdrawals.length) return alert('Invalid request');
  const req = withdrawals[index];
  // (Assumes balance was already reserved at request time)
  // Remove the request
  withdrawals.splice(index, 1);
  setWithdrawals(withdrawals);
  alert('Withdrawal processed. Marked as completed.');
  adminLoadDashboard();
}

/* Admin: Reject withdrawal request (refund user) */
function adminRejectWithdrawal(index) {
  if (!confirm('Reject this withdrawal? This will refund the user.')) return;
  const withdrawals = getWithdrawals();
  if (index < 0 || index >= withdrawals.length) return alert('Invalid request');
  const req = withdrawals[index];
  // Refund user
  const users = getUsers();
  const ui = users.findIndex(u => u.email === req.userEmail);
  if (ui !== -1) {
    users[ui].balance = (users[ui].balance || 0) + req.amount;
    setUsers(users);
  }
  // remove withdrawal
  withdrawals.splice(index, 1);
  setWithdrawals(withdrawals);
  alert('Withdrawal rejected and user refunded.');
  adminLoadDashboard();
}

/* Admin: Update settings from dashboard UI */
function adminSaveSettingsFromUI() {
  const registrationFee = parseInt(document.getElementById('registrationFee')?.value || getSettings().registrationFee, 10);
  const referralEarnings = parseInt(document.getElementById('referralEarnings')?.value || getSettings().referralEarnings, 10);
  const businessShare = parseInt(document.getElementById('businessShare')?.value || getSettings().businessShare, 10);
  const minWithdrawal = parseInt(document.getElementById('minWithdrawal')?.value || getSettings().minWithdrawal, 10);
  const startingBalance = parseInt(document.getElementById('startBalance')?.value || getSettings().startingBalanceOnApproval, 10);

  const s = getSettings();
  s.registrationFee = isNaN(registrationFee) ? s.registrationFee : registrationFee;
  s.referralEarnings = isNaN(referralEarnings) ? s.referralEarnings : referralEarnings;
  s.businessShare = isNaN(businessShare) ? s.businessShare : businessShare;
  s.minWithdrawal = isNaN(minWithdrawal) ? s.minWithdrawal : minWithdrawal;
  s.startingBalanceOnApproval = isNaN(startingBalance) ? s.startingBalanceOnApproval : startingBalance;
  setSettings(s);
  alert('Settings updated.');
  adminLoadDashboard();
}

/* Admin: Change admin password from UI */
function adminChangePassword(newPassInputId = 'newAdminPassword') {
  const newPass = document.getElementById(newPassInputId)?.value;
  if (!newPass || newPass.length < 3) { alert('Enter a new password (min 3 chars)'); return; }
  const auth = getAdminAuth();
  auth.password = newPass;
  setAdminAuth(auth);
  alert('Admin password changed.');
  // clear field
  document.getElementById(newPassInputId).value = '';
}

/* ---------- User dashboard functions ---------- */
/* Load user dashboard data into DOM */
function userLoadDashboard() {
  const currentEmail = localStorage.getItem(KEYS.CURRENT_USER);
  if (!currentEmail) {
    // no session -> redirect to index
    window.location.href = 'index.html';
    return;
  }
  const users = getUsers();
  const user = users.find(u => u.email === currentEmail);
  if (!user) { window.location.href = 'index.html'; return; }
  // if not approved -> redirect to pending
  if (user.status !== 'approved') {
    window.location.href = 'referral-pending.html';
    return;
  }

  // Populate UI elements (if present)
  const welcomeEl = document.getElementById('userWelcome');
  if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.fullName}!`;

  const curBal = document.getElementById('currentBalance');
  const totEarn = document.getElementById('totalEarnings');
  const refCount = document.getElementById('referralCount');
  const pendEl = document.getElementById('pendingEarnings');

  if (curBal) curBal.textContent = `KES ${user.balance || 0}`;
  if (totEarn) totEarn.textContent = `KES ${user.totalEarnings || 0}`;
  if (refCount) refCount.textContent = (user.referrals || []).length;
  if (pendEl) pendEl.textContent = `KES ${user.pendingEarnings || 0}`;

  // Generate referral link if missing
  if (!user.userReferralLink) {
    user.userReferralLink = `referral-register.html?ref=${user.id}`;
    // persist
    const us = getUsers();
    const ui = us.findIndex(x => x.email === currentEmail);
    if (ui !== -1) { us[ui] = user; setUsers(us); }
  }
  const linkEl = document.getElementById('referralCodeDisplay');
  if (linkEl) linkEl.textContent = window.location.origin + '/' + user.userReferralLink;

  // referral history
  const historyEl = document.getElementById('referralHistory');
  if (historyEl) {
    if (!user.referrals || user.referrals.length === 0) {
      historyEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem;">No referrals yet. Share your link to start earning!</div>`;
    } else {
      historyEl.innerHTML = user.referrals.map(r => `
        <div style="background:var(--off-white); padding:1rem; border-radius:8px; margin:0.5rem 0; display:flex; justify-content:space-between;">
          <div>
            <strong style="color:var(--dark-brown);">${escapeHtml(r.name)}</strong>
            <p style="color:var(--muted-rose); margin:0;">Joined: ${new Date(r.joinedAt).toLocaleDateString()}</p>
          </div>
          <div style="color:var(--gold-accent); font-weight:600;">KES ${r.amount}</div>
        </div>
      `).join('');
    }
  }
}

/* User: copy referral link */
function userCopyReferralLink() {
  const el = document.getElementById('referralCodeDisplay');
  if (!el) return alert('No referral link found.');
  const link = el.textContent || el.innerText;
  navigator.clipboard.writeText(link).then(() => alert('Referral link copied to clipboard!'));
}

/* User: share helpers */
function userShareWhatsApp() {
  const el = document.getElementById('referralCodeDisplay');
  if (!el) return alert('No referral link.');
  const msg = `Join Crown Trade Academy using my link: ${el.textContent || el.innerText}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
function userShareEmail() {
  const el = document.getElementById('referralCodeDisplay');
  if (!el) return alert('No referral link.');
  window.open(`mailto:?subject=${encodeURIComponent('Join Crown Trade Academy')}&body=${encodeURIComponent('Join here: ' + (el.textContent || el.innerText))}`, '_blank');
}
function userShareSMS() {
  const el = document.getElementById('referralCodeDisplay');
  if (!el) return alert('No referral link.');
  window.open(`sms:?body=${encodeURIComponent('Join here: ' + (el.textContent || el.innerText))}`, '_blank');
}

/* User: Request withdrawal */
function userRequestWithdrawal() {
  const amount = parseInt(document.getElementById('withdrawalAmount')?.value || '0', 10);
  const phone = (document.getElementById('withdrawalPhone')?.value || '').trim();
  if (!amount || !phone) return alert('Please enter amount and phone');
  const settings = getSettings();
  if (amount < settings.minWithdrawal) return alert(`Minimum withdrawal is KES ${settings.minWithdrawal}`);

  const currentEmail = localStorage.getItem(KEYS.CURRENT_USER);
  if (!currentEmail) return alert('No user session');

  const users = getUsers();
  const ui = users.findIndex(u => u.email === currentEmail);
  if (ui === -1) return alert('User not found');
  if ((users[ui].balance || 0) < amount) return alert('Insufficient balance');

  // Reserve funds by deducting immediately and creating withdrawal request
  users[ui].balance -= amount;
  setUsers(users);

  const req = {
    id: uid('W-'),
    userEmail: currentEmail,
    userName: users[ui].fullName,
    amount,
    phone,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
  const list = getWithdrawals();
  list.push(req);
  setWithdrawals(list);

  alert('Withdrawal requested. Admin will review and process it.');
  // reload dashboard elements
  if (typeof userLoadDashboard === 'function') userLoadDashboard();
}

/* User: change own password */
function userChangePassword(inputId = 'userNewPassword') {
  const newPass = document.getElementById(inputId)?.value;
  if (!newPass || newPass.length < 3) return alert('Enter new password (min 3 chars)');
  const email = localStorage.getItem(KEYS.CURRENT_USER);
  if (!email) return alert('No user session');
  const users = getUsers();
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) return alert('User not found');
  users[idx].password = newPass;
  setUsers(users);
  document.getElementById(inputId).value = '';
  alert('Password updated.');
}

/* ---------- Small utilities & global bindings ---------- */
function alertApplicationDetails(appId) {
  const apps = getApplications();
  const a = apps.find(x => x.id === appId);
  if (!a) return alert('Application not found');
  alert(`Application:\nName: ${a.fullName}\nEmail: ${a.email}\nPhone: ${a.phone}\nStatus: ${a.status}\nSubmitted: ${new Date(a.submittedAt).toLocaleString()}`);
}

/* Bind commonly used functions globally so inline onclicks in your HTML keep working */
window.handleAppFileInput = handleAppFileInput;
window.initDragDrop = initDragDrop;
window.submitReferralApplicationFromForm = submitReferralApplicationFromForm;
window.startPendingAutoCheck = startPendingAutoCheck;
window.adminLoginPromptIfNeeded = adminLoginPromptIfNeeded;
window.adminLoadDashboard = adminLoadDashboard;
window.adminApproveApplication = adminApproveApplication;
window.adminRejectApplication = adminRejectApplication;
window.adminApproveWithdrawal = adminApproveWithdrawal;
window.adminRejectWithdrawal = adminRejectWithdrawal;
window.adminSaveSettingsFromUI = adminSaveSettingsFromUI;
window.adminChangePassword = adminChangePassword;
window.adminLogout = adminLogout;
window.userLoadDashboard = userLoadDashboard;
window.userCopyReferralLink = userCopyReferralLink;
window.userShareWhatsApp = userShareWhatsApp;
window.userShareEmail = userShareEmail;
window.userShareSMS = userShareSMS;
window.userRequestWithdrawal = userRequestWithdrawal;
window.userChangePassword = userChangePassword;
window.viewPaymentProofAdmin = viewPaymentProofAdmin;
window.getTempReferrer = getTempReferrer;
window.alertApplicationDetails = alertApplicationDetails;

/* Auto page initializers */
document.addEventListener('DOMContentLoaded', () => {
  // If referral-register page: initialize drag/drop and capture referral param
  if (document.getElementById('applicationForm')) {
    initDragDrop('fileUploadArea', 'paymentProof');
    // If you have multi-step UI, you may need to pre-populate MultiApp.data from pre-filled inputs
    // Capture referral param and show somewhere
    const ref = getTempReferrer();
    if (ref) {
      const el = document.getElementById('summaryReferral');
      if (el) el.textContent = ref;
    }
  }

  // If pending page exists, start poll
  if (document.getElementById('loadingSpinner') || location.pathname.includes('referral-pending')) {
    startPendingAutoCheck();
  }

  // If admin page (by id markers), require login and load
  if (document.getElementById('applicationsList') || location.pathname.includes('admin-dashboard')) {
    const ok = adminLoginPromptIfNeeded();
    if (ok) {
      adminLoadDashboard();
      // Auto refresh
      setInterval(adminLoadDashboard, 30000);
    }
  }

  // If user dashboard page
  if (document.getElementById('referralCodeDisplay') || document.getElementById('currentBalance') || location.pathname.includes('referral-dashboard')) {
    userLoadDashboard();
  }
});
