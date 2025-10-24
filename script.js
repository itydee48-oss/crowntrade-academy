/* script.js
   Centralized frontend logic for Crown Trade Academy (localStorage-based)
   - Handles referral application flow
   - Admin approval/rejection + viewing payment proof
   - Waiting page auto-poll -> redirect on approval
   - User dashboard updates, withdrawals
   - Program settings stored in localStorage
*/

/* ---------- Utilities ---------- */
const STORAGE_KEYS = {
  APPLICATIONS: 'referral_applications',
  USERS: 'users',
  SETTINGS: 'program_settings',
  WITHDRAWALS: 'withdrawal_requests',
  CURRENT_USER_EMAIL: 'current_user_email',
  ADMIN_LOGGED_IN: 'admin_logged_in'
};

function getApplications() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
}
function setApplications(arr) {
  localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(arr));
}
function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
}
function setUsers(arr) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(arr));
}
function getSettings() {
  const defaults = {
    registrationFee: 500,
    referralEarnings: 300,
    minWithdrawal: 100,
    approvalSubject: 'Welcome to Crown Trade Academy!',
    approvalMessage: 'Congratulations! Your application has been approved.'
  };
  return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')) };
}
function setSettings(obj) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(obj));
}

/* Ensure default settings exist */
if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
  setSettings(getSettings());
}

/* ---------- Referral Multi-step form helpers ----------
   These functions are safe to use whether the page has inline
   scripts or not — they will be used by the registration page.
*/
const multiStep = {
  currentStep: 1,
  applicationData: {
    fullName: '',
    email: '',
    phone: '',
    referralCode: '',
    proofBase64: ''
  },
  initDragDrop(fileInputId, uploadAreaId, previewImageId, filePreviewContainerId, fileUploadContentId) {
    const fileUploadArea = document.getElementById(uploadAreaId);
    if (!fileUploadArea) return;
    fileUploadArea.addEventListener('dragover', e => {
      e.preventDefault();
      fileUploadArea.classList.add('dragover');
    });
    fileUploadArea.addEventListener('dragleave', () => fileUploadArea.classList.remove('dragover'));
    fileUploadArea.addEventListener('drop', e => {
      e.preventDefault();
      fileUploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileSelect({ target: { files } });
    });
  },
  nextStep(step) {
    const prev = this.currentStep;
    const prevEl = document.getElementById(`step${prev}`);
    const nextEl = document.getElementById(`step${step}`);
    if (prevEl) prevEl.classList.remove('active');
    const prevDot = document.querySelectorAll('.step')[prev - 1];
    if (prevDot) prevDot.classList.remove('active');

    if (nextEl) nextEl.classList.add('active');
    const nextDot = document.querySelectorAll('.step')[step - 1];
    if (nextDot) nextDot.classList.add('active');

    for (let i = 0; i < step - 1; i++) {
      const dot = document.querySelectorAll('.step')[i];
      if (dot) dot.classList.add('completed');
    }

    this.currentStep = step;
    if (step === 3) updateApplicationSummary();
  },
  prevStep(step) {
    const cur = this.currentStep;
    const curEl = document.getElementById(`step${cur}`);
    const targetEl = document.getElementById(`step${step}`);
    if (curEl) curEl.classList.remove('active');
    const curDot = document.querySelectorAll('.step')[cur - 1];
    if (curDot) curDot.classList.remove('active');

    if (targetEl) targetEl.classList.add('active');
    const targetDot = document.querySelectorAll('.step')[step - 1];
    if (targetDot) targetDot.classList.add('active');

    this.currentStep = step;
  }
};

/* Functions bound to the referral registration page (IDs used in your HTML) */
function validateStep1() {
  const fullName = (document.getElementById('fullName')?.value || '').trim();
  const email = (document.getElementById('email')?.value || '').trim();
  const phone = (document.getElementById('phone')?.value || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!fullName) { alert('Please enter your full name'); document.getElementById('fullName')?.focus(); return; }
  if (!email) { alert('Please enter your email address'); document.getElementById('email')?.focus(); return; }
  if (!emailRegex.test(email)) { alert('Please enter a valid email address'); document.getElementById('email')?.focus(); return; }
  if (!phone) { alert('Please enter your phone number'); document.getElementById('phone')?.focus(); return; }

  // Check for existing application or user
  const applications = getApplications();
  if (applications.find(a => a.email === email)) {
    alert('An application with this email already exists. Please use a different email address or check your waiting page.');
    return;
  }

  // store into multiStep.appData
  multiStep.applicationData.fullName = fullName;
  multiStep.applicationData.email = email;
  multiStep.applicationData.phone = phone;
  multiStep.applicationData.referralCode = (document.getElementById('referralCode')?.value || '').trim();

  multiStep.nextStep(2);
}

