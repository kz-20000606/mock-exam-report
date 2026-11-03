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

  // Keep the global workspace picker on other pages, but use compact local
  // year/grade selectors beside the student search field on this screen.
  const priorRender = render;
  render = function() {
    priorRender();
    const topPicker = $('#workspaceControlHost');
    if (topPicker) topPicker.style.display = route === 'students' ? 'none' : '';
    if (route !== 'students') return;

    // Remove the former separate student-workspace bar, if present.
    $$('.student-workspace-bar').forEach(el => el.remove());

    const search = $('#studentSearch');
    const legacyGradeFilter = $('#gradeFilter');
    if (!search || !legacyGradeFilter) return;

    const [year, grade] = activeWorkspace.split(':');
    const storedYears = workspaceIds().map(id => Number(id.split(':')[0]));
    const years = [...new Set([Number(year), ...storedYears])]
      .filter(Number.isFinite).sort((a,b) => b-a);

    const yearField = document.createElement('label');
    yearField.className = 'student-inline-filter';
    yearField.innerHTML = '<span>年度</span><select class="field select" id="studentYearFilter" aria-label="生徒一覧の年度">' +
      years.map(y => `<option value="${y}" ${String(y)===year?'selected':''}>${y}年度</option>`).join('') +
      '</select>';

    const gradeField = document.createElement('label');
    gradeField.className = 'student-inline-filter';
    gradeField.innerHTML = '<span>学年</span><select class="field select" id="studentGradeFilter" aria-label="生徒一覧の学年">' +
      ['中1','中2','中3','未分類'].map(g => `<option value="${g}" ${g===grade?'selected':''}>${g}</option>`).join('') +
      '</select>';

    search.after(yearField,gradeField);
    legacyGradeFilter.remove();
    const changeContext = () => {
      switchWorkspace(wk($('#studentYearFilter').value,$('#studentGradeFilter').value));
    };
    $('#studentYearFilter').addEventListener('change',changeContext);
    $('#studentGradeFilter').addEventListener('change',changeContext);
  };
  persist();
  render();
})();