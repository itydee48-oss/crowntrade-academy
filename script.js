/* script.js - Crown Trade Academy (localStorage based referral system)
   Features:
   - referral-register.html -> submit application (screenshot in payment step)
   - referral-pending.html -> auto-check for approval
   - referral-dashboard.html -> user dashboard, referral link, withdraw, change password
   - admin-dashboard.html -> admin login prompt, approve/reject apps, approve/reject withdrawals, change settings/password
*/

/* Storage keys */
const KEYS = {
  APPS: 'cta_referral_applications',
  USERS: 'cta_users',
  SETTINGS: 'cta_program_settings',
  WITHDRAWALS: 'cta_withdrawal_requests',
  CURRENT_USER: 'cta_current_user_email',
  ADMIN_AUTH: 'cta_admin_auth'
};

/* Defaults */
const DEFAULT_SETTINGS = {
  registrationFee: 500,
  referralEarnings: 300,
  businessShare: 200,
  minWithdrawal: 950,
  startingBalanceOnApproval: 500,
  totalBusinessEarnings: 0,
  totalReferralPayouts: 0
};
const DEFAULT_ADMIN = { username: 'admin', password: 'admin' };

/* Storage helpers */
function readJSON(k, fallback){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; } catch(e){ console.error(e); return fallback; }}
function writeJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function getSettings(){ return readJSON(KEYS.SETTINGS, DEFAULT_SETTINGS); }
function setSettings(s){ writeJSON(KEYS.SETTINGS, s); }
function getApplications(){ return readJSON(KEYS.APPS, []); }
function setApplications(a){ writeJSON(KEYS.APPS, a); }
function getUsers(){ return readJSON(KEYS.USERS, []); }
function setUsers(u){ writeJSON(KEYS.USERS, u); }
function getWithdrawals(){ return readJSON(KEYS.WITHDRAWALS, []); }
function setWithdrawals(w){ writeJSON(KEYS.WITHDRAWALS, w); }
function getAdminAuth(){ return readJSON(KEYS.ADMIN_AUTH, DEFAULT_ADMIN); }
function setAdminAuth(a){ writeJSON(KEYS.ADMIN_AUTH, a); }

/* Ensure initial settings & admin exist */
if(!readJSON(KEYS.SETTINGS, null)) writeJSON(KEYS.SETTINGS, DEFAULT_SETTINGS);
if(!readJSON(KEYS.ADMIN_AUTH, null)) writeJSON(KEYS.ADMIN_AUTH, DEFAULT_ADMIN);

