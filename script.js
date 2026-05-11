// Global Configuration
let PASS_SCORE = parseInt(localStorage.getItem('PASS_SCORE')) || 70;
const SILHOUETTE_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

// Data Storage Arrays
let users = JSON.parse(localStorage.getItem('users')) || [];
let globalModules = JSON.parse(localStorage.getItem('globalModules')) || [
  { id: 1, title: "Module 1", description: "Foundational Concepts & Setup", questions: [] },
  { id: 2, title: "Module 2", description: "Advanced Applications", questions: [] },
  { id: 3, title: "Module 3", description: "Final Certification Assessment", questions: [] }
];
let currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || null;

let certConfig = JSON.parse(localStorage.getItem('certConfig')) || {
  title: "Certificate of Achievement",
  subtitle: "This is to certify that",
  completionText: "has successfully completed",
  scoreText: "with a score of",
  signatureText: "Authorized Signature",
  dateText: "Date of Issue"
};

// Exam State
let activeModuleId = null;
let userPhoto = null; // base64
let photoStream = null;

let originalQueue = [];
let retryQueue = [];
let currentQIndex = 0;
let isRetryMode = false;
let correctScore = 0;
let userAnswers = [];
let activeQueue = [];
let currentShuffled = null;

// Ensure Admin Exists with correct password
const adminUser = users.find(u => u.username === 'admin');
if (!adminUser) {
  users.push({
    username: 'admin', password: 'admin123', fullName: 'System Administrator', createdAt: new Date().toISOString(), moduleProgress: {}
  });
  localStorage.setItem('users', JSON.stringify(users));
} else if (adminUser.password === 'password' || adminUser.password === 'admin12345') {
  // Migrate stale admin passwords from old versions
  adminUser.password = 'admin123';
  localStorage.setItem('users', JSON.stringify(users));
}

// Theme Handling
let isDarkTheme = localStorage.getItem('theme') === 'dark';
if (isDarkTheme) document.documentElement.setAttribute('data-theme', 'dark');

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  if (isDarkTheme) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
}

// ── Initialization ──
window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedModule = urlParams.get('module');
  if (sharedModule) {
    sessionStorage.setItem('pendingSharedModule', sharedModule);
  }

  if (currentUser) {
    renderDashboard();
    checkSharedModule();
  } else {
    showScreen('screen-login');
  }
};

function checkSharedModule() {
  const modId = sessionStorage.getItem('pendingSharedModule');
  if (modId) {
    sessionStorage.removeItem('pendingSharedModule');
    const mod = globalModules.find(m => m.id === parseInt(modId));
    if (mod) {
      const userObj = users.find(u => u.username === currentUser.username);
      if (!userObj.moduleProgress[modId]) {
        userObj.moduleProgress[modId] = { unlocked: true };
        saveUsers();
        renderDashboard();
      }
      showToast(`Shared Module ${modId} ready!`, 'success');
    }
  }
}

function saveUsers() {
  localStorage.setItem('users', JSON.stringify(users));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${type==='success'?'fa-check-circle':type==='error'?'fa-circle-exclamation':'fa-info-circle'}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Auth System (Change 5) ──
function toggleAuth(type) {
  if (type === 'register') {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
    document.getElementById('auth-subtitle').textContent = 'Create a new account';
  } else {
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('auth-subtitle').textContent = 'Login to your account';
  }
}

function handleLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();

  if (!u) return showToast('Please enter your username', 'error');
  if (!p) return showToast('Please enter your password', 'error');

  // Find the user (admin or regular)
  const existingUser = users.find(x => x.username === u);
  if (!existingUser) {
    // Unknown user — prompt to register
    showToast('No account found. Please register first.', 'error');
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
    document.getElementById('reg-user').value = u;
    document.getElementById('auth-subtitle').textContent = 'Create a new account';
    return;
  }

  // Validate password against stored value
  if (existingUser.password !== p) {
    return showToast('❌ Invalid credentials', 'error');
  }

  // Credentials match
  currentUser = { username: existingUser.username, fullName: existingUser.fullName };
  sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
  showToast('Login successful! Welcome, ' + existingUser.fullName + '!', 'success');
  renderDashboard();
  if (u !== 'admin') checkSharedModule();
}

