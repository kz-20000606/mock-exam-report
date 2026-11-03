'use strict';
/* Keep report creation/student listing separate from the saved-report browser.
 * No student data is transmitted or stored in this module. */
(() => {
  const PREF_KEY = 'mock-exam-screen-workspace-v1';
  const scopeForRoute = r => r === 'archive' ? 'archive'
    : (r === 'students' || r === 'detail' || r === 'report') ? 'students'
    : r === 'exams' ? 'exams' : null;
  let preferences;
  try { preferences = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; }
  catch (_) { preferences = {}; }
  if (!preferences.students) preferences.students = activeWorkspace;
  if (!preferences.archive) preferences.archive = activeWorkspace;
  if (!preferences.exams) preferences.exams = activeWorkspace;
  const persist = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch (_) {} };
  const valid = id => /^\d{4}:(中[123]|未分類)$/.test(id || '');
  const priorSwitch = switchWorkspace;
  switchWorkspace = function(id) {
    const scope = scopeForRoute(route);
    const before = activeWorkspace;
    const result = priorSwitch(id);
    if (activeWorkspace !== before && scope) {
      preferences[scope] = activeWorkspace;
      persist();
    }
    return result;
  };

  // The active workspace is the view context. It is safe to swap the context
  // before rendering a different screen without changing other screen prefs.
  const priorGoto = goto;
  goto = function(destination) {
    const targetScope = scopeForRoute(destination);
    const desired = targetScope ? preferences[targetScope] : null;
    if (valid(desired) && desired !== activeWorkspace && !batchDrafts.length) {
      if (!save()) return;
      activeWorkspace = desired;
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, desired);
      registerWorkspace(desired);
      load();
      selected.clear();
      currentStudent = null;
      reportIndex = 0;
      searchText = '';
      gradeFilter = 'all';
      archiveCurrentId = null;
      savedReportsView = [];
      if (typeof resetFolderView === 'function') resetFolderView();
    }
    return priorGoto(destination);
  };

  // Provide a visible list of available grades even when the current grade has
  // no registered students (the old gradeFilter was populated from one group).
  const priorRender = render;
  render = function() {
    priorRender();
    if (route !== 'students') return;
    const section = $('#appView .section');
    if (!section || $('#studentWorkspacePicker')) return;
    const registeredYears = workspaceIds().map(id => Number(id.split(':')[0]));
    const currentYear = Number(activeWorkspace.split(':')[0]);
    const years = [...new Set([currentYear, ...registeredYears])].sort((a,b) => b-a);
    const options = years.flatMap(year => ['中1','中2','中3'].map(grade => {
      const id = wk(year,grade);
      return `<option value="${id}" ${id === activeWorkspace ? 'selected' : ''}>${year}年度・${grade}</option>`;
    })).join('');
    const bar = document.createElement('div');
    bar.className = 'student-workspace-bar';
    bar.innerHTML = `<label for="studentWorkspacePicker">生徒一覧の年度・学年</label><select class="field" id="studentWorkspacePicker">${options}</select><span class="muted tiny">保存済み成績表の学年選択とは独立しています。</span>`;
    section.before(bar);
    $('#studentWorkspacePicker').addEventListener('change', e => switchWorkspace(e.target.value));
  };
  persist();
  render();
})();