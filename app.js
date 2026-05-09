// Constants
const ADMIN_EMAIL    = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin12345';
const PASS_THRESHOLD = 0.60;
const PLATFORM_NAME  = 'ExamProctor';

// Global Variables
let currentUser = null;
let isAdmin = false;
let pendingExamId = null;

// Camera state
let stream  = null;
let photos  = [];
const videoEl = () => document.getElementById('proctor-video');

// Exam state
let originalQueue   = [];
let retryQueue      = [];
let currentQIndex   = 0;
let isRetryMode     = false;
let correctScore    = 0;
let userAnswers     = [];
let captureIndices  = [];
let currentShuffled = null;
let activeQueue     = [];

// Init
window.onload = () => {
  checkForResume();
};

function getExamIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('exam');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function handleLoginContinue() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();

  if (!isValidEmail(email)) {
    showError('email-error', 'Please enter a valid email address.');
    return;
  }
  hideError('email-error');

  if (email === ADMIN_EMAIL) {
    document.getElementById('admin-pass-block').classList.remove('hidden');
    document.getElementById('input-admin-pass').focus();
    document.getElementById('btn-continue').setAttribute('onclick', 'handleAdminLogin()');
    return;
  }

  currentUser = { email };
  initUserInStorage(email);

  const examId = getExamIdFromURL();
  if (examId) {
    pendingExamId = examId;
    if (!getExamById(examId)) {
        alert('Exam not found. The link may be invalid or expired.');
        return;
    }
    showScreen('screen-camera');
  } else {
    showScreen('screen-user-history');
    renderUserHistory();
  }
}

function handleAdminLogin() {
  const pass = document.getElementById('input-admin-pass').value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    showScreen('screen-admin');
    renderAdminTab('upload');
  } else {
    showError('pass-error', 'Incorrect password. Try again.');
  }
}

function adminLogout() {
    isAdmin = false;
    document.getElementById('input-email').value = '';
    document.getElementById('input-admin-pass').value = '';
    document.getElementById('admin-pass-block').classList.add('hidden');
    document.getElementById('btn-continue').setAttribute('onclick', 'handleLoginContinue()');
    showScreen('screen-login');
}

function initUserInStorage(email) {
  const results = getResults();
  if (!results[email]) {
    results[email] = [];
    saveResults(results);
  }
}

// Data Storage Schema
function getExams() {
  return JSON.parse(localStorage.getItem('exams') || '{}');
}
function saveExams(exams) {
  try {
    localStorage.setItem('exams', JSON.stringify(exams));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage is full. Please ask the admin to delete old exams.');
    }
  }
}
function getExamById(id) {
  return getExams()[id] || null;
}

function getResults() {
  return JSON.parse(localStorage.getItem('results') || '{}');
}
function saveResults(results) {
  try {
    localStorage.setItem('results', JSON.stringify(results));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage is full. Old results may need to be cleared by the admin.');
    }
  }
}
function saveUserResult(email, resultRecord) {
  const results = getResults();
  if (!results[email]) results[email] = [];
  results[email].push(resultRecord);
  saveResults(results);
}

function saveProgress(data) {
  localStorage.setItem('examProgress', JSON.stringify(data));
}
function loadProgress() {
  return JSON.parse(localStorage.getItem('examProgress') || 'null');
}
function clearProgress() {
  localStorage.removeItem('examProgress');
}

// Camera Module
async function requestCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    const v = videoEl();
    v.srcObject = stream;
    await v.play();
    return true;
  } catch (err) {
    console.warn('Camera error:', err.name, err.message);
    return false;
  }
}

async function handleCameraPermission() {
  const granted = await requestCamera();
  if (granted) {
    showScreen('screen-instructions');
    renderInstructions();
  } else {
    document.getElementById('camera-error').textContent =
      'Camera permission is required to take this exam. Please refresh and allow camera access, or contact your administrator.';
    document.getElementById('camera-error').classList.remove('hidden');
    document.querySelector('#screen-camera .btn-primary').disabled = true;
    setTimeout(() => { try { window.close(); } catch(e) {} }, 3000);
  }
}

