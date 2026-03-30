/**
 * ═══════════════════════════════════════════════════
 *  KARLO — Premium Todo App v2  ·  app.js
 *  Features: Due Dates, Categories, Priority, Tags,
 *  Drag & Drop, Undo/Redo, Time Tracking, Export,
 *  Keyboard Shortcuts, Sound, Dark Mode
 * ═══════════════════════════════════════════════════
 */

"use strict";

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */

/** @typedef {{id:string,text:string,completed:boolean,category:string,dueDate:string,priority:string,createdAt:number,timeSpent:number}} Task */

/** @type {Task[]} */
let tasks = [];

let currentFilter = "all";
let currentCategory = "all";
let searchQuery = "";
let editingId = null;
let soundEnabled = true;
let toastTimer = null;

// Timers: id → { startedAt: timestamp }
const activeTimers = {};

// Undo/Redo stacks — each entry is a deep snapshot of tasks[]
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

// Drag & drop
let dragSrcId = null;

/* ══════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════ */
const taskInput = document.getElementById("taskInput");
const addBtn = document.getElementById("addBtn");
const categorySelect = document.getElementById("categorySelect");
const dueDateInput = document.getElementById("dueDateInput");
const prioritySelect = document.getElementById("prioritySelect");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const clearBtn = document.getElementById("clearBtn");
const footerNote = document.getElementById("footerNote");
const themeToggle = document.getElementById("themeToggle");
const charCount = document.getElementById("charCount");
const charCounter = document.getElementById("charCounter");
const filterBtns = document.querySelectorAll(".filter-btn");
const pillBtns = document.querySelectorAll(".pill");
const totalCountEl = document.getElementById("totalCount");
const pendingCountEl = document.getElementById("pendingCount");
const doneCountEl = document.getElementById("doneCount");
const overdueCountEl = document.getElementById("overdueCount");
const overdueChip = document.getElementById("overdueChip");
const searchInput = document.getElementById("searchInput");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const exportBtn = document.getElementById("exportBtn");
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");
const helpBtn = document.getElementById("helpBtn");

// Edit modal
const editModal = document.getElementById("editModal");
const modalInput = document.getElementById("modalInput");
const modalCategory = document.getElementById("modalCategory");
const modalDueDate = document.getElementById("modalDueDate");
const modalPriority = document.getElementById("modalPriority");
const modalCancel = document.getElementById("modalCancel");
const modalSave = document.getElementById("modalSave");

// Export modal
const exportModal = document.getElementById("exportModal");
const exportClose = document.getElementById("exportClose");
const exportJson = document.getElementById("exportJson");
const exportCsv = document.getElementById("exportCsv");

// Help modal
const helpModal = document.getElementById("helpModal");
const helpClose = document.getElementById("helpClose");

/* ══════════════════════════════════════════════════
   PERSISTENCE
══════════════════════════════════════════════════ */

function loadTasks() {
  try {
    tasks = JSON.parse(localStorage.getItem("karlo_tasks")) || [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem("karlo_tasks", JSON.stringify(tasks));
}

function loadTheme() {
  const t = localStorage.getItem("karlo_theme") || "light";
  document.documentElement.setAttribute("data-theme", t);
}

function saveTheme(t) {
  localStorage.setItem("karlo_theme", t);
}

function loadSound() {
  soundEnabled = localStorage.getItem("karlo_sound") !== "off";
  updateSoundIcon();
}

function updateSoundIcon() {
  soundIcon.textContent = soundEnabled ? "🔔" : "🔕";
  soundBtn.title = soundEnabled
    ? "Sound ON — click to mute"
    : "Sound OFF — click to unmute";
}

/* ══════════════════════════════════════════════════
   UNDO / REDO
══════════════════════════════════════════════════ */

/** Push a snapshot to undo stack before mutating tasks */
function pushUndo() {
  undoStack.push(JSON.stringify(tasks));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
  updateUndoRedoBtns();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(tasks));
  tasks = JSON.parse(undoStack.pop());
  saveTasks();
  renderTasks();
  updateStats();
  updateUndoRedoBtns();
  showToast("↩ Undo");
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(tasks));
  tasks = JSON.parse(redoStack.pop());
  saveTasks();
  renderTasks();
  updateStats();
  updateUndoRedoBtns();
  showToast("↪ Redo");
}

function updateUndoRedoBtns() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