function validateStep2() {
  if (!multiStep.applicationData.proofBase64) {
    alert('Please upload your payment proof screenshot');
    return;
  }
  multiStep.nextStep(3);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.match('image.*')) { alert('Please select an image file (PNG, JPG, JPEG)'); return; }
  if (file.size > 5 * 1024 * 1024) { alert('File size must be less than 5MB'); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    multiStep.applicationData.proofBase64 = e.target.result;
    const content = document.getElementById('fileUploadContent');
    const preview = document.getElementById('filePreview');
    const previewImg = document.getElementById('previewImage');
    if (content) content.style.display = 'none';
    if (preview) preview.style.display = 'block';
    if (previewImg) previewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function changeFile() {
  const paymentProof = document.getElementById('paymentProof');
  if (paymentProof) paymentProof.value = '';
  const content = document.getElementById('fileUploadContent');
  const preview = document.getElementById('filePreview');
  if (content) content.style.display = 'block';
  if (preview) preview.style.display = 'none';
  multiStep.applicationData.proofBase64 = '';
}

function updateApplicationSummary() {
  document.getElementById('summaryName') && (document.getElementById('summaryName').textContent = multiStep.applicationData.fullName || '-');
  document.getElementById('summaryEmail') && (document.getElementById('summaryEmail').textContent = multiStep.applicationData.email || '-');
  document.getElementById('summaryPhone') && (document.getElementById('summaryPhone').textContent = multiStep.applicationData.phone || '-');
  document.getElementById('summaryReferral') && (document.getElementById('summaryReferral').textContent = multiStep.applicationData.referralCode || 'None');

  const paymentProofStatus = document.getElementById('paymentProofStatus');
  if (paymentProofStatus) {
    if (multiStep.applicationData.proofBase64) {
      paymentProofStatus.innerHTML = `
        <span style="color:#28a745;">✅ Uploaded</span>
        <button type="button" onclick="viewPaymentProofPreview()" style="background:none; border:1px solid var(--gold-accent); color:var(--gold-accent); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.8rem; cursor:pointer; margin-left:1rem;">
          View
        </button>
      `;
    } else {
      paymentProofStatus.innerHTML = '<span style="color:#dc3545;">❌ Not uploaded</span>';
    }
  }
}

function viewPaymentProofPreview() {
  if (!multiStep.applicationData.proofBase64) return alert('No file to preview');
  const newWindow = window.open();
  newWindow.document.write(`
    <html><head><title>Payment Proof Preview</title></head>
    <body style="margin:0;padding:20px;text-align:center;background:#f5f5f5;">
      <h2 style="color:#333;margin-bottom:1rem;">Payment Proof Preview</h2>
      <img src="${multiStep.applicationData.proofBase64}" style="max-width:100%; max-height:80vh; border-radius:10px; box-shadow:0 4px 8px rgba(0,0,0,0.1);" />
      <br><br>
      <button onclick="window.close()" style="padding:10px 20px;background:#3A2D28;color:white;border:none;border-radius:5px;cursor:pointer;">Close Preview</button>
    </body></html>
  `);
}

/* Submit the application (used by your registration page) */
function submitApplication() {
  // Check T&C
  const agreed = document.getElementById('termsAgreement')?.checked;
  if (!agreed) { alert('Please agree to the Terms and Conditions before submitting your application.'); return; }

  if (!multiStep.applicationData.fullName || !multiStep.applicationData.email || !multiStep.applicationData.phone) {
    alert('Please complete all required personal information.'); multiStep.prevStep(1); return;
  }
  if (!multiStep.applicationData.proofBase64) { alert('Please upload your payment proof before submitting.'); multiStep.prevStep(2); return; }

  const submitButton = document.getElementById('submitButton');
  const submitSpinner = document.getElementById('submitSpinner');
  const submitText = document.getElementById('submitText');
  if (submitButton) submitButton.disabled = true;
  if (submitSpinner) submitSpinner.style.display = 'inline-block';
  if (submitText) submitText.textContent = 'Submitting...';

  const applicationId = 'CTA-' + Date.now().toString();
  const application = {
    id: applicationId,
    fullName: multiStep.applicationData.fullName,
    email: multiStep.applicationData.email,
    phone: multiStep.applicationData.phone,
    referralCode: multiStep.applicationData.referralCode,
    proofBase64: multiStep.applicationData.proofBase64,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    rejectionReason: null,
    applicationType: 'referral_program'
  };

  // Save application
  const apps = getApplications();
  apps.push(application);
  setApplications(apps);

  // Create or update user entry
  const users = getUsers();
  const existingIndex = users.findIndex(u => u.email === application.email);
  const userObj = {
    id: 'USER-' + Date.now().toString(),
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    referralCodeUsed: application.referralCode,
    userReferralCode: 'CTA-' + application.fullName.substring(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-4),
    status: 'pending',
    joinedAt: new Date().toISOString(),
    approvedAt: null,
    balance: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
    referrals: [],
    applicationId: applicationId
  };
  if (existingIndex !== -1) {
    users[existingIndex] = { ...users[existingIndex], ...userObj };
  } else {
    users.push(userObj);
  }
  setUsers(users);

  // Set current user for waiting page
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER_EMAIL, application.email);

  // Show success modal and redirect after small delay
  setTimeout(() => {
    const modal = document.getElementById('successModal');
    if (modal) modal.style.display = 'flex';
    let countdown = 3;
    const counterEl = document.getElementById('redirectCountdown');
    const interval = setInterval(() => {
      countdown--;
      if (counterEl) counterEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(interval);
        // Redirect — support both filenames users used in pages
        if (location.pathname.includes('referral-register') || true) {
          // some pages expect referral-pending.html
          window.location.href = 'referral-pending.html';
        } else {
          window.location.href = 'referral-pending.html';
        }
      }
    }, 1000);
  }, 700);
}