function capturePhoto() {
  if (!stream || photos.length >= 3) return;
  const canvas = document.createElement('canvas');
  canvas.width  = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl(), 0, 0, 320, 240);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
  photos.push(dataUrl);
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  const v = videoEl();
  if (v) { v.srcObject = null; }
}

function pickRandomIndices(max, count) {
  const indices = [];
  while (indices.length < Math.min(count, max)) {
    const r = Math.floor(Math.random() * max);
    if (!indices.includes(r)) indices.push(r);
  }
  return indices;
}

// Exam Logic
function renderInstructions() {
  const exam = getExamById(pendingExamId);
  if (!exam) {
    alert('Exam not found. The link may be invalid or expired.');
    showScreen('screen-login');
    return;
  }
  document.getElementById('instr-topic').textContent = `Exam: ${exam.topic}`;
  document.getElementById('instr-count').textContent = `Total Questions: ${exam.questions.length}`;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(question) {
  let opts = question.options.map((text, i) => ({
    text,
    reason   : question.reasons[i],
    isCorrect: i === question.correctIndex
  }));

  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }

  const newCorrectIndex = opts.findIndex(o => o.isCorrect);
  return { shuffledOpts: opts, newCorrectIndex };
}

function startExam() {
  const exam = getExamById(pendingExamId);
  originalQueue = shuffleArray(exam.questions.map((q, i) => ({ ...q, originalIndex: i })));
  retryQueue    = [];
  currentQIndex = 0;
  isRetryMode   = false;
  correctScore  = 0;
  userAnswers   = [];
  photos        = [];
  activeQueue   = originalQueue;
  captureIndices = pickRandomIndices(originalQueue.length, 3);
  showScreen('screen-exam');
  renderQuestion();
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
    const btn = document.getElementById(`opt-${i}`);
    btn.textContent = `${['A','B','C','D'][i]}. ${currentShuffled.shuffledOpts[i].text}`;
    btn.className   = 'option-btn';
    btn.disabled    = false;
    btn.onclick     = () => handleAnswer(i);
  }

  document.getElementById('exam-reason-box').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');

  if (!isRetryMode && captureIndices.includes(currentQIndex)) {
    capturePhoto();
  }
}

function handleAnswer(chosenIdx) {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`opt-${i}`).disabled = true;
  }

  const correctIdx = currentShuffled.newCorrectIndex;
  const isCorrect  = (chosenIdx === correctIdx);
  const q          = activeQueue[currentQIndex];

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    btn.classList.remove('correct', 'chosen-wrong', 'wrong');
    if (i === correctIdx) {
      btn.classList.add('correct');
    } else if (i === chosenIdx) {
      btn.classList.add('chosen-wrong');
    } else {
      btn.classList.add('wrong');
    }
  }

  const reasonText = currentShuffled.shuffledOpts[chosenIdx].reason;
  document.getElementById('exam-reason-text').textContent = reasonText || 'No explanation available.';
  document.getElementById('exam-reason-box').classList.remove('hidden');

  if (!isRetryMode) {
    userAnswers.push({
      originalIndex : q.originalIndex,
      question      : q.question,
      chosenText    : currentShuffled.shuffledOpts[chosenIdx].text,
      correctText   : currentShuffled.shuffledOpts[correctIdx].text,
      correct       : isCorrect
    });

    if (isCorrect) {
      correctScore++;
    } else {
      retryQueue.push(q);
    }
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
      if (retryQueue.length === 0) {
        finishExam();
      } else {
        isRetryMode   = true;
        activeQueue   = retryQueue;
        currentQIndex = 0;
        showRetryTransition();
      }
    } else {
      renderQuestion();
    }
  } else {
    if (retryQueue.length === 0) {
      finishExam();
    } else {
      if (currentQIndex >= retryQueue.length) currentQIndex = 0;
      renderQuestion();
    }
  }
}

function showRetryTransition() {
  const banner = document.getElementById('exam-retry-banner');
  banner.textContent = `🔁 You have ${retryQueue.length} question(s) to retry. Answer them correctly to complete. These do NOT affect your score.`;
  banner.classList.remove('hidden');
  setTimeout(() => renderQuestion(), 2500);
}