/* ══════════════════════════════════════════════════
   TASK CRUD
══════════════════════════════════════════════════ */

function generateId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Add new task */
function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    shakeInput();
    return;
  }

  pushUndo();

  /** @type {Task} */
  const task = {
    id: generateId(),
    text: trimmed,
    completed: false,
    category: categorySelect.value,
    dueDate: dueDateInput.value,
    priority: prioritySelect.value,
    createdAt: Date.now(),
    timeSpent: 0,
  };

  tasks.unshift(task);
  saveTasks();

  // Reset inputs
  taskInput.value = "";
  dueDateInput.value = "";
  categorySelect.value = "none";
  prioritySelect.value = "normal";
  updateCharCounter("");

  renderTasks();
  updateStats();
  playSound("add");
  showToast("✦ Task added!");
}

/** Toggle complete */
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  pushUndo();
  task.completed = !task.completed;

  // Stop timer if running
  if (task.completed && activeTimers[id]) stopTimer(id, task);

  saveTasks();
  renderTasks();
  updateStats();

  if (task.completed) {
    playSound("complete");
    showToast("✅ Task done! Great job!");
  }
}

/** Delete with animation */
function deleteTask(id) {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  pushUndo();

  // Stop any timer
  if (activeTimers[id]) {
    const task = tasks.find((t) => t.id === id);
    if (task) stopTimer(id, task);
  }

  if (li) {
    li.classList.add("removing");
    li.addEventListener(
      "animationend",
      () => {
        tasks = tasks.filter((t) => t.id !== id);
        saveTasks();
        renderTasks();
        updateStats();
      },
      { once: true },
    );
  } else {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
    renderTasks();
    updateStats();
  }
  showToast("🗑️ Task deleted");
}

/** Open edit modal */
function openEditModal(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  editingId = id;
  modalInput.value = task.text;
  modalCategory.value = task.category || "none";
  modalDueDate.value = task.dueDate || "";
  modalPriority.value = task.priority || "normal";
  editModal.hidden = false;
  requestAnimationFrame(() => modalInput.focus());
}

/** Confirm edit */
function confirmEdit() {
  const newText = modalInput.value.trim();
  if (!newText) return;
  const task = tasks.find((t) => t.id === editingId);
  if (task) {
    pushUndo();
    task.text = newText;
    task.category = modalCategory.value;
    task.dueDate = modalDueDate.value;
    task.priority = modalPriority.value;
    saveTasks();
    renderTasks();
    updateStats();
    showToast("✎ Task updated!");
  }
  closeModal(editModal);
}

/** Close any modal */
function closeModal(modal) {
  modal.hidden = true;
  editingId = null;
}

/** Clear all completed */
function clearCompleted() {
  if (!tasks.some((t) => t.completed)) return;
  pushUndo();
  tasks = tasks.filter((t) => !t.completed);
  saveTasks();
  renderTasks();
  updateStats();
  playSound("clear");
  showToast("🧹 Cleared all completed tasks!");
}

/* ══════════════════════════════════════════════════
   TIME TRACKING
══════════════════════════════════════════════════ */

/** Start/stop timer toggle */
function toggleTimer(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  if (activeTimers[id]) {
    stopTimer(id, task);
    showToast(`⏱ Timer stopped — ${formatDuration(task.timeSpent)}`);
  } else {
    startTimer(id, task);
    showToast("▶ Timer started!");
  }
  saveTasks();
  renderTasks();
}

function startTimer(id, task) {
  activeTimers[id] = { startedAt: Date.now() - task.timeSpent * 1000 };
  // Live update every second
  activeTimers[id].interval = setInterval(() => {
    const badge = document.querySelector(`[data-id="${id}"] .badge-timer`);
    if (badge) {
      const elapsed = Math.floor(
        (Date.now() - activeTimers[id].startedAt) / 1000,
      );
      badge.textContent = "⏱ " + formatDuration(elapsed);
    }
    // Also update timeSpent in memory (not saving every second for perf)
    const t = tasks.find((x) => x.id === id);
    if (t)
      t.timeSpent = Math.floor(
        (Date.now() - activeTimers[id].startedAt) / 1000,
      );
  }, 1000);
}

function stopTimer(id, task) {
  if (!activeTimers[id]) return;
  task.timeSpent = Math.floor((Date.now() - activeTimers[id].startedAt) / 1000);
  clearInterval(activeTimers[id].interval);
  delete activeTimers[id];
  saveTasks();
}

