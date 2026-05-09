# Proctored MCQ Exam Web App — Complete Build Plan

> **Self-contained specification.** A developer or AI agent with zero prior context can read this document and implement the entire application without asking a single question.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack & CDN Libraries](#2-technology-stack--cdn-libraries)
3. [File Structure](#3-file-structure)
4. [User Roles & Authentication Logic](#4-user-roles--authentication-logic)
5. [URL Scheme](#5-url-scheme)
6. [Screen-by-Screen Specification](#6-screen-by-screen-specification)
   - [Screen 1 — Landing / Login Page](#screen-1--landing--login-page)
   - [Screen 2 — Camera Permission Screen](#screen-2--camera-permission-screen)
   - [Screen 3 — Exam Instructions Screen](#screen-3--exam-instructions-screen)
   - [Screen 4 — Exam Screen (Core Logic)](#screen-4--exam-screen-core-logic)
   - [Screen 5 — Retry Queue Screen](#screen-5--retry-queue-screen)
   - [Screen 6 — Result Screen](#screen-6--result-screen)
   - [Screen 7 — Certificate Screen](#screen-7--certificate-screen)
   - [Screen 8 — Admin Dashboard](#screen-8--admin-dashboard)
   - [Screen 9 — User History Dashboard](#screen-9--user-history-dashboard)
7. [Data Storage Schema (localStorage)](#7-data-storage-schema-localstorage)
8. [Camera Module — Full Implementation](#8-camera-module--full-implementation)
9. [Question Shuffle Logic](#9-question-shuffle-logic)
10. [Answer Feedback UI — CSS Classes](#10-answer-feedback-ui--css-classes)
11. [Certificate Generation — jsPDF](#11-certificate-generation--jspdf)
12. [Admin — Excel Upload & Parsing Logic](#12-admin--excel-upload--parsing-logic)
13. [Responsive CSS Rules (Mobile-First)](#13-responsive-css-rules-mobile-first)
14. [Edge Cases to Handle](#14-edge-cases-to-handle)
15. [Security Notes](#15-security-notes)
16. [Excel Format Guide](#16-excel-format-guide)
17. [Development Checklist](#17-development-checklist)
18. [Known Limitations](#18-known-limitations)
19. [Future Upgrade Path](#19-future-upgrade-path)

---

## 1. Project Overview

Build a **fully functional, mobile-responsive, proctored MCQ exam web application** that runs entirely in the browser with no backend server. The app supports:

- An **Admin** who uploads Excel question banks, generates shareable exam links with QR codes, and views all user results with photo proofs.
- **Normal Users** who click a shared exam link, grant camera access, answer MCQ questions, and receive a score with an optional downloadable certificate.
- **Proctoring** via 3 silent camera snapshots taken at random points during the exam, stored as base64 in localStorage and visible to the admin.
- A **retry queue system** where wrong answers are re-queued until answered correctly, but only first-attempt correct answers count toward the score.

**Constraints:**
- No backend. No Firebase. No frameworks. No npm.
- Pure HTML5 + CSS3 + Vanilla JavaScript only.
- CDN libraries for SheetJS, jsPDF, jsPDF-AutoTable, QRCode.js.
- All data persisted in `localStorage`.
- Deployable to Vercel or any static host by dropping the files in.

---

## 2. Technology Stack & CDN Libraries

Include all `<script>` tags in `index.html` **before** the closing `</body>` tag, in this exact order:

```html
<!-- SheetJS: Excel parsing -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

<!-- jsPDF: PDF/Certificate generation -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

<!-- jsPDF AutoTable plugin: PDF tables in result export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js"></script>

<!-- QRCode.js: QR code generation for exam links -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<!-- App entry point (must be last) -->
<script src="app.js"></script>
```

---

## 3. File Structure

```
/project-root
│
├── index.html       ← All HTML structure; all screen divs; CDN script tags
├── style.css        ← All CSS; mobile-first; no external dependencies
├── app.js           ← All JavaScript logic; modular functions; no classes required
├── plan.md          ← This file (specification)
└── README.md        ← Deployment instructions (see bottom of this file)
```

### README.md content (minimal)

```markdown
# Proctored MCQ Exam App

## Deploy to Vercel
1. Push /project-root to a GitHub repo.
2. Import repo on vercel.com.
3. Framework preset: Other. Output directory: / (root). Build command: none.
4. Deploy. Done.

## Deploy to any static host
Upload index.html, style.css, app.js to the host's public folder.
No build step required.

## Admin Login
Email: admin@gmail.com
Password: admin12345

## Normal User Login
Enter any non-admin email. No password required.
```

---

## 4. User Roles & Authentication Logic

### Constants (top of `app.js`)

```javascript
const ADMIN_EMAIL    = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin12345';
const PASS_THRESHOLD = 0.60; // 60% to pass — change here if needed
const PLATFORM_NAME  = 'ExamProctor';
```

### Role Decision Flow

```
User enters email on Screen 1
│
├── email === ADMIN_EMAIL
│     └── Show password input
│           ├── password === ADMIN_PASSWORD → Load Admin Dashboard (Screen 8)
│           └── password !== ADMIN_PASSWORD → Show "Invalid password" error inline
│
└── email !== ADMIN_EMAIL (Normal User)
      ├── ?exam=UUID in URL → Camera Permission Screen (Screen 2)
      └── no ?exam param    → User History Dashboard (Screen 9)
```

### Normal User Account Creation

- No password. Email is the unique key.
- On first login: `localStorage.getItem('results')` parsed as object; if `results[email]` is undefined → create `results[email] = []`.
- On returning login: `results[email]` exists → show history.
- Store current session in a JS variable `let currentUser = { email }` (not persisted between tabs; user must log in again on new tab).

### Admin Auth

- Admin credentials are **hardcoded JS constants** (see above). No localStorage for admin auth needed.
- Admin session stored in JS variable: `let isAdmin = false` set to `true` on successful login.

---

## 5. URL Scheme

| URL | Behaviour |
|-----|-----------|
| `https://yoursite.com/` | Landing page. User enters email → history or admin dashboard. |
| `https://yoursite.com/?exam=UUID` | Landing page. After email → camera → exam for that UUID. |

**How to read the exam param in JS:**

```javascript
function getExamIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('exam'); // returns UUID string or null
}
```

**Shareable link generation (Admin Tab 1):**

```javascript
function generateExamLink(examId) {
  return `${window.location.origin}${window.location.pathname}?exam=${examId}`;
}
```

---

## 6. Screen-by-Screen Specification

All screens are `<div>` elements inside `index.html`. Only one is visible at a time. Switching is done by:

```javascript
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
```

All screens must have class `screen` and `id` as specified below.

---

### Screen 1 — Landing / Login Page

**ID:** `screen-login`  
**Shown on:** App load (always first screen).

#### HTML Structure

```html
<div id="screen-login" class="screen">
  <div class="container">
    <div class="card center-card">
      <h1 class="logo-title">📋 ExamProctor</h1>
      <p class="subtitle">Enter your email to continue</p>

      <input type="email" id="input-email" placeholder="your@email.com" class="input-field" />
      <p id="email-error" class="error-text hidden"></p>

      <!-- Admin password field: hidden by default -->
      <div id="admin-pass-block" class="hidden">
        <input type="password" id="input-admin-pass" placeholder="Admin Password" class="input-field" />
        <p id="pass-error" class="error-text hidden"></p>
      </div>

      <button id="btn-continue" class="btn btn-primary" onclick="handleLoginContinue()">
        Continue →
      </button>
    </div>
  </div>
</div>
```

#### JavaScript Logic

```javascript
function handleLoginContinue() {
  const email = document.getElementById('input-email').value.trim().toLowerCase();

  if (!isValidEmail(email)) {
    showError('email-error', 'Please enter a valid email address.');
    return;
  }
  hideError('email-error');

  if (email === ADMIN_EMAIL) {
    // Show password field if not already visible
    document.getElementById('admin-pass-block').classList.remove('hidden');
    document.getElementById('input-admin-pass').focus();
    // Change button handler to admin verify
    document.getElementById('btn-continue').setAttribute('onclick', 'handleAdminLogin()');
    return;
  }

  // Normal user flow
  currentUser = { email };
  initUserInStorage(email);

  const examId = getExamIdFromURL();
  if (examId) {
    pendingExamId = examId; // store globally for later screens
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function initUserInStorage(email) {
  const results = getResults();
  if (!results[email]) {
    results[email] = [];
    saveResults(results);
  }
}
```

#### Styling Notes

- Card: `max-width: 420px`, centered both horizontally and vertically with flexbox on `body`.
- On mobile (`< 480px`): card takes `95vw`, padding `16px`.
- Input fields: `width: 100%`, `padding: 12px`, `border-radius: 8px`, `border: 1px solid #ccc`.
- Primary button: `background: #0066CC`, `color: white`, `width: 100%`, `padding: 14px`, `border-radius: 8px`.
- Error text: `color: #D32F2F`, `font-size: 13px`.

---

### Screen 2 — Camera Permission Screen

**ID:** `screen-camera`  
**Shown after:** Normal user email entry when `?exam=UUID` is in URL.

#### HTML Structure

```html
<div id="screen-camera" class="screen hidden">
  <div class="container">
    <div class="card center-card">
      <div class="icon-large">📷</div>
      <h2>Camera Access Required</h2>
      <p class="info-text">
        This exam requires camera access for proctoring.<br><br>
        <strong>3 random photos</strong> will be captured silently during the exam
        and submitted with your result for review.<br><br>
        Your camera will stop after the exam ends.
      </p>
      <button class="btn btn-primary" onclick="handleCameraPermission()">
        Allow Camera &amp; Start Exam
      </button>
      <p id="camera-error" class="error-text hidden"></p>
    </div>
  </div>

  <!-- Hidden video element for camera stream -->
  <video id="proctor-video" autoplay playsinline muted
         style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
  </video>
</div>
```

#### JavaScript Logic

```javascript
async function handleCameraPermission() {
  const granted = await requestCamera();
  if (granted) {
    showScreen('screen-instructions');
    renderInstructions();
  } else {
    // Camera denied — dead-end
    document.getElementById('camera-error').textContent =
      'Camera permission is required to take this exam. Please refresh and allow camera access, or contact your administrator.';
    document.getElementById('camera-error').classList.remove('hidden');
    // Disable the button so they cannot bypass
    document.querySelector('#screen-camera .btn-primary').disabled = true;
    // Attempt to close the tab (browsers may block this)
    setTimeout(() => { try { window.close(); } catch(e) {} }, 3000);
  }
}
```

**Rules:**
- The exam MUST NOT proceed if camera is denied. The button becomes disabled.
- `window.close()` is attempted after 3 seconds (browsers only allow this if the tab was opened by script; otherwise it fails silently — which is acceptable).
- No "Skip" or alternative path exists.

---

### Screen 3 — Exam Instructions Screen

**ID:** `screen-instructions`  
**Shown after:** Camera granted.

#### HTML Structure

```html
<div id="screen-instructions" class="screen hidden">
  <div class="container">
    <div class="card">
      <h2 id="instr-topic">Exam: Road Safety</h2>
      <p id="instr-count" class="question-count">Total Questions: 20</p>

      <div class="rules-box">
        <h3>📋 Rules &amp; Instructions</h3>
        <ol class="rules-list">
          <li>Answer all MCQ questions to complete the exam.</li>
          <li>If you answer a question incorrectly, it will be <strong>re-queued</strong> at the end.</li>
          <li>You must answer re-queued questions correctly to finish — but they do <strong>NOT</strong> affect your score.</li>
          <li>Only your <strong>first-attempt correct answers</strong> count toward your final score.</li>
          <li>3 random photos will be captured silently during the exam for proctoring.</li>
          <li>Do <strong>NOT</strong> close or refresh this tab during the exam.</li>
          <li>Ensure your face is visible in the camera throughout the exam.</li>
        </ol>
      </div>

      <button class="btn btn-primary btn-large" onclick="startExam()">
        🚀 Start Exam
      </button>
    </div>
  </div>
</div>
```

#### JavaScript Logic

```javascript
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
```

---

### Screen 4 — Exam Screen (Core Logic)

**ID:** `screen-exam`  
**Shown after:** "Start Exam" button on Screen 3.

#### HTML Structure

```html
<div id="screen-exam" class="screen hidden">
  <div class="exam-topbar">
    <span id="exam-q-counter">Question 1 of 20</span>
    <span id="exam-score-tracker">Score: 0 / 20</span>
  </div>

  <div class="container">
    <div class="card">
      <p id="exam-retry-banner" class="retry-banner hidden">
        🔁 Retry Mode — These questions do NOT affect your score.
      </p>
      <h3 id="exam-question-text" class="question-text">Question text here</h3>

      <div id="exam-options" class="options-grid">
        <button class="option-btn" id="opt-0" onclick="handleAnswer(0)"></button>
        <button class="option-btn" id="opt-1" onclick="handleAnswer(1)"></button>
        <button class="option-btn" id="opt-2" onclick="handleAnswer(2)"></button>
        <button class="option-btn" id="opt-3" onclick="handleAnswer(3)"></button>
      </div>

      <div id="exam-reason-box" class="reason-box hidden">
        <strong>💡 Explanation:</strong>
        <p id="exam-reason-text"></p>
      </div>

      <button id="btn-next" class="btn btn-primary hidden" onclick="handleNext()">
        Next →
      </button>
    </div>
  </div>
</div>
```

#### Global State Variables

```javascript
// Exam runtime state — reset on every new exam
let originalQueue   = [];   // shuffled question objects (immutable after start)
let retryQueue      = [];   // questions answered wrong
let currentQIndex   = 0;    // pointer into active queue
let isRetryMode     = false; // true when working through retryQueue
let correctScore    = 0;    // count of first-attempt correct answers
let userAnswers     = [];   // [{questionIndex, chosenIndex, correct, shuffledOpts}] for result screen
let captureIndices  = [];   // 3 random indices in originalQueue at which to capture photo
let photos          = [];   // base64 strings (max 3)
let currentShuffled = null; // {shuffledOpts, newCorrectIndex} for active question
let activeQueue     = [];   // reference to whichever queue is active (original or retry)
```

#### `startExam()` Function

```javascript
function startExam() {
  const exam = getExamById(pendingExamId);

  // Deep clone and shuffle question order
  originalQueue = shuffleArray(exam.questions.map((q, i) => ({ ...q, originalIndex: i })));
  retryQueue    = [];
  currentQIndex = 0;
  isRetryMode   = false;
  correctScore  = 0;
  userAnswers   = [];
  photos        = [];
  activeQueue   = originalQueue;

  // Pick 3 random indices in originalQueue for photo capture
  captureIndices = pickRandomIndices(originalQueue.length, 3);

  showScreen('screen-exam');
  renderQuestion();
}
```

#### `renderQuestion()` Function

```javascript
function renderQuestion() {
  const q = activeQueue[currentQIndex];

  // Shuffle options for display
  currentShuffled = shuffleOptions(q);

  // Update top bar
  const qNum   = isRetryMode
    ? `Retry ${currentQIndex + 1} of ${retryQueue.length}`
    : `Question ${currentQIndex + 1} of ${originalQueue.length}`;
  document.getElementById('exam-q-counter').textContent    = qNum;
  document.getElementById('exam-score-tracker').textContent = `Score: ${correctScore} / ${originalQueue.length}`;

  // Retry banner
  document.getElementById('exam-retry-banner').classList.toggle('hidden', !isRetryMode);

  // Question text
  document.getElementById('exam-question-text').textContent = q.question;

  // Render options
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    btn.textContent = `${['A','B','C','D'][i]}. ${currentShuffled.shuffledOpts[i].text}`;
    btn.className   = 'option-btn'; // reset classes
    btn.disabled    = false;
    btn.onclick     = () => handleAnswer(i);
  }

  // Hide reason and next button
  document.getElementById('exam-reason-box').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');

  // Camera capture at designated indices (only in original queue)
  if (!isRetryMode && captureIndices.includes(currentQIndex)) {
    capturePhoto();
  }
}
```

#### `handleAnswer(chosenIdx)` Function

```javascript
function handleAnswer(chosenIdx) {
  // Disable all buttons immediately (prevent double tap)
  for (let i = 0; i < 4; i++) {
    document.getElementById(`opt-${i}`).disabled = true;
  }

  const correctIdx = currentShuffled.newCorrectIndex;
  const isCorrect  = (chosenIdx === correctIdx);
  const q          = activeQueue[currentQIndex];

  // Apply CSS classes to all 4 buttons
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    if (i === correctIdx) {
      btn.classList.add('correct');
    } else if (i === chosenIdx && !isCorrect) {
      btn.classList.add('chosen-wrong');
    } else {
      btn.classList.add('wrong');
    }
  }

  // Show reason for the chosen option
  const reasonText = currentShuffled.shuffledOpts[chosenIdx].reason;
  document.getElementById('exam-reason-text').textContent = reasonText || 'No explanation available.';
  document.getElementById('exam-reason-box').classList.remove('hidden');

  // Score & retry logic
  if (!isRetryMode) {
    // Record user answer for result screen
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
      retryQueue.push(q); // add to retry queue
    }
  } else {
    // Retry mode: correct = remove from retry, wrong = re-add at end
    if (isCorrect) {
      retryQueue.splice(currentQIndex, 1);
      currentQIndex--; // compensate for splice (handleNext will increment)
    } else {
      const wrongQ = retryQueue.splice(currentQIndex, 1)[0];
      retryQueue.push(wrongQ); // move to end
      currentQIndex--; // compensate
    }
  }

  // Show Next button
  document.getElementById('btn-next').classList.remove('hidden');
}
```

#### `handleNext()` Function

```javascript
function handleNext() {
  currentQIndex++;

  if (!isRetryMode) {
    if (currentQIndex >= originalQueue.length) {
      // Original queue finished
      if (retryQueue.length === 0) {
        finishExam();
      } else {
        // Switch to retry mode
        isRetryMode   = true;
        activeQueue   = retryQueue;
        currentQIndex = 0;
        showRetryTransition();
      }
    } else {
      renderQuestion();
    }
  } else {
    // Retry mode
    if (retryQueue.length === 0) {
      finishExam();
    } else {
      // Stay in retry mode — currentQIndex was adjusted in handleAnswer
      if (currentQIndex >= retryQueue.length) currentQIndex = 0;
      renderQuestion();
    }
  }
}
```

#### `showRetryTransition()` Function

```javascript
function showRetryTransition() {
  // Brief overlay message before retry starts
  const banner = document.getElementById('exam-retry-banner');
  banner.textContent = `🔁 You have ${retryQueue.length} question(s) to retry. Answer them correctly to complete. These do NOT affect your score.`;
  banner.classList.remove('hidden');
  // After 2.5 seconds, render first retry question
  setTimeout(() => renderQuestion(), 2500);
}
```

---

### Screen 5 — Retry Queue Screen

There is **no separate HTML screen** for retry. The retry phase uses **Screen 4** (`screen-exam`) with:
- `isRetryMode = true`
- The retry banner visible at the top of the exam card
- `exam-retry-banner` visible with retry count

When `retryQueue` is fully cleared, `finishExam()` is called.

---

### Screen 6 — Result Screen

**ID:** `screen-result`  
**Shown after:** All questions (original + retry) answered.

#### HTML Structure

```html
<div id="screen-result" class="screen hidden">
  <div class="container">
    <div class="card">
      <div id="result-header" class="result-header">
        <!-- dynamically filled -->
      </div>

      <div id="result-stats" class="result-stats">
        <!-- Score, percentage, pass/fail badge -->
      </div>

      <h3 class="section-title">Answer Summary</h3>
      <div class="table-wrapper">
        <table id="result-table" class="result-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Your Answer</th>
              <th>Correct Answer</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody id="result-table-body"></tbody>
        </table>
      </div>

      <div class="result-actions">
        <button id="btn-certificate" class="btn btn-success hidden" onclick="showScreen('screen-certificate'); generateCertificate()">
          🏅 Download Certificate
        </button>
        <button class="btn btn-secondary" onclick="goToHistory()">
          📂 View History
        </button>
      </div>
    </div>
  </div>
</div>
```

#### `finishExam()` Function

```javascript
function finishExam() {
  stopCamera();

  const exam       = getExamById(pendingExamId);
  const total      = originalQueue.length;
  const percentage = Math.round((correctScore / total) * 100);
  const pass       = (correctScore / total) >= PASS_THRESHOLD;

  // Save result to localStorage
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

  // Render result screen
  renderResultScreen(resultRecord, pass, total);
  showScreen('screen-result');
}

function renderResultScreen(result, pass, total) {
  // Header
  document.getElementById('result-header').innerHTML = `
    <div class="result-icon">${pass ? '🎉' : '😞'}</div>
    <h2>${pass ? 'Congratulations! You Passed!' : 'Exam Complete'}</h2>
  `;

  // Stats
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

  // Table body
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

  // Show certificate button only if pass
  document.getElementById('btn-certificate').classList.toggle('hidden', !pass);
}
```

---

### Screen 7 — Certificate Screen

**ID:** `screen-certificate`  
**Shown after:** "Download Certificate" button on Screen 6.

#### HTML Structure

```html
<div id="screen-certificate" class="screen hidden">
  <div class="container">
    <div class="card center-card">
      <div class="cert-preview" id="cert-preview">
        <!-- Static preview text; actual PDF generated by jsPDF -->
        <h2>🏅 Certificate Ready</h2>
        <p>Your certificate has been prepared. Click below to download the PDF.</p>
      </div>
      <button class="btn btn-success" onclick="downloadCertificate()">
        ⬇ Download Certificate PDF
      </button>
      <button class="btn btn-secondary" onclick="goToHistory()">
        ← Back to Dashboard
      </button>
    </div>
  </div>
</div>
```

The actual certificate is generated and downloaded via jsPDF when the user clicks "Download Certificate PDF". See [Section 11](#11-certificate-generation--jspdf) for the full implementation.

---

### Screen 8 — Admin Dashboard

**ID:** `screen-admin`  
**Shown after:** Admin login.

#### HTML Structure

```html
<div id="screen-admin" class="screen hidden">
  <div class="admin-header">
    <h2>🛠 Admin Dashboard</h2>
    <button class="btn btn-sm btn-outline" onclick="adminLogout()">Logout</button>
  </div>

  <!-- Tab Buttons -->
  <div class="tab-bar">
    <button class="tab-btn active" id="tab-upload-btn" onclick="renderAdminTab('upload')">📤 Upload Exam</button>
    <button class="tab-btn" id="tab-exams-btn"  onclick="renderAdminTab('exams')">📋 All Exams</button>
    <button class="tab-btn" id="tab-results-btn" onclick="renderAdminTab('results')">📊 User Results</button>
  </div>

  <!-- Tab Content Panels -->
  <div class="container">
    <div id="admin-tab-content">
      <!-- Dynamically rendered per tab -->
    </div>
  </div>
</div>
```

#### Tab 1 — Upload Exam

Rendered inside `admin-tab-content` when `renderAdminTab('upload')` is called:

```html
<div class="card">
  <h3>Upload New Exam</h3>

  <label class="input-label">Exam Topic *</label>
  <input type="text" id="admin-topic" placeholder="e.g. Road Safety" class="input-field" />

  <label class="input-label">Question Bank (Excel file) *</label>
  <input type="file" id="admin-file" accept=".xlsx,.xls" class="input-field" />

  <div class="file-hint">
    <strong>Expected columns (row 1 = headers, row 2+ = questions):</strong><br>
    Col A: Serial | Col B: Question | Col C: Option A (CORRECT) |
    Col D: Option B | Col E: Option C | Col F: Option D |
    Col G: Reason A | Col H: Reason B | Col I: Reason C | Col J: Reason D
  </div>

  <button class="btn btn-primary" onclick="handleExamUpload()">
    📤 Upload &amp; Generate Link
  </button>

  <p id="upload-error" class="error-text hidden"></p>

  <div id="upload-result" class="upload-result hidden">
    <h4>✅ Exam Created!</h4>
    <p>Shareable Link:</p>
    <div class="link-box">
      <span id="exam-link-text"></span>
      <button class="btn btn-sm btn-outline" onclick="copyExamLink()">Copy</button>
    </div>
    <p>QR Code:</p>
    <div id="exam-qr-code"></div>
  </div>
</div>
```

#### Tab 2 — All Exams

```html
<!-- Rendered dynamically -->
<div class="card">
  <h3>All Exams</h3>
  <div id="exams-list">
    <!-- One row per exam:
         Topic | Created | Questions | Attempts | [Copy Link] [Delete]
    -->
  </div>
</div>
```

#### Tab 3 — User Results

```html
<!-- Rendered dynamically -->
<div class="card">
  <h3>User Results</h3>

  <label class="input-label">Filter by Exam:</label>
  <select id="results-exam-filter" onchange="renderResultsTable()" class="input-field">
    <option value="all">All Exams</option>
    <!-- options populated dynamically -->
  </select>

  <button class="btn btn-sm btn-outline" onclick="exportResultsCSV()">⬇ Export CSV</button>

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
```

**Photo thumbnails** in the results table:
```javascript
// For each photo in result.photos:
`<img src="${photo}" width="60" height="45" style="cursor:pointer;border-radius:4px;margin:2px;"
      onclick="enlargePhoto('${photo}')" />`

function enlargePhoto(src) {
  // Create a full-screen overlay with the photo
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;`;
  overlay.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px;">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}
```

---

### Screen 9 — User History Dashboard

**ID:** `screen-user-history`  
**Shown after:** Normal user login with no `?exam=` param.

#### HTML Structure

```html
<div id="screen-user-history" class="screen hidden">
  <div class="container">
    <div class="card">
      <div class="history-header">
        <h2>📂 My Exam History</h2>
        <p id="history-user-email" class="subtitle"></p>
        <button class="btn btn-sm btn-outline" onclick="showScreen('screen-login')">Logout</button>
      </div>

      <div id="history-list">
        <!-- Dynamically populated -->
      </div>

      <p id="history-empty" class="empty-state hidden">
        No exams taken yet. Ask your administrator for an exam link.
      </p>
    </div>
  </div>
</div>
```

#### `renderUserHistory()` Function

```javascript
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
```

---

## 7. Data Storage Schema (localStorage)

All read/write must go through helper functions to avoid scattered direct `localStorage` calls.

### Helper Functions

```javascript
// ── Exams ──────────────────────────────────────────────────────────────────
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

// ── Results ────────────────────────────────────────────────────────────────
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

// ── Progress (resume mid-exam) ──────────────────────────────────────────────
function saveProgress(data) {
  localStorage.setItem('examProgress', JSON.stringify(data));
}
function loadProgress() {
  return JSON.parse(localStorage.getItem('examProgress') || 'null');
}
function clearProgress() {
  localStorage.removeItem('examProgress');
}
```

### Schema Reference

```json
// localStorage key: "exams"
{
  "550e8400-e29b-41d4-a716-446655440000": {
    "topic": "Road Safety",
    "createdAt": "2026-05-09T15:00:00.000Z",
    "questions": [
      {
        "serial": 1,
        "question": "What does a red traffic light signal mean?",
        "options": ["Stop completely", "Proceed with caution", "Slow down", "Honk and go"],
        "correctIndex": 0,
        "reasons": [
          "A red light legally requires all vehicles to stop.",
          "Proceeding on red is illegal and dangerous.",
          "Slowing is for yellow/amber lights, not red.",
          "Honking does not override traffic signals."
        ]
      }
    ]
  }
}
```

```json
// localStorage key: "results"
{
  "user@example.com": [
    {
      "examId": "550e8400-e29b-41d4-a716-446655440000",
      "topic": "Road Safety",
      "score": 8,
      "total": 10,
      "percentage": 80,
      "pass": true,
      "date": "2026-05-09T16:00:00.000Z",
      "answers": [
        {
          "originalIndex": 3,
          "question": "What does a red traffic light signal mean?",
          "chosenText": "Stop completely",
          "correctText": "Stop completely",
          "correct": true
        }
      ],
      "photos": [
        "data:image/jpeg;base64,/9j/4AAQSkZJRgAB...",
        "data:image/jpeg;base64,/9j/4AAQSkZJRgAB...",
        "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."
      ]
    }
  ]
}
```

---

## 8. Camera Module — Full Implementation

```javascript
// ── Global camera state ────────────────────────────────────────────────────
let stream  = null;
let photos  = [];
const videoEl = () => document.getElementById('proctor-video');

/**
 * Request camera permission and start stream.
 * Returns true if granted, false if denied or unavailable.
 */
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

/**
 * Silently capture one photo from the live video stream.
 * Stored as compressed JPEG base64 in photos[].
 */
function capturePhoto() {
  if (!stream || photos.length >= 3) return;
  const canvas = document.createElement('canvas');
  canvas.width  = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl(), 0, 0, 320, 240);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // 50% quality ≈ ~15–25 KB
  photos.push(dataUrl);
}

/**
 * Stop all camera tracks. Call when exam ends.
 */
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  const v = videoEl();
  if (v) { v.srcObject = null; }
}

/**
 * Pick `count` unique random indices from range [0, max).
 */
function pickRandomIndices(max, count) {
  const indices = [];
  while (indices.length < Math.min(count, max)) {
    const r = Math.floor(Math.random() * max);
    if (!indices.includes(r)) indices.push(r);
  }
  return indices;
}
```

**Notes:**
- The `<video>` element is hidden using `position:absolute; width:1px; height:1px; opacity:0; pointer-events:none;` — NOT `display:none`, because a hidden video element with `display:none` may not play the stream on some browsers.
- Each photo is ~15–25 KB at 320×240 and 50% JPEG quality.
- 3 photos = ~45–75 KB per exam attempt.

---

## 9. Question Shuffle Logic

```javascript
/**
 * Fisher-Yates shuffle — returns a new shuffled array without mutating input.
 */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffles the 4 display options for a question.
 * The correct answer (always index 0 from Excel = col C) is tracked after shuffle.
 *
 * @param {object} question - question object from localStorage
 * @returns {{ shuffledOpts: Array, newCorrectIndex: number }}
 */
function shuffleOptions(question) {
  // Build option objects with metadata
  let opts = question.options.map((text, i) => ({
    text,
    reason   : question.reasons[i],
    isCorrect: i === question.correctIndex   // correctIndex is always 0 from Excel
  }));

  // Fisher-Yates in-place shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }

  // Find where the correct answer ended up
  const newCorrectIndex = opts.findIndex(o => o.isCorrect);

  return { shuffledOpts: opts, newCorrectIndex };
}
```

**Important:** Question **order** is shuffled once at `startExam()` using `shuffleArray(exam.questions)`. Option **order within each question** is shuffled at `renderQuestion()` using `shuffleOptions(q)`. This means every time a retry question is shown, its options will be in a new random order — making it harder to guess by position.

---

## 10. Answer Feedback UI — CSS Classes

```css
/* Default state */
.option-btn {
  background   : #f5f5f5;
  border       : 2px solid #d0d0d0;
  color        : #333;
  width        : 100%;
  padding      : 14px 16px;
  margin       : 8px 0;
  font-size    : 16px;
  border-radius: 8px;
  cursor       : pointer;
  text-align   : left;
  transition   : background 0.15s, border-color 0.15s;
}
.option-btn:hover:not(:disabled) {
  background  : #e8f0fe;
  border-color: #0066CC;
}
.option-btn:disabled {
  cursor: not-allowed;
}

/* Correct answer — always shown green regardless of what user chose */
.option-btn.correct {
  background  : #4CAF50;
  color       : #fff;
  border-color: #388E3C;
  font-weight : bold;
}

/* The option the user chose, but it was wrong */
.option-btn.chosen-wrong {
  background  : #FFC107;
  color       : #333;
  border-color: #FFA000;
  font-weight : bold;
}

/* All other wrong options that were not chosen */
.option-btn.wrong {
  background  : #F44336;
  color       : #fff;
  border-color: #C62828;
}
```

**Application logic** (called inside `handleAnswer` after disabling all buttons):

```javascript
// i = button index 0..3
// correctIdx = newCorrectIndex from shuffledOpts
// chosenIdx  = what the user tapped

for (let i = 0; i < 4; i++) {
  const btn = document.getElementById(`opt-${i}`);
  btn.classList.remove('correct', 'chosen-wrong', 'wrong'); // reset first
  if (i === correctIdx) {
    btn.classList.add('correct');
  } else if (i === chosenIdx) {
    btn.classList.add('chosen-wrong'); // chosen but wrong
  } else {
    btn.classList.add('wrong');        // not chosen and wrong
  }
}
```

---

## 11. Certificate Generation — jsPDF

```javascript
/**
 * Store certificate data globally so downloadCertificate() can access it
 * without arguments (called from a button onclick).
 */
let certData = {};

function generateCertificate() {
  // Called from result screen's certificate button
  const results = getResults();
  const history = results[currentUser.email];
  const rec     = history[history.length - 1]; // most recent result

  certData = {
    userName : currentUser.email,
    examTopic: rec.topic,
    score    : rec.score,
    total    : rec.total,
    date     : formatDate(rec.date)
  };

  // Update static preview on Screen 7
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
  // A4 landscape = 297mm × 210mm

  // ── Outer border ─────────────────────────────────────────────────────────
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(4);
  doc.rect(8, 8, 281, 194);

  // ── Inner border ─────────────────────────────────────────────────────────
  doc.setLineWidth(1.5);
  doc.rect(13, 13, 271, 184);

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFontSize(36);
  doc.setTextColor(0, 102, 204);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate of Achievement', 148.5, 50, { align: 'center' });

  // ── Subtitle ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('This is to certify that', 148.5, 70, { align: 'center' });

  // ── User name / email ─────────────────────────────────────────────────────
  doc.setFontSize(26);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(certData.userName, 148.5, 90, { align: 'center' });

  // ── Body text ─────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('has successfully completed the online proctored exam on', 148.5, 108, { align: 'center' });

  // ── Exam topic ────────────────────────────────────────────────────────────
  doc.setFontSize(24);
  doc.setTextColor(0, 102, 204);
  doc.setFont('helvetica', 'bold');
  doc.text(certData.examTopic, 148.5, 126, { align: 'center' });

  // ── Score and date ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `Score: ${certData.score} / ${certData.total}   |   Date: ${certData.date}`,
    148.5, 145, { align: 'center' }
  );

  // ── Decorative line ───────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(50, 158, 247, 158);

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(`Issued by ${PLATFORM_NAME}`, 148.5, 168, { align: 'center' });
  doc.text('This certificate is system-generated and does not require a physical signature.', 148.5, 176, { align: 'center' });

  doc.save('certificate.pdf');
}
```

---

## 12. Admin — Excel Upload & Parsing Logic

### `handleExamUpload()` Function

```javascript
function handleExamUpload() {
  const topic    = document.getElementById('admin-topic').value.trim();
  const fileInput = document.getElementById('admin-file');
  const file     = fileInput.files[0];

  // Validation
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

      // Row 0 = headers (skip), Row 1+ = questions
      if (rows.length < 2) {
        showError('upload-error', 'Excel file has no question rows.');
        return;
      }

      const questions = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        // Require at least 10 columns
        if (!row || row.length < 10) {
          showError('upload-error', `Row ${i + 1} has fewer than 10 columns. Check Excel format.`);
          return;
        }

        const serial   = row[0] ?? i;
        const question = String(row[1] ?? '').trim();
        const optA     = String(row[2] ?? '').trim(); // CORRECT answer
        const optB     = String(row[3] ?? '').trim();
        const optC     = String(row[4] ?? '').trim();
        const optD     = String(row[5] ?? '').trim();
        const reasonA  = String(row[6] ?? '').trim();
        const reasonB  = String(row[7] ?? '').trim();
        const reasonC  = String(row[8] ?? '').trim();
        const reasonD  = String(row[9] ?? '').trim();

        if (!question || !optA || !optB || !optC || !optD) {
          console.warn(`Skipping row ${i + 1}: missing required fields.`);
          continue;
        }

        questions.push({
          serial,
          question,
          options     : [optA, optB, optC, optD],
          correctIndex: 0,   // Option A (col index 2) is ALWAYS correct in Excel
          reasons     : [reasonA, reasonB, reasonC, reasonD]
        });
      }

      if (questions.length === 0) {
        showError('upload-error', 'No valid questions found in the Excel file.');
        return;
      }

      // Generate exam ID and save
      const examId  = crypto.randomUUID();
      const exams   = getExams();
      exams[examId] = {
        topic,
        createdAt: new Date().toISOString(),
        questions
      };
      saveExams(exams);

      // Show result
      const link = generateExamLink(examId);
      document.getElementById('exam-link-text').textContent = link;
      document.getElementById('upload-result').classList.remove('hidden');

      // Generate QR code
      document.getElementById('exam-qr-code').innerHTML = ''; // clear previous
      new QRCode(document.getElementById('exam-qr-code'), {
        text  : link,
        width : 160,
        height: 160
      });

      // Reset form
      document.getElementById('admin-topic').value = '';
      fileInput.value = '';

    } catch (err) {
      showError('upload-error', `Failed to parse Excel: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}
```

### Copy Link Function

```javascript
let lastGeneratedLink = '';

function copyExamLink() {
  const link = document.getElementById('exam-link-text').textContent;
  navigator.clipboard.writeText(link)
    .then(() => alert('Link copied to clipboard!'))
    .catch(() => {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Link copied!');
    });
}
```

### Export Results as CSV

```javascript
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
        `${rec.percentage}%`,
        rec.pass ? 'PASS' : 'FAIL',
        formatDate(rec.date)
      ]);
    });
  });

  const csv     = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `results-export-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 13. Responsive CSS Rules (Mobile-First)

```css
/* ── Reset ─────────────────────────────────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin    : 0;
  padding   : 0;
}

/* ── Base ───────────────────────────────────────────────────────────────── */
body {
  font-family   : 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background    : #f0f2f5;
  color         : #1a1a1a;
  min-height    : 100vh;
  line-height   : 1.6;
}

/* ── Utility ────────────────────────────────────────────────────────────── */
.hidden { display: none !important; }

/* ── Container ──────────────────────────────────────────────────────────── */
.container {
  max-width: 680px;
  margin   : 0 auto;
  padding  : 16px;
}

/* ── Card ───────────────────────────────────────────────────────────────── */
.card {
  background   : #ffffff;
  border-radius: 16px;
  padding      : 28px 24px;
  box-shadow   : 0 4px 20px rgba(0,0,0,0.08);
  margin-bottom: 16px;
}
.center-card {
  text-align: center;
}

/* ── Typography ─────────────────────────────────────────────────────────── */
h1 { font-size: 26px; margin-bottom: 8px; }
h2 { font-size: 22px; margin-bottom: 12px; }
h3 { font-size: 18px; margin-bottom: 10px; }
.subtitle { color: #666; font-size: 14px; margin-bottom: 20px; }

/* ── Inputs ─────────────────────────────────────────────────────────────── */
.input-field {
  width        : 100%;
  padding      : 12px 14px;
  border       : 1.5px solid #ccc;
  border-radius: 8px;
  font-size    : 15px;
  margin-bottom: 12px;
  outline      : none;
  transition   : border-color 0.2s;
}
.input-field:focus { border-color: #0066CC; }
.input-label { display: block; font-weight: 600; margin-bottom: 6px; color: #444; }

/* ── Buttons ────────────────────────────────────────────────────────────── */
.btn {
  display       : inline-block;
  padding       : 13px 24px;
  border        : none;
  border-radius : 8px;
  font-size     : 15px;
  font-weight   : 600;
  cursor        : pointer;
  transition    : opacity 0.2s, transform 0.1s;
  text-align    : center;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary   { background: #0066CC; color: #fff; width: 100%; margin-top: 8px; }
.btn-success   { background: #2E7D32; color: #fff; width: 100%; margin-top: 8px; }
.btn-secondary { background: #e0e0e0; color: #333; width: 100%; margin-top: 8px; }
.btn-outline   { background: transparent; border: 1.5px solid #0066CC; color: #0066CC; }
.btn-sm        { padding: 8px 16px; font-size: 13px; width: auto; }
.btn-large     { padding: 16px 24px; font-size: 17px; }

/* ── Option buttons (Exam Screen) ───────────────────────────────────────── */
.option-btn {
  background   : #f5f5f5;
  border       : 2px solid #d0d0d0;
  color        : #333;
  width        : 100%;
  padding      : 14px 16px;
  margin       : 8px 0;
  font-size    : 16px;
  border-radius: 8px;
  cursor       : pointer;
  text-align   : left;
  transition   : background 0.15s;
  min-height   : 52px; /* WCAG touch target */
}
.option-btn:hover:not(:disabled) { background: #e8f0fe; border-color: #0066CC; }
.option-btn:disabled { cursor: not-allowed; }
.option-btn.correct      { background: #4CAF50; color: #fff; border-color: #388E3C; font-weight: 700; }
.option-btn.chosen-wrong { background: #FFC107; color: #333; border-color: #FFA000; font-weight: 700; }
.option-btn.wrong        { background: #F44336; color: #fff; border-color: #C62828; }

/* ── Exam top bar ───────────────────────────────────────────────────────── */
.exam-topbar {
  display        : flex;
  justify-content: space-between;
  align-items    : center;
  background     : #0066CC;
  color          : #fff;
  padding        : 10px 16px;
  font-weight    : 600;
  font-size      : 14px;
  position       : sticky;
  top            : 0;
  z-index        : 100;
}

/* ── Question text ──────────────────────────────────────────────────────── */
.question-text {
  font-size    : 18px;
  font-weight  : 700;
  margin-bottom: 20px;
  line-height  : 1.5;
}

/* ── Reason box ─────────────────────────────────────────────────────────── */
.reason-box {
  background   : #FFF9C4;
  border-left  : 4px solid #F9A825;
  padding      : 12px 16px;
  border-radius: 0 8px 8px 0;
  margin       : 12px 0;
  font-size    : 14px;
  color        : #555;
}

/* ── Retry banner ───────────────────────────────────────────────────────── */
.retry-banner {
  background   : #E3F2FD;
  border-left  : 4px solid #1565C0;
  padding      : 10px 14px;
  border-radius: 0 8px 8px 0;
  margin-bottom: 16px;
  font-size    : 14px;
  color        : #1565C0;
  font-weight  : 600;
}

/* ── Badges ─────────────────────────────────────────────────────────────── */
.badge {
  display      : inline-block;
  padding      : 2px 10px;
  border-radius: 100px;
  font-size    : 12px;
  font-weight  : 700;
}
.badge-pass { background: #C8E6C9; color: #1B5E20; }
.badge-fail { background: #FFCDD2; color: #B71C1C; }

/* ── Result stats ───────────────────────────────────────────────────────── */
.result-stats {
  display        : flex;
  gap            : 12px;
  margin         : 20px 0;
  flex-wrap      : wrap;
  justify-content: center;
}
.stat-box {
  flex         : 1;
  min-width    : 90px;
  background   : #f5f5f5;
  border-radius: 10px;
  padding      : 14px;
  text-align   : center;
}
.stat-label { display: block; font-size: 12px; color: #777; margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 800; color: #222; }

/* ── Tables ─────────────────────────────────────────────────────────────── */
.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.result-table  { width: 100%; border-collapse: collapse; font-size: 14px; }
.result-table th {
  background : #0066CC;
  color      : #fff;
  padding    : 10px 8px;
  text-align : left;
  white-space: nowrap;
}
.result-table td { padding: 9px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
.result-table tr:hover td { background: #f9f9f9; }

/* ── Admin header & tabs ────────────────────────────────────────────────── */
.admin-header {
  display        : flex;
  justify-content: space-between;
  align-items    : center;
  background     : #0066CC;
  color          : #fff;
  padding        : 12px 20px;
}
.tab-bar {
  display         : flex;
  background      : #f0f0f0;
  border-bottom   : 2px solid #ddd;
  overflow-x      : auto;
  -webkit-overflow-scrolling: touch;
}
.tab-btn {
  padding         : 12px 20px;
  border          : none;
  background      : transparent;
  font-size       : 14px;
  font-weight     : 600;
  color           : #555;
  cursor          : pointer;
  white-space     : nowrap;
  border-bottom   : 3px solid transparent;
}
.tab-btn.active {
  color        : #0066CC;
  border-bottom: 3px solid #0066CC;
  background   : #fff;
}

/* ── History rows ───────────────────────────────────────────────────────── */
.history-row {
  display        : flex;
  justify-content: space-between;
  align-items    : center;
  padding        : 14px 0;
  border-bottom  : 1px solid #eee;
  gap            : 12px;
}
.history-info { flex: 1; }

/* ── Link box (Admin upload result) ────────────────────────────────────── */
.link-box {
  display      : flex;
  align-items  : center;
  gap          : 10px;
  background   : #f5f5f5;
  padding      : 10px 14px;
  border-radius: 8px;
  word-break   : break-all;
  font-size    : 13px;
}

/* ── Error text ─────────────────────────────────────────────────────────── */
.error-text { color: #D32F2F; font-size: 13px; margin-top: -8px; margin-bottom: 8px; }

/* ── Responsive overrides ───────────────────────────────────────────────── */
@media (max-width: 480px) {
  .card          { padding: 16px 14px; border-radius: 12px; }
  h1             { font-size: 20px; }
  h2             { font-size: 18px; }
  .question-text { font-size: 15px; }
  .option-btn    { font-size: 14px; padding: 12px 12px; }
  .btn           { font-size: 14px; padding: 12px 18px; }
  .stat-value    { font-size: 18px; }
  .result-stats  { gap: 8px; }
}

/* Full-screen centering for login card */
#screen-login {
  min-height     : 100vh;
  display        : flex;
  align-items    : center;
  justify-content: center;
}
#screen-camera, #screen-instructions {
  min-height     : 100vh;
  display        : flex;
  align-items    : center;
  justify-content: center;
}
```

---

## 14. Edge Cases to Handle

| # | Scenario | Handling |
|---|----------|----------|
| 1 | `?exam=UUID` in URL but UUID not in localStorage | Show error card: "Exam not found or this link has expired. Please contact your administrator." No further action. |
| 2 | Excel row has fewer than 10 columns | `showError('upload-error', 'Row N has fewer than 10 columns. Please fix the Excel file.')` and abort upload. |
| 3 | Camera already in use by another app | `getUserMedia` throws `NotReadableError` — catch and show: "Camera is in use by another application. Close that app and try again." |
| 4 | User closes tab mid-exam | On `beforeunload` event: `saveProgress({email, examId, originalQueue, currentQIndex, retryQueue, correctScore, userAnswers, photos, isRetryMode})`. On next load with same exam param, detect `examProgress` in localStorage and prompt "Resume your previous exam?" with a Resume / Start Fresh button. |
| 5 | localStorage full | Wrapped in try/catch for `QuotaExceededError`. Alert admin to delete old exams via Tab 2. |
| 6 | Score exactly 60% | `(correctScore / total) >= PASS_THRESHOLD` — the `>=` operator ensures 60% is a PASS. |
| 7 | User attempts to download certificate after fail | "Download Certificate" button is conditionally rendered only when `pass === true`. |
| 8 | Admin email entered in exam link flow | After detecting `ADMIN_EMAIL`, show password field. If admin enters `?exam=UUID`, after successful admin login → redirect to Admin Dashboard, NOT the exam. |
| 9 | Exam with 0 questions (empty Excel) | Show error: "No valid questions found in the uploaded file." |
| 10 | `captureIndices` count exceeds question count | `pickRandomIndices(max, count)` has `Math.min(count, max)` to cap at available questions. |

### Mid-Exam Resume Implementation

```javascript
// Save on tab close
window.addEventListener('beforeunload', () => {
  if (examInProgress) {
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

// Check on load
function checkForResume() {
  const saved = loadProgress();
  if (!saved) return false;
  if (saved.examId !== getExamIdFromURL()) return false;
  if (saved.email !== currentUser.email) return false;

  const resume = confirm(
    `You have an unfinished exam: "${getExamById(saved.examId)?.topic}". Resume where you left off?`
  );
  if (resume) {
    // Restore all state
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
    return true;
  } else {
    clearProgress();
    return false;
  }
}
```

---

## 15. Security Notes

| Note | Detail |
|------|--------|
| Admin credentials | Stored as plain JS constants (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Anyone who can view the source JS can see them. Acceptable for internal/intranet use. Do not use for public exams with sensitive content. |
| No encryption | All localStorage data is plaintext. Anyone with browser devtools access can read/modify it. |
| Photo storage | Each base64 JPEG is ~15–25 KB. 3 photos per attempt = ~75 KB. After 100 exam attempts, photos alone occupy ~7.5 MB of the 10 MB localStorage limit. Warn admin to export and delete regularly. |
| HTTPS required | `navigator.mediaDevices.getUserMedia()` only works on HTTPS or `localhost`. Deploy to HTTPS host (Vercel provides this automatically). |
| Score tampering | Since all logic is client-side, a user with devtools can manipulate their score in localStorage. For integrity-critical exams, a backend is necessary. |
| QR code | Generated entirely client-side via QRCode.js — no external service is called. |

---

## 16. Excel Format Guide

The admin uploads a `.xlsx` or `.xls` file. The file must follow this exact column layout:

### Required Column Layout

| Column | Index | Header (Row 1) | Content |
|--------|-------|----------------|---------|
| A | 0 | `Serial` | Question number (1, 2, 3…) — used for ordering only |
| B | 1 | `Question` | The MCQ question text |
| C | 2 | `Option A` | **THE CORRECT ANSWER** (always) |
| D | 3 | `Option B` | Wrong option |
| E | 4 | `Option C` | Wrong option |
| F | 5 | `Option D` | Wrong option |
| G | 6 | `Reason A` | Explanation for why Option A is correct |
| H | 7 | `Reason B` | Explanation for why Option B is wrong |
| I | 8 | `Reason C` | Explanation for why Option C is wrong |
| J | 9 | `Reason D` | Explanation for why Option D is wrong |

### Sample Excel Data (first 3 rows shown)

| Serial | Question | Option A | Option B | Option C | Option D | Reason A | Reason B | Reason C | Reason D |
|--------|----------|----------|----------|----------|----------|----------|----------|----------|----------|
| 1 | What does a red traffic light mean? | Stop completely | Go slowly | Honk and pass | Accelerate | Red legally requires all vehicles to stop at the line. | Proceeding on red is illegal and causes accidents. | Honking does not override traffic signals. | Accelerating through a red light is a serious offence. |
| 2 | What is the speed limit in a school zone? | 25 km/h | 60 km/h | 40 km/h | 80 km/h | School zones have a strict 25 km/h limit to protect children. | 60 km/h is a standard urban speed, not a school zone limit. | 40 km/h applies to residential streets, not school zones. | 80 km/h is a highway speed — never near a school. |
| 3 | When must you wear a seat belt? | Always when the vehicle is moving | Only on highways | Only in the front seat | Only if driving above 60 km/h | Seat belts must be worn at all times in a moving vehicle by all occupants. | Seat belts are required on all roads, not just highways. | All passengers, not just front-seat occupants, must wear seat belts. | Speed does not affect the seat belt rule — it applies always. |

### Notes for Excel Creators

- **Row 1** must always be the header row. It is skipped during parsing.
- **Option A (column C) is ALWAYS the correct answer.** The app shuffles option order randomly when displaying to the user, so students will never know Column C = correct.
- All 10 columns are mandatory. Rows with missing columns will be skipped with a console warning.
- Blank rows between questions will be skipped gracefully.
- Do not merge cells or add images — text only.
- File format: `.xlsx` (Excel 2007+) or `.xls` (older) — both supported via SheetJS.

---

## 17. Development Checklist

### Project Setup
- [ ] Create `/project` folder with `index.html`, `style.css`, `app.js`, `plan.md`, `README.md`
- [ ] Add all 4 CDN `<script>` tags to `index.html` (SheetJS, jsPDF, jsPDF-AutoTable, QRCode.js)
- [ ] Link `style.css` in `<head>` and `app.js` before `</body>`
- [ ] Add all 9 screen `<div>` elements with correct IDs and class `screen`
- [ ] Add hidden `<video id="proctor-video">` element to `index.html`
- [ ] Define all global constants at top of `app.js`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PASS_THRESHOLD`, `PLATFORM_NAME`

### Screen 1 — Login
- [ ] Email input with validation (regex)
- [ ] Admin branch: show password input on admin email
- [ ] Admin password verification → Admin Dashboard
- [ ] Normal user → URL param check → Camera Screen or History
- [ ] Error messages displayed inline (no alerts)

### Screen 2 — Camera
- [ ] `requestCamera()` implemented with `getUserMedia`
- [ ] Denied → error message shown + button disabled + `window.close()` attempted
- [ ] Granted → proceed to Instructions
- [ ] `<video>` element is `position:absolute; width:1px; height:1px; opacity:0` (NOT `display:none`)

### Screen 3 — Instructions
- [ ] Exam topic rendered from localStorage
- [ ] Question count rendered
- [ ] All 7 rules listed
- [ ] "Start Exam" button calls `startExam()`

### Screen 4 — Exam Core
- [ ] `originalQueue` built from shuffled `exam.questions`
- [ ] `captureIndices` = 3 random indices picked before exam starts
- [ ] `renderQuestion()` implemented:
  - [ ] Options shuffled per question display
  - [ ] Top bar updated (question counter + score)
  - [ ] Retry banner shown/hidden
  - [ ] Camera capture triggered at correct indices
- [ ] `handleAnswer(i)` implemented:
  - [ ] All 4 buttons disabled immediately
  - [ ] Correct = green, chosen-wrong = yellow, others = red
  - [ ] Reason box shown with chosen option's reason
  - [ ] Score incremented only on first-attempt correct answers
  - [ ] Wrong answers added to `retryQueue`
  - [ ] "Next" button revealed
- [ ] `handleNext()` implemented:
  - [ ] Transitions to retry mode when original queue done and retry queue non-empty
  - [ ] Calls `finishExam()` when all done

### Screen 5 — Retry Mode
- [ ] Uses Screen 4 UI with `isRetryMode = true`
- [ ] Retry banner visible with count
- [ ] Correct retry = removed from `retryQueue`
- [ ] Wrong retry = moved to end of `retryQueue`
- [ ] No score changes during retry

### Screen 6 — Result
- [ ] Camera stopped via `stopCamera()`
- [ ] Result saved to localStorage via `saveUserResult()`
- [ ] Score, percentage, pass/fail displayed
- [ ] Answer summary table rendered
- [ ] Certificate button shown only if pass

### Screen 7 — Certificate
- [ ] Static preview on screen
- [ ] `downloadCertificate()` generates A4 landscape PDF via jsPDF
- [ ] PDF has double border, title, user name, exam topic, score, date, footer
- [ ] `doc.save('certificate.pdf')` called

### Screen 8 — Admin Dashboard
- [ ] Logout button → returns to login screen, resets state
- [ ] Tab navigation (Upload / All Exams / User Results)

#### Admin Tab 1 — Upload Exam
- [ ] Topic text input validated (required)
- [ ] File input (`.xlsx`, `.xls` only)
- [ ] SheetJS parsing: `XLSX.read` → `sheet_to_json({header:1})`
- [ ] Row validation: ≥10 columns required per row
- [ ] Correct index always `0` (Option A = column C)
- [ ] `crypto.randomUUID()` for exam ID
- [ ] Saved to `localStorage['exams']`
- [ ] Shareable link generated and displayed
- [ ] "Copy Link" button works
- [ ] QR code generated via QRCode.js

#### Admin Tab 2 — All Exams
- [ ] Lists all exams from localStorage
- [ ] Shows: Topic, Created Date, Question Count, Attempt Count
- [ ] "Copy Link" button per exam
- [ ] "Delete" button removes exam from localStorage

#### Admin Tab 3 — User Results
- [ ] Filter dropdown by exam
- [ ] Table: Email, Topic, Score, %, Pass/Fail, Date, Photos
- [ ] Photo thumbnails clickable → full-screen overlay
- [ ] "Export CSV" generates downloadable CSV file

### Screen 9 — User History
- [ ] Lists all past attempts for logged-in user
- [ ] Newest first
- [ ] Each row: Topic, Score, Pass/Fail, Date, "View →" button
- [ ] "View →" loads read-only result detail (Screen 6)
- [ ] Empty state message when no history

### Data & Storage
- [ ] All localStorage access through helper functions (`getExams`, `saveExams`, `getResults`, `saveResults`)
- [ ] `QuotaExceededError` caught in save functions
- [ ] Mid-exam progress saved on `beforeunload`
- [ ] Resume prompt on next visit with same examId

### Responsive Design
- [ ] All cards `max-width: 680px`, centered
- [ ] Option buttons `min-height: 52px` (touch-friendly)
- [ ] `@media (max-width: 480px)` overrides applied
- [ ] Admin tab bar horizontally scrollable on mobile
- [ ] Result table horizontally scrollable on mobile

### Edge Cases
- [ ] Invalid exam ID in URL → error card shown
- [ ] Admin accessing exam link → redirect to admin dashboard only
- [ ] Exactly 60% score → PASS
- [ ] Camera in use by another app → `NotReadableError` caught
- [ ] `pickRandomIndices` handles fewer than 3 questions

---

## 18. Known Limitations

| Limitation | Detail |
|------------|--------|
| **Client-side only** | All data lives in the browser. Clearing browser data = all exams and results lost permanently. |
| **Single-device** | Results and exams do not sync across devices or browsers. A student must take the exam on the same device/browser as the one the admin uses to view results. |
| **Admin credential security** | Password visible in `app.js` source code. Anyone with devtools can see it. Not suitable for external/public deployment as-is. |
| **Score tampering** | Users with devtools can modify localStorage values post-exam. No server-side verification. |
| **Storage cap** | Each photo ≈ 20 KB base64. 3 photos per attempt ≈ 60 KB. LocalStorage limit ≈ 10 MB. After ~160 attempts with photos, storage will fill up. Admin must export and delete old results. |
| **Camera requirement** | Exam cannot be taken without camera. No fallback for students without a webcam. |
| **PDF styling** | jsPDF does not support custom fonts without embedding them. Certificate uses Helvetica only. |
| **No time limit** | The app does not enforce a per-question or total exam time limit. |
| **No tab-switch detection** | The app warns not to close the tab but cannot reliably detect tab switching or window focusing. |
| **QRCode.js CDN** | The QRCode.js CDN URL used (`cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`) may occasionally be unavailable. Admin should regenerate link manually if QR fails. |
| **Single admin account** | Only one hardcoded admin. Multi-admin not supported without a backend. |

---

*End of plan.md — Version 1.0 — Generated for ExamProctor Application*  
*Admin credentials: `admin@gmail.com` / `admin12345`*