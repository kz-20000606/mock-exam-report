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

  persist();
  render();
})();