/* ---------- Waiting / Pending Page ---------- */
/* This function runs on the waiting page to poll for changes */
function waitForApprovalAutoRedirect(options = {}) {
  const { interval = 5000, maxChecks = 300 } = options;
  let checks = 0;
  const currentUserEmail = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_EMAIL);
  if (!currentUserEmail) return; // nothing to do

  function check() {
    checks++;
    const users = getUsers();
    const user = users.find(u => u.email === currentUserEmail);
    if (user) {
      if (user.status === 'approved') {
        // redirect to user-dashboard (support user-dashboard.html / dashboard.html)
        setTimeout(() => {
          const dash = 'user-dashboard.html';
          window.location.href = dash;
        }, 1000);
        return;
      }
      if (user.status === 'rejected') {
        // show rejection message on page if element exists
        const badge = document.getElementById('statusBadge');
        const title = document.getElementById('statusTitle');
        const msg = document.getElementById('statusMessage');
        if (badge) { badge.textContent = 'REJECTED'; badge.style.background = '#dc3545'; badge.style.color = 'white'; }
        if (title) title.textContent = 'Application Not Approved';
        if (msg) msg.textContent = 'We regret to inform you that your application was not approved at this time. Contact support for more info.';
        return;
      }
    }
    if (checks < maxChecks) {
      setTimeout(check, interval);
    } else {
      const countdown = document.getElementById('countdown');
      if (countdown) countdown.innerHTML = 'Status check timeout. Please refresh the page or contact support.';
    }
  }

  // initial delayed check
  setTimeout(check, 1500);
}