/** Format seconds → h m s or m s or s */
function formatDuration(secs) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

/* ══════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════ */

function exportJSON() {
  const data = JSON.stringify(tasks, null, 2);
  downloadFile("karlo-tasks.json", data, "application/json");
  showToast("📦 Exported as JSON!");
  closeModal(exportModal);
}

function exportCSV() {
  const headers = [
    "ID",
    "Text",
    "Completed",
    "Category",
    "Priority",
    "DueDate",
    "TimeSpent(s)",
    "CreatedAt",
  ];
  const rows = tasks.map((t) => [
    t.id,
    `"${t.text.replace(/"/g, '""')}"`,
    t.completed,
    t.category,
    t.priority,
    t.dueDate || "",
    t.timeSpent || 0,
    new Date(t.createdAt).toLocaleString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  downloadFile("karlo-tasks.csv", csv, "text/csv");
  showToast("📊 Exported as CSV!");
  closeModal(exportModal);
}

function downloadFile(filename, content, type) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════
   DUE DATE HELPERS
══════════════════════════════════════════════════ */

function getDueBadgeClass(dateStr) {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "";
}

function formatDueDate(dateStr) {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return `📅 ${Math.abs(diff)}d overdue`;
  if (diff === 0) return "📅 Due today";
  if (diff === 1) return "📅 Due tomorrow";
  if (diff <= 7) return `📅 In ${diff} days`;
  return `📅 ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate) < today;
}

/* ══════════════════════════════════════════════════
   SOUND
══════════════════════════════════════════════════ */

/**
 * Play a short synthesized sound using Web Audio API
 * @param {'add'|'complete'|'clear'} type
 */
function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "add") {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else if (type === "complete") {
      // Two-note chime
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "clear") {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch {
    /* Audio not available — silently skip */
  }
}

/* ══════════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════════ */

function getVisibleTasks() {
  return tasks.filter((t) => {
    // Status filter
    if (currentFilter === "completed" && !t.completed) return false;
    if (currentFilter === "pending" && t.completed) return false;
    if (currentFilter === "overdue" && !isOverdue(t)) return false;
    // Category filter
    if (currentCategory !== "all" && t.category !== currentCategory)
      return false;
    // Search
    if (searchQuery && !t.text.toLowerCase().includes(searchQuery))
      return false;
    return true;
  });
}

function renderTasks() {
  const visible = getVisibleTasks();
  taskList.innerHTML = "";

  if (visible.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    visible.forEach((task) => taskList.appendChild(createTaskElement(task)));
  }

  const hasCompleted = tasks.some((t) => t.completed);
  clearBtn.hidden = !hasCompleted;

  const rem = tasks.filter((t) => !t.completed).length;
  footerNote.textContent =
    rem === 0
      ? tasks.length > 0
        ? "🎉 All done! Amazing!"
        : ""
      : `${rem} task${rem !== 1 ? "s" : ""} remaining`;
}

/** @param {Task} task @returns {HTMLLIElement} */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item${task.completed ? " completed" : ""}`;
  li.dataset.id = task.id;
  li.dataset.priority = task.priority || "normal";
  li.setAttribute("draggable", "true");
  li.setAttribute("role", "listitem");

  // ── Drag handle ──
  const handle = document.createElement("div");
  handle.className = "drag-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = "<span></span><span></span><span></span>";

  // ── Checkbox ──
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "task-checkbox";
  cb.checked = task.completed;
  cb.setAttribute(
    "aria-label",
    `Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`,
  );
  cb.addEventListener("change", () => toggleTask(task.id));

  // ── Body ──
  const body = document.createElement("div");
  body.className = "task-body";

  const textEl = document.createElement("span");
  textEl.className = "task-text";
  textEl.textContent = task.text;

  // Meta badges
  const meta = document.createElement("div");
  meta.className = "task-meta";

  if (task.category && task.category !== "none") {
    const catMap = {
      work: "💼",
      personal: "🏠",
      health: "💪",
      learning: "📚",
      finance: "💰",
      shopping: "🛒",
      urgent: "🔥",
    };
    const badge = document.createElement("span");
    badge.className = "meta-badge badge-cat";
    badge.textContent =
      (catMap[task.category] || "") + " " + capitalize(task.category);
    meta.appendChild(badge);
  }

  if (task.dueDate) {
    const badge = document.createElement("span");
    const cls = getDueBadgeClass(task.dueDate);
    badge.className = `meta-badge badge-due${cls ? " " + cls : ""}`;
    badge.textContent = formatDueDate(task.dueDate);
    meta.appendChild(badge);
  }

  // Time tracking badge (always show if timeSpent > 0, or if timer running)
  const totalSecs = activeTimers[task.id]
    ? Math.floor((Date.now() - activeTimers[task.id].startedAt) / 1000)
    : task.timeSpent || 0;

  if (totalSecs > 0 || activeTimers[task.id]) {
    const tBadge = document.createElement("span");
    tBadge.className = "meta-badge badge-timer";
    tBadge.textContent = "⏱ " + formatDuration(totalSecs);
    meta.appendChild(tBadge);
  }

  body.appendChild(textEl);
  if (meta.children.length) body.appendChild(meta);

  // ── Priority dot ──
  const dot = document.createElement("span");
  dot.className = `priority-dot ${task.priority || "normal"}`;
  dot.title = `Priority: ${task.priority || "normal"}`;

  // ── Actions ──
  const actions = document.createElement("div");
  actions.className = "task-actions";

  // Timer btn
  const timerBtn = document.createElement("button");
  timerBtn.className = `task-btn timer-btn${activeTimers[task.id] ? " running" : ""}`;
  timerBtn.setAttribute(
    "aria-label",
    activeTimers[task.id] ? "Stop timer" : "Start timer",
  );
  timerBtn.title = activeTimers[task.id] ? "⏹ Stop timer" : "▶ Start timer";
  timerBtn.innerHTML = activeTimers[task.id] ? "⏹" : "▶";
  timerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTimer(task.id);
  });

  // Edit btn
  const editBtn = document.createElement("button");
  editBtn.className = "task-btn edit-btn";
  editBtn.setAttribute("aria-label", `Edit "${task.text}"`);
  editBtn.title = "Edit task";
  editBtn.innerHTML = "✎";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditModal(task.id);
  });

  // Delete btn
  const delBtn = document.createElement("button");
  delBtn.className = "task-btn delete-btn";
  delBtn.setAttribute("aria-label", `Delete "${task.text}"`);
  delBtn.title = "Delete task";
  delBtn.innerHTML = "✕";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  actions.appendChild(timerBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(handle);
  li.appendChild(cb);
  li.appendChild(body);
  li.appendChild(dot);
  li.appendChild(actions);

  // ── Drag & drop events ──
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragover", onDragOver);
  li.addEventListener("dragleave", onDragLeave);
  li.addEventListener("drop", onDrop);
  li.addEventListener("dragend", onDragEnd);

  return li;
}

