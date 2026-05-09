// Constants
const ADMIN_EMAIL    = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin12345';
const PASS_THRESHOLD = 0.60;
const PLATFORM_NAME  = 'ExamProctor';

// SUPABASE CONFIGURATION - FILL THESE IN!
// Get these from your Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = 'https://vnwurvdsqiwxtwpixgds.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZud3VydmRzcWl3eHR3cGl4Z2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzUyODYsImV4cCI6MjA5MzkxMTI4Nn0.P39vzzbOfjpENBpdtEkP-bLE-MyIp2OG-ajlEav4opc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
window.onload = async () => {
  await checkForResume();
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

async function handleLoginContinue() {
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

  // Check resume after login
  if (pendingExamId) {
      const saved = loadProgress();
      if (saved && saved.examId === pendingExamId && saved.email === currentUser.email) {
           const exam = await getExamById(saved.examId);
           const resume = confirm('You have an unfinished exam: "' + (exam?.topic || 'Unknown') + '". Resume where you left off?');
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

  const examId = getExamIdFromURL();
  if (examId) {
    pendingExamId = examId;
    const exam = await getExamById(examId);
    if (!exam) {
        alert('Exam not found. The link may be invalid or expired.');
        return;
    }
    showScreen('screen-camera');
  } else {
    showScreen('screen-user-history');
    await renderUserHistory();
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

// Data Storage Schema (Supabase)
async function getExams() {
  const { data, error } = await supabaseClient.from('exams').select('*');
  if (error) { console.error('Error fetching exams', error); return {}; }
  const exams = {};
  data.forEach(e => { exams[e.id] = e; });
  return exams;
}

async function getExamById(id) {
  const { data, error } = await supabaseClient.from('exams').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}

async function saveExam(exam) {
  const { error } = await supabaseClient.from('exams').insert([exam]);
  if (error) {
    alert('Failed to save exam to Supabase: ' + error.message);
    throw error;
  }
}

async function deleteExamFromDB(id) {
  const { error } = await supabaseClient.from('exams').delete().eq('id', id);
  if (error) alert('Failed to delete exam: ' + error.message);
}

async function getResults() {
  const { data, error } = await supabaseClient.from('results').select('*').order('date', { ascending: false });
  if (error) { console.error('Error fetching results', error); return {}; }
  const results = {};
  data.forEach(r => {
    if (!results[r.email]) results[r.email] = [];
    results[r.email].push(r);
  });
  return results;
}

async function saveUserResult(resultRecord) {
  const { error } = await supabaseClient.from('results').insert([resultRecord]);
  if (error) alert('Failed to save result to Supabase: ' + error.message);
}

async function getUserHistory(email) {
  const { data, error } = await supabaseClient.from('results').select('*').eq('email', email).order('date', { ascending: false });
  if (error) return [];
  return data;
}

// Progress (local storage still used for mid-exam resume)
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
    await renderInstructions();
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
async function renderInstructions() {
  const exam = await getExamById(pendingExamId);
  if (!exam) {
    alert('Exam not found. The link may be invalid or expired.');
    showScreen('screen-login');
    return;
  }
  document.getElementById('instr-topic').textContent = 'Exam: ' + exam.topic;
  document.getElementById('instr-count').textContent = 'Total Questions: ' + exam.questions.length;
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

async function startExam() {
  const exam = await getExamById(pendingExamId);
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
    ? 'Retry ' + (currentQIndex + 1) + ' of ' + retryQueue.length
    : 'Question ' + (currentQIndex + 1) + ' of ' + originalQueue.length;
  document.getElementById('exam-q-counter').textContent = qNum;
  document.getElementById('exam-score-tracker').textContent = 'Score: ' + correctScore + ' / ' + originalQueue.length;
  document.getElementById('exam-retry-banner').classList.toggle('hidden', !isRetryMode);
  document.getElementById('exam-question-text').textContent = q.question;

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById('opt-' + i);
    btn.textContent = ['A','B','C','D'][i] + '. ' + currentShuffled.shuffledOpts[i].text;
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
    document.getElementById('opt-' + i).disabled = true;
  }

  const correctIdx = currentShuffled.newCorrectIndex;
  const isCorrect  = (chosenIdx === correctIdx);
  const q          = activeQueue[currentQIndex];

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById('opt-' + i);
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

async function handleNext() {
  currentQIndex++;

  if (!isRetryMode) {
    if (currentQIndex >= originalQueue.length) {
      if (retryQueue.length === 0) {
        await finishExam();
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
      await finishExam();
    } else {
      if (currentQIndex >= retryQueue.length) currentQIndex = 0;
      renderQuestion();
    }
  }
}

function showRetryTransition() {
  const banner = document.getElementById('exam-retry-banner');
  banner.textContent = '🔁 You have ' + retryQueue.length + ' question(s) to retry. Answer them correctly to complete. These do NOT affect your score.';
  banner.classList.remove('hidden');
  setTimeout(() => renderQuestion(), 2500);
}

async function finishExam() {
  stopCamera();

  const exam       = await getExamById(pendingExamId);
  const total      = originalQueue.length;
  const percentage = Math.round((correctScore / total) * 100);
  const pass       = (correctScore / total) >= PASS_THRESHOLD;

  const resultRecord = {
    exam_id   : pendingExamId,
    email     : currentUser.email,
    topic     : exam.topic,
    score     : correctScore,
    total,
    percentage,
    pass,
    date      : new Date().toISOString(),
    answers   : userAnswers,
    photos    : [...photos]
  };
  await saveUserResult(resultRecord);

  renderResultScreen(resultRecord, pass, total);
  showScreen('screen-result');
  clearProgress();
}

function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
}

function renderResultScreen(result, pass, total) {
  document.getElementById('result-header').innerHTML = '<div class="result-icon" style="font-size: 48px;">' + (pass ? '🎉' : '😞') + '</div><h2>' + (pass ? 'Congratulations! You Passed!' : 'Exam Complete') + '</h2>';

  document.getElementById('result-stats').innerHTML = '<div class="stat-box"><span class="stat-label">Score</span><span class="stat-value">' + result.score + ' / ' + result.total + '</span></div><div class="stat-box"><span class="stat-label">Percentage</span><span class="stat-value">' + result.percentage + '%</span></div><div class="stat-box"><span class="stat-label">Status</span><span class="stat-value badge ' + (pass ? 'badge-pass' : 'badge-fail') + '">' + (pass ? 'PASS' : 'FAIL') + '</span></div>';

  const tbody = document.getElementById('result-table-body');
  tbody.innerHTML = '';
  result.answers.forEach((ans, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + ans.question + '</td><td>' + ans.chosenText + '</td><td>' + ans.correctText + '</td><td>' + (ans.correct ? '✅' : '❌') + '</td>';
    tbody.appendChild(tr);
  });

  document.getElementById('btn-certificate').classList.toggle('hidden', !pass);
}

// User History
async function renderUserHistory() {
  const history = await getUserHistory(currentUser.email);

  document.getElementById('history-user-email').textContent = currentUser.email;

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (history.length === 0) {
    document.getElementById('history-empty').classList.remove('hidden');
    return;
  }
  document.getElementById('history-empty').classList.add('hidden');

  // We are already ordering by date desc from Supabase, no need to reverse
  history.forEach((rec, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = '<div class="history-info"><strong>' + rec.topic + '</strong><span class="badge ' + (rec.pass ? 'badge-pass' : 'badge-fail') + '">' + (rec.pass ? 'PASS' : 'FAIL') + '</span><br><small>Score: ' + rec.score + '/' + rec.total + ' (' + rec.percentage + '%) — ' + formatDate(rec.date) + '</small></div><button class="btn btn-sm btn-outline" onclick="showHistoryDetail(\'' + rec.id + '\')">View →</button>';
    list.appendChild(row);
  });
}

async function showHistoryDetail(resultId) {
  // Fetch specific result
  const { data: rec, error } = await supabaseClient.from('results').select('*').eq('id', resultId).single();
  if (error || !rec) {
      alert("Error loading result details.");
      return;
  }
  renderResultScreen(rec, rec.pass, rec.total);
  showScreen('screen-result');
}

async function goToHistory() {
    showScreen('screen-user-history');
    await renderUserHistory();
}

// Certificate
let certData = {};

async function generateCertificate() {
  // Fetch latest result for current user
  const history = await getUserHistory(currentUser.email);
  if (!history || history.length === 0) return;
  const rec = history[0];

  certData = {
    userName : currentUser.email,
    examTopic: rec.topic,
    score    : rec.score,
    total    : rec.total,
    date     : formatDate(rec.date)
  };

  document.getElementById('cert-preview').innerHTML = '<h2>🏅 Certificate of Achievement</h2><p>Awarded to: <strong>' + certData.userName + '</strong></p><p>Exam: <strong>' + certData.examTopic + '</strong></p><p>Score: ' + certData.score + ' / ' + certData.total + ' &nbsp;|&nbsp; Date: ' + certData.date + '</p>';
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
    'Score: ' + certData.score + ' / ' + certData.total + '   |   Date: ' + certData.date,
    148.5, 145, { align: 'center' }
  );

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(50, 158, 247, 158);

  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text('Issued by ' + PLATFORM_NAME, 148.5, 168, { align: 'center' });
  doc.text('This certificate is system-generated and does not require a physical signature.', 148.5, 176, { align: 'center' });

  doc.save('certificate.pdf');
}

// Admin Logic
async function renderAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab-' + tab + '-btn').classList.add('active');

    const content = document.getElementById('admin-tab-content');
    content.innerHTML = '';

    if (tab === 'upload') {
        content.innerHTML = '<div class="card"><h3>Upload New Exam</h3><label class="input-label">Exam Topic *</label><input type="text" id="admin-topic" placeholder="e.g. Road Safety" class="input-field" /><label class="input-label">Question Bank (Excel file) *</label><input type="file" id="admin-file" accept=".xlsx,.xls" class="input-field" /><div class="file-hint" style="font-size: 13px; color: #666; margin-bottom: 12px; background: #f9f9f9; padding: 10px; border-radius: 6px;"><strong>Expected columns (row 1 = headers, row 2+ = questions):</strong><br>Col A: Serial | Col B: Question | Col C: Option A (CORRECT) | Col D: Option B | Col E: Option C | Col F: Option D | Col G: Reason A | Col H: Reason B | Col I: Reason C | Col J: Reason D</div><button class="btn btn-primary" onclick="handleExamUpload()">📤 Upload &amp; Generate Link</button><p id="upload-error" class="error-text hidden"></p><div id="upload-result" class="upload-result hidden" style="margin-top: 20px; text-align: center;"><h4 style="color: #2E7D32;">✅ Exam Created!</h4><p style="margin-top: 10px;">Shareable Link:</p><div class="link-box" style="justify-content: center;"><span id="exam-link-text"></span><button class="btn btn-sm btn-outline" onclick="copyExamLink()">Copy</button></div><p>QR Code:</p><div id="exam-qr-code" style="display: flex; justify-content: center; margin-top: 10px;"></div></div></div>';
    } else if (tab === 'exams') {
        content.innerHTML = '<div class="card"><h3>All Exams (Loading...)</h3><div id="exams-list"></div></div>';
        
        const exams = await getExams();
        const results = await getResults();
        
        content.innerHTML = '<div class="card"><h3>All Exams</h3><div id="exams-list"></div></div>';
        const examsListReal = document.getElementById('exams-list');

        let examAttempts = {};
        Object.values(results).forEach(userAttempts => {
            userAttempts.forEach(rec => {
                examAttempts[rec.exam_id] = (examAttempts[rec.exam_id] || 0) + 1;
            });
        });

        if (Object.keys(exams).length === 0) {
            examsListReal.innerHTML = '<p style="color: #666;">No exams found.</p>';
        } else {
            Object.keys(exams).forEach(id => {
                const exam = exams[id];
                const row = document.createElement('div');
                row.className = 'history-row';
                row.innerHTML = '<div class="history-info"><strong>' + exam.topic + '</strong><br><small>' + exam.questions.length + ' questions | ' + (examAttempts[id] || 0) + ' attempts | ' + formatDate(exam.created_at) + '</small></div><div style="display: flex; gap: 8px;"><button class="btn btn-sm btn-outline" onclick="copyExamLinkById(\'' + id + '\')">Copy Link</button><button class="btn btn-sm" style="background: #F44336; color: white;" onclick="deleteExam(\'' + id + '\')">Delete</button></div>';
                examsListReal.appendChild(row);
            });
        }
    } else if (tab === 'results') {
        content.innerHTML = '<div class="card"><h3>User Results (Loading...)</h3></div>';
        const exams = await getExams();
        
        let optionsHtml = '<option value="all">All Exams</option>';
        Object.keys(exams).forEach(id => {
            optionsHtml += '<option value="' + id + '">' + exams[id].topic + '</option>';
        });

        content.innerHTML = '<div class="card" style="max-width: 100%;"><h3>User Results</h3><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;"><div style="flex: 1; min-width: 200px;"><label class="input-label" style="display: inline-block; margin-right: 10px;">Filter by Exam:</label><select id="results-exam-filter" onchange="renderResultsTable()" class="input-field" style="width: auto; display: inline-block;">' + optionsHtml + '</select></div><button class="btn btn-sm btn-outline" onclick="exportResultsCSV()">⬇ Export CSV</button></div><div class="table-wrapper"><table class="result-table" id="admin-results-table"><thead><tr><th>User Email</th><th>Exam Topic</th><th>Score</th><th>%</th><th>Pass/Fail</th><th>Date &amp; Time</th><th>Photos</th></tr></thead><tbody id="admin-results-tbody"></tbody></table></div></div>';
        await renderResultsTable();
    }
}

async function handleExamUpload() {
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
  reader.onload = async function(e) {
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
          showError('upload-error', 'Row ' + (i + 1) + ' has fewer than 10 columns. Check Excel format.');
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
          console.warn('Skipping row ' + (i + 1) + ': missing required fields.');
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
      const examData = {
        id: examId,
        topic,
        created_at: new Date().toISOString(),
        questions
      };
      
      await saveExam(examData);

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
      showError('upload-error', 'Failed to parse/upload: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function generateExamLink(examId) {
  return window.location.origin + window.location.pathname + '?exam=' + examId;
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

async function deleteExam(examId) {
    if (confirm('Are you sure you want to delete this exam?')) {
        await deleteExamFromDB(examId);
        renderAdminTab('exams');
    }
}

async function renderResultsTable() {
    const results = await getResults();
    const filter  = document.getElementById('results-exam-filter').value;
    const tbody = document.getElementById('admin-results-tbody');
    tbody.innerHTML = '';

    Object.entries(results).forEach(([email, attempts]) => {
        attempts.forEach(rec => {
            if (filter !== 'all' && rec.exam_id !== filter) return;
            
            let photosHtml = '';
            (rec.photos || []).forEach(photo => {
                photosHtml += '<img src="' + photo + '" width="60" height="45" style="cursor:pointer;border-radius:4px;margin:2px;" onclick="enlargePhoto(\'' + photo + '\')" />';
            });

            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + email + '</td><td>' + rec.topic + '</td><td>' + rec.score + ' / ' + rec.total + '</td><td>' + rec.percentage + '%</td><td><span class="badge ' + (rec.pass ? 'badge-pass' : 'badge-fail') + '">' + (rec.pass ? 'PASS' : 'FAIL') + '</span></td><td>' + formatDate(rec.date) + '</td><td>' + photosHtml + '</td>';
            tbody.appendChild(tr);
        });
    });
}

function enlargePhoto(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
  overlay.innerHTML = '<img src="' + src + '" style="max-width:90vw;max-height:90vh;border-radius:8px;">';
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

async function exportResultsCSV() {
  const results = await getResults();
  const filter  = document.getElementById('results-exam-filter').value;
  const rows    = [['Email', 'Exam Topic', 'Score', 'Total', 'Percentage', 'Pass/Fail', 'Date']];

  Object.entries(results).forEach(([email, attempts]) => {
    attempts.forEach(rec => {
      if (filter !== 'all' && rec.exam_id !== filter) return;
      rows.push([
        email,
        rec.topic,
        rec.score,
        rec.total,
        rec.percentage + '%',
        rec.pass ? 'PASS' : 'FAIL',
        formatDate(rec.date)
      ]);
    });
  });

  const csv     = rows.map(r => r.map(c => '"' + c + '"').join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = 'results-export-' + Date.now() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

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

async function checkForResume() {
  const saved = loadProgress();
  if (!saved) return false;
  
  const currentExamId = getExamIdFromURL();
  if (saved.examId !== currentExamId) return false;
  
  return true;
}