/* ---------- Admin functions (approve/reject/view proof, etc) ---------- */
/* Approve application: update application status and user status, credit referrer if referral code used */
function approveApplication(appId) {
  if (!confirm('Approve this application?')) return;

  const apps = getApplications();
  const idx = apps.findIndex(a => a.id === appId);
  if (idx === -1) { alert('Application not found'); return; }
  apps[idx].status = 'approved';
  apps[idx].reviewedAt = new Date().toISOString();
  setApplications(apps);

  // Update user
  const userEmail = apps[idx].email;
  const users = getUsers();
  const uidx = users.findIndex(u => u.email === userEmail);
  if (uidx !== -1) {
    users[uidx].status = 'approved';
    users[uidx].approvedAt = new Date().toISOString();
    setUsers(users);
  }

  // If the applicant used a referral code, credit the referrer
  const settings = getSettings();
  const codeUsed = apps[idx].referralCode;
  if (codeUsed) {
    const refUsers = getUsers();
    // Match on userReferralCode field
    const referrerIndex = refUsers.findIndex(u => u.userReferralCode === codeUsed);
    if (referrerIndex !== -1) {
      // Add referral record
      const referralRecord = {
        name: apps[idx].fullName,
        email: apps[idx].email,
        joinedAt: new Date().toISOString(),
        amount: settings.referralEarnings
      };
      refUsers[referrerIndex].referrals = refUsers[referrerIndex].referrals || [];
      refUsers[referrerIndex].referrals.push(referralRecord);
      // Add pending earnings (until withdrawal processing)
      refUsers[referrerIndex].pendingEarnings = (refUsers[referrerIndex].pendingEarnings || 0) + settings.referralEarnings;
      setUsers(refUsers);
    }
  }

  alert('Application approved. User will be able to access their dashboard.');
  // Reload admin UI if present
  if (typeof loadDashboardData === 'function') loadDashboardData();
}

/* Reject application */
function rejectApplication(appId) {
  const reason = prompt('Enter rejection reason (optional):') || 'Rejected by admin';
  const apps = getApplications();
  const idx = apps.findIndex(a => a.id === appId);
  if (idx === -1) { alert('Application not found'); return; }
  apps[idx].status = 'rejected';
  apps[idx].rejectionReason = reason;
  apps[idx].reviewedAt = new Date().toISOString();
  setApplications(apps);

  // Update user status as rejected
  const users = getUsers();
  const uidx = users.findIndex(u => u.email === apps[idx].email);
  if (uidx !== -1) {
    users[uidx].status = 'rejected';
    users[uidx].approvedAt = null;
    setUsers(users);
  }

  alert('Application rejected.');
  if (typeof loadDashboardData === 'function') loadDashboardData();
}

