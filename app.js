(() => {
  "use strict";

  const BASE = window.TRAINING_BANK || { mcqs: [] };
  const KEYS = {
    attempts: "toqb_attempts_v1",
    custom: "toqb_custom_bank_v1",
  };
  const $ = (id) => document.getElementById(id);
  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const custom = load(KEYS.custom, { mcqs: [] });
  save(KEYS.custom, custom);
  localStorage.removeItem("toqb_case_drafts_v1");
  const mergeById = (a, b) => [...new Map([...a, ...b].map(x => [x.id, x])).values()];
  let mcqs = mergeById(BASE.mcqs || [], custom.mcqs || []);
  let attempts = load(KEYS.attempts, []);
  let session = null;
  let timerHandle = null;

  const shuffle = arr => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const esc = s => String(s ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const download = (name, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };

  function init() {
    $("totalQuestions").textContent = mcqs.length;
    $("attemptCount").textContent = attempts.length;
    populateFilters();
    wireTabs();
    wirePractice();
    wireAnswerKey();
    wireManage();
    renderProgress();
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
    $("flagQuestion").addEventListener("click", toggleFlag);
    $("finishSession").addEventListener("click", finishSession);
    $("retryWrong").addEventListener("click", () => {
      $("kindFilter").value = "wrong";
      startSession();
    });
  }

  function filteredQuestions() {
    const role = $("roleFilter").value;
    const kind = $("kindFilter").value;
    const topic = $("topicFilter").value;
    const wrongIds = new Set(attempts.flatMap(a => a.wrongIds || []));
    return mcqs.filter(q =>
      (role === "all" || q.role === role || q.role === "Both") &&
      (topic === "all" || q.topic === topic) &&
      (kind === "all" || kind === "wrong" ? true : q.kind === kind) &&
      (kind !== "wrong" || wrongIds.has(q.id))
    );
  }

  function startSession() {
    let pool = filteredQuestions();
    if (!pool.length) {
      alert("لا توجد أسئلة مطابقة لهذا النطاق حتى الآن.");
      return;
    }
    if ($("shuffleToggle").checked) pool = shuffle(pool);
    const requested = $("countFilter").value;
    const count = requested === "all" ? pool.length : Math.min(Number(requested), pool.length);
    const questions = pool.slice(0, count);
    session = { questions, index: 0, answers: {}, flags: new Set(), seconds: 0, startedAt: Date.now() };
    $("emptyPractice").classList.add("hidden");
    $("resultArea").classList.add("hidden");
    $("sessionArea").classList.remove("hidden");
    clearInterval(timerHandle);
    timerHandle = setInterval(() => { session.seconds += 1; $("sessionTimer").textContent = formatTime(session.seconds); }, 1000);
    renderQuestion();
  }

  function renderQuestion() {
    const q = session.questions[session.index];
    $("questionIndex").textContent = `سؤال ${session.index + 1} من ${session.questions.length}`;
    $("questionTopic").textContent = q.topic || "General";
    $("questionId").textContent = q.id;
    $("questionRole").textContent = q.role || "Both";
    $("questionSourceType").textContent = q.kind === "past" ? "Previous Exam" : "Question Bank";
    $("questionText").textContent = q.question;
    document.querySelector(".source-alert")?.remove();
    if (q.sourceIssue) {
      $("questionText").insertAdjacentHTML("afterend", `<div class="source-alert">${esc(q.sourceIssue)}</div>`);
    }
    const visual = $("questionVisual");
    if (q.image) {
      visual.innerHTML = `<img src="${esc(q.image)}" alt="Technical diagram for ${esc(q.id)}">`;
      visual.classList.remove("hidden");
    } else { visual.classList.add("hidden"); visual.innerHTML = ""; }
    $("optionsList").innerHTML = Object.entries(q.options).map(([letter, text]) => {
      const selected = session.answers[q.id] === letter;
      return `<label class="option ${selected ? "selected" : ""}" data-letter="${letter}"><input type="radio" name="answer" value="${letter}" ${selected ? "checked" : ""}><span class="option-letter">${letter}.</span>${esc(text)}</label>`;
    }).join("");
    $("optionsList").querySelectorAll(".option").forEach(option => option.addEventListener("click", e => {
      const letter = option.dataset.letter;
      if (session.answers[q.id] === letter) delete session.answers[q.id];
      else session.answers[q.id] = letter;
      e.preventDefault();
      renderQuestion();
    }));
    $("prevQuestion").disabled = session.index === 0;
    $("nextQuestion").textContent = session.index === session.questions.length - 1 ? "مراجعة الخريطة" : "التالي";
    $("flagQuestion").textContent = session.flags.has(q.id) ? "★ معلّم" : "☆ مراجعة";
    $("clearAnswer").disabled = !session.answers[q.id];
    $("questionProgress").style.width = `${((session.index + 1) / session.questions.length) * 100}%`;
    renderMap();
  }

  function renderMap() {
    $("questionMap").innerHTML = session.questions.map((q, i) => `<button class="${session.answers[q.id] ? "answered" : ""} ${i === session.index ? "current" : ""} ${session.flags.has(q.id) ? "flagged" : ""}" data-index="${i}" aria-label="السؤال ${i + 1}">${i + 1}</button>`).join("");
    $("questionMap").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { session.index = Number(btn.dataset.index); renderQuestion(); }));
  }
  function move(delta) { session.index = Math.max(0, Math.min(session.questions.length - 1, session.index + delta)); renderQuestion(); }
  function clearCurrentAnswer() { delete session.answers[session.questions[session.index].id]; renderQuestion(); }
  function toggleFlag() { const id = session.questions[session.index].id; session.flags.has(id) ? session.flags.delete(id) : session.flags.add(id); renderQuestion(); }

  function finishSession() {
    if (!session) return;
    const unanswered = session.questions.filter(q => !session.answers[q.id]).length;
    if (unanswered && !confirm(`لديك ${unanswered} سؤال/أسئلة بدون إجابة. هل تريد الإنهاء؟`)) return;
    clearInterval(timerHandle);
    const scoredQuestions = session.questions.filter(q => q.answer && q.options?.[q.answer]);
    const answered = session.questions.filter(q => session.answers[q.id]).length;
    const blank = session.questions.length - answered;
    const correct = scoredQuestions.filter(q => session.answers[q.id] === q.answer).length;
    const wrong = scoredQuestions.filter(q => session.answers[q.id] && session.answers[q.id] !== q.answer).length;
    const penalized = scoredQuestions.length ? Math.max(0, correct - (wrong / 3)) : null;
    const pct = scoredQuestions.length ? Math.round((penalized / scoredQuestions.length) * 1000) / 10 : null;
    const wrongIds = scoredQuestions.filter(q => session.answers[q.id] && session.answers[q.id] !== q.answer).map(q => q.id);
    const attempt = {
      date: new Date().toISOString(), count: session.questions.length, correct, wrong, blank,
      penalized: penalized === null ? null : Math.round(penalized * 100) / 100, percent: pct, seconds: session.seconds,
      answered, scoredCount: scoredQuestions.length, responses: { ...session.answers },
      role: $("roleFilter").selectedOptions[0].textContent, kind: $("kindFilter").selectedOptions[0].textContent,
      topic: $("topicFilter").selectedOptions[0].textContent, wrongIds,
    };
    attempts.unshift(attempt); save(KEYS.attempts, attempts);
    $("attemptCount").textContent = attempts.length;
    $("sessionArea").classList.add("hidden");
    $("resultArea").classList.remove("hidden");
    if (scoredQuestions.length) {
      $("resultPercent").textContent = `${pct}%`;
      document.querySelector(".result-ring").style.setProperty("--score-angle", `${Math.max(0, Math.min(360, pct * 3.6))}deg`);
      $("resultTitle").textContent = pct >= 75 ? "أداء قوي — ثبّت النقاط الضعيفة" : "حدد الأخطاء وأعد المحاولة";
      $("resultStats").innerHTML = `<span>صحيح <strong>${correct}</strong></span><span>خطأ <strong>${wrong}</strong></span><span>فارغ <strong>${blank}</strong></span><span>بعد الخصم <strong>${attempt.penalized}/${scoredQuestions.length}</strong></span>`;
      $("resultNote").textContent = wrongIds.length ? `راجع الإجابات الموثقة للأسئلة: ${wrongIds.join("، ")}` : "انتهى تصحيح الأسئلة الموثقة في هذه المحاولة.";
      $("retryWrong").classList.toggle("hidden", !wrongIds.length);
    } else {
      const completion = Math.round((answered / session.questions.length) * 100);
      $("resultPercent").textContent = "حُفظت";
      document.querySelector(".result-ring").style.setProperty("--score-angle", `${completion * 3.6}deg`);
      $("resultTitle").textContent = "تم حفظ اختياراتك بدون تصحيح";
      $("resultStats").innerHTML = `<span>تمت الإجابة <strong>${answered}</strong></span><span>فارغ <strong>${blank}</strong></span><span>موثّق الإجابة <strong>0</strong></span>`;
      $("resultNote").textContent = "لن نعتبر دوائر أوراق الاختبار مفتاح إجابة. نراجع الأسئلة سويًا ونضيف فقط ما نتحقق منه من الوثيقة الرسمية.";
      $("retryWrong").classList.add("hidden");
    }
    renderProgress();
  }

  function wireAnswerKey() {
    $("unlockAnswers").addEventListener("click", () => {
      $("answerGuard").classList.add("hidden"); $("answerContent").classList.remove("hidden"); renderMcqKey();
    });
    $("answerSearch").addEventListener("input", renderMcqKey);
  }
  function renderMcqKey() {
    const term = $("answerSearch").value.trim().toLowerCase();
    const rows = mcqs.filter(q => q.answer && (!term || `${q.id} ${q.question} ${q.topic}`.toLowerCase().includes(term)));
    $("mcqKey").innerHTML = rows.length ? rows.map(q => `<article class="answer-item"><header><div><strong>${esc(q.id)}</strong><small>${esc(q.topic)}</small></div><span class="answer-letter">${esc(q.answer)}</span></header><p>${esc(q.question)}</p><small><strong>Correct:</strong> ${esc(q.answer_text || q.options?.[q.answer])}</small><small><strong>Source:</strong> ${esc(q.answerSource || q.source_detail || q.sources?.join(" / "))}</small><small><strong>Confidence:</strong> verified</small></article>`).join("") : `<div class="empty-key"><h3>لا توجد إجابات موثقة بعد</h3><p>سنضيف كل إجابة هنا بعد حل السؤال ومراجعته مقابل الوثيقة الرسمية ذات الصلة.</p></div>`;
  }
  function renderProgress() {
    const total = attempts.length;
    const scoredAttempts = attempts.filter(a => typeof a.percent === "number");
    const best = scoredAttempts.length ? Math.max(...scoredAttempts.map(a => a.percent)) : "—";
    const average = scoredAttempts.length ? Math.round(scoredAttempts.reduce((s, a) => s + a.percent, 0) / scoredAttempts.length * 10) / 10 : "—";
    const uniqueWrong = new Set(attempts.flatMap(a => a.wrongIds || [])).size;
    $("progressCards").innerHTML = `<div class="metric"><strong>${total}</strong><span>محاولات</span></div><div class="metric"><strong>${best}${best === "—" ? "" : "%"}</strong><span>أفضل نتيجة موثقة</span></div><div class="metric"><strong>${average}${average === "—" ? "" : "%"}</strong><span>المتوسط الموثق</span></div><div class="metric"><strong>${uniqueWrong}</strong><span>أخطاء موثقة</span></div>`;
    $("attemptTable").innerHTML = attempts.length ? attempts.map(a => `<tr><td>${new Date(a.date).toLocaleString("ar-SA")}</td><td>${esc(a.role)}<br><small>${esc(a.topic)}</small></td><td><strong>${typeof a.percent === "number" ? `${a.percent}%` : "غير مصحح"}</strong><br><small>${a.penalized === null ? `${a.answered || 0}/${a.count} مجاب` : `${a.penalized}/${a.scoredCount || a.count}`}</small></td><td>${a.scoredCount ? a.correct : "—"}</td><td>${a.scoredCount ? a.wrong : "—"}</td><td>${a.blank}</td><td>${formatTime(a.seconds)}</td></tr>`).join("") : `<tr><td colspan="7">لا توجد محاولات محفوظة بعد.</td></tr>`;
  }

  function wireManage() {
    $("exportProgress").addEventListener("click", () => download("traffic-operations-results.json", { exportedAt: new Date().toISOString(), attempts }));
    $("exportBank").addEventListener("click", () => download("traffic-operations-question-bank.json", { version: BASE.version, mcqs }));
    $("exportBackup").addEventListener("click", () => download("traffic-operations-full-backup.json", { exportedAt: new Date().toISOString(), customBank: { mcqs: custom.mcqs || [] }, attempts }));
    $("clearProgress").addEventListener("click", () => { if (confirm("سيتم مسح سجل المحاولات من هذا الجهاز. هل أنت متأكد؟")) { attempts = []; save(KEYS.attempts, attempts); $("attemptCount").textContent = 0; renderProgress(); } });
    $("importBank").addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const incoming = data.customBank || data;
        if (!Array.isArray(incoming.mcqs)) throw new Error("missing mcqs array");
        custom.mcqs = mergeById(custom.mcqs || [], incoming.mcqs || []);
        save(KEYS.custom, custom);
        mcqs = mergeById(BASE.mcqs || [], custom.mcqs);
        populateFilters(); $("totalQuestions").textContent = mcqs.length;
        $("importStatus").textContent = `تم الاستيراد: ${incoming.mcqs.length} سؤال.`;
      } catch { $("importStatus").textContent = "تعذر قراءة الملف. تأكد أنه JSON صادر من هذه الصفحة أو بنفس البنية."; }
      e.target.value = "";
    });
  }

  init();
})();