function finishExam() {
  stopCamera();

  const exam       = getExamById(pendingExamId);
  const total      = originalQueue.length;
  const percentage = Math.round((correctScore / total) * 100);
  const pass       = (correctScore / total) >= PASS_THRESHOLD;

  const resultRecord = {
    examId    : pendingExamId,
    topic     : exam.topic,
    score     : correctScore,
    total,
    percentage,
    pass,
    date      : new Date().toISOString(),
    answers   : userAnswers,
    photos    : [...photos]
  };
  saveUserResult(currentUser.email, resultRecord);

  renderResultScreen(resultRecord, pass, total);
  showScreen('screen-result');
  clearProgress();
}

function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
}

function renderResultScreen(result, pass, total) {
  document.getElementById('result-header').innerHTML = `
    <div class="result-icon" style="font-size: 48px;">${pass ? '🎉' : '😞'}</div>
    <h2>${pass ? 'Congratulations! You Passed!' : 'Exam Complete'}</h2>
  `;

  document.getElementById('result-stats').innerHTML = `
    <div class="stat-box">
      <span class="stat-label">Score</span>
      <span class="stat-value">${result.score} / ${result.total}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Percentage</span>
      <span class="stat-value">${result.percentage}%</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Status</span>
      <span class="stat-value badge ${pass ? 'badge-pass' : 'badge-fail'}">${pass ? 'PASS' : 'FAIL'}</span>
    </div>
  `;

  const tbody = document.getElementById('result-table-body');
  tbody.innerHTML = '';
  result.answers.forEach((ans, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${ans.question}</td>
      <td>${ans.chosenText}</td>
      <td>${ans.correctText}</td>
      <td>${ans.correct ? '✅' : '❌'}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('btn-certificate').classList.toggle('hidden', !pass);
}

// User History
function renderUserHistory() {
  const results = getResults();
  const history = results[currentUser.email] || [];

  document.getElementById('history-user-email').textContent = currentUser.email;

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (history.length === 0) {
    document.getElementById('history-empty').classList.remove('hidden');
    return;
  }
  document.getElementById('history-empty').classList.add('hidden');

  history.slice().reverse().forEach((rec, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div class="history-info">
        <strong>${rec.topic}</strong>
        <span class="badge ${rec.pass ? 'badge-pass' : 'badge-fail'}">${rec.pass ? 'PASS' : 'FAIL'}</span>
        <br>
        <small>Score: ${rec.score}/${rec.total} (${rec.percentage}%) — ${formatDate(rec.date)}</small>
      </div>
      <button class="btn btn-sm btn-outline" onclick="showHistoryDetail(${history.length - 1 - i})">
        View →
      </button>
    `;
    list.appendChild(row);
  });
}

function showHistoryDetail(index) {
  const results = getResults();
  const rec = results[currentUser.email][index];
  renderResultScreen(rec, rec.pass, rec.total);
  showScreen('screen-result');
}

function goToHistory() {
    showScreen('screen-user-history');
    renderUserHistory();
}

// Certificate
let certData = {};

function generateCertificate() {
  const results = getResults();
  const history = results[currentUser.email];
  const rec     = history[history.length - 1];

  certData = {
    userName : currentUser.email,
    examTopic: rec.topic,
    score    : rec.score,
    total    : rec.total,
    date     : formatDate(rec.date)
  };

  document.getElementById('cert-preview').innerHTML = `
    <h2>🏅 Certificate of Achievement</h2>
    <p>Awarded to: <strong>${certData.userName}</strong></p>
    <p>Exam: <strong>${certData.examTopic}</strong></p>
    <p>Score: ${certData.score} / ${certData.total} &nbsp;|&nbsp; Date: ${certData.date}</p>
  `;
}

function downloadCertificate() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(4);
  doc.rect(8, 8, 281, 194);

  doc.setLineWidth(1.5);
  doc.rect(13, 13, 271, 184);

  doc.setFontSize(36);
  doc.setTextColor(0, 102, 204);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate of Achievement', 148.5, 50, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('This is to certify that', 148.5, 70, { align: 'center' });

  doc.setFontSize(26);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(certData.userName, 148.5, 90, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('has successfully completed the online proctored exam on', 148.5, 108, { align: 'center' });

  doc.setFontSize(24);
  doc.setTextColor(0, 102, 204);
  doc.setFont('helvetica', 'bold');
  doc.text(certData.examTopic, 148.5, 126, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `Score: ${certData.score} / ${certData.total}   |   Date: ${certData.date}`,
    148.5, 145, { align: 'center' }
  );

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(50, 158, 247, 158);

  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(`Issued by ${PLATFORM_NAME}`, 148.5, 168, { align: 'center' });
  doc.text('This certificate is system-generated and does not require a physical signature.', 148.5, 176, { align: 'center' });

  doc.save('certificate.pdf');
}

// Admin Logic
function renderAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}-btn`).classList.add('active');

    const content = document.getElementById('admin-tab-content');
    content.innerHTML = '';

    if (tab === 'upload') {
        content.innerHTML = `
        <div class="card">
          <h3>Upload New Exam</h3>

          <label class="input-label">Exam Topic *</label>
          <input type="text" id="admin-topic" placeholder="e.g. Road Safety" class="input-field" />

          <label class="input-label">Question Bank (Excel file) *</label>
          <input type="file" id="admin-file" accept=".xlsx,.xls" class="input-field" />

          <div class="file-hint" style="font-size: 13px; color: #666; margin-bottom: 12px; background: #f9f9f9; padding: 10px; border-radius: 6px;">
            <strong>Expected columns (row 1 = headers, row 2+ = questions):</strong><br>
            Col A: Serial | Col B: Question | Col C: Option A (CORRECT) |
            Col D: Option B | Col E: Option C | Col F: Option D |
            Col G: Reason A | Col H: Reason B | Col I: Reason C | Col J: Reason D
          </div>

          <button class="btn btn-primary" onclick="handleExamUpload()">
            📤 Upload &amp; Generate Link
          </button>

          <p id="upload-error" class="error-text hidden"></p>

          <div id="upload-result" class="upload-result hidden" style="margin-top: 20px; text-align: center;">
            <h4 style="color: #2E7D32;">✅ Exam Created!</h4>
            <p style="margin-top: 10px;">Shareable Link:</p>
            <div class="link-box" style="justify-content: center;">
              <span id="exam-link-text"></span>
              <button class="btn btn-sm btn-outline" onclick="copyExamLink()">Copy</button>
            </div>
            <p>QR Code:</p>
            <div id="exam-qr-code" style="display: flex; justify-content: center; margin-top: 10px;"></div>
          </div>
        </div>
        `;
    } else if (tab === 'exams') {
        content.innerHTML = `
        <div class="card">
          <h3>All Exams</h3>
          <div id="exams-list"></div>
        </div>
        `;
        const examsList = document.getElementById('exams-list');
        const exams = getExams();
        const results = getResults();
        
        let examAttempts = {};
        Object.values(results).forEach(userAttempts => {
            userAttempts.forEach(rec => {
                examAttempts[rec.examId] = (examAttempts[rec.examId] || 0) + 1;
            });
        });

        if (Object.keys(exams).length === 0) {
            examsList.innerHTML = '<p style="color: #666;">No exams found.</p>';
        } else {
            Object.keys(exams).forEach(id => {
                const exam = exams[id];
                const row = document.createElement('div');
                row.className = 'history-row';
                row.innerHTML = `
                  <div class="history-info">
                    <strong>${exam.topic}</strong>
                    <br>
                    <small>${exam.questions.length} questions | ${examAttempts[id] || 0} attempts | ${formatDate(exam.createdAt)}</small>
                  </div>
                  <div style="display: flex; gap: 8px;">
                      <button class="btn btn-sm btn-outline" onclick="copyExamLinkById('${id}')">Copy Link</button>
                      <button class="btn btn-sm" style="background: #F44336; color: white;" onclick="deleteExam('${id}')">Delete</button>
                  </div>
                `;
                examsList.appendChild(row);
            });
        }
    } else if (tab === 'results') {
        const exams = getExams();
        let optionsHtml = '<option value="all">All Exams</option>';
        Object.keys(exams).forEach(id => {
            optionsHtml += `<option value="${id}">${exams[id].topic}</option>`;
        });

        content.innerHTML = `
        <div class="card" style="max-width: 100%;">
          <h3>User Results</h3>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
              <div style="flex: 1; min-width: 200px;">
                  <label class="input-label" style="display: inline-block; margin-right: 10px;">Filter by Exam:</label>
                  <select id="results-exam-filter" onchange="renderResultsTable()" class="input-field" style="width: auto; display: inline-block;">
                    ${optionsHtml}
                  </select>
              </div>
              <button class="btn btn-sm btn-outline" onclick="exportResultsCSV()">⬇ Export CSV</button>
          </div>

          <div class="table-wrapper">
            <table class="result-table" id="admin-results-table">
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Exam Topic</th>
                  <th>Score</th>
                  <th>%</th>
                  <th>Pass/Fail</th>
                  <th>Date &amp; Time</th>
                  <th>Photos</th>
                </tr>
              </thead>
              <tbody id="admin-results-tbody"></tbody>
            </table>
          </div>
        </div>
        `;
        renderResultsTable();
    }
}

function handleExamUpload() {
  const topic    = document.getElementById('admin-topic').value.trim();
  const fileInput = document.getElementById('admin-file');
  const file     = fileInput.files[0];

  if (!topic) {
    showError('upload-error', 'Exam topic is required.');
    return;
  }
  if (!file) {
    showError('upload-error', 'Please select an Excel file.');
    return;
  }

  hideError('upload-error');

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data     = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) {
        showError('upload-error', 'Excel file has no question rows.');
        return;
      }

      const questions = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        if (!row || row.length < 10) {
          showError('upload-error', \`Row \${i + 1} has fewer than 10 columns. Check Excel format.\`);
          return;
        }

        const serial   = row[0] ?? i;
        const question = String(row[1] ?? '').trim();
        const optA     = String(row[2] ?? '').trim(); 
        const optB     = String(row[3] ?? '').trim();
        const optC     = String(row[4] ?? '').trim();
        const optD     = String(row[5] ?? '').trim();
        const reasonA  = String(row[6] ?? '').trim();
        const reasonB  = String(row[7] ?? '').trim();
        const reasonC  = String(row[8] ?? '').trim();
        const reasonD  = String(row[9] ?? '').trim();

        if (!question || !optA || !optB || !optC || !optD) {
          console.warn(\`Skipping row \${i + 1}: missing required fields.\`);
          continue;
        }

        questions.push({
          serial,
          question,
          options     : [optA, optB, optC, optD],
          correctIndex: 0,
          reasons     : [reasonA, reasonB, reasonC, reasonD]
        });
      }

      if (questions.length === 0) {
        showError('upload-error', 'No valid questions found in the Excel file.');
        return;
      }

      const examId  = crypto.randomUUID();
      const exams   = getExams();
      exams[examId] = {
        topic,
        createdAt: new Date().toISOString(),
        questions
      };
      saveExams(exams);

      const link = generateExamLink(examId);
      document.getElementById('exam-link-text').textContent = link;
      document.getElementById('upload-result').classList.remove('hidden');

      document.getElementById('exam-qr-code').innerHTML = ''; 
      new QRCode(document.getElementById('exam-qr-code'), {
        text  : link,
        width : 160,
        height: 160
      });

      document.getElementById('admin-topic').value = '';
      fileInput.value = '';

    } catch (err) {
      showError('upload-error', \`Failed to parse Excel: \${err.message}\`);
    }
  };
  reader.readAsArrayBuffer(file);
}

function generateExamLink(examId) {
  return \`\${window.location.origin}\${window.location.pathname}?exam=\${examId}\`;
}

function copyExamLink() {
  const link = document.getElementById('exam-link-text').textContent;
  navigator.clipboard.writeText(link)
    .then(() => alert('Link copied to clipboard!'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Link copied!');
    });
}

function copyExamLinkById(examId) {
    const link = generateExamLink(examId);
    navigator.clipboard.writeText(link)
        .then(() => alert('Link copied to clipboard!'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = link;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert('Link copied!');
        });
}

function deleteExam(examId) {
    if (confirm('Are you sure you want to delete this exam?')) {
        const exams = getExams();
        delete exams[examId];
        saveExams(exams);
        renderAdminTab('exams');
    }
}

function renderResultsTable() {
    const results = getResults();
    const filter  = document.getElementById('results-exam-filter').value;
    const tbody = document.getElementById('admin-results-tbody');
    tbody.innerHTML = '';

    Object.entries(results).forEach(([email, attempts]) => {
        attempts.forEach(rec => {
            if (filter !== 'all' && rec.examId !== filter) return;
            
            let photosHtml = '';
            (rec.photos || []).forEach(photo => {
                photosHtml += \`<img src="\${photo}" width="60" height="45" style="cursor:pointer;border-radius:4px;margin:2px;" onclick="enlargePhoto('\${photo}')" />\`;
            });

            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td>\${email}</td>
                <td>\${rec.topic}</td>
                <td>\${rec.score} / \${rec.total}</td>
                <td>\${rec.percentage}%</td>
                <td><span class="badge \${rec.pass ? 'badge-pass' : 'badge-fail'}">\${rec.pass ? 'PASS' : 'FAIL'}</span></td>
                <td>\${formatDate(rec.date)}</td>
                <td>\${photosHtml}</td>
            \`;
            tbody.appendChild(tr);
        });
    });
}

function enlargePhoto(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = \`position:fixed;inset:0;background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;\`;
  overlay.innerHTML = \`<img src="\${src}" style="max-width:90vw;max-height:90vh;border-radius:8px;">\`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function exportResultsCSV() {
  const results = getResults();
  const filter  = document.getElementById('results-exam-filter').value;
  const rows    = [['Email', 'Exam Topic', 'Score', 'Total', 'Percentage', 'Pass/Fail', 'Date']];

  Object.entries(results).forEach(([email, attempts]) => {
    attempts.forEach(rec => {
      if (filter !== 'all' && rec.examId !== filter) return;
      rows.push([
        email,
        rec.topic,
        rec.score,
        rec.total,
        \`\${rec.percentage}%\`,
        rec.pass ? 'PASS' : 'FAIL',
        formatDate(rec.date)
      ]);
    });
  });

  const csv     = rows.map(r => r.map(c => \`"\${c}"\`).join(',')).join('\\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = \`results-export-\${Date.now()}.csv\`;
  a.click();
  URL.revokeObjectURL(url);
}

// Resume functionality
window.addEventListener('beforeunload', () => {
  const currentScreenId = document.querySelector('.screen:not(.hidden)').id;
  if (currentScreenId === 'screen-exam' && pendingExamId) {
    saveProgress({
      email        : currentUser.email,
      examId       : pendingExamId,
      originalQueue,
      currentQIndex,
      retryQueue,
      correctScore,
      userAnswers,
      photos,
      isRetryMode,
      captureIndices
    });
  }
});

function checkForResume() {
  const saved = loadProgress();
  if (!saved) return false;
  
  const currentExamId = getExamIdFromURL();
  if (saved.examId !== currentExamId) return false;
  
  // To restore exactly we need to know the current user, but at this stage they haven't logged in.
  // Actually, we can check if they log in. I'll modify handleLoginContinue.
  // We'll return true so we know we have a saved state.
  return true;
}

// Check for resume inside handleLoginContinue
const oldHandleLoginContinue = handleLoginContinue;
handleLoginContinue = function() {
    oldHandleLoginContinue();
    
    // Check resume after login
    if (currentUser && pendingExamId) {
        const saved = loadProgress();
        if (saved && saved.examId === pendingExamId && saved.email === currentUser.email) {
             const resume = confirm(
                \`You have an unfinished exam: "\${getExamById(saved.examId)?.topic}". Resume where you left off?\`
              );
              if (resume) {
                originalQueue   = saved.originalQueue;
                currentQIndex   = saved.currentQIndex;
                retryQueue      = saved.retryQueue;
                correctScore    = saved.correctScore;
                userAnswers     = saved.userAnswers;
                photos          = saved.photos;
                isRetryMode     = saved.isRetryMode;
                captureIndices  = saved.captureIndices;
                activeQueue     = isRetryMode ? retryQueue : originalQueue;
                clearProgress();
                showScreen('screen-exam');
                renderQuestion();
                return;
              } else {
                clearProgress();
              }
        }
    }
}