/* View payment proof in a new window */
function viewPaymentProof(appId) {
  const apps = getApplications();
  const app = apps.find(a => a.id === appId);
  if (!app || !app.proofBase64) { alert('No payment proof found for this application'); return; }
  const newWindow = window.open();
  newWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head><title>Payment Proof - ${app.fullName}</title></head>
    <body style="margin:0;padding:20px;text-align:center;background:#f5f5f5;font-family:Arial, sans-serif;">
      <h2>Payment Proof - ${app.fullName}</h2>
      <img src="${app.proofBase64}" style="max-width:100%; max-height:80vh; border-radius:10px; box-shadow:0 4px 8px rgba(0,0,0,0.1);" />
      <br><br>
      <button onclick="window.close()" style="padding:10px 20px;background:#3A2D28;color:white;border:none;border-radius:5px;cursor:pointer;">Close</button>
    </body>
    </html>
  `);
}

/* ---------- Admin dashboard data loaders (if admin page exists) ---------- */
function checkAdminAuth(promptIfNeeded = true) {
  const isAdmin = localStorage.getItem(STORAGE_KEYS.ADMIN_LOGGED_IN);
  if (!isAdmin && promptIfNeeded) {
    const password = prompt('Enter admin password:');
    // default: admin123 (you can change or store hashed later)
    if (password === 'admin123') {
      localStorage.setItem(STORAGE_KEYS.ADMIN_LOGGED_IN, 'true');
      return true;
    } else {
      alert('Invalid password');
      if (location.pathname.includes('admin')) window.location.href = 'index.html';
      return false;
    }
  }
  return !!isAdmin;
}

function loadDashboardData() {
  // admin page UI - populate stats, applications, withdrawals
  try {
    const apps = getApplications();
    const settings = getSettings();
    const pendingApps = apps.filter(a => a.status === 'pending' || !a.status);
    const approvedApps = apps.filter(a => a.status === 'approved');
    const rejectedApps = apps.filter(a => a.status === 'rejected');
    const users = getUsers();

    // update DOM if elements exist
    const totalRevenue = approvedApps.length * (settings.registrationFee || 0);
    document.getElementById('totalRevenue') && (document.getElementById('totalRevenue').textContent = `KES ${totalRevenue}`);
    document.getElementById('pendingApprovals') && (document.getElementById('pendingApprovals').textContent = pendingApps.length);
    document.getElementById('totalUsers') && (document.getElementById('totalUsers').textContent = approvedApps.length);
    document.getElementById('conversionRate') && (document.getElementById('conversionRate').textContent = apps.length > 0 ? `${Math.round((approvedApps.length / apps.length) * 100)}%` : '0%');

    // load application list
    const applicationsList = document.getElementById('applicationsList');
    if (applicationsList) {
      if (pendingApps.length === 0) {
        applicationsList.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:3rem;">No pending applications at the moment.</div>`;
      } else {
        applicationsList.innerHTML = pendingApps.map(app => `
          <div class="application-card" style="background:var(--off-white); padding:1rem; border-radius:12px; margin-bottom:1rem;">
            <h3 style="color:var(--dark-brown); margin-bottom:0.25rem;">${escapeHtml(app.fullName)}</h3>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>Email:</strong> ${escapeHtml(app.email)}</p>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>Phone:</strong> ${escapeHtml(app.phone)}</p>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>Applied:</strong> ${new Date(app.submittedAt).toLocaleDateString()}</p>
            <p style="margin:0.5rem 0;">
              <a href="#" onclick="viewPaymentProof('${app.id}')" style="color: var(--warm-beige); text-decoration:none; font-weight:600;">📎 View Payment Proof</a>
            </p>
            <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
              <button class="luxury-btn btn-success" onclick="approveApplication('${app.id}')">Approve</button>
              <button class="luxury-btn btn-danger" onclick="rejectApplication('${app.id}')">Reject</button>
              <button class="luxury-btn" onclick="alertApplicationDetails('${app.id}')">Details</button>
            </div>
          </div>
        `).join('');
      }
    }

    // withdrawals
    const withdrawals = JSON.parse(localStorage.getItem(STORAGE_KEYS.WITHDRAWALS) || '[]');
    const withdrawalsList = document.getElementById('withdrawalsList');
    if (withdrawalsList) {
      if (withdrawals.length === 0) {
        withdrawalsList.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:3rem;">No withdrawal requests yet.</div>`;
      } else {
        withdrawalsList.innerHTML = withdrawals.map((w, idx) => `
          <div class="application-card" style="background:var(--off-white); padding:1rem; border-radius:12px; margin-bottom:1rem;">
            <h3 style="color:var(--dark-brown); margin-bottom:0.25rem;">${escapeHtml(w.userName)}</h3>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>Amount:</strong> KES ${w.amount}</p>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>MPesa:</strong> ${escapeHtml(w.phone)}</p>
            <p style="color:var(--muted-rose); margin:0.25rem 0;"><strong>Requested:</strong> ${new Date(w.requestedAt).toLocaleDateString()}</p>
            <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
              <button class="luxury-btn btn-success" onclick="processWithdrawal(${idx})">Process</button>
              <button class="luxury-btn btn-danger" onclick="rejectWithdrawal(${idx})">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    // try to update charts if Chart.js exists (admin page uses it)
    if (window.Chart && typeof loadAnalytics === 'function') {
      loadAnalytics(getApplications(), approvedApps, pendingApps, rejectedApps);
    }
  } catch (err) {
    console.error('Error loading admin dashboard data', err);
  }
}

/* Admin helper functions used in templates (process/reject withdrawals) */
function processWithdrawal(index) {
  if (!confirm('Mark this withdrawal as processed?')) return;
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.WITHDRAWALS) || '[]');
  const removed = list.splice(index, 1);
  localStorage.setItem(STORAGE_KEYS.WITHDRAWALS, JSON.stringify(list));
  alert('Withdrawal processed.');
  if (typeof loadDashboardData === 'function') loadDashboardData();
}

function rejectWithdrawal(index) {
  const reason = prompt('Enter rejection reason:') || 'Rejected by admin';
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.WITHDRAWALS) || '[]');
  list.splice(index, 1);
  localStorage.setItem(STORAGE_KEYS.WITHDRAWALS, JSON.stringify(list));
  alert('Withdrawal rejected.');
  if (typeof loadDashboardData === 'function') loadDashboardData();
}

/* Export data (applications) */
function exportData() {
  const applications = getApplications();
  const dataStr = JSON.stringify(applications, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'referral_applications.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* Simple alert with app details */
function alertApplicationDetails(appId) {
  const apps = getApplications();
  const app = apps.find(a => a.id === appId);
  if (!app) return alert('Application not found');
  alert(`Application Details:\n\nName: ${app.fullName}\nEmail: ${app.email}\nPhone: ${app.phone}\nStatus: ${app.status || 'Pending'}\nSubmitted: ${new Date(app.submittedAt).toLocaleString()}`);
}

/* ---------- User dashboard helpers ---------- */
function loadUserDashboard() {
  // This function is safe to call from user-dashboard page.
  const currentUserEmail = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_EMAIL);
  if (!currentUserEmail) {
    // no session — send to index
    window.location.href = 'index.html';
    return;
  }
  const users = getUsers();
  const user = users.find(u => u.email === currentUserEmail);
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  // if not approved yet, redirect to waiting page
  if (user.status !== 'approved') {
    window.location.href = 'referral-pending.html';
    return;
  }

  // Update elements if present
  const welcomeEl = document.getElementById('userWelcome');
  if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.fullName}!`;

  const cur = document.getElementById('currentBalance');
  const tot = document.getElementById('totalEarnings');
  const refc = document.getElementById('referralCount');
  const pend = document.getElementById('pendingEarnings');
  if (cur) cur.textContent = `KES ${user.balance || 0}`;
  if (tot) tot.textContent = `KES ${user.totalEarnings || 0}`;
  if (refc) refc.textContent = (user.referrals || []).length;
  if (pend) pend.textContent = `KES ${user.pendingEarnings || 0}`;

  if (!user.userReferralCode) {
    user.userReferralCode = 'CTA-' + user.fullName.substring(0,3).toUpperCase() + '-' + Date.now().toString().slice(-4);
    const us = getUsers();
    const idx = us.findIndex(u => u.email === user.email);
    if (idx !== -1) {
      us[idx] = user;
      setUsers(us);
    }
  }
  const codeDisplay = document.getElementById('referralCodeDisplay');
  if (codeDisplay) codeDisplay.textContent = user.userReferralCode;

  // Load referral history into page if element present
  const historyEl = document.getElementById('referralHistory');
  if (historyEl) {
    if (!user.referrals || user.referrals.length === 0) {
      historyEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem;">No referrals yet. Share your code to start earning!</div>`;
    } else {
      historyEl.innerHTML = user.referrals.map(ref => `
        <div style="background:var(--off-white); padding:1rem; border-radius:8px; margin:0.5rem 0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:var(--dark-brown);">${escapeHtml(ref.name)}</strong>
            <p style="color:var(--muted-rose); margin:0.25rem 0;">Joined: ${new Date(ref.joinedAt).toLocaleDateString()}</p>
          </div>
          <div style="color:var(--gold-accent); font-weight:600;">KES ${ref.amount}</div>
        </div>
      `).join('');
    }
  }
}

/* Copy referral code (user dashboard) */
function copyReferralCode() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (!code) return alert('No referral code found.');
  navigator.clipboard.writeText(code).then(() => alert('Referral code copied to clipboard!'));
}

/* Share helpers */
function shareViaWhatsApp() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (!code) return alert('No referral code.');
  const message = `Join Crown Trade Academy using my referral code: ${code}. Earn money through their referral program!`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}