function handleRegister() {
  const n = document.getElementById('reg-name').value.trim();
  const u = document.getElementById('reg-user').value.trim();
  const p = document.getElementById('reg-pass').value.trim();
  const cp = document.getElementById('reg-confirm').value.trim();

  if(!n || !u || !p || !cp) return showToast('Fill all fields', 'error');
  if(p !== cp) return showToast('Passwords do not match', 'error');
  if(users.find(x => x.username === u)) return showToast('Username already taken', 'error');

  users.push({ username: u, password: p, fullName: n, createdAt: new Date().toISOString(), moduleProgress: {} });
  saveUsers();
  
  currentUser = { username: u, fullName: n };
  sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
  showToast('Account created successfully!', 'success');
  renderDashboard();
  checkSharedModule();
}

function logout() {
  sessionStorage.removeItem('currentUser');
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  toggleAuth('login');
  showScreen('screen-login');
}

// ── Dashboard & Admin (Change 4 & 5) ──
function renderDashboard() {
  showScreen('screen-dashboard');
  document.getElementById('dash-welcome').textContent = `Welcome, ${currentUser.fullName}! 👋`;

  const userObj = users.find(u => u.username === currentUser.username);
  const prog = userObj.moduleProgress || {};

  // Admin Panel Setup
  if (currentUser.username === 'admin') {
    document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('admin-pass-score').value = PASS_SCORE;
    
    if (document.getElementById('cert-admin-title')) {
      document.getElementById('cert-admin-title').value = certConfig.title;
      document.getElementById('cert-admin-subtitle').value = certConfig.subtitle;
      document.getElementById('cert-admin-completion').value = certConfig.completionText;
      document.getElementById('cert-admin-score').value = certConfig.scoreText;
      document.getElementById('cert-admin-signature').value = certConfig.signatureText;
      document.getElementById('cert-admin-date').value = certConfig.dateText;
    }
    
    renderAdminUsersTable();
  } else {
    document.getElementById('admin-panel').classList.add('hidden');
  }

  // Render Modules Grid
  const grid = document.getElementById('module-grid');
  grid.innerHTML = '';
  
  globalModules.forEach(mod => {
    let p = prog[mod.id];
    if (!p) {
      p = { unlocked: mod.id === 1, completed: false, score: 0 };
      prog[mod.id] = p;
    }

    const card = document.createElement('div');
    card.className = 'module-card ' + (p.unlocked ? '' : 'locked');
    
    let badge = '', btn = '';
    if (p.completed || p.failedAttempt) {
      if (p.completed) {
        badge = `<span class="badge badge-pass">✅ Completed (Score: ${p.score || 0}%)</span>`;
        btn = `<button class="btn btn-secondary" style="width:100%; margin-top:auto;" disabled>Already Completed</button>`;
      } else {
        badge = `<span class="badge badge-fail">❌ Failed (Score: ${p.score || 0}%)</span>`;
        btn = `<button class="btn btn-secondary" style="width:100%; margin-top:auto;" disabled>Attempt Exhausted</button>`;
      }
    } else if (p.unlocked) {
      badge = `<span class="badge" style="background:var(--accent); color:white;">▶ Ready</span>`;
      btn = `<button class="btn btn-primary" style="width:100%; margin-top:auto;" onclick="startModule(${mod.id})">Start Module</button>`;
    } else {
      badge = `<span class="badge" style="background:#e2e8f0; color:#444;">🔒 Locked</span>`;
      btn = `<button class="btn btn-secondary" style="width:100%; margin-top:auto;" disabled>Locked</button>`;
    }

    const qCount = mod.questions ? mod.questions.length : 0;
    let adminInfo = '';
    if (currentUser.username === 'admin') {
      adminInfo = `
        <div style="margin-top:15px; padding-top:10px; border-top:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12px; color:var(--success); font-weight:600;">✅ Loaded (${qCount} Qs)</div>
            <div>
              <button class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" onclick="shareModule(${mod.id})">🔗 Share</button>
              <button class="btn btn-sm btn-outline" style="border-color:var(--error); color:var(--error); padding: 4px 8px; font-size: 12px;" onclick="deleteModule(${mod.id})">🗑 Delete</button>
            </div>
          </div>
          <input type="file" id="admin-file-${mod.id}" accept=".xlsx,.xls" class="input-field" style="padding: 6px; font-size:12px; margin-bottom:0;" onchange="uploadExcelFromCard(${mod.id})" />
        </div>
      `;
    }

    card.innerHTML = `
      <h3 style="font-size:18px;">Module ${mod.id}: ${mod.title}</h3>
      <p style="color:#666; font-size:14px; margin-bottom:15px; flex-grow:1;">${mod.description}</p>
      <div>${badge}</div>
      ${btn}
      ${adminInfo}
      ${!p.unlocked ? `<div class="lock-overlay"><i class="fa-solid fa-lock" style="font-size:24px; margin-bottom:10px;"></i> Complete previous module to unlock</div>` : ''}
    `;
    grid.appendChild(card);
  });
  
  userObj.moduleProgress = prog;
  saveUsers();

  // Render Certificates Grid
  const certsGrid = document.getElementById('certs-container');
  certsGrid.innerHTML = '';
  let hasCerts = false;
  
  globalModules.forEach(mod => {
    const p = prog[mod.id];
    if (p && p.completed) {
      hasCerts = true;
      const cCard = document.createElement('div');
      cCard.className = 'module-card';
      cCard.innerHTML = `
        <h3>${mod.title}</h3>
        <p style="color:#666; font-size:14px; flex-grow:1;">Score: <strong>${p.score}%</strong><br>Date: ${new Date(p.certDate).toLocaleDateString()}</p>
        <button class="btn btn-success" style="width:100%; margin-top:15px;" onclick="viewCertificate(${mod.id})">📥 View / Download</button>
      `;
      certsGrid.appendChild(cCard);
    }
  });
  
  if (!hasCerts) certsGrid.innerHTML = '<p style="color:#666; grid-column: 1 / -1;">No certificates earned yet. Complete a module to earn your first certificate!</p>';
}