/* ══════════════════════════════════════════════════
   DRAG & DROP
══════════════════════════════════════════════════ */

function onDragStart(e) {
  dragSrcId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcId);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const li = e.currentTarget;
  if (li.dataset.id !== dragSrcId) li.classList.add("drag-over");
}

function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove("drag-over");
  if (!dragSrcId || dragSrcId === targetId) return;

  // Reorder in tasks array
  const srcIdx = tasks.findIndex((t) => t.id === dragSrcId);
  const tgtIdx = tasks.findIndex((t) => t.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  pushUndo();
  const [moved] = tasks.splice(srcIdx, 1);
  tasks.splice(tgtIdx, 0, moved);
  saveTasks();
  renderTasks();
  showToast("↕ Task reordered");
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document
    .querySelectorAll(".task-item")
    .forEach((li) => li.classList.remove("drag-over"));
  dragSrcId = null;
}

/* ══════════════════════════════════════════════════
   STATS
══════════════════════════════════════════════════ */

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pending = total - done;
  const overdue = tasks.filter((t) => isOverdue(t)).length;

  animateStat(totalCountEl, total);
  animateStat(pendingCountEl, pending);
  animateStat(doneCountEl, done);
  animateStat(overdueCountEl, overdue);

  overdueChip.style.display = overdue > 0 ? "" : "none";
}

function animateStat(el, value) {
  if (parseInt(el.textContent) !== value) {
    el.textContent = value;
    el.style.transform = "scale(1.3)";
    setTimeout(() => {
      el.style.transform = "scale(1)";
      el.style.transition = "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)";
    }, 10);
  }
}