function shareViaEmail() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (!code) return alert('No referral code.');
  const subject = 'Join Crown Trade Academy with my referral code';
  const body = `Hi! Join Crown Trade Academy using my referral code: ${code}.`;
  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
}
function shareViaSMS() {
  const code = document.getElementById('referralCodeDisplay')?.textContent;
  if (!code) return alert('No referral code.');
  const message = `Join Crown Trade Academy using my referral code: ${code}.`;
  window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank');
}

/* Request withdrawal (user) */
function requestWithdrawal() {
  const amount = parseInt(document.getElementById('withdrawalAmount')?.value || '0', 10);
  const phone = (document.getElementById('withdrawalPhone')?.value || '').trim();
  const settings = getSettings();
  const minWithdrawal = settings.minWithdrawal || 100;
  if (!amount || !phone) { alert('Please enter both amount and phone number'); return; }
  if (amount < minWithdrawal) { alert(`Minimum withdrawal amount is KES ${minWithdrawal}`); return; }

  const users = getUsers();
  const currentUserEmail = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_EMAIL);
  const idx = users.findIndex(u => u.email === currentUserEmail);
  if (idx === -1) return alert('User not found');
  if (amount > (users[idx].balance || 0)) return alert('Insufficient balance');

  // Create withdrawal request
  const withdrawal = {
    id: Date.now().toString(),
    userName: users[idx].fullName,
    userEmail: currentUserEmail,
    amount: amount,
    phone: phone,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.WITHDRAWALS) || '[]');
  list.push(withdrawal);
  localStorage.setItem(STORAGE_KEYS.WITHDRAWALS, JSON.stringify(list));

  // Update user balance immediately (funds reserved)
  users[idx].balance = (users[idx].balance || 0) - amount;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  alert('Withdrawal request submitted successfully! It will be processed by admin.');

  // reset form fields if present
  const amtEl = document.getElementById('withdrawalAmount');
  const phoneEl = document.getElementById('withdrawalPhone');
  if (amtEl) amtEl.value = '';
  if (phoneEl) phoneEl.value = '';
  if (typeof loadUserDashboard === 'function') loadUserDashboard();
}