function savePassScore() {
  const val = parseInt(document.getElementById('admin-pass-score').value);
  if(val >= 0 && val <= 100) {
    PASS_SCORE = val;
    localStorage.setItem('PASS_SCORE', PASS_SCORE);
    showToast('Passing score updated!', 'success');
  } else {
    showToast('Enter a valid percentage (0-100)', 'error');
  }
}

function saveCertConfig() {
  certConfig = {
    title: document.getElementById('cert-admin-title').value.trim() || "Certificate of Achievement",
    subtitle: document.getElementById('cert-admin-subtitle').value.trim() || "This is to certify that",
    completionText: document.getElementById('cert-admin-completion').value.trim() || "has successfully completed",
    scoreText: document.getElementById('cert-admin-score').value.trim() || "with a score of",
    signatureText: document.getElementById('cert-admin-signature').value.trim() || "Authorized Signature",
    dateText: document.getElementById('cert-admin-date').value.trim() || "Date of Issue"
  };
  localStorage.setItem('certConfig', JSON.stringify(certConfig));
  showToast('Certificate settings saved!', 'success');
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    if(u.username === 'admin') return;
    const tr = document.createElement('tr');
    let progressStr = '';
    globalModules.forEach(m => {
       const p = u.moduleProgress[m.id];
       if(p && p.completed) progressStr += `<span class="badge badge-pass" style="margin-right:5px;">M${m.id}: ${p.score}%</span>`;
       else if(p && p.unlocked) progressStr += `<span class="badge" style="background:#e2e8f0;color:#333;margin-right:5px;">M${m.id}: unlock</span>`;
       else progressStr += `<span class="badge" style="background:#f1f1f1;color:#aaa;margin-right:5px;">M${m.id}: lock</span>`;
    });
    
    tr.innerHTML = `
      <td><strong>${u.fullName}</strong></td>
      <td>${u.username}</td>
      <td>${progressStr}</td>
      <td><button class="btn btn-sm btn-outline" onclick="resetUser('${u.username}')">Reset</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function resetUser(username) {
  if(!confirm(`Reset all progress for ${username}?`)) return;
  const u = users.find(x => x.username === username);
  if(u) {
    u.moduleProgress = {};
    saveUsers();
    renderDashboard();
    showToast(`Progress reset for ${username}`, 'success');
  }
}

function createNewModule() {
  const title = document.getElementById('new-mod-title').value.trim();
  const desc = document.getElementById('new-mod-desc').value.trim();
  
  if (!title) return showToast('Please enter a module title', 'error');
  
  const newId = globalModules.length > 0 ? Math.max(...globalModules.map(m => m.id)) + 1 : 1;
  
  globalModules.push({
    id: newId,
    title: title,
    description: desc,
    questions: []
  });
  
  localStorage.setItem('globalModules', JSON.stringify(globalModules));
  
  document.getElementById('new-mod-title').value = '';
  document.getElementById('new-mod-desc').value = '';
  
  showToast(`Module ${newId} created!`, 'success');
  renderDashboard();
}

function deleteModule(modId) {
  if (!confirm(`Are you sure you want to delete Module ${modId}? This action cannot be undone.`)) return;
  
  globalModules = globalModules.filter(m => m.id !== modId);
  localStorage.setItem('globalModules', JSON.stringify(globalModules));
  
  users.forEach(u => {
    if (u.moduleProgress && u.moduleProgress[modId]) {
      delete u.moduleProgress[modId];
    }
  });
  saveUsers();
  
  showToast(`Module ${modId} deleted successfully`, 'success');
  renderDashboard();
}

function shareModule(modId) {
  const baseUrl = window.location.href.split('?')[0];
  const shareUrl = baseUrl + '?module=' + modId;
  document.getElementById('share-link').value = shareUrl;
  document.getElementById('share-qr').src =
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;
  // Show modal: remove hidden class (modal-overlay handles its own display)
  document.getElementById('modal-share').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('modal-share').classList.add('hidden');
}

function copyShareLink() {
  const input = document.getElementById('share-link');
  input.select();
  input.setSelectionRange(0, 99999); // mobile support
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(input.value)
      .then(() => showToast('Link copied to clipboard!', 'success'))
      .catch(() => { document.execCommand('copy'); showToast('Link copied!', 'success'); });
  } else {
    document.execCommand('copy');
    showToast('Link copied to clipboard!', 'success');
  }
}

// ── Excel Upload Logic (Change 1 & 4) ──
function uploadExcelFromCard(modId) {
  const fileInput = document.getElementById(`admin-file-${modId}`);
  processExcel(fileInput, modId);
}

function processExcel(fileInput, modId) {
  if(!fileInput.files[0]) { showToast('Select an Excel file', 'error'); return; }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      const questions = [];
      for(let i=1; i<rows.length; i++) {
        const row = rows[i];
        if(!row || row.length < 2) continue;
        const serial = row[0] || i;
        const question = String(row[1] || '').trim();
        const optA = String(row[2] || '').trim(); // ALWAYS CORRECT IN EXCEL
        const optB = String(row[3] || '').trim();
        const optC = String(row[4] || '').trim();
        const optD = String(row[5] || '').trim();
        const reason = String(row[6] || '').trim();
        
        if(question && optA && optB && optC && optD) {
          questions.push({ serial, question, options: [optA, optB, optC, optD], reason, correctIndex: 0 });
        }
      }
      
      if(questions.length > 0) {
        const mod = globalModules.find(m => m.id === modId);
        mod.questions = questions;
        localStorage.setItem('globalModules', JSON.stringify(globalModules));
        showToast(`✅ Loaded ${questions.length} Questions for Module ${modId}`, 'success');
        renderDashboard();
      } else {
        showToast('No valid questions found. Check columns format.', 'error');
      }
    } catch(err) {
      showToast('Error parsing Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(fileInput.files[0]);
}

// ── Module Initialization ──
function startModule(modId) {
  const mod = globalModules.find(m => m.id === modId);
  if(!mod.questions || mod.questions.length === 0) {
    return showToast('This module has no questions yet.', 'error');
  }
  activeModuleId = modId;
  
  document.getElementById('instr-topic').textContent = mod.title;
  document.getElementById('instr-count').textContent = 'Total Questions: ' + mod.questions.length;
  showScreen('screen-instructions');
}

// ── Exam Logic ──
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(question) {
  let opts = question.options.map((text, i) => ({ text, isCorrect: i === question.correctIndex }));
  opts = shuffleArray(opts);
  const newCorrectIndex = opts.findIndex(o => o.isCorrect);
  return { shuffledOpts: opts, newCorrectIndex };
}

let proctorPhotos = [];
let proctorInterval = null;

function startQuiz() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      photoStream = stream;
      const video = document.getElementById('proctor-video');
      if (video) video.srcObject = stream;
      
      const mod = globalModules.find(m => m.id === activeModuleId);
      originalQueue = shuffleArray([...mod.questions]);
      retryQueue = [];
      currentQIndex = 0;
      isRetryMode = false;
      correctScore = 0;
      userAnswers = [];
      activeQueue = originalQueue;
      proctorPhotos = [];
      
      showScreen('screen-exam');
      renderQuestion();
      
      let captures = 0;
      proctorInterval = setInterval(() => {
        if (captures >= 3 || !photoStream) {
          clearInterval(proctorInterval);
          return;
        }
        captureProctorPhoto();
        captures++;
      }, 10000);
    })
    .catch(() => {
      showToast('Camera access denied. You must allow camera access to take the exam.', 'error');
    });
}

function captureProctorPhoto() {
  const video = document.getElementById('proctor-video');
  if(!video || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = 300; canvas.height = 225;
  canvas.getContext('2d').drawImage(video, 0, 0, 300, 225);
  proctorPhotos.push(canvas.toDataURL('image/jpeg', 0.6));
}

function renderQuestion() {
  const q = activeQueue[currentQIndex];
  currentShuffled = shuffleOptions(q);

  const qNum = isRetryMode
    ? `Retry ${currentQIndex + 1} of ${retryQueue.length}`
    : `Question ${currentQIndex + 1} of ${originalQueue.length}`;
    
  document.getElementById('exam-q-counter').textContent = qNum;
  document.getElementById('exam-score-tracker').textContent = `Score: ${correctScore} / ${originalQueue.length}`;
  document.getElementById('exam-retry-banner').classList.toggle('hidden', !isRetryMode);
  document.getElementById('exam-question-text').textContent = q.question;

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById('opt-' + i);
    btn.textContent = ['A','B','C','D'][i] + '. ' + currentShuffled.shuffledOpts[i].text;
    btn.className = 'option-btn';
    btn.disabled = false;
    btn.onclick = () => handleAnswer(i);
  }

  document.getElementById('exam-reason-box').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');
}

function handleAnswer(chosenIdx) {
  for (let i = 0; i < 4; i++) document.getElementById('opt-' + i).disabled = true;

  const correctIdx = currentShuffled.newCorrectIndex;
  const isCorrect = (chosenIdx === correctIdx);
  const q = activeQueue[currentQIndex];

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById('opt-' + i);
    btn.classList.remove('correct', 'chosen-wrong', 'wrong');
    if (i === correctIdx) btn.classList.add('correct');
    else if (i === chosenIdx) btn.classList.add('chosen-wrong');
    else btn.classList.add('wrong');
  }

  // Show single explanation
  document.getElementById('exam-reason-text').textContent = q.reason || 'No explanation available.';
  document.getElementById('exam-reason-box').classList.remove('hidden');

  if (!isRetryMode) {
    userAnswers.push({
      question: q.question,
      chosenText: currentShuffled.shuffledOpts[chosenIdx].text,
      correctText: currentShuffled.shuffledOpts[correctIdx].text,
      correct: isCorrect
    });

    if (isCorrect) correctScore++;
    else retryQueue.push(q);
  } else {
    if (isCorrect) {
      retryQueue.splice(currentQIndex, 1);
      currentQIndex--;
    } else {
      const wrongQ = retryQueue.splice(currentQIndex, 1)[0];
      retryQueue.push(wrongQ);
      currentQIndex--;
    }
  }

  document.getElementById('btn-next').classList.remove('hidden');
}

function handleNext() {
  currentQIndex++;
  if (!isRetryMode) {
    if (currentQIndex >= originalQueue.length) {
      if (retryQueue.length === 0) finishExam();
      else {
        isRetryMode = true;
        activeQueue = retryQueue;
        currentQIndex = 0;
        showRetryTransition();
      }
    } else {
      renderQuestion();
    }
  } else {
    if (retryQueue.length === 0) finishExam();
    else {
      if (currentQIndex >= retryQueue.length) currentQIndex = 0;
      renderQuestion();
    }
  }
}

function showRetryTransition() {
  const banner = document.getElementById('exam-retry-banner');
  banner.textContent = `🔁 You have ${retryQueue.length} question(s) to retry. Answer them correctly to complete. These do NOT affect your score.`;
  banner.classList.remove('hidden');
  setTimeout(() => renderQuestion(), 2000);
}

function finishExam() {
  if (photoStream) {
    photoStream.getTracks().forEach(t => t.stop());
    photoStream = null;
  }
  if (proctorInterval) clearInterval(proctorInterval);

  const total = originalQueue.length;
  const percentage = Math.round((correctScore / total) * 100);
  const pass = percentage >= PASS_SCORE;
  
  const user = users.find(u => u.username === currentUser.username);
  let prog = user.moduleProgress[activeModuleId] || {};
  
  if (pass) {
    prog.completed = true;
    prog.score = Math.max(prog.score || 0, percentage);
    prog.certDate = new Date().toISOString();
    prog.proctorPhotos = proctorPhotos;
    
    // Unlock Next Module logic
    const nextMod = globalModules.find(m => m.id === activeModuleId + 1);
    if (nextMod) {
      if (!user.moduleProgress[nextMod.id]) user.moduleProgress[nextMod.id] = { unlocked: true };
      else user.moduleProgress[nextMod.id].unlocked = true;
    }
    showToast(`🎉 Module ${activeModuleId} Complete!`, 'success');
  } else {
    prog.failedAttempt = true;
    prog.score = percentage;
    showToast(`Score too low. You needed ${PASS_SCORE}% to pass.`, 'error');
  }
  
  user.moduleProgress[activeModuleId] = prog;
  saveUsers();
  
  renderResultScreen(pass, total, percentage);
  showScreen('screen-result');
}

function renderResultScreen(pass, total, percentage) {
  document.getElementById('result-header').innerHTML = `<div style="font-size: 56px; margin-bottom:10px;">${pass ? '🎉' : '😞'}</div><h2>${pass ? 'Module Completed Successfully!' : 'Module Failed'}</h2>`;
  
  document.getElementById('result-stats').innerHTML = `
    <div class="stat-box"><span class="stat-label">Score</span><span class="stat-value">${correctScore} / ${total}</span></div>
    <div class="stat-box"><span class="stat-label">Percentage</span><span class="stat-value">${percentage}%</span></div>
    <div class="stat-box"><span class="stat-label">Status</span><span class="stat-value badge ${pass ? 'badge-pass' : 'badge-fail'}">${pass ? 'PASS' : 'FAIL'}</span></div>
  `;

  const tbody = document.getElementById('result-table-body');
  tbody.innerHTML = '';
  userAnswers.forEach((ans, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${ans.question}</td><td>${ans.chosenText}</td><td>${ans.correctText}</td><td>${ans.correct ? '✅' : '❌'}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Certificate Management (Change 2) ──
function viewCertificate(modId) {
  activeModuleId = modId;
  const user = users.find(u => u.username === currentUser.username);
  const p = user.moduleProgress[modId];
  const mod = globalModules.find(m => m.id === modId);
  
  if (document.getElementById('cert-display-title')) {
    document.getElementById('cert-display-title').textContent = certConfig.title;
    document.getElementById('cert-display-subtitle').textContent = certConfig.subtitle;
    document.getElementById('cert-display-completion').textContent = certConfig.completionText;
    document.getElementById('cert-display-score').textContent = certConfig.scoreText;
    document.getElementById('cert-display-signature').textContent = certConfig.signatureText;
    document.getElementById('cert-display-date-label').textContent = certConfig.dateText;
  }
  
  document.getElementById('cert-name').textContent = user.fullName.toUpperCase();
  document.getElementById('cert-module').textContent = `MODULE ${mod.id}: ${mod.title.toUpperCase()}`;
  document.getElementById('cert-score').textContent = `${p.score}%`;
  
  const d = new Date(p.certDate);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('cert-date').textContent = dateStr;
  
  showScreen('screen-certificate');
  
  const wrapper = document.getElementById('cert-responsive-wrapper');
  const scaleWrapper = document.getElementById('cert-scale-wrapper');
  if (wrapper && scaleWrapper) {
    // Remove any old resize listener to avoid duplicates
    if (wrapper._scaleListener) window.removeEventListener('resize', wrapper._scaleListener);
    
    const updateScale = () => {
      const hPad = 24; // horizontal padding
      const vReserve = 160; // space for action buttons + margins
      const containerWidth = wrapper.clientWidth - hPad * 2;
      const containerHeight = window.innerHeight - vReserve;

      const scaleByWidth = containerWidth / 1122;
      const scaleByHeight = containerHeight / 794;
      const s = Math.min(scaleByWidth, scaleByHeight, 1);

      scaleWrapper.style.transform = s < 1 ? `scale(${s})` : 'none';
      scaleWrapper.style.transformOrigin = 'top center';
      // Collapse the empty space left by scaling down
      const scaledH = 794 * s;
      scaleWrapper.style.marginBottom = s < 1 ? `-${794 - scaledH}px` : '0';
      wrapper.style.minHeight = `${scaledH + 20}px`;
    };
    
    wrapper._scaleListener = updateScale;
    window.addEventListener('resize', updateScale);
    updateScale();
  }
}

function printCertificate() {
  window.print();
}

function downloadPNG() {
  const btn = document.getElementById('btn-download-png');
  btn.innerHTML = '<div class="spinner"></div> ...';
  btn.disabled = true;

  const target = document.getElementById('cert-container');
  const scaleWrapper = document.getElementById('cert-scale-wrapper');

  const oldTransform = scaleWrapper ? scaleWrapper.style.transform : '';
  const oldMargin = scaleWrapper ? scaleWrapper.style.marginBottom : '';
  if (scaleWrapper) {
    scaleWrapper.style.transform = 'none';
    scaleWrapper.style.marginBottom = '0';
  }

  setTimeout(() => {
    html2canvas(target, { scale: 2, useCORS: true, logging: false }).then(canvas => {
      const link = document.createElement('a');
      link.download = `certificate-${currentUser.fullName.replace(/\s+/g,'-')}-Module${activeModuleId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      btn.innerHTML = '📥 PNG';
      btn.disabled = false;
      if (scaleWrapper) { scaleWrapper.style.transform = oldTransform; scaleWrapper.style.marginBottom = oldMargin; }
    }).catch(err => {
      showToast('Failed to generate PNG', 'error');
      btn.innerHTML = '📥 PNG';
      btn.disabled = false;
      if (scaleWrapper) { scaleWrapper.style.transform = oldTransform; scaleWrapper.style.marginBottom = oldMargin; }
    });
  }, 300);
}