/* ══════════════════════════════════════════════════
   FILTER / SEARCH
══════════════════════════════════════════════════ */

function setFilter(filter) {
  currentFilter = filter;
  filterBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.filter === filter),
  );
  renderTasks();
}

function setCategory(cat) {
  currentCategory = cat;
  pillBtns.forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
  renderTasks();
}

/* ══════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════ */

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  saveTheme(next);
}

/* ══════════════════════════════════════════════════
   CHAR COUNTER
══════════════════════════════════════════════════ */

function updateCharCounter(value) {
  const len = value.length;
  charCount.textContent = len;
  charCounter.classList.toggle("warn", len > 100);
}

/* ══════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════ */

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

function shakeInput() {
  taskInput.style.animation = "none";
  void taskInput.offsetWidth;
  taskInput.style.animation = "shake 0.4s ease";
  if (!document.getElementById("shakeStyle")) {
    const s = document.createElement("style");
    s.id = "shakeStyle";
    s.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`;
    document.head.appendChild(s);
  }
}

let _toastEl = null;
function showToast(msg) {
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.className = "toast";
    _toastEl.id = "appToast";
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => _toastEl.classList.remove("show"), 2200);
}

/* ══════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════ */

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  // ? → help modal (not in input)
  if (e.key === "?" && !inInput) {
    helpModal.hidden = false;
    return;
  }

  // D → dark mode (not in input)
  if (e.key === "d" && !inInput && !e.ctrlKey) {
    toggleTheme();
    return;
  }

  // Ctrl+Z → undo
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }

  // Ctrl+Y → redo
  if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    redo();
    return;
  }

  // Ctrl+F → focus search
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  // Ctrl+N → focus add input
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    taskInput.focus();
    return;
  }

  // Ctrl+E → export modal
  if (e.ctrlKey && e.key === "e") {
    e.preventDefault();
    exportModal.hidden = false;
    return;
  }

  // Escape → close any open modal
  if (e.key === "Escape") {
    if (!editModal.hidden) {
      closeModal(editModal);
      return;
    }
    if (!exportModal.hidden) {
      closeModal(exportModal);
      return;
    }
    if (!helpModal.hidden) {
      helpModal.hidden = true;
      return;
    }
  }
});

/* ══════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════ */

// Add task
addBtn.addEventListener("click", () => addTask(taskInput.value));
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask(taskInput.value);
});
taskInput.addEventListener("input", () => updateCharCounter(taskInput.value));

// Filters
filterBtns.forEach((b) =>
  b.addEventListener("click", () => setFilter(b.dataset.filter)),
);
pillBtns.forEach((b) =>
  b.addEventListener("click", () => setCategory(b.dataset.cat)),
);

// Search
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderTasks();
});

// Clear completed
clearBtn.addEventListener("click", clearCompleted);

// Theme
themeToggle.addEventListener("click", toggleTheme);

// Undo / Redo buttons
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

// Export button opens modal
exportBtn.addEventListener("click", () => {
  exportModal.hidden = false;
});
exportJson.addEventListener("click", exportJSON);
exportCsv.addEventListener("click", exportCSV);
exportClose.addEventListener("click", () => closeModal(exportModal));
exportModal.addEventListener("click", (e) => {
  if (e.target === exportModal) closeModal(exportModal);
});

// Sound toggle
soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("karlo_sound", soundEnabled ? "on" : "off");
  updateSoundIcon();
  showToast(soundEnabled ? "🔔 Sound enabled" : "🔕 Sound muted");
});

// Help
helpBtn.addEventListener("click", () => {
  helpModal.hidden = false;
});
helpClose.addEventListener("click", () => {
  helpModal.hidden = true;
});
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) helpModal.hidden = true;
});

// Edit modal
modalCancel.addEventListener("click", () => closeModal(editModal));
modalSave.addEventListener("click", confirmEdit);
modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmEdit();
  if (e.key === "Escape") closeModal(editModal);
});
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeModal(editModal);
});

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */

function init() {
  loadTheme();
  loadSound();
  loadTasks();
  renderTasks();
  updateStats();
  updateUndoRedoBtns();
  taskInput.focus();

  // Set today as min date for due date picker
  const today = new Date().toISOString().split("T")[0];
  dueDateInput.min = today;
  modalDueDate.min = today;
}

document.addEventListener("DOMContentLoaded", init);
