(() => {
  "use strict";

  const BASE = window.TRAINING_BANK || { mcqs: [] };
  const DB = window.TrainingStore;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const formatTime = seconds => `${String(Math.floor((seconds || 0) / 60)).padStart(2, "0")}:${String((seconds || 0) % 60).padStart(2, "0")}`;
  const shuffle = rows => {
    const copy = [...rows];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  const isAdminRoute = new URLSearchParams(location.search).has("admin") || location.hash.toLowerCase() === "#admin";
  let mcqs = DB.getBank(BASE.mcqs || []);
  let currentUser = null;
  let attempts = [];
  let session = null;
  let timerHandle = null;

  function init() {
    if (isAdminRoute) return initAdmin();
    if (DB.getSettings().closed) return $("closedScreen").classList.remove("hidden");
    currentUser = DB.getCurrentUser();
    if (currentUser) openTraining();
    else $("loginScreen").classList.remove("hidden");
    $("loginForm").addEventListener("submit", event => {
      event.preventDefault();
      currentUser = DB.loginUser($("loginName").value, $("loginPassword").value);
      if (!currentUser) { $("loginError").textContent = "تأكد من الاسم وكلمة المرور."; return; }
      $("loginScreen").classList.add("hidden");
      openTraining();
    });
  }

  function openTraining() {
    mcqs = DB.getBank(BASE.mcqs || []);
    attempts = DB.getAttempts(currentUser.name);
    $("appShell").classList.remove("hidden");
    $("currentUserName").textContent = currentUser.name;
    $("totalQuestions").textContent = mcqs.length;
    $("attemptCount").textContent = attempts.length;
    populateFilters(); wireTabs(); wirePractice(); wireAnswerKey(); renderProgress();
    $("logoutUser").addEventListener("click", () => { DB.logoutUser(); location.reload(); });
  }

  function populateFilters() {
    const roles = ["all", ...new Set(mcqs.map(q => q.role).filter(Boolean))];
    $("roleFilter").innerHTML = roles.map(r => `<option value="${esc(r)}">${r === "all" ? "كل الوظائف" : esc(r)}</option>`).join("");
    const topics = ["all", ...[...new Set(mcqs.map(q => q.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b))];
    $("topicFilter").innerHTML = topics.map(t => `<option value="${esc(t)}">${t === "all" ? "كل الموضوعات" : esc(t)}</option>`).join("");
  }

  function wireTabs() {
    document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
    document.querySelectorAll(".go-key").forEach(btn => btn.addEventListener("click", () => showView("key")));
  }
  function showView(name) {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.view === name));
    document.querySelectorAll(".view").forEach(x => x.classList.toggle("active", x.id === name));
    if (name === "progress") renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function wirePractice() {
    $("startSession").addEventListener("click", startSession);
    $("prevQuestion").addEventListener("click", () => move(-1));
    $("nextQuestion").addEventListener("click", () => move(1));
    $("clearAnswer").addEventListener("click", clearCurrentAnswer);
    $("revealAnswer").addEventListener("click", toggleRevealAnswer);
    $("flagQuestion").addEventListener("click", toggleFlag);
    $("finishSession").addEventListener("click", finishSession);
    $("retryWrong").addEventListener("click", () => { $("kindFilter").value = "wrong"; startSession(); });
  }
  function filteredQuestions() {
    const role = $("roleFilter").value;
    const topic = $("topicFilter").value;
    const wrongOnly = $("kindFilter").value === "wrong";
    const wrongIds = new Set(attempts.flatMap(a => a.wrongIds || []));
    return mcqs.filter(q => (role === "all" || q.role === role || q.role === "Both") && (topic === "all" || q.topic === topic) && (!wrongOnly || wrongIds.has(q.id)));
  }
  function startSession() {
    let pool = filteredQuestions();
    if (!pool.length) { alert($("kindFilter").value === "wrong" ? "لا توجد أخطاء سابقة ضمن هذا النطاق." : "لا توجد أسئلة مطابقة لهذا النطاق."); return; }
    if ($("shuffleToggle").checked) pool = shuffle(pool);
    const requested = $("countFilter").value;
    const count = requested === "all" ? pool.length : Math.min(Number(requested), pool.length);
    session = { questions: pool.slice(0, count), index: 0, answers: {}, flags: new Set(), revealed: new Set(), visibleAnswers: new Set(), seconds: 0 };
    $("emptyPractice").classList.add("hidden"); $("resultArea").classList.add("hidden"); $("sessionArea").classList.remove("hidden");
    clearInterval(timerHandle); timerHandle = setInterval(() => { session.seconds += 1; $("sessionTimer").textContent = formatTime(session.seconds); }, 1000);
    renderQuestion();
  }
  function renderQuestion() {
    const q = session.questions[session.index];
    $("questionIndex").textContent = `سؤال ${session.index + 1} من ${session.questions.length}`;
    $("questionTopic").textContent = q.topic || "General"; $("questionId").textContent = q.id; $("questionRole").textContent = q.role || "Both"; $("questionText").textContent = q.question;
    const visual = $("questionVisual");
    if (q.image) { visual.innerHTML = `<img src="${esc(q.image)}" alt="صورة السؤال">`; visual.classList.remove("hidden"); }
    else { visual.classList.add("hidden"); visual.innerHTML = ""; }
    const showingAnswer = session.visibleAnswers.has(q.id);
    $("optionsList").innerHTML = Object.entries(q.options || {}).map(([letter, text]) => { const selected = session.answers[q.id] === letter; const correct = showingAnswer && q.answer === letter; return `<label class="option ${selected ? "selected" : ""} ${correct ? "correct-revealed" : ""}" data-letter="${letter}"><input type="radio" name="answer" value="${letter}" ${selected ? "checked" : ""}><span class="option-letter">${letter}.</span>${esc(text)}</label>`; }).join("");
    $("optionsList").querySelectorAll(".option").forEach(option => option.addEventListener("click", event => { const letter = option.dataset.letter; session.answers[q.id] === letter ? delete session.answers[q.id] : session.answers[q.id] = letter; event.preventDefault(); renderQuestion(); }));
    $("prevQuestion").disabled = session.index === 0; $("nextQuestion").textContent = session.index === session.questions.length - 1 ? "مراجعة الخريطة" : "التالي"; $("flagQuestion").textContent = session.flags.has(q.id) ? "★ معلّم" : "☆ مراجعة"; $("clearAnswer").disabled = !session.answers[q.id];
    $("revealAnswer").textContent = showingAnswer ? "إخفاء الإجابة" : "إظهار الإجابة"; $("revealAnswer").disabled = !q.answer; $("revealAnswer").classList.toggle("active", showingAnswer); $("revealedBadge").classList.toggle("hidden", !session.revealed.has(q.id));
    $("questionProgress").style.width = `${((session.index + 1) / session.questions.length) * 100}%`; renderMap();
  }
  function renderMap() {
    $("questionMap").innerHTML = session.questions.map((q, i) => `<button class="${session.answers[q.id] ? "answered" : ""} ${i === session.index ? "current" : ""} ${session.flags.has(q.id) ? "flagged" : ""} ${session.revealed.has(q.id) ? "revealed" : ""}" data-index="${i}">${i + 1}</button>`).join("");
    $("questionMap").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { session.index = Number(btn.dataset.index); renderQuestion(); }));
  }
  function move(delta) { session.index = Math.max(0, Math.min(session.questions.length - 1, session.index + delta)); renderQuestion(); }
  function clearCurrentAnswer() { delete session.answers[session.questions[session.index].id]; renderQuestion(); }
  function toggleFlag() { const id = session.questions[session.index].id; session.flags.has(id) ? session.flags.delete(id) : session.flags.add(id); renderQuestion(); }
  function toggleRevealAnswer() { const q = session.questions[session.index]; if (!q.answer) return; if (session.visibleAnswers.has(q.id)) session.visibleAnswers.delete(q.id); else { session.visibleAnswers.add(q.id); session.revealed.add(q.id); } renderQuestion(); }

  function finishSession() {
    if (!session) return;
    const unanswered = session.questions.filter(q => !session.answers[q.id]).length;
    if (unanswered && !confirm(`لديك ${unanswered} سؤال/أسئلة بدون إجابة. هل تريد الإنهاء؟`)) return;
    clearInterval(timerHandle);
    const scored = session.questions.filter(q => q.answer && q.options?.[q.answer] && !session.revealed.has(q.id));
    const answered = session.questions.filter(q => session.answers[q.id]).length;
    const correct = scored.filter(q => session.answers[q.id] === q.answer).length;
    const wrong = scored.filter(q => session.answers[q.id] && session.answers[q.id] !== q.answer).length;
    const blank = session.questions.length - answered;
    const penalized = scored.length ? Math.max(0, correct - wrong / 3) : null;
    const percent = scored.length ? Math.round((penalized / scored.length) * 1000) / 10 : null;
    const wrongIds = scored.filter(q => session.answers[q.id] && session.answers[q.id] !== q.answer).map(q => q.id);
    const revealedIds = [...session.revealed];
    const attempt = { username: currentUser.name, date: new Date().toISOString(), count: session.questions.length, correct, wrong, blank, answered, scoredCount: scored.length, revealedIds, penalized: penalized === null ? null : Math.round(penalized * 100) / 100, percent, seconds: session.seconds, responses: { ...session.answers }, wrongIds, role: $("roleFilter").selectedOptions[0].textContent, topic: $("topicFilter").selectedOptions[0].textContent };
    DB.addAttempt(attempt); attempts = DB.getAttempts(currentUser.name); $("attemptCount").textContent = attempts.length;
    $("sessionArea").classList.add("hidden"); $("resultArea").classList.remove("hidden");
    if (scored.length) {
      $("resultPercent").textContent = `${percent}%`; document.querySelector(".result-ring").style.setProperty("--score-angle", `${Math.max(0, Math.min(360, percent * 3.6))}deg`); $("resultTitle").textContent = percent >= 75 ? "أداء قوي" : "راجع أخطاءك وأعد المحاولة"; $("resultStats").innerHTML = `<span>صحيح <strong>${correct}</strong></span><span>خطأ <strong>${wrong}</strong></span><span>فارغ <strong>${blank}</strong></span><span>مستبعد <strong>${revealedIds.length}</strong></span><span>بعد الخصم <strong>${attempt.penalized}/${scored.length}</strong></span>`; $("resultNote").textContent = revealedIds.length ? `استُبعد ${revealedIds.length} سؤال من الدرجة لأنك أظهرت إجابته.` : (wrongIds.length ? "أضيفت الأسئلة الخاطئة إلى أخطائي السابقة." : "لا توجد أخطاء في الأسئلة المصححة."); $("retryWrong").classList.toggle("hidden", !wrongIds.length);
    } else {
      $("resultPercent").textContent = "حُفظت"; document.querySelector(".result-ring").style.setProperty("--score-angle", `${Math.round(answered / session.questions.length * 360)}deg`); $("resultTitle").textContent = "حُفظت المحاولة بدون تصحيح"; $("resultStats").innerHTML = `<span>تمت الإجابة <strong>${answered}</strong></span><span>فارغ <strong>${blank}</strong></span><span>مستبعد <strong>${revealedIds.length}</strong></span>`; $("resultNote").textContent = revealedIds.length ? "كل الأسئلة القابلة للتصحيح عُرضت إجاباتها، لذلك لم تُحسب درجة." : "لا توجد إجابات محددة لهذه الأسئلة في المفتاح."; $("retryWrong").classList.add("hidden");
    }
    renderProgress();
  }

  function wireAnswerKey() { $("unlockAnswers").addEventListener("click", () => { $("answerGuard").classList.add("hidden"); $("answerContent").classList.remove("hidden"); renderKey(); }); $("answerSearch").addEventListener("input", renderKey); }
  function renderKey() { const term = $("answerSearch").value.trim().toLowerCase(); const rows = mcqs.filter(q => q.answer && (!term || `${q.id} ${q.question} ${q.topic}`.toLowerCase().includes(term))); $("mcqKey").innerHTML = rows.length ? rows.map(q => `<article class="answer-item"><header><div><strong>${esc(q.id)}</strong><small>${esc(q.topic)}</small></div><span class="answer-letter">${esc(q.answer)}</span></header><p>${esc(q.question)}</p><small><strong>Correct:</strong> ${esc(q.options?.[q.answer])}</small></article>`).join("") : `<div class="empty-key">لا توجد إجابات مضافة بعد.</div>`; }
  function renderProgress() {
    const scored = attempts.filter(a => typeof a.percent === "number"); const best = scored.length ? Math.max(...scored.map(a => a.percent)) : "—"; const average = scored.length ? Math.round(scored.reduce((sum, a) => sum + a.percent, 0) / scored.length * 10) / 10 : "—"; const uniqueWrong = new Set(attempts.flatMap(a => a.wrongIds || [])).size;
    $("progressCards").innerHTML = `<div class="metric"><strong>${attempts.length}</strong><span>محاولات</span></div><div class="metric"><strong>${best}${best === "—" ? "" : "%"}</strong><span>أفضل نتيجة</span></div><div class="metric"><strong>${average}${average === "—" ? "" : "%"}</strong><span>المتوسط</span></div><div class="metric"><strong>${uniqueWrong}</strong><span>أخطاء</span></div>`;
    $("attemptTable").innerHTML = attempts.length ? attempts.map(a => `<tr><td>${new Date(a.date).toLocaleString("ar-SA")}</td><td>${esc(a.role)}<br><small>${esc(a.topic)}</small></td><td><strong>${typeof a.percent === "number" ? `${a.percent}%` : "غير مصحح"}</strong></td><td>${a.scoredCount ? a.correct : "—"}</td><td>${a.scoredCount ? a.wrong : "—"}</td><td>${a.blank}</td><td>${formatTime(a.seconds)}</td></tr>`).join("") : `<tr><td colspan="7">لا توجد محاولات محفوظة بعد.</td></tr>`;
  }

  function initAdmin() {
    if (DB.isAdmin()) openAdmin(); else $("adminGate").classList.remove("hidden");
    $("adminLoginForm").addEventListener("submit", event => { event.preventDefault(); if (!DB.loginAdmin($("adminName").value, $("adminPassword").value)) { $("adminLoginError").textContent = "بيانات الدخول غير صحيحة."; return; } $("adminGate").classList.add("hidden"); openAdmin(); });
  }
  function openAdmin() {
    $("adminShell").classList.remove("hidden");
    $("logoutAdmin").addEventListener("click", () => { DB.logoutAdmin(); location.reload(); });
    $("toggleSite").addEventListener("click", () => { const closed = !DB.getSettings().closed; DB.setClosed(closed); renderAdmin(); });
    $("questionForm").addEventListener("submit", saveAdminQuestion);
    $("cancelEdit").addEventListener("click", resetEditor);
    $("adminSearch").addEventListener("input", renderAdminQuestions);
    renderAdmin();
  }
  function renderAdmin() {
    mcqs = DB.getBank(BASE.mcqs || []); const attemptsAll = DB.getAllAttempts(); const closed = DB.getSettings().closed;
    $("toggleSite").textContent = closed ? "إعادة فتح الموقع" : "إغلاق الموقع"; $("toggleSite").classList.toggle("site-closed", closed);
    $("adminQuestionCount").textContent = mcqs.length; $("adminAnswerCount").textContent = mcqs.filter(q => q.answer).length; $("adminUserCount").textContent = DB.getUsers().length; $("adminAttemptCount").textContent = attemptsAll.length;
    $("adminScores").innerHTML = attemptsAll.length ? attemptsAll.map(a => `<tr><td>${esc(a.username)}</td><td>${new Date(a.date).toLocaleString("ar-SA")}</td><td>${typeof a.percent === "number" ? `${a.percent}%` : "غير مصحح"}</td><td>${a.scoredCount ? a.correct : "—"}</td><td>${a.scoredCount ? a.wrong : "—"}</td><td>${a.blank}</td><td>${formatTime(a.seconds)}</td></tr>`).join("") : `<tr><td colspan="7">لا توجد درجات مسجلة بعد.</td></tr>`;
    renderAdminQuestions();
  }
  function renderAdminQuestions() {
    const term = $("adminSearch").value.trim().toLowerCase(); const rows = mcqs.filter(q => !term || `${q.id} ${q.question} ${q.topic}`.toLowerCase().includes(term));
    $("adminQuestionList").innerHTML = rows.map(q => `<article class="admin-question"><div><strong>${esc(q.id)}</strong><span>${esc(q.topic || "General")}</span><p>${esc(q.question)}</p><small>الإجابة: ${esc(q.answer || "غير محددة")}</small></div><div class="row-actions"><button class="secondary edit-question" data-id="${esc(q.id)}">تعديل</button><button class="delete-question" data-id="${esc(q.id)}">حذف</button></div></article>`).join("") || `<div class="empty-key">لا توجد نتائج.</div>`;
    $("adminQuestionList").querySelectorAll(".edit-question").forEach(btn => btn.addEventListener("click", () => editQuestion(btn.dataset.id)));
    $("adminQuestionList").querySelectorAll(".delete-question").forEach(btn => btn.addEventListener("click", () => { const q = mcqs.find(x => x.id === btn.dataset.id); if (q && confirm(`حذف السؤال: ${q.question}`)) { DB.deleteQuestion(q.id, BASE.mcqs || []); renderAdmin(); } }));
  }
  function editQuestion(id) {
    const q = mcqs.find(row => row.id === id); if (!q) return;
    $("editOriginalId").value = q.id; $("editId").value = q.id; $("editRole").value = q.role || "Both"; $("editTopic").value = q.topic || "General"; $("editQuestion").value = q.question; $("editA").value = q.options?.A || ""; $("editB").value = q.options?.B || ""; $("editC").value = q.options?.C || ""; $("editD").value = q.options?.D || ""; $("editAnswer").value = q.answer || ""; $("editorTitle").textContent = "تعديل السؤال"; $("cancelEdit").classList.remove("hidden"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function saveAdminQuestion(event) {
    event.preventDefault(); const originalId = $("editOriginalId").value; const id = $("editId").value.trim() || `CUSTOM-${Date.now()}`;
    if (id !== originalId && mcqs.some(q => q.id === id)) { $("editorStatus").textContent = "رمز السؤال مستخدم مسبقًا."; return; }
    const existing = mcqs.find(q => q.id === originalId) || {};
    if (originalId && originalId !== id) DB.deleteQuestion(originalId, BASE.mcqs || []);
    const options = { A: $("editA").value.trim(), B: $("editB").value.trim(), C: $("editC").value.trim(), D: $("editD").value.trim() }; const answer = $("editAnswer").value;
    const question = { ...existing, id, role: $("editRole").value, topic: $("editTopic").value.trim(), kind: "bank", question: $("editQuestion").value.trim(), options };
    if (answer) { question.answer = answer; question.answer_text = options[answer]; }
    else { delete question.answer; delete question.answer_text; }
    DB.saveQuestion(question, BASE.mcqs || []); resetEditor(); $("editorStatus").textContent = "تم حفظ السؤال."; renderAdmin();
  }
  function resetEditor() { $("questionForm").reset(); $("editOriginalId").value = ""; $("editorTitle").textContent = "إضافة سؤال"; $("cancelEdit").classList.add("hidden"); }

  init();
})();
