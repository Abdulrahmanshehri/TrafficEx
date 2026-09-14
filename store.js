(() => {
  "use strict";

  const KEYS = {
    edits: "toqb_bank_edits_v2",
    attempts: "toqb_attempts_v2",
    users: "toqb_users_v2",
    settings: "toqb_settings_v2",
    session: "toqb_user_session_v2",
    admin: "toqb_admin_session_v2",
  };
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const readSession = (key) => {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
  };

  function getBank(base) {
    const edits = read(KEYS.edits, { overrides: {}, added: [], deleted: [] });
    const deleted = new Set(edits.deleted || []);
    const baseRows = (base || []).filter(q => !deleted.has(q.id)).map(q => edits.overrides?.[q.id] || q);
    const baseIds = new Set(baseRows.map(q => q.id));
    return [...baseRows, ...(edits.added || []).filter(q => !baseIds.has(q.id))];
  }

  function saveQuestion(question, base) {
    const edits = read(KEYS.edits, { overrides: {}, added: [], deleted: [] });
    edits.overrides ||= {};
    edits.added ||= [];
    edits.deleted ||= [];
    edits.deleted = edits.deleted.filter(id => id !== question.id);
    if ((base || []).some(q => q.id === question.id)) edits.overrides[question.id] = question;
    else {
      const index = edits.added.findIndex(q => q.id === question.id);
      if (index >= 0) edits.added[index] = question;
      else edits.added.push(question);
    }
    write(KEYS.edits, edits);
  }

  function deleteQuestion(id, base) {
    const edits = read(KEYS.edits, { overrides: {}, added: [], deleted: [] });
    edits.overrides ||= {};
    edits.added ||= [];
    edits.deleted ||= [];
    delete edits.overrides[id];
    edits.added = edits.added.filter(q => q.id !== id);
    if ((base || []).some(q => q.id === id) && !edits.deleted.includes(id)) edits.deleted.push(id);
    write(KEYS.edits, edits);
  }

  function loginUser(name, password) {
    const clean = String(name || "").trim();
    if (!clean || password !== "123456" || clean.toLowerCase() === "admin") return null;
    const users = read(KEYS.users, {});
    users[clean.toLowerCase()] = { name: clean, lastLogin: new Date().toISOString() };
    write(KEYS.users, users);
    const user = { name: clean };
    sessionStorage.setItem(KEYS.session, JSON.stringify(user));
    return user;
  }

  function addAttempt(attempt) {
    const rows = read(KEYS.attempts, []);
    rows.unshift(attempt);
    write(KEYS.attempts, rows);
  }

  window.TrainingStore = {
    getBank,
    saveQuestion,
    deleteQuestion,
    getAttempts: name => read(KEYS.attempts, []).filter(a => !name || a.username?.toLowerCase() === name.toLowerCase()),
    getAllAttempts: () => read(KEYS.attempts, []),
    addAttempt,
    getUsers: () => Object.values(read(KEYS.users, {})),
    getSettings: () => read(KEYS.settings, { closed: false }),
    setClosed: closed => write(KEYS.settings, { ...read(KEYS.settings, {}), closed: Boolean(closed) }),
    loginUser,
    getCurrentUser: () => readSession(KEYS.session),
    logoutUser: () => sessionStorage.removeItem(KEYS.session),
    loginAdmin: (name, password) => {
      const okay = String(name || "").trim().toLowerCase() === "admin" && password === "123456";
      if (okay) sessionStorage.setItem(KEYS.admin, JSON.stringify({ okay: true }));
      return okay;
    },
    isAdmin: () => Boolean(readSession(KEYS.admin)?.okay),
    logoutAdmin: () => sessionStorage.removeItem(KEYS.admin),
  };
})();