/* ---------- Small helpers ---------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (s) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[s];
  });
}

/* ---------- Admin settings save utilities ---------- */
function savePaymentSettingsFromAdmin() {
  const registrationFee = parseInt(document.getElementById('registrationFee')?.value || '500', 10);
  const referralEarnings = parseInt(document.getElementById('referralEarnings')?.value || '300', 10);
  const minWithdrawal = parseInt(document.getElementById('minWithdrawal')?.value || '100', 10);
  const approvalSubject = document.getElementById('approvalSubject')?.value || getSettings().approvalSubject;
  const approvalMessage = document.getElementById('approvalMessage')?.value || getSettings().approvalMessage;

  const settings = { registrationFee, referralEarnings, minWithdrawal, approvalSubject, approvalMessage };
  setSettings(settings);
  alert('Payment settings saved successfully!');
  if (typeof loadDashboardData === 'function') loadDashboardData();
}

/* ---------- Initialization for pages ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // If on referral-register page: initialize drag/drop listeners
  if (document.getElementById('fileUploadArea')) {
    multiStep.initDragDrop('paymentProof', 'fileUploadArea', 'previewImage', 'filePreview', 'fileUploadContent');
    // bind file input change to shared handler so it works if file input exists but inline handler removed
    const fileInput = document.getElementById('paymentProof');
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
  }

  // If on waiting/referral-pending page — start auto-poll
  if (document.getElementById('loadingSpinner') || location.pathname.includes('referral-pending') || location.pathname.includes('waiting')) {
    // keep legacy names working
    try {
      waitForApprovalAutoRedirect();
    } catch (e) { console.warn('Waiting page polling init failed', e); }
  }

  // If on admin page, check auth and load admin data
  if (location.pathname.includes('admin') || document.getElementById('applicationsList')) {
    // run auth and load
    const ok = checkAdminAuth(true);
    if (ok) {
      loadDashboardData();
      // auto-refresh every 30s if admin page
      setInterval(() => { loadDashboardData(); }, 30000);
    }
  }

  // If on user dashboard page
  if (location.pathname.includes('user-dashboard') || document.getElementById('referralCodeDisplay') || document.getElementById('currentBalance')) {
    try { loadUserDashboard(); }
    catch (e) { console.warn('Could not initialize user dashboard', e); }
  }

  // Bind global functions expected by your HTML (so inline onclicks still call them)
  window.validateStep1 = validateStep1;
  window.validateStep2 = validateStep2;
  window.handleFileSelect = handleFileSelect;
  window.changeFile = changeFile;
  window.updateApplicationSummary = updateApplicationSummary;
  window.viewPaymentProofPreview = viewPaymentProofPreview;
  window.submitApplication = submitApplication;
  window.approveApplication = approveApplication;
  window.rejectApplication = rejectApplication;
  window.viewPaymentProof = viewPaymentProof;
  window.loadDashboardData = loadDashboardData;
  window.processWithdrawal = processWithdrawal;
  window.rejectWithdrawal = rejectWithdrawal;
  window.exportData = exportData;
  window.loadUserDashboard = loadUserDashboard;
  window.copyReferralCode = copyReferralCode;
  window.shareViaWhatsApp = shareViaWhatsApp;
  window.shareViaEmail = shareViaEmail;
  window.shareViaSMS = shareViaSMS;
  window.requestWithdrawal = requestWithdrawal;
  window.checkAdminAuth = checkAdminAuth;
  window.savePaymentSettings = savePaymentSettingsFromAdmin;
  window.alertApplicationDetails = alertApplicationDetails;
});

/* End of script.js */