/* Utilities */
function uid(prefix=''){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

/* Temp app holder used by referral-register page */
const MultiApp = { data:{ fullName:'', email:'', phone:'', password:null, referredBy:null, proofBase64:'' } };

/* Capture referral id from query param and store in sessionStorage */
function captureReferralFromQuery(){
  try{
    const q = new URLSearchParams(window.location.search);
    const r = q.get('ref') || q.get('referrer');
    if(r) sessionStorage.setItem('cta_referrer_temp', r);
  } catch(e){ /* ignore */ }
}
function getTempReferrer(){ return sessionStorage.getItem('cta_referrer_temp') || null; }

/* File handler used by referral-register */
function handleAppFileInput(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return alert('No file selected');
  if(!file.type.match('image.*')) return alert('Please choose an image file');
  if(file.size > 5*1024*1024) return alert('File must be <5MB');
  const r = new FileReader();
  r.onload = e => {
    MultiApp.data.proofBase64 = e.target.result;
    const img = document.getElementById('previewImage'); if(img) img.src = e.target.result;
    const preview = document.getElementById('filePreview'); const content = document.getElementById('fileUploadContent');
    if(content) content.style.display='none'; if(preview) preview.style.display='block';
  };
  r.readAsDataURL(file);
}

/* Submit application (referral-register) */
function submitReferralApplicationFromForm(){
  try{
    const fullName = MultiApp.data.fullName || document.getElementById('fullName')?.value?.trim();
    const email = MultiApp.data.email || document.getElementById('email')?.value?.trim();
    const phone = MultiApp.data.phone || document.getElementById('phone')?.value?.trim();
    const referralInput = document.getElementById('referralCode')?.value?.trim();
    const proof = MultiApp.data.proofBase64;

    if(!fullName || !email || !phone) return alert('Please fill required fields.');
    if(!proof) return alert('Please upload payment proof.');

    const apps = getApplications();
    const users = getUsers();
    if(apps.find(a=>a.email===email) || users.find(u=>u.email===email)) return alert('An application or user with this email already exists.');

    const tempRef = getTempReferrer();
    const referredBy = tempRef || (referralInput || null);

    const appId = uid('APP-');
    const app = { id: appId, fullName, email, phone, referredBy, proofBase64:proof, status:'pending', submittedAt:new Date().toISOString(), reviewedAt:null, rejectionReason:null };
    apps.push(app); setApplications(apps);

    const userId = uid('USER-');
    const user = { id:userId, fullName, email, phone, password:MultiApp.data.password || null, status:'pending', referredBy, userReferralLink:null, balance:0, totalEarnings:0, pendingEarnings:0, referrals:[], joinedAt:new Date().toISOString(), approvedAt:null, applicationId:appId };
    users.push(user); setUsers(users);

    localStorage.setItem(KEYS.CURRENT_USER, email);
    alert('Application submitted. Redirecting to waiting page.');
    window.location.href = 'referral-pending.html';
  } catch(e){ console.error(e); alert('Error submitting application.'); }
}

/* Polling pending page to detect approval */
function startPendingAutoCheck(pollInterval=4000){
  const email = localStorage.getItem(KEYS.CURRENT_USER);
  if(!email) return;
  let checks=0; const maxChecks=300;
  const counterEl = document.getElementById('counter');
  function checkNow(){
    checks++;
    const users = getUsers(); const user = users.find(u=>u.email===email);
    if(user){
      if(user.status==='approved'){
        document.getElementById('loadingSpinner')?.style?.display && (document.getElementById('loadingSpinner').style.display='none');
        document.getElementById('approvedCheckmark') && (document.getElementById('approvedCheckmark').style.display='block');
        document.getElementById('statusTitle') && (document.getElementById('statusTitle').textContent='Application Approved!');
        document.getElementById('statusBadge') && (document.getElementById('statusBadge').textContent='APPROVED');
        document.getElementById('statusMessage') && (document.getElementById('statusMessage').textContent='Redirecting to your dashboard...');
        setTimeout(()=> window.location.href='referral-dashboard.html',1400);
        return;
      } else if(user.status==='rejected'){
        document.getElementById('loadingSpinner')?.style?.display && (document.getElementById('loadingSpinner').style.display='none');
        document.getElementById('statusTitle') && (document.getElementById('statusTitle').textContent='Application Not Approved');
        document.getElementById('statusBadge') && (document.getElementById('statusBadge').textContent='REJECTED');
        document.getElementById('statusMessage') && (document.getElementById('statusMessage').textContent=(user.rejectionReason||'Application rejected.'));
        return;
      }
    }
    if(counterEl) counterEl.textContent = Math.max(0, 5 - Math.floor(checks % 5));
    if(checks < maxChecks) setTimeout(checkNow, pollInterval); else { document.getElementById('countdown') && (document.getElementById('countdown').innerHTML='Status check timeout. Please refresh.'); }
  }
  setTimeout(checkNow, 1000);
}

/* Admin auth prompt */
function adminLoginPromptIfNeeded(){
  const auth = getAdminAuth();
  if(sessionStorage.getItem('cta_admin_logged_in') === 'true') return true;
  const user = prompt('Admin username:');
  const pass = prompt('Admin password:');
  if(!user || !pass){ alert('Admin login required'); window.location.href='index.html'; return false; }
  if(user === auth.username && pass === auth.password){ sessionStorage.setItem('cta_admin_logged_in','true'); return true; }
  alert('Invalid credentials'); window.location.href='index.html'; return false;
}
function adminLogout(){ sessionStorage.removeItem('cta_admin_logged_in'); window.location.href='index.html'; }

/* Admin: view apps, approve, reject */
function adminLoadDashboard(){
  try{
    const apps = getApplications();
    const users = getUsers();
    const settings = getSettings();
    const pending = apps.filter(a=>!a.status || a.status==='pending');
    const approved = apps.filter(a=>a.status==='approved');
    const rejected = apps.filter(a=>a.status==='rejected');

    document.getElementById('totalRevenue') && (document.getElementById('totalRevenue').textContent = `KES ${approved.length * settings.registrationFee}`);
    document.getElementById('pendingApprovals') && (document.getElementById('pendingApprovals').textContent = pending.length);
    document.getElementById('totalUsers') && (document.getElementById('totalUsers').textContent = approved.length);
    document.getElementById('conversionRate') && (document.getElementById('conversionRate').textContent = apps.length ? `${Math.round((approved.length/apps.length)*100)}%` : '0%');
    document.getElementById('businessEarnings') && (document.getElementById('businessEarnings').textContent = `KES ${settings.totalBusinessEarnings||0}`);
    document.getElementById('totalReferralPayouts') && (document.getElementById('totalReferralPayouts').textContent = `KES ${settings.totalReferralPayouts||0}`);
    document.getElementById('currentAdminUser') && (document.getElementById('currentAdminUser').textContent = getAdminAuth().username);

    // Pending apps list
    const listEl = document.getElementById('applicationsList');
    if(listEl){
      if(!pending.length) listEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem">No pending applications.</div>`;
      else{
        listEl.innerHTML = pending.map(a=>{
          const refUser = users.find(u => u.id === a.referredBy);
          const refLabel = refUser ? `${escapeHtml(refUser.fullName)} (${escapeHtml(refUser.email)})` : (a.referredBy ? escapeHtml(a.referredBy) : 'None');
          return `<div class="application-card">
            <h3 style="margin:0">${escapeHtml(a.fullName)}</h3>
            <p style="margin:0"><strong>Email:</strong> ${escapeHtml(a.email)}</p>
            <p style="margin:0"><strong>Phone:</strong> ${escapeHtml(a.phone)}</p>
            <p style="margin:0"><strong>Referred By:</strong> ${escapeHtml(refLabel)}</p>
            <p style="margin:.6rem 0"><a href="#" onclick="viewPaymentProofAdmin('${a.id}');return false;">📎 View Payment Proof</a></p>
            <div style="display:flex;gap:.5rem">
              <button class="btn-success" onclick="adminApproveApplication('${a.id}')">Approve</button>
              <button class="btn-danger" onclick="adminRejectApplication('${a.id}')">Reject</button>
            </div>
          </div>`; }).join('');
      }
    }

    // Withdrawals list
    const withdrawals = getWithdrawals();
    const wEl = document.getElementById('withdrawalsList');
    if(wEl){
      if(!withdrawals.length) wEl.innerHTML = `<div style="text-align:center;color:var(--muted-rose);padding:2rem">No withdrawal requests.</div>`;
      else wEl.innerHTML = withdrawals.map((w,idx) => `<div class="application-card">
        <h3 style="margin:0">${escapeHtml(w.userName)}</h3>
        <p style="margin:0"><strong>Amount:</strong> KES ${w.amount}</p>
        <p style="margin:0"><strong>MPesa:</strong> ${escapeHtml(w.phone)}</p>
        <p style="margin:0"><strong>Requested:</strong> ${new Date(w.requestedAt).toLocaleString()}</p>
        <div style="margin-top:.6rem"><button class="btn-success" onclick="adminApproveWithdrawal(${idx})">Approve</button> <button class="btn-danger" onclick="adminRejectWithdrawal(${idx})">Reject</button></div>
      </div>`).join('');
    }
  } catch(e){ console.error(e); }
}

function viewPaymentProofAdmin(appId){
  const apps = getApplications(); const a = apps.find(x=>x.id===appId);
  if(!a || !a.proofBase64) return alert('No proof found');
  const w = window.open(); w.document.write(`<html><head><title>Proof</title></head><body style="margin:0;padding:20px;text-align:center;background:#f5f5f5">
    <h2>${escapeHtml(a.fullName)} - Payment Proof</h2><img src="${a.proofBase64}" style="max-width:100%;max-height:80vh;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.12)"><br><br><button onclick="window.close()" style="padding:10px 18px;background:#3A2D28;color:white;border:none;border-radius:6px;cursor:pointer">Close</button></body></html>`);
}

/* Approve application: set app status, update user, credit referrer & business */
function adminApproveApplication(appId){
  if(!confirm('Approve this application?')) return;
  const apps = getApplications(); const ai = apps.findIndex(a=>a.id===appId); if(ai===-1) return alert('Application not found');
  apps[ai].status = 'approved'; apps[ai].reviewedAt = new Date().toISOString(); setApplications(apps);

  const users = getUsers(); const user = users.find(u=>u.applicationId===appId);
  if(!user) return alert('User record missing');
  user.status = 'approved'; user.approvedAt = new Date().toISOString();
  user.balance = (user.balance||0) + (getSettings().startingBalanceOnApproval||DEFAULT_SETTINGS.startingBalanceOnApproval);
  user.userReferralLink = `referral-register.html?ref=${user.id}`;
  setUsers(users);

  const settings = getSettings();
  if(user.referredBy){
    const refUsers = getUsers(); const rif = refUsers.findIndex(u=>u.id===user.referredBy);
    if(rif!==-1){
      refUsers[rif].balance = (refUsers[rif].balance||0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings);
      refUsers[rif].totalEarnings = (refUsers[rif].totalEarnings||0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings);
      refUsers[rif].referrals = refUsers[rif].referrals || [];
      refUsers[rif].referrals.push({ id: user.id, name: user.fullName, joinedAt: new Date().toISOString(), amount: settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings });
      setUsers(refUsers);
      const s = getSettings(); s.totalReferralPayouts = (s.totalReferralPayouts||0) + (settings.referralEarnings || DEFAULT_SETTINGS.referralEarnings); s.totalBusinessEarnings = (s.totalBusinessEarnings||0) + (settings.businessShare || DEFAULT_SETTINGS.businessShare); setSettings(s);
    } else {
      const s = getSettings(); s.totalBusinessEarnings = (s.totalBusinessEarnings||0) + (settings.businessShare||DEFAULT_SETTINGS.businessShare); setSettings(s);
    }
  } else {
    const s = getSettings(); s.totalBusinessEarnings = (s.totalBusinessEarnings||0) + (settings.businessShare||DEFAULT_SETTINGS.businessShare); setSettings(s);
  }

  alert('Application approved. Credits applied where applicable.');
  adminLoadDashboard();
}

/* Reject app */
function adminRejectApplication(appId){
  const reason = prompt('Reason for rejection (optional):') || 'Rejected';
  if(!confirm('Reject application?')) return;
  const apps = getApplications(); const ai = apps.findIndex(a=>a.id===appId); if(ai===-1) return alert('App not found');
  apps[ai].status = 'rejected'; apps[ai].rejectionReason = reason; apps[ai].reviewedAt = new Date().toISOString(); setApplications(apps);
  const users = getUsers(); const ui = users.findIndex(u=>u.applicationId===appId); if(ui!==-1){ users[ui].status='rejected'; setUsers(users); }
  alert('Application rejected'); adminLoadDashboard();
}

/* Withdrawals: admin approve -> remove request (assumed processed); reject -> refund user */
function adminApproveWithdrawal(index){
  if(!confirm('Process and mark this withdrawal as completed?')) return;
  const withdrawals = getWithdrawals();
  if(index<0 || index>=withdrawals.length) return alert('Invalid');
  withdrawals.splice(index,1); setWithdrawals(withdrawals); alert('Withdrawal processed'); adminLoadDashboard();
}
function adminRejectWithdrawal(index){
  if(!confirm('Reject this withdrawal and refund user?')) return;
  const withdrawals = getWithdrawals();
  if(index<0 || index>=withdrawals.length) return alert('Invalid');
  const req = withdrawals[index];
  const users = getUsers(); const ui = users.findIndex(u=>u.email===req.userEmail);
  if(ui!==-1){ users[ui].balance = (users[ui].balance||0) + req.amount; setUsers(users); }
  withdrawals.splice(index,1); setWithdrawals(withdrawals); alert('Withdrawal rejected and refunded'); adminLoadDashboard();
}

/* Save settings from admin UI */
function adminSaveSettingsFromUI(){
  const registrationFee = parseInt(document.getElementById('registrationFee')?.value || getSettings().registrationFee,10);
  const referralEarnings = parseInt(document.getElementById('referralEarnings')?.value || getSettings().referralEarnings,10);
  const businessShare = parseInt(document.getElementById('businessShare')?.value || getSettings().businessShare,10);
  const minWithdrawal = parseInt(document.getElementById('minWithdrawal')?.value || getSettings().minWithdrawal,10);
  const startingBalance = parseInt(document.getElementById('startBalance')?.value || getSettings().startingBalanceOnApproval,10);

  const s = getSettings();
  s.registrationFee = isNaN(registrationFee) ? s.registrationFee : registrationFee;
  s.referralEarnings = isNaN(referralEarnings) ? s.referralEarnings : referralEarnings;
  s.businessShare = isNaN(businessShare) ? s.businessShare : businessShare;
  s.minWithdrawal = isNaN(minWithdrawal) ? s.minWithdrawal : minWithdrawal;
  s.startingBalanceOnApproval = isNaN(startingBalance) ? s.startingBalanceOnApproval : startingBalance;
  setSettings(s);
  alert('Settings saved.');
  adminLoadDashboard();
}

/* Admin change password */
function adminChangePassword(inputId='newAdminPassword'){
  const newPass = document.getElementById(inputId)?.value;
  if(!newPass || newPass.length < 3) return alert('Enter new password (min 3 chars).');
  const auth = getAdminAuth(); auth.password = newPass; setAdminAuth(auth);
  document.getElementById(inputId).value=''; alert('Admin password changed.');
}

/* User dashboard loader */
function userLoadDashboard(){
  const current = localStorage.getItem(KEYS.CURRENT_USER);
  if(!current){ window.location.href='index.html'; return; }
  const users = getUsers(); const user = users.find(u=>u.email===current);
  if(!user){ window.location.href='index.html'; return; }
  if(user.status !== 'approved'){ window.location.href='referral-pending.html'; return; }

  document.getElementById('userWelcome') && (document.getElementById('userWelcome').textContent = `Welcome, ${user.fullName}!`);
  document.getElementById('currentBalance') && (document.getElementById('currentBalance').textContent = `KES ${user.balance||0}`);
  document.getElementById('totalEarnings') && (document.getElementById('totalEarnings').textContent = `KES ${user.totalEarnings||0}`);
  document.getElementById('referralCount') && (document.getElementById('referralCount').textContent = (user.referrals||[]).length);
  document.getElementById('pendingEarnings') && (document.getElementById('pendingEarnings').textContent = `KES ${user.pendingEarnings||0}`);

  if(!user.userReferralLink){ user.userReferralLink = `referral-register.html?ref=${user.id}`; const us = getUsers(); const ui = us.findIndex(x=>x.email===user.email); if(ui!==-1){ us[ui]=user; setUsers(us); } }
  document.getElementById('referralCodeDisplay') && (document.getElementById('referralCodeDisplay').textContent = window.location.origin + '/' + user.userReferralLink);

  // referral history
  const historyEl = document.getElementById('referralHistory');
  if(historyEl){
    if(!user.referrals || user.referrals.length===0) historyEl.innerHTML=`<div style="text-align:center;color:var(--muted-rose);padding:1rem">No referrals yet</div>`;
    else historyEl.innerHTML = user.referrals.map(r=>`<div style="background:var(--off-white);padding: .8rem;border-radius:8px;margin:.5rem 0;display:flex;justify-content:space-between">
      <div><strong>${escapeHtml(r.name)}</strong><p style="margin:0;color:var(--muted-rose)">Joined: ${new Date(r.joinedAt).toLocaleDateString()}</p></div><div style="color:var(--gold-accent);font-weight:600">KES ${r.amount}</div></div>`).join('');
  }
}

/* User copy/share helpers */
function userCopyReferralLink(){ const el = document.getElementById('referralCodeDisplay'); if(!el) return alert('No link'); navigator.clipboard.writeText(el.textContent||el.innerText).then(()=>alert('Referral link copied')); }
function userShareWhatsApp(){ const el = document.getElementById('referralCodeDisplay'); if(!el) return; window.open(`https://wa.me/?text=${encodeURIComponent('Join via: '+el.textContent)}`,'_blank'); }
function userShareEmail(){ const el = document.getElementById('referralCodeDisplay'); if(!el) return; window.open(`mailto:?subject=${encodeURIComponent('Join Crown Trade')}&body=${encodeURIComponent('Join here: '+el.textContent)}`); }

/* User withdrawal request (reserves funds immediately) */
function userRequestWithdrawal(){
  const amount = parseInt(document.getElementById('withdrawalAmount')?.value || '0',10); const phone = document.getElementById('withdrawalPhone')?.value?.trim();
  if(!amount || !phone) return alert('Enter amount and phone');
  const settings = getSettings();
  if(amount < settings.minWithdrawal) return alert(`Min withdrawal is KES ${settings.minWithdrawal}`);
  const current = localStorage.getItem(KEYS.CURRENT_USER); if(!current) return alert('No session');
  const users = getUsers(); const ui = users.findIndex(u=>u.email===current); if(ui===-1) return alert('User not found');
  if((users[ui].balance||0) < amount) return alert('Insufficient balance');
  users[ui].balance -= amount; setUsers(users);
  const req = { id: uid('W-'), userEmail: current, userName: users[ui].fullName, amount, phone, requestedAt: new Date().toISOString(), status:'pending' };
  const ws = getWithdrawals(); ws.push(req); setWithdrawals(ws);
  alert('Withdrawal requested. Admin will process it.');
  document.getElementById('withdrawalAmount').value=''; document.getElementById('withdrawalPhone').value='';
  userLoadDashboard();
}

/* User change password */
function userChangePassword(inputId='userNewPassword'){
  const newP = document.getElementById(inputId)?.value; if(!newP || newP.length<3) return alert('Enter new password (min 3 chars)');
  const current = localStorage.getItem(KEYS.CURRENT_USER); if(!current) return alert('No session');
  const users = getUsers(); const ui = users.findIndex(u=>u.email===current); if(ui===-1) return alert('User missing');
  users[ui].password = newP; setUsers(users); document.getElementById(inputId).value=''; alert('Password updated');
}

/* Alerts & helpers */
function alertApplicationDetails(appId){ const apps = getApplications(); const a = apps.find(x=>x.id===appId); if(!a) return alert('Not found'); alert(`Name: ${a.fullName}\nEmail: ${a.email}\nPhone: ${a.phone}\nStatus: ${a.status}\nSubmitted: ${new Date(a.submittedAt).toLocaleString()}`); }

/* Expose functions globally for inline HTML usage */
window.handleAppFileInput = handleAppFileInput;
window.captureReferralFromQuery = captureReferralFromQuery;
window.getTempReferrer = getTempReferrer;
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
window.alertApplicationDetails = alertApplicationDetails;
window.handleAppFileInput = handleAppFileInput;

/* Auto initializers on page load */
document.addEventListener('DOMContentLoaded', ()=>{
  captureReferralFromQuery();

  // If referral-register form present, attach drag/drop and input binding
  if(document.getElementById('applicationForm')){
    const fileArea = document.getElementById('fileUploadArea'); const inputFile = document.getElementById('paymentProof');
    if(fileArea && inputFile){
      fileArea.addEventListener('dragover', e=>{ e.preventDefault(); fileArea.classList.add('dragover'); });
      fileArea.addEventListener('dragleave', ()=> fileArea.classList.remove('dragover'));
      fileArea.addEventListener('drop', e=>{ e.preventDefault(); fileArea.classList.remove('dragover'); const f = e.dataTransfer.files; if(f && f[0]){ inputFile.files = f; handleAppFileInput(inputFile); } });
      inputFile.addEventListener('change', ()=> handleAppFileInput(inputFile));
    }
    // optionally pre-populate MultiApp from inputs
  }

  // If pending page exists, start polling
  if(document.getElementById('loadingSpinner') || location.pathname.includes('referral-pending')){
    startPendingAutoCheck();
  }

  // If admin dashboard loaded -> require admin login then load
  if(document.getElementById('applicationsList') || location.pathname.includes('admin-dashboard')){
    const ok = adminLoginPromptIfNeeded();
    if(ok){
      adminLoadDashboard();
      setInterval(adminLoadDashboard, 30000);
    }
  }

  // If user dashboard present
  if(document.getElementById('referralCodeDisplay') || location.pathname.includes('referral-dashboard')){
    userLoadDashboard();
  }

  // Hide loader after small delay so page feels smooth
  setTimeout(()=> document.body.classList.add('loaded'), 700);
});