function downloadCertificatePDF() {
  const btn = document.getElementById('btn-download-cert-pdf');
  btn.innerHTML = '<div class="spinner"></div> ...';
  btn.disabled = true;

  const target = document.getElementById('cert-container');
  const scaleWrapper = document.getElementById('cert-scale-wrapper');
  const oldTransform = scaleWrapper ? scaleWrapper.style.transform : '';
  const oldMargin = scaleWrapper ? scaleWrapper.style.marginBottom : '';
  if (scaleWrapper) {
    scaleWrapper.style.transform = 'none';
    scaleWrapper.style.marginBottom = '0';
  }

  setTimeout(() => {
    html2canvas(target, { scale: 2, useCORS: true, logging: false }).then(canvas => {
      const { jsPDF } = window.jspdf;
      // A4 landscape: 297mm x 210mm
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(pageWidth / imgW, pageHeight / imgH);
      const w = imgW * ratio;
      const h = imgH * ratio;
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
      const filename = `certificate-${currentUser.fullName.replace(/\s+/g,'-')}-Module${activeModuleId}.pdf`;
      pdf.save(filename);

      btn.innerHTML = '📄 PDF';
      btn.disabled = false;
      showToast('Certificate PDF downloaded!', 'success');
      if (scaleWrapper) { scaleWrapper.style.transform = oldTransform; scaleWrapper.style.marginBottom = oldMargin; }
    }).catch(err => {
      showToast('Failed to generate PDF: ' + err.message, 'error');
      btn.innerHTML = '📄 PDF';
      btn.disabled = false;
      if (scaleWrapper) { scaleWrapper.style.transform = oldTransform; scaleWrapper.style.marginBottom = oldMargin; }
    });
  }, 300);
}

function downloadResultPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Get current result data from the screen
  const resultHeader = document.getElementById('result-header').textContent.trim();
  const resultStats = document.getElementById('result-stats');
  const statBoxes = resultStats.querySelectorAll('.stat-box');
  const tableBody = document.getElementById('result-table-body');

  // Title
  doc.setFontSize(20);
  doc.setTextColor(0, 102, 204);
  doc.setFont('helvetica', 'bold');
  doc.text('Exam Result Report', 105, 20, { align: 'center' });

  // Header info
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(resultHeader.replace(/🎉|😞/g, '').trim(), 105, 35, { align: 'center' });

  // Stats
  let yPos = 50;
  statBoxes.forEach((box, index) => {
    const label = box.querySelector('.stat-label').textContent;
    const value = box.querySelector('.stat-value').textContent;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 60, yPos);
    yPos += 10;
  });

  // Table data
  const tableData = [];
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const rowData = [];
    cells.forEach(cell => {
      rowData.push(cell.textContent);
    });
    tableData.push(rowData);
  });

  // Add table
  doc.autoTable({
    startY: yPos + 10,
    head: [['#', 'Question', 'Your Answer', 'Correct Answer', 'Result']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [0, 102, 204],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 60 },
      2: { cellWidth: 30 },
      3: { cellWidth: 30 },
      4: { cellWidth: 20 }
    }
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text('Generated by ExamProctor Pro', 105, pageHeight - 10, { align: 'center' });

  // Save the PDF
  const filename = `exam-result-${currentUser.fullName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  showToast('PDF report downloaded!', 'success');
}
