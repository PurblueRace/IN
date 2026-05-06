/* ============================================================
   ?뺣낫泥섎━湲곗궗 ?ㅽ꽣?붾찓?댄듃 ??Main Application
   ============================================================ */

// ??? CONFIG ?????????????????????????????????????????????????
const DATA_BUNDLE = './data/topics-bundle.json';
const EMBEDDED_DATA_BUNDLE_KEY = '__STUDY_TOPIC_BUNDLE__';
const PRACTICE_BUNDLE = './data/subtopic-practice-bundle.json';
const EMBEDDED_PRACTICE_BUNDLE_KEY = '__STUDY_SUBTOPIC_PRACTICE_BUNDLE__';
const OBJECTIVE_SET_BUNDLE = './data/objective-sets.json';
const PRACTICAL_SUMMARY_BUNDLE = './data/practical-summary.json';
const CORE_SUMMARY_BUNDLE = './data/written-core-summaries.json';
const QUESTION_BANK_ROOT = './data/question-bank/';
const AUTH_STORAGE_KEY = 'study_auth_v1';
const AUTH_SESSION_KEY = 'study_auth_session_v1';
const USER_PROGRESS_STORAGE_KEY = 'study_user_progress_v1';
const PRACTICAL_PROGRESS_STORAGE_KEY = 'study_practical_progress_v1';
const LEGACY_PROGRESS_MIGRATION_KEY = 'study_topics_v2_migration_v1';

const SUBJECTS = [
  { id: 1, name: '소프트웨어 설계', emoji: '📐', color: '#3182F6' },
  { id: 2, name: '소프트웨어 개발', emoji: '💻', color: '#30C85E' },
  { id: 3, name: '데이터베이스 구축', emoji: '🗄️', color: '#FF9500' },
  { id: 4, name: '프로그래밍 언어 활용', emoji: '⌨️', color: '#8B5CF6' },
  { id: 5, name: '정보시스템 구축관리', emoji: '🔒', color: '#F04452' },
];

// ??? STATE ??????????????????????????????????????????????????
const state = {
  currentPage: 'home',
  manifest: null,
  currentLecture: null,
  currentLectureId: null,
  dataReady: false,
  dataLoading: false,
  dataLoadError: '',

  currentSegIdx: 0,
  currentSentIdx: 0,
  shownSentences: [],
  autoPlay: false,
  autoPlayTimer: null,

  quizQuestions: [],
  quizIndex: 0,
  quizRevealed: false,
  quizRevealedBlanks: {},
  quizScore: { correct: 0, incorrect: 0 },
  quizSelectedChoiceLabel: null,
  quizSubmission: null,
  quizAnswers: {},
  quizResults: [],
  quizStartedAt: null,
  quizElapsedSeconds: 0,
  quizTimerId: null,
  objectiveSubjectResult: null,
  objectiveSubjectReview: null,
  objectiveSubjectTimerBaselines: {},

  completedLectures: new Set(),
  lastLectureId: null,

  lectureFilter: null,
  searchQuery: '',
  objectiveSearchQuery: '',
  objectiveWrongNoteSetFilter: 'all',
  topicMap: {},
  subtopicPracticeMap: {},
  objectiveSets: [],
  objectiveSetsReady: false,
  objectiveSetsLoading: false,
  objectiveSetsError: '',
  practicalSummary: null,
  practicalSummaryReady: false,
  practicalSummaryLoading: false,
  practicalSummaryError: '',
  practicalUnitFilter: 'all',
  practicalSearchQuery: '',
  practicalStudyMode: 'sequential',
  practicalStudyIndex: 0,
  practicalRevealed: false,
  practicalRevealedBlanks: {},
  objectiveProgress: { by_set_id: {} },
  aiChatOpen: false,
  aiChatMessages: [
    { role: 'assistant', text: '궁금한 개념이나 지금 문제를 물어보세요.' },
  ],
  aiChatLoading: false,
  aiChatError: '',
  coreSummary: null,
  coreSummaryReady: false,
  coreSummaryLoading: false,
  coreSummaryError: '',
  coreSummarySubjectFilter: 'all',
  coreSummarySearchQuery: '',
  coreSummarySearchTimer: null,
  coreSummaryOpenSectionId: null,
  coreSummaryRevealedBlanks: {},
  practicalProgress: { by_item_id: {} },
  questionBankTopicCache: {},
  quizContext: null,
  currentUser: null,
  authError: '',
};

// ??? STORAGE ????????????????????????????????????????????????
const STORAGE_KEY = 'study_topics_v2';

function readJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Storage read failed: ${key}`, e);
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Storage write failed: ${key}`, e);
  }
}

function createEmptyProgress() {
  return {
    completedLectures: [],
    lastLectureId: null,
    objectiveProgress: { by_set_id: {}, updatedAt: null },
    updatedAt: null,
  };
}

function createEmptyPracticalProgress() {
  return {
    by_item_id: {},
    updatedAt: null,
  };
}

function hasProgressPayload(progress) {
  if (!progress) return false;
  const objectiveProgress = normalizeObjectiveProgress(progress.objectiveProgress || {
    by_set_id: progress.objectiveSets || {},
  });
  return (progress.completedLectures || []).length > 0
    || !!progress.lastLectureId
    || Object.keys(objectiveProgress.by_set_id).length > 0;
}

function applyProgressState(progress) {
  const safeProgress = progress || createEmptyProgress();
  state.completedLectures = new Set(safeProgress.completedLectures || []);
  state.lastLectureId = safeProgress.lastLectureId || null;
  state.objectiveProgress = normalizeObjectiveProgress(safeProgress.objectiveProgress || {
    by_set_id: safeProgress.objectiveSets || {},
  });
}

function normalizeObjectiveProgress(progress = {}) {
  const bySetId = progress.by_set_id || progress.bySetId || {};
  return {
    by_set_id: bySetId && typeof bySetId === 'object' ? bySetId : {},
    updatedAt: progress.updatedAt || null,
  };
}

function applyPracticalProgressState(progress) {
  const safeProgress = progress || createEmptyPracticalProgress();
  state.practicalProgress = {
    by_item_id: safeProgress.by_item_id || {},
    updatedAt: safeProgress.updatedAt || null,
  };
}

function normalizeUsername(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 20);
}

function normalizeDisplayName(value) {
  return normalizeUsername(value);
}

function buildUserLookupKey(value) {
  return normalizeUsername(value).toLocaleLowerCase();
}

function buildStableUserId(lookupKey) {
  return `name:${encodeURIComponent(lookupKey)}`;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name || user.username,
    lookup_key: user.lookup_key || buildUserLookupKey(user.display_name || user.username),
  };
}

function readAuthStore() {
  const store = readJsonStorage(AUTH_STORAGE_KEY, { users: [] });
  return {
    users: Array.isArray(store?.users) ? store.users : [],
  };
}

function writeAuthStore(store) {
  writeJsonStorage(AUTH_STORAGE_KEY, {
    users: Array.isArray(store?.users) ? store.users : [],
  });
}

function readProgressStore() {
  const store = readJsonStorage(USER_PROGRESS_STORAGE_KEY, { by_user_id: {} });
  return {
    by_user_id: store?.by_user_id || {},
  };
}

function readPracticalProgressStore() {
  const store = readJsonStorage(PRACTICAL_PROGRESS_STORAGE_KEY, { by_user_id: {} });
  return {
    by_user_id: store?.by_user_id || {},
  };
}

function writeProgressStore(store) {
  writeJsonStorage(USER_PROGRESS_STORAGE_KEY, {
    by_user_id: store?.by_user_id || {},
  });
}

function writePracticalProgressStore(store) {
  writeJsonStorage(PRACTICAL_PROGRESS_STORAGE_KEY, {
    by_user_id: store?.by_user_id || {},
  });
}

function getStoredProgressForUser(userId) {
  if (!userId) return createEmptyProgress();
  const store = readProgressStore();
  return store.by_user_id[userId] || createEmptyProgress();
}

function getStoredPracticalProgressForUser(userId) {
  if (!userId) return createEmptyPracticalProgress();
  const store = readPracticalProgressStore();
  return store.by_user_id[userId] || createEmptyPracticalProgress();
}

function mergeProgressPayload(primaryProgress, secondaryProgress) {
  const primary = primaryProgress || createEmptyProgress();
  const secondary = secondaryProgress || createEmptyProgress();
  const primaryObjective = normalizeObjectiveProgress(primary.objectiveProgress || {
    by_set_id: primary.objectiveSets || {},
  });
  const secondaryObjective = normalizeObjectiveProgress(secondary.objectiveProgress || {
    by_set_id: secondary.objectiveSets || {},
  });

  return {
    completedLectures: [...new Set([
      ...(secondary.completedLectures || []),
      ...(primary.completedLectures || []),
    ])],
    lastLectureId: primary.lastLectureId || secondary.lastLectureId || null,
    objectiveProgress: {
      by_set_id: {
        ...secondaryObjective.by_set_id,
        ...primaryObjective.by_set_id,
      },
      updatedAt: primaryObjective.updatedAt || secondaryObjective.updatedAt || null,
    },
    updatedAt: primary.updatedAt || secondary.updatedAt || new Date().toISOString(),
  };
}

function mergePracticalProgressPayload(primaryProgress, secondaryProgress) {
  const primary = primaryProgress || createEmptyPracticalProgress();
  const secondary = secondaryProgress || createEmptyPracticalProgress();
  return {
    by_item_id: {
      ...(secondary.by_item_id || {}),
      ...(primary.by_item_id || {}),
    },
    updatedAt: primary.updatedAt || secondary.updatedAt || new Date().toISOString(),
  };
}

function migrateUserStores(oldUserId, nextUserId) {
  if (!oldUserId || !nextUserId || oldUserId === nextUserId) return;

  const progressStore = readProgressStore();
  const oldProgress = progressStore.by_user_id[oldUserId];
  if (oldProgress) {
    const nextProgress = progressStore.by_user_id[nextUserId] || createEmptyProgress();
    progressStore.by_user_id[nextUserId] = mergeProgressPayload(nextProgress, oldProgress);
    delete progressStore.by_user_id[oldUserId];
    writeProgressStore(progressStore);
  }

  const practicalStore = readPracticalProgressStore();
  const oldPracticalProgress = practicalStore.by_user_id[oldUserId];
  if (oldPracticalProgress) {
    const nextPracticalProgress = practicalStore.by_user_id[nextUserId] || createEmptyPracticalProgress();
    practicalStore.by_user_id[nextUserId] = mergePracticalProgressPayload(nextPracticalProgress, oldPracticalProgress);
    delete practicalStore.by_user_id[oldUserId];
    writePracticalProgressStore(practicalStore);
  }
}

function normalizeAuthUserRecord(user, displayName = '') {
  if (!user) return false;
  const normalizedDisplayName = normalizeDisplayName(displayName || user.display_name || user.username);
  const lookupKey = buildUserLookupKey(normalizedDisplayName);
  const stableUserId = buildStableUserId(lookupKey);
  const previousUserId = user.user_id;
  let didChange = false;

  if (!user.user_id || user.user_id !== stableUserId) {
    user.previous_user_ids = [...new Set([
      ...(user.previous_user_ids || []),
      previousUserId,
    ].filter(Boolean))];
    user.user_id = stableUserId;
    migrateUserStores(previousUserId, stableUserId);
    didChange = true;
  }
  (user.previous_user_ids || [])
    .filter(previousId => previousId && previousId !== stableUserId)
    .forEach(previousId => migrateUserStores(previousId, stableUserId));
  if (user.lookup_key !== lookupKey) {
    user.lookup_key = lookupKey;
    didChange = true;
  }
  if (user.username !== lookupKey) {
    user.username = lookupKey;
    didChange = true;
  }
  if (user.display_name !== normalizedDisplayName) {
    user.display_name = normalizedDisplayName;
    didChange = true;
  }

  return didChange;
}

function loadSessionUser() {
  const session = readJsonStorage(AUTH_SESSION_KEY, null);
  if (!session?.user_id) return null;
  const authStore = readAuthStore();
  const user = authStore.users.find(user => user.user_id === session.user_id)
    || (session.lookup_key ? findUserByLookupKey(authStore, session.lookup_key) : null);
  if (!user) return null;

  const didChange = normalizeAuthUserRecord(user);
  if (didChange) {
    writeAuthStore(authStore);
  }

  const sanitizedUser = sanitizeUser(user);
  persistSessionUser(sanitizedUser);
  return sanitizedUser;
}

function persistSessionUser(user) {
  if (!user?.user_id) return;
  writeJsonStorage(AUTH_SESSION_KEY, {
    user_id: user.user_id,
    lookup_key: user.lookup_key || buildUserLookupKey(user.display_name || user.username),
    display_name: user.display_name || user.username,
  });
}

function clearSessionUser() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch (e) {
    console.warn('Session clear failed', e);
  }
}

function loadStorage() {
  if (!state.currentUser?.user_id) {
    applyProgressState(createEmptyProgress());
    return;
  }

  const progress = getStoredProgressForUser(state.currentUser.user_id);
  const hasUserProgress = hasProgressPayload(progress);
  if (!hasUserProgress) {
    const legacyProgress = readJsonStorage(STORAGE_KEY, null);
    const migrationRecord = readJsonStorage(LEGACY_PROGRESS_MIGRATION_KEY, null);
    const progressStore = readProgressStore();
    const canUseLegacyProgress = !migrationRecord
      && Object.keys(progressStore.by_user_id || {}).length === 0
      && hasProgressPayload(legacyProgress);
    if (canUseLegacyProgress) {
      const migrated = {
        completedLectures: legacyProgress.completedLectures || [],
        lastLectureId: legacyProgress.lastLectureId || null,
        objectiveProgress: normalizeObjectiveProgress(legacyProgress.objectiveProgress || {
          by_set_id: legacyProgress.objectiveSets || {},
        }),
        updatedAt: legacyProgress.updatedAt || new Date().toISOString(),
      };
      const store = readProgressStore();
      store.by_user_id[state.currentUser.user_id] = migrated;
      writeProgressStore(store);
      writeJsonStorage(LEGACY_PROGRESS_MIGRATION_KEY, {
        user_id: state.currentUser.user_id,
        migrated_at: new Date().toISOString(),
      });
      applyProgressState(migrated);
      return;
    }
  }

  applyProgressState(progress);
}

function loadPracticalProgress() {
  if (!state.currentUser?.user_id) {
    applyPracticalProgressState(createEmptyPracticalProgress());
    return;
  }

  applyPracticalProgressState(getStoredPracticalProgressForUser(state.currentUser.user_id));
}

function saveStorage() {
  if (!state.currentUser?.user_id) return;

  const payload = {
    completedLectures: [...state.completedLectures],
    lastLectureId: state.lastLectureId,
    objectiveProgress: normalizeObjectiveProgress(state.objectiveProgress),
    updatedAt: new Date().toISOString(),
  };
  const store = readProgressStore();
  store.by_user_id[state.currentUser.user_id] = payload;
  writeProgressStore(store);
}

function savePracticalProgress() {
  if (!state.currentUser?.user_id) return;

  const payload = {
    by_item_id: state.practicalProgress?.by_item_id || {},
    updatedAt: new Date().toISOString(),
  };
  const store = readPracticalProgressStore();
  store.by_user_id[state.currentUser.user_id] = payload;
  writePracticalProgressStore(store);
  applyPracticalProgressState(payload);
}

function findUserByLookupKey(authStore, lookupKey) {
  return authStore.users.find((user) => {
    const candidates = [
      user.lookup_key,
      user.username,
      user.display_name,
    ];
    return candidates.some(candidate => buildUserLookupKey(candidate) === lookupKey);
  });
}

function signInOrCreateUser(name) {
  const normalizedName = normalizeDisplayName(name);
  if (normalizedName.length < 2) {
    throw new Error('이름은 2자 이상 입력해 주세요.');
  }

  const authStore = readAuthStore();
  const lookupKey = buildUserLookupKey(normalizedName);
  const stableUserId = buildStableUserId(lookupKey);
  let user = findUserByLookupKey(authStore, lookupKey)
    || authStore.users.find(item => item.user_id === stableUserId);
  let didChangeStore = false;

  if (!user) {
    user = {
      user_id: stableUserId,
      username: lookupKey,
      lookup_key: lookupKey,
      display_name: normalizedName,
      created_at: new Date().toISOString(),
    };
    authStore.users.push(user);
    didChangeStore = true;
  } else {
    didChangeStore = normalizeAuthUserRecord(user, normalizedName) || didChangeStore;
  }

  if (didChangeStore) {
    writeAuthStore(authStore);
  }

  return sanitizeUser(user);
}

function completeLogin(user) {
  state.currentUser = sanitizeUser(user);
  state.authError = '';
  persistSessionUser(state.currentUser);
  loadStorage();
  loadPracticalProgress();
}

function logoutCurrentUser() {
  saveStorage();
  savePracticalProgress();
  clearSessionUser();
  state.currentUser = null;
  state.authError = '';
  applyProgressState(createEmptyProgress());
  applyPracticalProgressState(createEmptyPracticalProgress());
  state.currentLecture = null;
  state.currentLectureId = null;
  state.currentSegIdx = 0;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  state.quizQuestions = [];
  state.quizIndex = 0;
  state.quizRevealed = false;
  state.quizRevealedBlanks = {};
  state.quizSelectedChoiceLabel = null;
  state.quizSubmission = null;
  state.quizAnswers = {};
  state.quizResults = [];
  state.objectiveSubjectResult = null;
  state.objectiveSubjectReview = null;
  state.objectiveSubjectTimerBaselines = {};
  clearQuizTimer();
  navigate('auth');
}

// ??? DATA API ???????????????????????????????????????????????
async function fetchManifest() {
  const embeddedBundle = window[EMBEDDED_DATA_BUNDLE_KEY];
  if (embeddedBundle) {
    state.topicMap = embeddedBundle.topics || {};
    return (embeddedBundle.manifest?.items || []).filter(item => item.status === 'success');
  }

  const resp = await fetch(DATA_BUNDLE);
  if (!resp.ok) throw new Error('Failed to load topic bundle');
  const data = await resp.json();
  state.topicMap = data.topics || {};
  return (data.manifest?.items || []).filter(item => item.status === 'success');
}

async function fetchPracticeBundle() {
  const embeddedBundle = window[EMBEDDED_PRACTICE_BUNDLE_KEY];
  if (embeddedBundle) {
    return embeddedBundle;
  }

  const resp = await fetch(PRACTICE_BUNDLE);
  if (!resp.ok) {
    return { items: [] };
  }
  return resp.json();
}

async function fetchObjectiveSets() {
  const resp = await fetch(OBJECTIVE_SET_BUNDLE);
  if (!resp.ok) {
    if (resp.status === 404) return { sets: [] };
    throw new Error('객관식 세트를 불러오지 못했어요.');
  }
  return resp.json();
}

async function fetchPracticalSummary() {
  const resp = await fetch(PRACTICAL_SUMMARY_BUNDLE);
  if (!resp.ok) {
    if (resp.status === 404) return { source: { section_count: 0, item_count: 0 }, sections: [] };
    throw new Error('실기 정리 데이터를 불러오지 못했어요.');
  }
  return resp.json();
}

async function fetchCoreSummary() {
  const resp = await fetch(CORE_SUMMARY_BUNDLE);
  if (!resp.ok) {
    if (resp.status === 404) return { source: { section_count: 0, item_count: 0, page_count: 0 }, sections: [] };
    throw new Error('요약본 데이터를 불러오지 못했어요.');
  }
  return resp.json();
}

async function loadObjectiveSets(forceReload = false) {
  if (state.objectiveSetsReady && !forceReload) return;
  if (state.objectiveSetsLoading) return;

  state.objectiveSetsLoading = true;
  state.objectiveSetsError = '';
  if (state.currentPage === 'objective' || state.currentPage === 'wrong-note') {
    if (state.currentPage === 'wrong-note') renderObjectiveWrongNotePage();
    else renderObjectiveHub();
  }

  try {
    const data = await fetchObjectiveSets();
    state.objectiveSets = Array.isArray(data?.sets) ? data.sets : [];
    state.objectiveSetsReady = true;
  } catch (err) {
    state.objectiveSets = [];
    state.objectiveSetsReady = false;
    state.objectiveSetsError = err?.message || '객관식 세트를 불러오지 못했어요.';
  } finally {
    state.objectiveSetsLoading = false;
    if (state.currentPage === 'objective' || state.currentPage === 'wrong-note') {
      if (state.currentPage === 'wrong-note') renderObjectiveWrongNotePage();
      else renderObjectiveHub();
    }
  }
}

async function loadPracticalSummary(forceReload = false) {
  if (state.practicalSummaryReady && !forceReload) return;
  if (state.practicalSummaryLoading) return;

  state.practicalSummaryLoading = true;
  state.practicalSummaryError = '';
  if (state.currentPage === 'practical') renderPracticalSummary();

  try {
    const data = await fetchPracticalSummary();
    state.practicalSummary = {
      source: data?.source || { section_count: 0, item_count: 0 },
      sections: Array.isArray(data?.sections) ? data.sections : [],
    };
    state.practicalSummaryReady = true;
  } catch (err) {
    state.practicalSummary = null;
    state.practicalSummaryReady = false;
    state.practicalSummaryError = err?.message || '실기 정리 데이터를 불러오지 못했어요.';
  } finally {
    state.practicalSummaryLoading = false;
    if (state.currentPage === 'practical') renderPracticalSummary();
  }
}

async function loadCoreSummary(forceReload = false) {
  if (state.coreSummaryReady && !forceReload) return;
  if (state.coreSummaryLoading) return;

  state.coreSummaryLoading = true;
  state.coreSummaryError = '';
  if (state.currentPage === 'summaries') renderCoreSummary();

  try {
    const data = await fetchCoreSummary();
    state.coreSummary = {
      source: data?.source || { section_count: 0, item_count: 0, page_count: 0 },
      sections: Array.isArray(data?.sections) ? data.sections : [],
    };
    state.coreSummaryReady = true;
  } catch (err) {
    state.coreSummary = null;
    state.coreSummaryReady = false;
    state.coreSummaryError = err?.message || '요약본 데이터를 불러오지 못했어요.';
  } finally {
    state.coreSummaryLoading = false;
    if (state.currentPage === 'summaries') renderCoreSummary();
  }
}

async function fetchLecture(lectureId) {
  const lecture = state.topicMap?.[lectureId];
  if (!lecture) throw new Error('Topic not found');
  return lecture;
}

async function fetchQuestionBankTopic(topicFile) {
  if (state.questionBankTopicCache[topicFile]) {
    return state.questionBankTopicCache[topicFile];
  }

  const resp = await fetch(`${QUESTION_BANK_ROOT}${topicFile}`);
  if (!resp.ok) throw new Error(`문제 JSON을 불러오지 못했어요: ${topicFile}`);
  const data = await resp.json();
  state.questionBankTopicCache[topicFile] = data;
  return data;
}

async function loadAppData(forceReload = false) {
  if (state.dataReady && !forceReload) {
    return;
  }

  state.dataLoading = true;
  state.dataLoadError = '';
  render();

  try {
    const [manifest, practiceBundle] = await Promise.all([
      fetchManifest(),
      fetchPracticeBundle(),
    ]);
    state.manifest = manifest;
    state.subtopicPracticeMap = buildSubtopicPracticeMap(practiceBundle?.items || []);
    state.dataReady = true;
  } catch (err) {
    console.error('Failed to initialize', err);
    state.dataReady = false;
    state.dataLoadError = err?.message || '학습 데이터를 불러오지 못했어요.';
  } finally {
    state.dataLoading = false;
    render();
  }
}

// ??? HELPERS ????????????????????????????????????????????????
function getSubjectForItem(item) {
  return SUBJECTS.find(s => s.id === item.subject_id) || SUBJECTS[0];
}

function buildSubtopicPracticeKey(lectureId, subtopicIndex) {
  return `${lectureId}::${subtopicIndex}`;
}

function buildSubtopicPracticeMap(items) {
  const map = {};
  for (const item of (items || [])) {
    const lectureId = item?.lecture_topic_id;
    const subtopicIndex = item?.subtopic_index;
    if (!lectureId || !subtopicIndex) continue;
    map[buildSubtopicPracticeKey(lectureId, subtopicIndex)] = item;
  }
  return map;
}

function getSubtopicPractice(lectureId, subtopicIndex) {
  return state.subtopicPracticeMap[buildSubtopicPracticeKey(lectureId, subtopicIndex)] || null;
}

function getLectureManifestItem(lectureId) {
  return (state.manifest || []).find(item => item.lecture_id === lectureId) || null;
}

function getPracticeActivitiesByKind(practice, kind) {
  return (practice?.activities || []).filter(activity => activity?.kind === kind);
}

function countPracticeActivitiesByKind(practice, kind) {
  return getPracticeActivitiesByKind(practice, kind).length;
}

function hasObjectiveActivities(practice) {
  return countPracticeActivitiesByKind(practice, 'question_bank_ref') > 0;
}

function getObjectiveHubEntries() {
  const orderMap = new Map((state.manifest || []).map((item, index) => [item.lecture_id, index]));
  return Object.values(state.subtopicPracticeMap || {})
    .map((practice) => {
      const objectiveCount = countPracticeActivitiesByKind(practice, 'question_bank_ref');
      if (!objectiveCount) return null;

      const lecture = getLectureManifestItem(practice.lecture_topic_id);
      const subject = lecture ? getSubjectForItem(lecture) : SUBJECTS[0];
      const searchText = [
        practice.lecture_topic_title,
        practice.subtopic_title,
        lecture?.title,
        ...(practice.lecture_keywords || []),
      ].join(' ').toLowerCase();

      return {
        practice,
        lecture,
        subject,
        objectiveCount,
        sortOrder: orderMap.get(practice.lecture_topic_id) ?? Number.MAX_SAFE_INTEGER,
        searchText,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.sortOrder - right.sortOrder
      || left.practice.subtopic_index - right.practice.subtopic_index
    );
}

function buildQuestionBankAssetUrl(relativePath) {
  if (!relativePath) return '';
  return `${QUESTION_BANK_ROOT}${relativePath}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHighlightKeyword(keyword) {
  if (!keyword) return null;
  if (typeof keyword === 'string') {
    return {
      keyword,
      emphasis: 'secondary',
      color_token: 'secondary',
    };
  }
  if (!keyword.keyword) return null;
  return keyword;
}

function mergeHighlightKeywords(...groups) {
  const mergedByKey = new Map();
  for (const group of groups) {
    for (const item of (group || [])) {
      const normalized = normalizeHighlightKeyword(item);
      const keyword = normalized?.keyword?.trim();
      if (!keyword) continue;
      const key = keyword.toLowerCase();
      const existing = mergedByKey.get(key);
      if (!existing) {
        mergedByKey.set(key, {
          ...normalized,
          keyword,
        });
        continue;
      }

      const shouldPromoteToPrimary =
        existing.emphasis !== 'primary' && normalized.emphasis === 'primary';
      if (shouldPromoteToPrimary) {
        mergedByKey.set(key, {
          ...existing,
          ...normalized,
          keyword,
        });
      }
    }
  }
  return Array.from(mergedByKey.values());
}

function renderHighlightedText(text, highlightKeywords = []) {
  const rawText = String(text || '');
  const normalizedKeywords = mergeHighlightKeywords(highlightKeywords)
    .sort((left, right) => right.keyword.length - left.keyword.length);

  if (!rawText || !normalizedKeywords.length) {
    return escapeHtml(rawText);
  }

  const keywordMap = new Map(normalizedKeywords.map(item => [item.keyword.toLowerCase(), item]));
  const pattern = new RegExp(`(${normalizedKeywords.map(item => escapeRegExp(item.keyword)).join('|')})`, 'gi');
  const highlightedOnce = new Set();

  return rawText.split(pattern).map(fragment => {
    const matched = keywordMap.get(fragment.toLowerCase());
    if (!matched) {
      return escapeHtml(fragment);
    }
    const matchedKey = matched.keyword.toLowerCase();
    if (highlightedOnce.has(matchedKey)) {
      return escapeHtml(fragment);
    }
    highlightedOnce.add(matchedKey);
    const toneClass = matched.emphasis === 'primary'
      ? 'keyword-mark keyword-mark-primary'
      : 'keyword-mark keyword-mark-secondary';
    return `<span class="${toneClass}">${escapeHtml(fragment)}</span>`;
  }).join('');
}

const CLOZE_BLANK_PATTERN = /(\{\{blank\}\}|_{2,})/gi;

function getClozeBlankCount(prompt) {
  return (String(prompt || '').match(CLOZE_BLANK_PATTERN) || []).length;
}

function normalizeClozeAnswers(source = {}) {
  const rawAnswers = Array.isArray(source.answers)
    ? source.answers
    : Array.isArray(source.answer)
      ? source.answer
      : [source.answer];
  const answers = rawAnswers
    .map((answer) => {
      if (answer && typeof answer === 'object') {
        return cleanPracticalText(answer.answer || answer.acceptableAnswers?.[0] || '');
      }
      return cleanPracticalText(answer);
    })
    .filter(Boolean);

  if (answers.length) return answers;

  const fallback = cleanPracticalText(source.correct_answer || source.title || '');
  return fallback ? [fallback] : [];
}

function getRequiredBlankCount(prompt, answers = []) {
  return Math.max(getClozeBlankCount(prompt), answers.length, 1);
}

function isEveryBlankRevealed(prompt, answers, revealedBlanks = {}) {
  const blankCount = getRequiredBlankCount(prompt, answers);
  return Array.from({ length: blankCount }).every((_, index) => !!revealedBlanks[index]);
}

function renderBlankButton(index, answer, isRevealed, dataAttribute) {
  return `<button type="button" class="inline-blank ${isRevealed ? 'revealed' : ''}" ${dataAttribute}="${index}" aria-label="${isRevealed ? '공개된 빈칸' : '빈칸 답 보기'}"><span>${isRevealed ? escapeHtml(answer) : ''}</span></button>`;
}

function renderInteractiveClozePrompt(prompt, answers, revealedBlanks = {}, dataAttribute = 'data-cloze-blank') {
  const rawPrompt = String(prompt || '').trim();
  const normalizedAnswers = (answers || []).map(answer => cleanPracticalText(answer)).filter(Boolean);
  const matches = [...rawPrompt.matchAll(CLOZE_BLANK_PATTERN)];

  if (!matches.length) {
    const fallbackAnswer = normalizedAnswers[0] || '';
    return `${escapeHtml(rawPrompt)} ${renderBlankButton(0, fallbackAnswer, !!revealedBlanks[0], dataAttribute)}`;
  }

  let html = '';
  let lastIndex = 0;
  matches.forEach((match, index) => {
    const answer = normalizedAnswers[index] || normalizedAnswers[normalizedAnswers.length - 1] || '';
    html += escapeHtml(rawPrompt.slice(lastIndex, match.index));
    html += renderBlankButton(index, answer, !!revealedBlanks[index], dataAttribute);
    lastIndex = match.index + match[0].length;
  });
  html += escapeHtml(rawPrompt.slice(lastIndex));
  return html;
}

function getAllRevealedBlankMap(prompt, answers = []) {
  const blankCount = getRequiredBlankCount(prompt, answers);
  return Object.fromEntries(Array.from({ length: blankCount }, (_, index) => [index, true]));
}

function getSubtopicHighlightKeywords(subtopic) {
  return mergeHighlightKeywords(subtopic?.highlight_keywords, subtopic?.secondary_keywords);
}

function buildFallbackSubtopicPractice(lectureId, subtopic) {
  const blankCandidates = subtopic?.blank_quiz_candidates || [];
  if (!blankCandidates.length) return null;
  return {
    mapping_id: `${lectureId}__subtopic_${String(subtopic.subtopic_index).padStart(3, '0')}__fallback`,
    lecture_topic_id: lectureId,
    lecture_topic_title: subtopic.title,
    subtopic_index: subtopic.subtopic_index,
    subtopic_lecture_id: subtopic.lecture_id,
    subtopic_title: subtopic.title,
    trigger: 'after_subtopic',
    activities: blankCandidates.slice(0, 2).map((candidate, index) => ({
      activity_id: `${lectureId}__subtopic_${String(subtopic.subtopic_index).padStart(3, '0')}__blank_${String(index + 1).padStart(2, '0')}`,
      kind: 'fill_blank',
      type_label: '빈칸 추론 문제',
      prompt: candidate.prompt,
      answer: candidate.answer,
      original: candidate.original || candidate.prompt,
      explanation: candidate.explanation || '',
    })),
  };
}

function getSubtopicPracticeForContext(lectureId, subtopic) {
  return getSubtopicPractice(lectureId, subtopic?.subtopic_index) || buildFallbackSubtopicPractice(lectureId, subtopic);
}

function buildObjectiveQuestionPayload(baseQuestion, asset, sourceRef = {}) {
  const explanation = baseQuestion?.explanation || {};
  return {
    id: sourceRef.activity_id || sourceRef.question_id || baseQuestion?.question_id || '',
    kind: 'objective',
    type: sourceRef.type_label || '객관식 문제',
    question: baseQuestion?.question?.stem || sourceRef.question || '',
    choices: baseQuestion?.question?.choices || sourceRef.choices || [],
    answer: buildObjectiveAnswerText(baseQuestion),
    correctLabels: baseQuestion?.answer?.correct_labels || sourceRef.correct_labels || [],
    detailedSummary: explanation.detailed_summary || explanation.summary || explanation.source_text || sourceRef.explanation || '',
    explanation: explanation.summary || sourceRef.explanation || '',
    explanationSource: explanation.source_text || sourceRef.explanationSource || '',
    choiceAnalysis: explanation.choice_analysis || sourceRef.choice_analysis || [],
    solvingSteps: explanation.solving_steps || sourceRef.solving_steps || [],
    examTraps: explanation.exam_traps || sourceRef.exam_traps || [],
    answerChecklist: explanation.answer_checklist || sourceRef.answer_checklist || [],
    memoryCues: explanation.memory_cues || sourceRef.memory_cues || [],
    figure: asset?.relative_path ? {
      src: buildQuestionBankAssetUrl(asset.relative_path),
      alt: sourceRef.figure_alt || `${baseQuestion?.question?.stem || sourceRef.question || '문제'} 관련 그림`,
      width: asset.width,
      height: asset.height,
    } : null,
    sourceRef,
  };
}

function getSubjectLectures(subjectId) {
  if (!state.manifest) return [];
  return state.manifest.filter(l => l.subject_id === subjectId);
}

function getSubjectProgress(subjectId) {
  const lectures = getSubjectLectures(subjectId);
  if (lectures.length === 0) return 0;
  const done = lectures.filter(l => state.completedLectures.has(l.lecture_id)).length;
  return Math.round((done / lectures.length) * 100);
}

function getTotalProgress() {
  if (!state.manifest) return { done: 0, total: 0, pct: 0 };
  const total = state.manifest.length;
  const done = state.manifest.filter(l => state.completedLectures.has(l.lecture_id)).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ??? QUIZ GENERATION ????????????????????????????????????????
function generateQuiz(lecture) {
  const desiredCount = Math.min(16, Math.max(6, lecture.subtopics?.length || 1));
  const questions = [];
  const seenKeys = new Set();

  for (const subtopic of (lecture.subtopics || [])) {
    for (const candidate of (subtopic.blank_quiz_candidates || [])) {
      const question = (candidate.prompt || '').trim();
      const answer = (candidate.answer || '').trim();
      if (!question || !answer) continue;
      const dedupeKey = `${question}|||${answer}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      questions.push({
        id: candidate.candidate_id || `${lecture.lecture.lecture_id}-${subtopic.subtopic_index}-${questions.length + 1}`,
        kind: 'fill_blank',
        type: '빈칸 추론 문제',
        question,
        answer,
        original: candidate.original || question,
        explanation: candidate.explanation || '',
        sourceType: candidate.source_type || 'lecture_keyword',
        highlightKeyword: candidate.keyword || answer,
      });
      break;
    }
    if (questions.length >= desiredCount) break;
  }

  return questions.length > 0 ? questions : [{
    id: `${lecture.lecture.lecture_id}-fallback`,
    kind: 'fill_blank',
    type: '빈칸 추론 문제',
    question: '이 주제의 핵심 키워드는 ______ 입니다.',
    answer: lecture.lecture.title,
    original: lecture.summary?.overall_summary || lecture.lecture.title,
    explanation: '정답은 현재 학습 중인 주제 제목입니다.',
  }];
}

function getCurrentTheoryContext() {
  const lecture = state.currentLecture;
  if (!lecture) return null;

  const segments = lecture.segments || [];
  const subtopics = lecture.subtopics || [];
  const currentSeg = segments[state.currentSegIdx];
  if (!currentSeg) return null;

  const sentences = currentSeg.spoken_sentences || [];
  const currentSubtopic = subtopics.find(sub => sub.subtopic_index === currentSeg.subtopic_index)
    || { subtopic_index: currentSeg.subtopic_index || 1, title: currentSeg.subtopic_title || lecture.lecture.title, youtube_url_normalized: currentSeg.youtube_url_normalized || '' };
  const nextSeg = segments[state.currentSegIdx + 1] || null;
  const isLastSentence = state.currentSentIdx >= sentences.length;
  const isLastSegment = state.currentSegIdx >= segments.length - 1;
  const isSubtopicBoundary = isLastSentence && (!nextSeg || nextSeg.subtopic_index !== currentSubtopic.subtopic_index);

  return {
    lecture,
    segments,
    subtopics,
    currentSeg,
    currentSubtopic,
    nextSeg,
    nextSegmentIndex: nextSeg ? state.currentSegIdx + 1 : null,
    isLastSentence,
    isLastSegment,
    isSubtopicBoundary,
  };
}

function buildObjectiveAnswerText(question) {
  const label = question.answer?.correct_labels?.[0];
  const text = question.answer?.answer_text || question.answer?.correct_choice_texts?.[0] || '';
  if (label && text) return `${label}번 · ${text}`;
  return text || (label ? `${label}번` : '');
}

function normalizeObjectiveSetFigure(question) {
  const figure = question?.figure || question?.visual_asset || null;
  if (!figure || typeof figure !== 'object') return null;

  const src = figure.src || figure.relative_path || figure.path || '';
  if (!src) return null;

  return {
    src,
    alt: figure.alt || `${question?.question || '객관식 문제'} 관련 그림`,
    width: figure.width,
    height: figure.height,
  };
}

function buildObjectiveSetQuestionPayload(set, question, index) {
  const choices = (question.choices || []).map(choice => {
    const source = Array.isArray(choice)
      ? { label: choice[0], text: choice[1] }
      : choice;
    return {
      label: String(source?.label || ''),
      text: String(source?.text || ''),
    };
  }).filter(choice => choice.label && choice.text);
  const correctLabels = (question.correctLabels || question.correct_labels || [])
    .map(label => String(label));
  const answerLabel = correctLabels[0] || String(question.answerLabel || '');
  const answerChoice = choices.find(choice => choice.label === answerLabel);
  const answerText = question.answer
    || (answerChoice ? `${answerChoice.label}번 · ${answerChoice.text}` : `${answerLabel}번`);
  const questionType = getObjectiveQuestionType(set, question);

  return {
    id: question.id || `${set.id || 'objective-set'}-${index + 1}`,
    kind: 'objective',
    type: questionType,
    question: question.question || '',
    choices,
    answer: answerText,
    correctLabels: correctLabels.length ? correctLabels : [answerLabel].filter(Boolean),
    detailedSummary: question.explanation || '',
    explanation: question.explanation || '',
    figure: normalizeObjectiveSetFigure(question),
    sourceRef: {
      objective_set_id: set.id,
      objective_set_title: set.title,
      subject: questionType,
      question_number: question.number || index + 1,
    },
  };
}

function buildObjectiveSetQuestions(set) {
  return (set?.questions || [])
    .map((question, index) => buildObjectiveSetQuestionPayload(set, question, index))
    .filter(question => question.question && question.choices.length && question.correctLabels.length);
}

function getObjectiveSetQuestionCount(set) {
  return Array.isArray(set?.questions) ? set.questions.length : 0;
}

function getObjectiveProgressMap() {
  if (!state.objectiveProgress || typeof state.objectiveProgress !== 'object') {
    state.objectiveProgress = { by_set_id: {} };
  }
  if (!state.objectiveProgress.by_set_id || typeof state.objectiveProgress.by_set_id !== 'object') {
    state.objectiveProgress.by_set_id = {};
  }
  return state.objectiveProgress.by_set_id;
}

function getObjectiveSetProgress(setId) {
  if (!setId) return null;
  return getObjectiveProgressMap()[setId] || null;
}

function getObjectiveWrongMap(setId) {
  const progress = getObjectiveSetProgress(setId);
  const wrongMap = progress?.wrongByQuestionId || {};
  return wrongMap && typeof wrongMap === 'object' ? wrongMap : {};
}

function saveObjectiveSetProgress(setId, patch = {}) {
  if (!setId) return;
  const now = new Date().toISOString();
  const bySetId = {
    ...getObjectiveProgressMap(),
  };
  bySetId[setId] = {
    ...(bySetId[setId] || {}),
    ...patch,
    updatedAt: now,
  };
  state.objectiveProgress = {
    by_set_id: bySetId,
    updatedAt: now,
  };
  saveStorage();
}

function getObjectiveSetResumeState(setId, totalQuestions) {
  const progress = getObjectiveSetProgress(setId);
  if (!progress || progress.completed) return null;
  if (Number(progress.totalQuestions || totalQuestions) !== Number(totalQuestions)) return null;

  const answers = progress.answers && typeof progress.answers === 'object' ? progress.answers : {};
  const hasAnswers = Object.values(answers).some(Boolean);
  const savedIndex = Math.max(0, Math.min(Number(progress.currentIndex || 0), totalQuestions));
  const firstUnansweredIndex = Array.from({ length: totalQuestions })
    .findIndex((_, index) => !answers[getObjectiveAnswerKey(null, index)]);
  const currentIndex = Math.max(0, Math.min(
    firstUnansweredIndex >= 0 ? firstUnansweredIndex : savedIndex,
    totalQuestions
  ));
  if (currentIndex >= totalQuestions) return null;
  if (currentIndex <= 0 && !hasAnswers) return null;

  const score = progress.score || {};
  return {
    currentIndex,
    answers,
    elapsedSeconds: Math.max(0, Number(progress.elapsedSeconds || 0)),
    score: {
      correct: Math.max(0, Number(score.correct || 0)),
      incorrect: Math.max(0, Number(score.incorrect || 0)),
    },
  };
}

function getObjectiveQuestionNumber(question, fallbackNumber = 0) {
  return Number(question?.sourceRef?.question_number || question?.number || fallbackNumber || 0);
}

function getObjectiveQuestionKey(question) {
  return String(question?.id || question?.sourceRef?.question_id || getObjectiveQuestionNumber(question) || '');
}

function getObjectivePeriodNumber(question, fallbackIndex = 0) {
  const questionNumber = getObjectiveQuestionNumber(question, fallbackIndex + 1);
  if (!questionNumber) return null;
  return Math.max(1, Math.min(5, Math.ceil(questionNumber / 20)));
}

function getCurrentObjectiveSet() {
  const setId = state.quizContext?.setId;
  if (!setId) return null;
  return state.objectiveSets.find(set => set.id === setId) || null;
}

function getObjectiveSubjectTitle(subjectNumber, question = null, fallbackIndex = 0, set = getCurrentObjectiveSet()) {
  const questionNumber = getObjectiveQuestionNumber(question, fallbackIndex + 1);
  const sections = Array.isArray(set?.sections) ? set.sections : [];
  const section = sections.find(item => {
    const from = Number(item?.from || 0);
    const to = Number(item?.to || 0);
    return from && to && questionNumber >= from && questionNumber <= to;
  }) || sections.find(item => String(item?.title || '').startsWith(`${subjectNumber}과목`));
  if (section?.title) return section.title;

  const subject = SUBJECTS.find(item => item.id === subjectNumber);
  return subject ? `${subjectNumber}과목 ${subject.name}` : `${subjectNumber}과목`;
}

function buildObjectiveSubjectScoreEntries(results = null, options = {}) {
  const questions = Array.isArray(options.questions) ? options.questions : (state.quizQuestions || []);
  if (!questions.length) return [];

  const set = options.set || getCurrentObjectiveSet();
  const resultList = Array.isArray(results) ? results : null;
  const buckets = new Map();

  questions.forEach((question, index) => {
    const subjectNumber = getObjectivePeriodNumber(question, index) || 1;
    if (!buckets.has(subjectNumber)) {
      buckets.set(subjectNumber, {
        subjectNumber,
        title: getObjectiveSubjectTitle(subjectNumber, question, index, set),
        total: 0,
        answered: 0,
        correct: 0,
      });
    }

    const bucket = buckets.get(subjectNumber);
    const result = resultList ? resultList[index] : null;
    const selectedLabel = resultList
      ? String(result?.selectedLabel || '')
      : getObjectiveSelectedLabel(question, index);
    const isAnswered = !!selectedLabel;
    const isCorrect = resultList
      ? !!result?.isCorrect
      : isAnswered && (question.correctLabels || []).includes(selectedLabel);

    bucket.total += 1;
    if (isAnswered) bucket.answered += 1;
    if (isCorrect) bucket.correct += 1;
  });

  return [...buckets.values()]
    .sort((left, right) => left.subjectNumber - right.subjectNumber)
    .map(entry => {
      const total = Math.max(0, Number(entry.total || 0));
      const answered = Math.max(0, Math.min(Number(entry.answered || 0), total));
      const correct = Math.max(0, Math.min(Number(entry.correct || 0), total));
      const incorrect = resultList ? Math.max(0, total - correct) : Math.max(0, answered - correct);
      const unanswered = Math.max(0, total - answered);
      return {
        subjectNumber: entry.subjectNumber,
        title: entry.title,
        shortTitle: `${entry.subjectNumber}과목`,
        total,
        answered,
        correct,
        incorrect,
        unanswered,
        completed: total > 0 && answered >= total,
        pct: total > 0 ? Math.round((correct / total) * 100) : 0,
      };
    });
}

function renderObjectiveLiveSubjectScores() {
  if (state.quizContext?.mode !== 'objective_set') return '';

  const completedScores = buildObjectiveSubjectScoreEntries()
    .filter(entry => entry.completed);
  if (!completedScores.length) return '';

  return `
    <div class="quiz-subject-score-strip" aria-label="완료한 과목 점수">
      ${completedScores.map(entry => `
        <span>
          <strong>${escapeHtml(entry.shortTitle)}</strong>
          ${entry.pct}점
          <em>${entry.correct}/${entry.total}</em>
        </span>
      `).join('')}
    </div>
  `;
}

function renderObjectiveSavedSubjectScores(progress) {
  const scores = Array.isArray(progress?.subjectScores) ? progress.subjectScores : [];
  if (!scores.length) return '';

  return `
    <div class="objective-subject-score-list" aria-label="최근 과목별 점수">
      ${scores.map(entry => `
        <span>
          <strong>${escapeHtml(entry.shortTitle || `${entry.subjectNumber || ''}과목`)}</strong>
          ${Math.max(0, Number(entry.pct || 0))}점
        </span>
      `).join('')}
    </div>
  `;
}

function renderObjectiveSubjectResultScores() {
  if (state.quizContext?.mode !== 'objective_set') return '';

  const scores = buildObjectiveSubjectScoreEntries(state.quizResults);
  if (scores.length <= 1) return '';

  return `
    <div class="quiz-subject-result">
      <div class="quiz-subject-result-head">
        <span>과목별 점수</span>
        <strong>${scores.length}과목</strong>
      </div>
      <div class="quiz-subject-result-list">
        ${scores.map(entry => `
          <div class="quiz-subject-result-row">
            <div>
              <span>${escapeHtml(entry.shortTitle)}</span>
              <strong>${escapeHtml(entry.title)}</strong>
              <small>정답 ${entry.correct}/${entry.total}${entry.unanswered ? ` · 미답 ${entry.unanswered}` : ''}</small>
            </div>
            <em>${entry.pct}점</em>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getObjectiveAnswerKey(question, index = state.quizIndex) {
  return `q${Math.max(0, Number(index || 0))}`;
}

function isObjectiveExamSession() {
  return Array.isArray(state.quizQuestions)
    && state.quizQuestions.length > 0
    && state.quizQuestions.every(question => question?.kind === 'objective');
}

function getObjectiveSelectedLabel(question, index = state.quizIndex) {
  const key = getObjectiveAnswerKey(question, index);
  return state.quizAnswers?.[key] || '';
}

function getObjectiveAnsweredCount() {
  if (!isObjectiveExamSession()) return 0;
  return state.quizQuestions.reduce((count, question, index) =>
    count + (getObjectiveSelectedLabel(question, index) ? 1 : 0), 0);
}

function isObjectiveSubjectReviewMode() {
  return !!state.objectiveSubjectReview
    && !!state.objectiveSubjectResult
    && isObjectiveExamSession();
}

function getObjectiveSubjectReviewRecord(question, index = state.quizIndex) {
  const result = state.objectiveSubjectResult;
  if (!result || !Array.isArray(result.records)) return null;

  const resultKey = getObjectiveAnswerKey(question, index);
  const questionKey = getObjectiveQuestionKey(question);
  const questionNumber = getObjectiveQuestionNumber(question, index + 1);
  return result.records.find(record =>
    String(record.resultKey || '') === resultKey
    || (questionKey && String(record.questionId || '') === questionKey)
    || (questionNumber && Number(record.questionNumber || 0) === Number(questionNumber))
  ) || null;
}

function getObjectiveSubjectId(question) {
  const period = getObjectivePeriodNumber(question, state.quizIndex);
  if (period) return period;

  const subjectText = String(question?.type || question?.sourceRef?.subject || '').toLowerCase();
  const subject = SUBJECTS.find(item => subjectText.includes(String(item.name || '').toLowerCase()));
  return subject?.id || null;
}

function getObjectiveTheoryTarget(question) {
  const sourceRef = question?.sourceRef || {};
  const lectureId = sourceRef.lecture_topic_id || sourceRef.question_bank_topic_id;
  if (lectureId && state.topicMap?.[lectureId]) {
    return {
      mode: 'lecture',
      lectureId,
      subtopicIndex: Number(sourceRef.subtopic_index || 0) || null,
      label: sourceRef.subtopic_index ? '관련 이론 바로 보기' : '관련 이론 보기',
    };
  }

  const subjectId = getObjectiveSubjectId(question);
  const subject = SUBJECTS.find(item => item.id === subjectId);
  if (subject) {
    return {
      mode: 'subject',
      subjectId,
      label: `${subject.name} 강의 목록 보기`,
    };
  }

  return null;
}

function getObjectivePeriodJumpIndex(period) {
  const targetPeriod = Number(period);
  if (!targetPeriod) return -1;
  return state.quizQuestions.findIndex((question, index) =>
    getObjectivePeriodNumber(question, index) === targetPeriod
  );
}

function renderObjectivePeriodStrip(question) {
  if (
    state.quizContext?.mode !== 'objective_set'
    && state.quizContext?.mode !== 'objective_wrong_set'
  ) return '';

  const currentPeriod = getObjectivePeriodNumber(question, state.quizIndex);
  const disableJump = isObjectiveSubjectReviewMode();
  return `
    <div class="quiz-period-strip" aria-label="객관식 과목">
      ${[1, 2, 3, 4, 5].map((period) => {
        const targetIndex = getObjectivePeriodJumpIndex(period);
        const isAvailable = targetIndex >= 0;
        const isActive = period === currentPeriod;
        return `
          <button
            class="quiz-period-chip ${isActive ? 'active' : ''}"
            type="button"
            data-objective-period-jump="${period}"
            ${isActive ? 'aria-current="true"' : ''}
            ${isAvailable && !disableJump ? '' : 'disabled'}
          >
            ${period}과목
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
}

function formatDurationKorean(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes <= 0) return `${restSeconds}초`;
  if (restSeconds <= 0) return `${minutes}분`;
  return `${minutes}분 ${restSeconds}초`;
}

function getQuizElapsedSeconds() {
  if (!state.quizStartedAt) return Math.max(0, Number(state.quizElapsedSeconds || 0));
  return Math.max(0, Math.floor((Date.now() - state.quizStartedAt) / 1000));
}

function updateQuizTimerDisplay() {
  const timer = document.getElementById('quiz-timer-value');
  if (timer) timer.textContent = formatDuration(getQuizElapsedSeconds());
}

function clearQuizTimer() {
  if (state.quizTimerId) {
    clearInterval(state.quizTimerId);
    state.quizTimerId = null;
  }
}

function startQuizTimer() {
  if (!isObjectiveExamSession()) return;
  if (!state.quizStartedAt) {
    const resumeSeconds = Math.max(0, Number(state.quizElapsedSeconds || 0));
    state.quizStartedAt = Date.now() - (resumeSeconds * 1000);
  }
  updateQuizTimerDisplay();
  if (!state.quizTimerId) {
    state.quizTimerId = setInterval(updateQuizTimerDisplay, 1000);
  }
}

function ensureObjectiveSubjectTimer(question, index = state.quizIndex) {
  if (state.quizContext?.mode !== 'objective_set' || !isObjectiveExamSession()) return;

  const subjectNumber = getObjectivePeriodNumber(question, index);
  if (!subjectNumber) return;
  if (!state.objectiveSubjectTimerBaselines || typeof state.objectiveSubjectTimerBaselines !== 'object') {
    state.objectiveSubjectTimerBaselines = {};
  }

  const subjectKey = String(subjectNumber);
  if (state.objectiveSubjectTimerBaselines[subjectKey] == null) {
    state.objectiveSubjectTimerBaselines[subjectKey] = getQuizElapsedSeconds();
  }
}

function getObjectiveSubjectElapsedSeconds(subjectNumber) {
  const baselines = state.objectiveSubjectTimerBaselines || {};
  const baseline = Math.max(0, Number(baselines[String(subjectNumber)] || 0));
  return Math.max(0, getQuizElapsedSeconds() - baseline);
}

function getObjectiveSubjectRange(subjectNumber) {
  if (!isObjectiveExamSession()) return null;

  const indexes = state.quizQuestions
    .map((question, index) => ({ question, index }))
    .filter(entry => getObjectivePeriodNumber(entry.question, entry.index) === subjectNumber)
    .map(entry => entry.index);
  if (!indexes.length) return null;

  const startIndex = Math.min(...indexes);
  const endIndex = Math.max(...indexes);
  return {
    subjectNumber,
    startIndex,
    endIndex,
    nextIndex: endIndex + 1,
    total: indexes.length,
  };
}

function isObjectiveSubjectBoundaryIndex(index = state.quizIndex) {
  if (state.quizContext?.mode !== 'objective_set' || !isObjectiveExamSession()) return false;
  const currentQuestion = state.quizQuestions[index];
  const nextQuestion = state.quizQuestions[index + 1];
  if (!currentQuestion || !nextQuestion) return false;

  const currentSubject = getObjectivePeriodNumber(currentQuestion, index);
  const nextSubject = getObjectivePeriodNumber(nextQuestion, index + 1);
  return !!currentSubject && !!nextSubject && currentSubject !== nextSubject;
}

function getObjectiveSubjectUnansweredCount(subjectNumber) {
  const range = getObjectiveSubjectRange(subjectNumber);
  if (!range) return 0;

  let unanswered = 0;
  for (let index = range.startIndex; index <= range.endIndex; index += 1) {
    const question = state.quizQuestions[index];
    if (!getObjectiveSelectedLabel(question, index)) unanswered += 1;
  }
  return unanswered;
}

function buildObjectiveSubjectCheckpointResult(subjectNumber) {
  const range = getObjectiveSubjectRange(subjectNumber);
  if (!range) return null;

  const set = getCurrentObjectiveSet();
  const records = [];
  for (let index = range.startIndex; index <= range.endIndex; index += 1) {
    const question = state.quizQuestions[index];
    const selectedLabel = getObjectiveSelectedLabel(question, index);
    const isCorrect = !!selectedLabel && (question.correctLabels || []).includes(selectedLabel);
    const record = buildObjectiveResultRecord(question, selectedLabel, isCorrect, index);
    record.resultKey = getObjectiveAnswerKey(question, index);
    records.push(record);
  }

  const correct = records.filter(record => record.isCorrect).length;
  const total = records.length;
  const answered = records.filter(record => record.selectedLabel).length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const firstQuestion = state.quizQuestions[range.startIndex];

  return {
    ...range,
    title: getObjectiveSubjectTitle(subjectNumber, firstQuestion, range.startIndex, set),
    shortTitle: `${subjectNumber}과목`,
    records,
    wrongResults: records.filter(record => !record.isCorrect),
    correct,
    incorrect: total - correct,
    answered,
    unanswered: Math.max(0, total - answered),
    score,
    elapsedSeconds: getObjectiveSubjectElapsedSeconds(subjectNumber),
    showWrongList: false,
    savedToNotebook: false,
  };
}

function pauseObjectiveExamTimer() {
  state.quizElapsedSeconds = getQuizElapsedSeconds();
  state.quizStartedAt = null;
  clearQuizTimer();
}

function showObjectiveSubjectResultForCurrentQuestion() {
  if (!isObjectiveSubjectBoundaryIndex(state.quizIndex)) {
    goToObjectiveExamQuestion(state.quizIndex + 1);
    return;
  }

  const subjectNumber = getObjectivePeriodNumber(state.quizQuestions[state.quizIndex], state.quizIndex);
  const result = buildObjectiveSubjectCheckpointResult(subjectNumber);
  if (!result) {
    goToObjectiveExamQuestion(state.quizIndex + 1);
    return;
  }

  pauseObjectiveExamTimer();
  state.objectiveSubjectResult = result;
  state.objectiveSubjectReview = null;
  persistCurrentObjectiveSetProgress({
    currentIndex: result.nextIndex,
    answers: state.quizAnswers,
    elapsedSeconds: state.quizElapsedSeconds,
    completed: false,
  });
  renderObjectiveSubjectCheckpoint();
}

function saveObjectiveSubjectResultToNotebook(result = state.objectiveSubjectResult) {
  if (!result || state.quizContext?.mode !== 'objective_set' || !state.quizContext?.setId) return false;

  const progress = getObjectiveSetProgress(state.quizContext.setId) || {};
  const wrongByQuestionId = { ...(progress.wrongByQuestionId || {}) };
  for (const record of result.records || []) {
    const questionKey = record.questionId || String(record.questionNumber || '');
    if (!questionKey) continue;
    if (record.isCorrect) {
      delete wrongByQuestionId[questionKey];
    } else {
      wrongByQuestionId[questionKey] = {
        questionId: questionKey,
        questionNumber: record.questionNumber,
        questionText: record.questionText,
        selectedLabel: record.selectedLabel,
        correctLabels: record.correctLabels || [],
        answer: record.answer || '',
        explanation: record.explanation || '',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const subjectScore = {
    subjectNumber: result.subjectNumber,
    title: result.title,
    shortTitle: result.shortTitle,
    total: result.total,
    answered: result.answered,
    correct: result.correct,
    incorrect: result.incorrect,
    unanswered: result.unanswered,
    pct: result.score,
    elapsedSeconds: result.elapsedSeconds,
  };
  const subjectScores = [
    ...(Array.isArray(progress.subjectScores) ? progress.subjectScores : [])
      .filter(entry => Number(entry?.subjectNumber || 0) !== Number(result.subjectNumber)),
    subjectScore,
  ].sort((left, right) => Number(left.subjectNumber || 0) - Number(right.subjectNumber || 0));

  const lastRecord = result.records?.[result.records.length - 1] || null;
  saveObjectiveSetProgress(state.quizContext.setId, {
    wrongByQuestionId,
    subjectScores,
    totalQuestions: state.quizQuestions.length,
    currentIndex: Math.max(Number(progress.currentIndex || 0), result.nextIndex),
    completed: false,
    answers: { ...(state.quizAnswers || {}) },
    elapsedSeconds: state.quizElapsedSeconds,
    lastQuestionId: lastRecord?.questionId || null,
    lastQuestionNumber: lastRecord?.questionNumber || null,
    lastQuestionText: lastRecord?.questionText || '',
    lastQuestionType: lastRecord?.type || '',
    lastWasCorrect: lastRecord?.isCorrect ?? null,
  });

  state.objectiveSubjectResult = {
    ...result,
    savedToNotebook: true,
  };
  return true;
}

function renderObjectiveSetProgress(set) {
  const progress = getObjectiveSetProgress(set.id);
  if (!progress) return '';

  const total = getObjectiveSetQuestionCount(set);
  const currentIndex = Math.max(0, Math.min(Number(progress.currentIndex || 0), total));
  const answers = progress.answers && typeof progress.answers === 'object' ? progress.answers : {};
  const answeredCount = Object.values(answers).filter(Boolean).length;
  if (currentIndex <= 0 && !answeredCount && !progress.completed) return '';
  const firstUnansweredIndex = Array.from({ length: total })
    .findIndex((_, index) => !answers[getObjectiveAnswerKey(null, index)]);
  const nextIndex = progress.completed
    ? total
    : Math.max(0, Math.min(firstUnansweredIndex >= 0 ? firstUnansweredIndex : currentIndex, total - 1));
  const activePosition = progress.completed ? total : Math.min(total, nextIndex + 1);
  const visibleProgress = Math.max(currentIndex, answeredCount, activePosition);
  const pct = total > 0 ? Math.round((visibleProgress / total) * 100) : 0;
  const score = progress.score || {};
  const label = progress.completed
    ? `완료 · 정답 ${Number(score.correct || 0)}/${total}`
    : `이어풀기 ${activePosition}/${total} · 답안 ${answeredCount}/${total}`;
  const subjectScoreHtml = renderObjectiveSavedSubjectScores(progress);
  const lastQuestionText = String(progress.lastQuestionText || '').trim();
  const lastQuestionNumber = Number(progress.lastQuestionNumber || 0);
  const lastQuestionHtml = lastQuestionNumber || lastQuestionText ? `
    <div class="objective-last-question">
      <span>마지막 풀이</span>
      <strong>${lastQuestionNumber ? `${lastQuestionNumber}번` : '최근 문제'}</strong>
      ${lastQuestionText ? `<p>${escapeHtml(lastQuestionText)}</p>` : ''}
    </div>
  ` : '';

  return `
    <div class="objective-item-progress">
      <div class="objective-item-progress-head">
        <span>${escapeHtml(label)}</span>
        ${progress.completed ? '<strong>다시 풀기</strong>' : '<strong>이어 풀기</strong>'}
      </div>
      <div class="objective-item-progress-bar">
        <div style="width:${pct}%"></div>
      </div>
      ${subjectScoreHtml}
      ${lastQuestionHtml}
    </div>
  `;
}

function getObjectiveResumeEntries(objectiveSets = state.objectiveSets || []) {
  return objectiveSets.map((set) => {
    const progress = getObjectiveSetProgress(set.id);
    const total = getObjectiveSetQuestionCount(set);
    const currentIndex = Math.max(0, Math.min(Number(progress?.currentIndex || 0), total));
    const answeredCount = Object.values(progress?.answers || {}).filter(Boolean).length;
    if (!progress || progress.completed || currentIndex >= total || (currentIndex <= 0 && !answeredCount)) {
      return null;
    }

    const nextQuestion = set.questions?.[currentIndex] || null;
    const nextQuestionNumber = Number(nextQuestion?.number || currentIndex + 1);
    return {
      set,
      progress,
      total,
      currentIndex,
      nextQuestion,
      nextQuestionNumber,
      updatedAt: progress.updatedAt || '',
    };
  }).filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function getLatestObjectiveResumeEntry(objectiveSets = state.objectiveSets || []) {
  return getObjectiveResumeEntries(objectiveSets)[0] || null;
}

function renderObjectiveResumeCard(entry) {
  if (!entry) return '';

  const nextQuestionTitle = String(entry.nextQuestion?.question || '').trim();
  const lastQuestionNumber = Number(entry.progress.lastQuestionNumber || entry.currentIndex);
  const period = getObjectivePeriodNumber(entry.nextQuestion, entry.currentIndex);

  return `
    <button class="objective-resume-card" type="button" data-objective-resume="${escapeHtml(entry.set.id)}">
      <div class="objective-resume-top">
        <span>마지막 객관식 이어풀기</span>
        <strong>${period ? `${period}과목` : '객관식'}</strong>
      </div>
      <div class="objective-resume-title">${escapeHtml(entry.set.title || '객관식 문제 세트')}</div>
      <div class="objective-resume-meta">
        마지막 풀이 ${lastQuestionNumber}번 · 이어서 ${entry.nextQuestionNumber}번부터
      </div>
      ${nextQuestionTitle ? `<div class="objective-resume-question">${escapeHtml(nextQuestionTitle)}</div>` : ''}
    </button>
  `;
}

function getObjectiveWrongEntries(objectiveSets = state.objectiveSets || []) {
  const entries = [];
  for (const set of objectiveSets) {
    const wrongMap = getObjectiveWrongMap(set.id);
    const questions = set.questions || [];
    for (const [questionId, record] of Object.entries(wrongMap)) {
      const question = questions.find(item => String(item.id || item.question_id || item.number) === String(questionId));
      if (!question) continue;
      entries.push({
        set,
        question,
        record,
        updatedAt: record.updatedAt || '',
      });
    }
  }
  return entries.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function renderObjectiveWrongReviewCard(entries) {
  if (!entries.length) return '';
  const latest = entries[0];
  const latestNumber = Number(latest.question.number || latest.record.questionNumber || 0);
  return `
    <button class="objective-wrong-card" type="button" data-objective-wrong-review="all">
      <div class="objective-wrong-top">
        <span>틀린 문제 다시 보기</span>
        <strong>${entries.length}문제</strong>
      </div>
      <div class="objective-wrong-title">오답만 모아서 다시 풀기</div>
      <div class="objective-wrong-meta">
        최근 오답 ${latestNumber ? `${latestNumber}번` : '문제'} · 맞히면 오답 목록에서 빠져요
      </div>
      <div class="objective-wrong-question">${escapeHtml(latest.question.question || latest.record.questionText || '')}</div>
    </button>
  `;
}

function getFrequentObjectiveWrongEntries(objectiveSets = state.objectiveSets || []) {
  const entries = [];
  for (const set of objectiveSets) {
    const progress = getObjectiveSetProgress(set.id);
    const statsMap = progress?.statsByQuestionId || {};
    const questions = set.questions || [];
    for (const [questionId, stats] of Object.entries(statsMap)) {
      const incorrect = Math.max(0, Number(stats?.incorrect || 0));
      if (!incorrect) continue;
      const question = questions.find(item => String(item.id || item.question_id || item.number) === String(questionId));
      if (!question) continue;
      entries.push({
        set,
        question,
        stats,
        incorrect,
        attempts: Math.max(0, Number(stats?.attempts || 0)),
        updatedAt: stats.lastAttemptAt || '',
      });
    }
  }

  return entries.sort((left, right) =>
    (right.incorrect - left.incorrect)
    || String(right.updatedAt).localeCompare(String(left.updatedAt))
  );
}

function renderObjectiveFrequentWrongCard(entries) {
  if (!entries.length) return '';
  const topEntries = entries.slice(0, 3);
  return `
    <div class="objective-insight-card">
      <div class="objective-insight-head">
        <span>자주 틀린 문제</span>
        <strong>${entries.length}개</strong>
      </div>
      <div class="objective-insight-list">
        ${topEntries.map(entry => `
          <div class="objective-insight-item">
            <div class="objective-insight-meta">
              ${escapeHtml(entry.set.title || '객관식 세트')} · ${entry.question.number || entry.stats.questionNumber || ''}번 · 오답 ${entry.incorrect}회
            </div>
            <p>${escapeHtml(entry.question.question || entry.stats.questionText || '')}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderObjectiveWrongNotebook(entries) {
  if (!entries.length) return '';
  return `
    <div class="objective-notebook">
      <div class="objective-notebook-head">
        <span>오답노트</span>
        <strong>최근 ${Math.min(entries.length, 5)}문제</strong>
      </div>
      <div class="objective-notebook-list">
        ${entries.slice(0, 5).map((entry) => {
          const question = buildObjectiveSetQuestionPayload(entry.set, entry.question, 0);
          const target = getObjectiveTheoryTarget(question);
          const questionKey = getObjectiveQuestionKey(question);
          return `
            <article class="objective-note-item">
              <div class="objective-note-meta">
                ${escapeHtml(entry.set.title || '객관식 세트')} · ${escapeHtml(String(entry.record.questionNumber || entry.question.number || ''))}번
              </div>
              <p>${escapeHtml(entry.question.question || entry.record.questionText || '')}</p>
              <div class="objective-note-answer">
                선택 ${escapeHtml(entry.record.selectedLabel || '-')} · 정답 ${escapeHtml(entry.record.answer || '')}
              </div>
              <div class="objective-note-actions">
                <button type="button" data-objective-wrong-review="all">오답 다시 풀기</button>
                ${target ? `<button type="button" data-objective-theory-set="${escapeHtml(entry.set.id)}" data-objective-theory-question="${escapeHtml(questionKey)}">${escapeHtml(target.label)}</button>` : ''}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function updateObjectiveWrongRecord(question, isCorrect, selectedLabel) {
  const setId = state.quizContext?.setId || question?.sourceRef?.objective_set_id;
  if (!setId) return;

  const questionKey = getObjectiveQuestionKey(question);
  if (!questionKey) return;

  const wrongByQuestionId = {
    ...getObjectiveWrongMap(setId),
  };

  if (isCorrect) {
    delete wrongByQuestionId[questionKey];
  } else {
    wrongByQuestionId[questionKey] = {
      questionId: questionKey,
      questionNumber: getObjectiveQuestionNumber(question),
      questionText: question.question || '',
      selectedLabel,
      correctLabels: question.correctLabels || [],
      answer: question.answer || '',
      explanation: question.detailedSummary || question.explanation || '',
      updatedAt: new Date().toISOString(),
    };
  }

  saveObjectiveSetProgress(setId, { wrongByQuestionId });
}

function getObjectiveQuestionType(set, question) {
  if (question.type || question.subject) {
    return question.type || question.subject;
  }

  const questionNumber = Number(question.number || 0);
  const section = (set.sections || []).find(item => {
    const from = Number(item.from || 0);
    const to = Number(item.to || 0);
    return questionNumber >= from && questionNumber <= to;
  });

  return section?.title || set.subject || set.title || '객관식 문제';
}

function getObjectiveSetSectionSummary(set) {
  const sections = Array.isArray(set?.sections) ? set.sections : [];
  if (!sections.length) return set?.description || '';

  return sections
    .map(section => `${section.from}-${section.to} ${getShortObjectiveSectionTitle(section.title)}`)
    .join(' · ');
}

function getObjectiveSetRoundLabel(set) {
  const title = String(set?.title || '').trim();
  const match = title.match(/(\d+)\s*회/);
  if (match) return `${match[1]}회`;
  return title || '객관식';
}

function getShortObjectiveSectionTitle(title = '') {
  return String(title)
    .replace('1과목 소프트웨어 설계', '설계')
    .replace('2과목 소프트웨어 개발', '개발')
    .replace('3과목 데이터베이스 구축', 'DB')
    .replace('4과목 프로그래밍 언어 활용', '언어')
    .replace('5과목 정보시스템 구축관리', '구축관리');
}

function pickPreferredDisplayAsset(visualAssets, preferredAssetId = '') {
  if (!visualAssets) return null;
  const crops = visualAssets.question_figure_crops || [];
  if (preferredAssetId) {
    const exact = crops.find(asset => asset.asset_id === preferredAssetId)
      || (visualAssets.page_images || []).find(asset => asset.asset_id === preferredAssetId);
    if (exact) return exact;
  }
  return visualAssets.preferred_display_asset || crops[0] || visualAssets.primary_image || (visualAssets.page_images || [])[0] || null;
}

async function resolvePracticeActivities(practice, allowedKinds = null) {
  const resolved = [];
  const allowedKindSet = Array.isArray(allowedKinds) && allowedKinds.length
    ? new Set(allowedKinds)
    : null;

  for (const activity of (practice?.activities || [])) {
    if (allowedKindSet && !allowedKindSet.has(activity.kind)) {
      continue;
    }

    if (activity.kind === 'fill_blank') {
      resolved.push({
        id: activity.activity_id,
        kind: 'fill_blank',
        type: activity.type_label || '빈칸 추론',
        question: activity.prompt,
        answer: activity.answer,
        original: activity.original || activity.prompt,
        explanation: activity.explanation || '',
        highlightKeyword: activity.answer,
      });
      continue;
    }

    if (activity.kind !== 'question_bank_ref') continue;

    let liveQuestion = null;
    if (activity.question_bank_topic_file && activity.question_id) {
      try {
        const topicData = await fetchQuestionBankTopic(activity.question_bank_topic_file);
        liveQuestion = (topicData.questions || []).find(item => item.question_id === activity.question_id) || null;
      } catch (err) {
        console.warn('Question bank fetch failed, falling back to resolved snapshot', err);
      }
    }

    if (liveQuestion) {
      const asset = pickPreferredDisplayAsset(liveQuestion.visual_assets, activity.preferred_figure_asset_id);
      resolved.push(buildObjectiveQuestionPayload(
        liveQuestion,
        asset,
        {
          activity_id: activity.activity_id || liveQuestion.question_id,
          type_label: activity.type_label,
          question_id: liveQuestion.question_id,
          question_bank_topic_id: liveQuestion.exam_taxonomy?.topic_id || activity.question_bank_topic_id,
          question_bank_topic_file: activity.question_bank_topic_file,
          lecture_topic_id: practice.lecture_topic_id,
          subtopic_index: practice.subtopic_index,
          figure_alt: `${liveQuestion.question?.stem || ''} 관련 그림`,
        },
      ));
      continue;
    }

    if (!activity.resolved_question) continue;

    const fallbackAsset = activity.resolved_question.figure_relative_path ? {
      relative_path: activity.resolved_question.figure_relative_path,
    } : null;
    resolved.push({
      id: activity.activity_id || activity.question_id,
      kind: 'objective',
      type: activity.type_label || '객관식 문제',
      question: activity.resolved_question.question,
      choices: activity.resolved_question.choices || [],
      answer: activity.resolved_question.answer,
      correctLabels: activity.resolved_question.correct_labels || [],
      detailedSummary: activity.resolved_question.detailed_summary || activity.resolved_question.explanation || '',
      explanation: activity.resolved_question.explanation || '',
      explanationSource: activity.resolved_question.explanation || '',
      choiceAnalysis: activity.resolved_question.choice_analysis || [],
      solvingSteps: activity.resolved_question.solving_steps || [],
      examTraps: activity.resolved_question.exam_traps || [],
      answerChecklist: activity.resolved_question.answer_checklist || [],
      memoryCues: activity.resolved_question.memory_cues || [],
      figure: fallbackAsset ? {
        src: buildQuestionBankAssetUrl(fallbackAsset.relative_path),
        alt: activity.resolved_question.figure_alt || `${activity.resolved_question.question} 愿??洹몃┝`,
      } : null,
      sourceRef: {
        question_id: activity.question_id,
        question_bank_topic_id: activity.question_bank_topic_id,
        question_bank_topic_file: activity.question_bank_topic_file,
        lecture_topic_id: practice.lecture_topic_id,
        subtopic_index: practice.subtopic_index,
      },
    });
  }

  return resolved;
}

function beginQuizSession(questions, quizContext = null, resumeState = null) {
  const resumeIndex = Math.max(0, Math.min(Number(resumeState?.currentIndex || 0), questions.length));
  const resumeScore = resumeState?.score || {};
  clearQuizTimer();
  state.quizQuestions = questions;
  state.quizIndex = resumeIndex;
  state.quizRevealed = false;
  state.quizRevealedBlanks = {};
  state.quizScore = {
    correct: Math.max(0, Number(resumeScore.correct || 0)),
    incorrect: Math.max(0, Number(resumeScore.incorrect || 0)),
  };
  state.quizSelectedChoiceLabel = null;
  state.quizSubmission = null;
  state.quizAnswers = resumeState?.answers && typeof resumeState.answers === 'object'
    ? { ...resumeState.answers }
    : {};
  state.quizResults = [];
  state.quizElapsedSeconds = Math.max(0, Number(resumeState?.elapsedSeconds || 0));
  state.quizStartedAt = Date.now() - (state.quizElapsedSeconds * 1000);
  state.quizContext = quizContext;
  state.objectiveSubjectResult = null;
  state.objectiveSubjectReview = null;
  state.objectiveSubjectTimerBaselines = {};
  if (questions[resumeIndex]?.kind === 'objective') {
    state.quizSelectedChoiceLabel = getObjectiveSelectedLabel(questions[resumeIndex], resumeIndex);
    ensureObjectiveSubjectTimer(questions[resumeIndex], resumeIndex);
  }
  navigate('quiz');
}

function renderQuizLoading(message) {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">📚</div>
      <div class="loading-text">${escapeHtml(message)}</div>
    </div>
  `;
}

async function startSubtopicPracticeSession(context, practice, mode) {
  const allowedKinds = mode === 'subtopic_objective'
    ? ['question_bank_ref']
    : ['fill_blank'];
  const questions = await resolvePracticeActivities(practice, allowedKinds);
  if (!questions.length) {
    return false;
  }

  beginQuizSession(questions, {
    mode,
    lectureId: state.currentLectureId,
    subtopicIndex: context.currentSubtopic.subtopic_index,
    subtopicTitle: context.currentSubtopic.title,
    resumeSegIdx: context.nextSegmentIndex,
    hasObjective: mode === 'subtopic_fill_blank' && hasObjectiveActivities(practice),
    objectiveCount: countPracticeActivitiesByKind(practice, 'question_bank_ref'),
  });
  return true;
}

async function startObjectiveHubSession(lectureId, subtopicIndex) {
  const practice = getSubtopicPractice(lectureId, subtopicIndex);
  if (!practice) {
    throw new Error('객관식 매핑을 찾지 못했어요.');
  }

  const questions = await resolvePracticeActivities(practice, ['question_bank_ref']);
  if (!questions.length) {
    return false;
  }

  beginQuizSession(questions, {
    mode: 'objective_hub',
    lectureId,
    subtopicIndex,
    subtopicTitle: practice.subtopic_title,
  });
  return true;
}

function startObjectiveSetSession(setId) {
  const set = state.objectiveSets.find(item => item.id === setId);
  if (!set) return;

  const questions = buildObjectiveSetQuestions(set);

  if (!questions.length) {
    state.objectiveSetsError = '풀 수 있는 문제가 없는 세트입니다.';
    renderObjectiveHub();
    return;
  }

  const resumeState = getObjectiveSetResumeState(set.id, questions.length);
  beginQuizSession(questions, {
    mode: 'objective_set',
    setId: set.id,
    setTitle: set.title,
  }, resumeState);
}

function startObjectiveWrongReviewSession(setId = 'all') {
  const requestedSetId = String(setId || 'all');
  const entries = getObjectiveWrongEntries(state.objectiveSets)
    .filter(entry => requestedSetId === 'all' || String(entry.set.id) === requestedSetId);
  if (!entries.length) {
    state.objectiveSetsError = requestedSetId === 'all'
      ? '아직 저장된 오답이 없습니다.'
      : '이 회차에 저장된 오답이 없습니다.';
    if (state.currentPage === 'wrong-note') renderObjectiveWrongNotePage();
    else renderObjectiveHub();
    return;
  }

  const questions = entries
    .map((entry, index) => buildObjectiveSetQuestionPayload(entry.set, entry.question, index))
    .filter(question => question.question && question.choices.length && question.correctLabels.length);

  if (!questions.length) {
    state.objectiveSetsError = '오답 문제를 불러오지 못했어요.';
    if (state.currentPage === 'wrong-note') renderObjectiveWrongNotePage();
    else renderObjectiveHub();
    return;
  }

  const activeSet = requestedSetId === 'all'
    ? null
    : state.objectiveSets.find(set => String(set.id) === requestedSetId);

  beginQuizSession(questions, {
    mode: 'objective_wrong_set',
    setTitle: activeSet ? `${getObjectiveSetRoundLabel(activeSet)} 오답 다시 풀기` : '오답 다시 풀기',
  });
}

function resumeLectureAtSegment(segmentIndex) {
  if (!state.currentLecture) return navigate('home');
  state.currentSegIdx = segmentIndex;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  revealNextSentence();
  navigate('theory');
}

function markCurrentLectureComplete() {
  if (!state.currentLectureId) return;
  state.completedLectures.add(state.currentLectureId);
  saveStorage();
}

function getSubtopicContinueLabel(quizContext) {
  return Number.isInteger(quizContext?.resumeSegIdx) ? '다음 소주제로' : '다음 주제로';
}

function getQuizPrimaryActionLabel() {
  if (state.quizContext?.mode === 'subtopic_fill_blank' && state.quizContext.hasObjective) {
    const objectiveCount = state.quizContext.objectiveCount || 0;
    return objectiveCount > 0 ? `객관식 ${objectiveCount}문제 풀러 가기` : '객관식 풀러 가기';
  }
  if (
    state.quizContext?.mode === 'objective_hub'
    || state.quizContext?.mode === 'objective_set'
    || state.quizContext?.mode === 'objective_wrong_set'
  ) {
    return '객관식 목록으로';
  }
  if (state.quizContext?.mode === 'subtopic_fill_blank' || state.quizContext?.mode === 'subtopic_objective') {
    return getSubtopicContinueLabel(state.quizContext);
  }
  return '다음 주제로';
}

function getQuizSecondaryActionLabel() {
  if (state.quizContext?.mode === 'subtopic_fill_blank' && state.quizContext.hasObjective) {
    return getSubtopicContinueLabel(state.quizContext);
  }
  return null;
}

function handleQuizSecondaryAction() {
  if (state.quizContext?.mode === 'subtopic_fill_blank' || state.quizContext?.mode === 'subtopic_objective') {
    const targetIndex = state.quizContext.resumeSegIdx;
    state.quizContext = null;
    if (Number.isInteger(targetIndex)) {
      resumeLectureAtSegment(targetIndex);
    } else {
      goToNextLectureOrHome();
    }
    return;
  }
  state.quizContext = null;
  goToNextLectureOrHome();
}

async function handleQuizPrimaryAction() {
  if (state.quizContext?.mode === 'subtopic_fill_blank' && state.quizContext.hasObjective) {
    const lectureId = state.quizContext.lectureId;
    const subtopicIndex = state.quizContext.subtopicIndex;
    renderQuizLoading('소주제 객관식을 준비하고 있어요...');
    try {
      const practice = getSubtopicPractice(lectureId, subtopicIndex);
      const questions = await resolvePracticeActivities(practice, ['question_bank_ref']);
      if (!questions.length) {
        handleQuizSecondaryAction();
        return;
      }

      beginQuizSession(questions, {
        mode: 'subtopic_objective',
        lectureId,
        subtopicIndex,
        subtopicTitle: state.quizContext.subtopicTitle,
        resumeSegIdx: state.quizContext.resumeSegIdx,
      });
    } catch (err) {
      console.error('Failed to start subtopic objective session', err);
      app.innerHTML = `
        <div class="empty-state" style="height:100dvh">
          <div class="empty-emoji">⚠️</div>
          <div class="empty-text">객관식을 준비하지 못했어요<br/><small style="color:var(--text-tertiary)">${escapeHtml(err.message)}</small></div>
        </div>
      `;
    }
    return;
  }

  if (
    state.quizContext?.mode === 'objective_hub'
    || state.quizContext?.mode === 'objective_set'
    || state.quizContext?.mode === 'objective_wrong_set'
  ) {
    state.quizContext = null;
    navigate('objective');
    return;
  }

  if (state.quizContext?.mode === 'subtopic_fill_blank' || state.quizContext?.mode === 'subtopic_objective') {
    handleQuizSecondaryAction();
    return;
  }

  state.quizContext = null;
  goToNextLectureOrHome();
}

function showSubtopicCheckpoint(context, practice) {
  clearAutoPlayTimer();
  if (context.isLastSegment) {
    markCurrentLectureComplete();
  }

  app.innerHTML = `
    <div class="theory-complete">
      <div class="complete-emoji">🎉</div>
      <div class="complete-title">소주제 학습 완료!</div>
      <div class="complete-sub">
        <strong>${escapeHtml(context.currentSubtopic.title)}</strong> 학습이 끝났어요.<br/>
        핵심 키워드 빈칸 문제와 연결된 객관식 문제를 바로 풀어볼까요?
      </div>
      <button class="btn-quiz" id="btn-start-subtopic-practice">소주제 문제 풀기</button>
      <button class="btn-skip-quiz" id="btn-skip-subtopic-practice">${context.isLastSegment ? '다음 주제로' : '다음 소주제로'}</button>
    </div>
  `;

  document.getElementById('btn-start-subtopic-practice').addEventListener('click', async () => {
    app.innerHTML = `
      <div class="loading-screen">
        <div class="loading-logo">📝</div>
        <div class="loading-text">소주제 문제를 준비하는 중...</div>
      </div>
    `;

    try {
      const questions = await resolvePracticeActivities(practice);
      if (!questions.length) {
        if (context.nextSegmentIndex !== null) resumeLectureAtSegment(context.nextSegmentIndex);
        else goToNextLectureOrHome();
        return;
      }

      state.quizQuestions = questions;
      state.quizIndex = 0;
      state.quizRevealed = false;
      state.quizRevealedBlanks = {};
      state.quizScore = { correct: 0, incorrect: 0 };
      state.quizSelectedChoiceLabel = null;
      state.quizSubmission = null;
      state.quizAnswers = {};
      state.quizResults = [];
      state.quizStartedAt = null;
      state.quizElapsedSeconds = 0;
      state.quizContext = {
        mode: 'subtopic_practice',
        lectureId: state.currentLectureId,
        subtopicIndex: context.currentSubtopic.subtopic_index,
        subtopicTitle: context.currentSubtopic.title,
        resumeSegIdx: context.nextSegmentIndex,
      };
      navigate('quiz');
    } catch (err) {
      console.error('Failed to build subtopic practice', err);
      app.innerHTML = `
        <div class="empty-state" style="height:100dvh">
          <div class="empty-emoji">⚠️</div>
          <div class="empty-text">소주제 문제를 준비하지 못했어요<br/><small style="color:var(--text-tertiary)">${escapeHtml(err.message)}</small></div>
        </div>
      `;
    }
  });

  document.getElementById('btn-skip-subtopic-practice').addEventListener('click', () => {
    if (context.nextSegmentIndex !== null) {
      resumeLectureAtSegment(context.nextSegmentIndex);
    } else {
      goToNextLectureOrHome();
    }
  });
}

function showSubtopicCheckpoint(context, practice) {
  clearAutoPlayTimer();
  if (context.isLastSegment) {
    markCurrentLectureComplete();
  }

  const hasObjective = hasObjectiveActivities(practice);
  const objectiveCount = countPracticeActivitiesByKind(practice, 'question_bank_ref');
  const continueLabel = getSubtopicContinueLabel({ resumeSegIdx: context.nextSegmentIndex });
  const checkpointCopy = hasObjective
    ? `먼저 핵심 키워드 빈칸으로 복습하고, 이어서 이 소주제에 연결된 객관식 ${objectiveCount}문제를 풀 수 있어요.`
    : '먼저 핵심 키워드 빈칸으로 복습하고 다음 소주제로 넘어갈 수 있어요.';

  app.innerHTML = `
    <div class="theory-complete">
      <div class="complete-emoji">🎉</div>
      <div class="complete-title">소주제 학습 완료!</div>
      <div class="complete-sub">
        <strong>${escapeHtml(context.currentSubtopic.title)}</strong> 학습을 마쳤어요.<br/>
        ${escapeHtml(checkpointCopy)}
      </div>
      <div class="checkpoint-action-group">
        <button class="btn-quiz" id="btn-start-subtopic-blank">핵심 빈칸 풀기</button>
        ${hasObjective ? `<button class="btn-quiz btn-quiz-secondary" id="btn-start-subtopic-objective">객관식 ${objectiveCount}문제 풀어보기</button>` : ''}
        <button class="btn-skip-quiz" id="btn-skip-subtopic-practice">${continueLabel}</button>
      </div>
    </div>
  `;

  document.getElementById('btn-start-subtopic-blank').addEventListener('click', async () => {
    renderQuizLoading('핵심 키워드 빈칸을 준비하고 있어요...');

    try {
      const didStart = await startSubtopicPracticeSession(context, practice, 'subtopic_fill_blank');
      if (!didStart) {
        if (context.nextSegmentIndex !== null) resumeLectureAtSegment(context.nextSegmentIndex);
        else goToNextLectureOrHome();
      }
    } catch (err) {
      console.error('Failed to start subtopic fill-blank practice', err);
      app.innerHTML = `
        <div class="empty-state" style="height:100dvh">
          <div class="empty-emoji">⚠️</div>
          <div class="empty-text">빈칸 문제를 준비하지 못했어요<br/><small style="color:var(--text-tertiary)">${escapeHtml(err.message)}</small></div>
        </div>
      `;
    }
  });

  if (hasObjective) {
    document.getElementById('btn-start-subtopic-objective').addEventListener('click', async () => {
      renderQuizLoading('소주제 객관식을 준비하고 있어요...');

      try {
        const didStart = await startSubtopicPracticeSession(context, practice, 'subtopic_objective');
        if (!didStart) {
          if (context.nextSegmentIndex !== null) resumeLectureAtSegment(context.nextSegmentIndex);
          else goToNextLectureOrHome();
        }
      } catch (err) {
        console.error('Failed to start subtopic objective practice', err);
        app.innerHTML = `
          <div class="empty-state" style="height:100dvh">
            <div class="empty-emoji">⚠️</div>
            <div class="empty-text">객관식을 준비하지 못했어요<br/><small style="color:var(--text-tertiary)">${escapeHtml(err.message)}</small></div>
          </div>
        `;
      }
    });
  }

  document.getElementById('btn-skip-subtopic-practice').addEventListener('click', () => {
    if (context.nextSegmentIndex !== null) {
      resumeLectureAtSegment(context.nextSegmentIndex);
    } else {
      goToNextLectureOrHome();
    }
  });
}

function renderQuizPrompt(q) {
  if (q.kind !== 'objective') {
    return renderInteractiveClozePrompt(
      q.question,
      normalizeClozeAnswers(q),
      state.quizRevealedBlanks,
      'data-quiz-blank'
    );
  }

  const figureHtml = q.figure ? `
    <div class="quiz-figure-wrap">
      <img class="quiz-figure-image" src="${q.figure.src}" alt="${escapeHtml(q.figure.alt || '문제 그림')}" />
    </div>
  ` : '';

  const choicesHtml = `
    <div class="quiz-choice-list">
      ${(q.choices || []).map(choice => {
        const isSelected = (isObjectiveExamSession()
          ? getObjectiveSelectedLabel(q, state.quizIndex)
          : state.quizSelectedChoiceLabel) === choice.label;
        const isCorrect = (q.correctLabels || []).includes(choice.label);
        const isSubmittedWrong = state.quizRevealed && state.quizSubmission?.selectedLabel === choice.label && !isCorrect;
        return `
          <button
            type="button"
            class="quiz-choice-item ${isSelected ? 'selected' : ''} ${state.quizRevealed && isCorrect ? 'correct' : ''} ${isSubmittedWrong ? 'incorrect' : ''}"
            data-choice="${escapeHtml(choice.label)}"
            ${state.quizRevealed ? 'disabled' : ''}
          >
            <span class="choice-label">${escapeHtml(choice.label)}</span>
            <span class="choice-text">${escapeHtml(choice.text)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  return `
    <div class="quiz-objective-prompt">${escapeHtml(q.question)}</div>
    ${figureHtml}
    ${choicesHtml}
  `;
}

function renderExplanationList(title, items, listClass = '') {
  if (!items || !items.length) return '';
  return `
    <div class="quiz-explanation-block ${listClass}">
      <div class="quiz-explanation-title">${escapeHtml(title)}</div>
      <ul class="quiz-explanation-list">
        ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderChoiceAnalysisList(choiceAnalysis = []) {
  if (!choiceAnalysis.length) return '';
  return `
    <div class="quiz-explanation-block">
      <div class="quiz-explanation-title">보기별 해설</div>
      <div class="quiz-choice-analysis-list">
        ${choiceAnalysis.map(item => `
          <div class="quiz-choice-analysis-item ${item.is_correct ? 'correct' : 'incorrect'}">
            <div class="quiz-choice-analysis-head">
              <span class="choice-label">${escapeHtml(item.label)}</span>
              <span class="quiz-choice-analysis-text">${escapeHtml(item.text)}</span>
            </div>
            <div class="quiz-choice-analysis-body">${escapeHtml(item.analysis)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderQuizRevealPanel(q) {
  if (q.kind !== 'objective') {
    return '';
  }

  const selectedLabel = state.quizSubmission?.selectedLabel || state.quizSelectedChoiceLabel || '';
  const selectedChoice = (q.choices || []).find(choice => choice.label === selectedLabel);
  const isCorrect = !!state.quizSubmission?.isCorrect;
  const selectedText = selectedChoice ? `${selectedChoice.label}번 ${selectedChoice.text}` : '선택하지 않음';
  const explanation = q.detailedSummary || q.explanation || q.explanationSource || q.original || '';

  return `
    <div class="quiz-answer-card ${isCorrect ? 'is-correct' : 'is-incorrect'}">
      <div class="quiz-answer-label">채점 결과</div>
      <div class="quiz-answer-status">${escapeHtml(isCorrect ? '정답입니다!' : '정답을 다시 확인해 보세요.')}</div>
      <div class="quiz-answer-selected">선택한 답: ${escapeHtml(selectedText)}</div>
      <div class="quiz-answer-selected">정답: ${escapeHtml(q.answer)}</div>
      ${explanation ? `<div class="quiz-answer-explanation">${escapeHtml(explanation)}</div>` : ''}
    </div>
    ${renderExplanationList('????쒖꽌', q.solvingSteps || [])}
    ${renderChoiceAnalysisList(q.choiceAnalysis || [])}
    ${renderExplanationList('실수 포인트', q.examTraps || [])}
    ${renderExplanationList('留덈Т由?泥댄겕', q.answerChecklist || [])}
    ${renderExplanationList('암기 포인트', q.memoryCues || [], 'compact')}
  `;
}

function isObjectiveQuizShell(question = null) {
  return question?.kind === 'objective'
    || state.quizContext?.mode === 'objective_hub'
    || state.quizContext?.mode === 'objective_set'
    || state.quizContext?.mode === 'objective_wrong_set'
    || state.quizContext?.mode === 'subtopic_objective';
}

function isObjectiveSetQuizContext() {
  return state.quizContext?.mode === 'objective_set' && !!state.quizContext?.setId;
}

function persistCurrentObjectiveSetProgress(patch = {}) {
  if (!isObjectiveSetQuizContext()) return;

  const totalQuestions = state.quizQuestions.length;
  const defaultCurrentIndex = isObjectiveExamSession()
    ? state.quizIndex
    : state.quizIndex + (state.quizRevealed && state.quizSubmission ? 1 : 0);
  const currentIndex = Math.max(0, Math.min(
    Number(patch.currentIndex ?? defaultCurrentIndex),
    totalQuestions
  ));
  const completed = !!patch.completed || currentIndex >= totalQuestions;
  const lastQuestionIndex = Math.max(0, Math.min(currentIndex, totalQuestions) - 1);
  const lastQuestion = currentIndex > 0 ? state.quizQuestions[lastQuestionIndex] : null;
  const lastQuestionNumber = getObjectiveQuestionNumber(lastQuestion, currentIndex);

  saveObjectiveSetProgress(state.quizContext.setId, {
    setId: state.quizContext.setId,
    setTitle: state.quizContext.setTitle || '',
    totalQuestions,
    currentIndex,
    completed,
    score: {
      correct: Math.max(0, Number(state.quizScore.correct || 0)),
      incorrect: Math.max(0, Number(state.quizScore.incorrect || 0)),
    },
    answers: isObjectiveExamSession() ? { ...(state.quizAnswers || {}) } : undefined,
    elapsedSeconds: isObjectiveExamSession() ? getQuizElapsedSeconds() : undefined,
    lastQuestionId: lastQuestion?.id || null,
    lastQuestionNumber: lastQuestionNumber || null,
    lastQuestionText: lastQuestion?.question || '',
    lastQuestionType: lastQuestion?.type || '',
    lastWasCorrect: state.quizSubmission?.isCorrect ?? null,
    ...patch,
  });
}

function getObjectiveExamPersistIndex() {
  if (state.objectiveSubjectResult && !isObjectiveSubjectReviewMode()) {
    return Math.max(0, Math.min(
      Number(state.objectiveSubjectResult.nextIndex || 0),
      state.quizQuestions.length
    ));
  }

  return state.quizIndex;
}

function handleQuizBack() {
  if (isObjectiveSubjectReviewMode()) {
    endObjectiveSubjectReview();
    return;
  }

  if (
    state.quizContext?.mode === 'objective_hub'
    || state.quizContext?.mode === 'objective_set'
    || state.quizContext?.mode === 'objective_wrong_set'
  ) {
    persistCurrentObjectiveSetProgress({
      currentIndex: getObjectiveExamPersistIndex(),
      answers: state.quizAnswers,
      elapsedSeconds: getQuizElapsedSeconds(),
    });
    navigate('objective');
    return;
  }

  if (state.quizContext?.mode === 'subtopic_objective') {
    handleQuizSecondaryAction();
    return;
  }

  navigate('home');
}

function handleObjectiveChoiceSelect(choiceLabel) {
  if (isObjectiveExamSession()) {
    const question = state.quizQuestions[state.quizIndex];
    const answerKey = getObjectiveAnswerKey(question, state.quizIndex);
    state.quizAnswers = {
      ...(state.quizAnswers || {}),
      [answerKey]: choiceLabel,
    };
    state.quizSelectedChoiceLabel = choiceLabel;
    persistCurrentObjectiveSetProgress({
      currentIndex: Math.min(state.quizIndex + 1, state.quizQuestions.length),
      answers: state.quizAnswers,
      elapsedSeconds: getQuizElapsedSeconds(),
    });
    renderQuiz();
    return;
  }

  state.quizSelectedChoiceLabel = choiceLabel;
  renderQuiz();
}

function getQuizAnsweredCount() {
  if (isObjectiveExamSession()) return getObjectiveAnsweredCount();
  return Math.max(0, Number(state.quizScore.correct || 0))
    + Math.max(0, Number(state.quizScore.incorrect || 0));
}

function buildObjectiveResultRecord(question, selectedLabel, isCorrect, index = state.quizIndex) {
  const selectedChoice = (question.choices || []).find(choice => choice.label === selectedLabel);
  return {
    questionId: getObjectiveQuestionKey(question),
    questionNumber: getObjectiveQuestionNumber(question, index + 1),
    questionText: question.question || '',
    type: question.type || '',
    selectedLabel,
    selectedText: selectedChoice?.text || '',
    correctLabels: question.correctLabels || [],
    answer: question.answer || '',
    isCorrect,
    sourceRef: question.sourceRef || {},
    explanation: question.detailedSummary || question.explanation || '',
    theoryTarget: getObjectiveTheoryTarget(question),
  };
}

function recordObjectiveResult(question, selectedLabel, isCorrect) {
  const record = buildObjectiveResultRecord(question, selectedLabel, isCorrect);
  const resultKey = record.questionId || `${state.quizIndex}`;
  record.resultKey = resultKey;
  const previousResults = Array.isArray(state.quizResults) ? state.quizResults : [];
  state.quizResults = [
    ...previousResults.filter(item => (item.resultKey || item.questionId || '') !== resultKey),
    record,
  ];
}

function renderQuizScoreStrip() {
  const total = state.quizQuestions.length;
  if (!total) return '';

  if (isObjectiveSubjectReviewMode()) {
    const review = state.objectiveSubjectReview;
    const result = state.objectiveSubjectResult;
    const reviewPosition = Math.max(1, state.quizIndex - Number(review.startIndex || 0) + 1);
    return `
      <div class="quiz-score-strip quiz-review-strip" aria-label="과목 복기 현황">
        <span>${escapeHtml(result.shortTitle || `${result.subjectNumber || ''}과목`)} 복기</span>
        <strong>정답 ${Math.max(0, Number(result.correct || 0))}/${Math.max(0, Number(result.total || 0))}</strong>
        <em>${reviewPosition}/${Math.max(0, Number(result.total || 0))}</em>
      </div>
    `;
  }

  if (isObjectiveExamSession()) {
    const answered = getObjectiveAnsweredCount();
    return `
      <div class="quiz-score-strip" aria-label="객관식 풀이 현황">
        <span>답안 ${answered}/${total}</span>
        <strong id="quiz-timer-value">${formatDuration(getQuizElapsedSeconds())}</strong>
        <em>${total - answered}문제 남음</em>
      </div>
      ${renderObjectiveLiveSubjectScores()}
    `;
  }

  return `
    <div class="quiz-score-strip" aria-label="객관식 채점 현황">
      <span>채점 ${getQuizAnsweredCount()}/${total}</span>
      <strong>정답 ${Math.max(0, Number(state.quizScore.correct || 0))}</strong>
      <em>오답 ${Math.max(0, Number(state.quizScore.incorrect || 0))}</em>
    </div>
  `;
}

function getObjectiveExamUnansweredCount() {
  if (!isObjectiveExamSession()) return 0;
  return state.quizQuestions.length - getObjectiveAnsweredCount();
}

function renderObjectiveExamActions() {
  const isFirst = state.quizIndex <= 0;
  const isLast = state.quizIndex >= state.quizQuestions.length - 1;
  const isSubjectBoundary = isObjectiveSubjectBoundaryIndex(state.quizIndex);
  const subjectNumber = getObjectivePeriodNumber(state.quizQuestions[state.quizIndex], state.quizIndex);
  const unanswered = getObjectiveExamUnansweredCount();
  const subjectUnanswered = isSubjectBoundary ? getObjectiveSubjectUnansweredCount(subjectNumber) : 0;
  const finalLabel = unanswered > 0 ? `미답 ${unanswered}개 · 채점하기` : '채점하기';
  const nextLabel = isSubjectBoundary
    ? (subjectUnanswered > 0 ? `미답 ${subjectUnanswered}개 · ${subjectNumber}과목 채점하기` : `${subjectNumber}과목 채점하기`)
    : '다음 문제';

  return `
    <div class="quiz-actions quiz-exam-actions">
      <button class="btn-quiz-action secondary" id="btn-prev-question" ${isFirst ? 'disabled' : ''}>이전</button>
      <button class="btn-quiz-action next" id="${isLast ? 'btn-finish-objective-exam' : 'btn-next-question'}">
        ${isLast ? finalLabel : nextLabel}
      </button>
    </div>
  `;
}

function getObjectiveResultSetId(result) {
  const sourceRef = result?.sourceRef || {};
  if (sourceRef.objective_set_id) return sourceRef.objective_set_id;
  if (state.quizContext?.setId) return state.quizContext.setId;
  if (sourceRef.lecture_topic_id) {
    return `linked:${sourceRef.lecture_topic_id}:${sourceRef.subtopic_index || 'all'}`;
  }
  return '';
}

function applyObjectiveExamResults(results, elapsedSeconds) {
  const grouped = {};
  for (const result of results) {
    const setId = getObjectiveResultSetId(result);
    if (!setId) continue;
    if (!grouped[setId]) grouped[setId] = [];
    grouped[setId].push(result);
  }

  for (const [setId, setResults] of Object.entries(grouped)) {
    const progress = getObjectiveSetProgress(setId) || {};
    const fullSet = state.objectiveSets.find(set => set.id === setId);
    const fullTotalQuestions = getObjectiveSetQuestionCount(fullSet) || Number(progress.totalQuestions || state.quizQuestions.length);
    const isFullSetAttempt = state.quizContext?.mode === 'objective_set' && state.quizContext?.setId === setId;
    const wrongByQuestionId = { ...(progress.wrongByQuestionId || {}) };
    const statsByQuestionId = { ...(progress.statsByQuestionId || {}) };

    for (const result of setResults) {
      const questionKey = result.questionId || String(result.questionNumber || '');
      if (!questionKey) continue;

      const prevStats = statsByQuestionId[questionKey] || {};
      statsByQuestionId[questionKey] = {
        ...prevStats,
        questionId: questionKey,
        questionNumber: result.questionNumber,
        questionText: result.questionText,
        type: result.type,
        attempts: Math.max(0, Number(prevStats.attempts || 0)) + 1,
        correct: Math.max(0, Number(prevStats.correct || 0)) + (result.isCorrect ? 1 : 0),
        incorrect: Math.max(0, Number(prevStats.incorrect || 0)) + (result.isCorrect ? 0 : 1),
        lastSelectedLabel: result.selectedLabel,
        lastWasCorrect: result.isCorrect,
        lastAttemptAt: new Date().toISOString(),
      };

      if (result.isCorrect) {
        delete wrongByQuestionId[questionKey];
      } else {
        wrongByQuestionId[questionKey] = {
          questionId: questionKey,
          questionNumber: result.questionNumber,
          questionText: result.questionText,
          selectedLabel: result.selectedLabel,
          correctLabels: result.correctLabels || [],
          answer: result.answer || '',
          explanation: result.explanation || '',
          updatedAt: new Date().toISOString(),
        };
      }
    }

    const correct = setResults.filter(result => result.isCorrect).length;
    const incorrect = setResults.length - correct;
    const subjectScores = isFullSetAttempt
      ? buildObjectiveSubjectScoreEntries(results, { questions: state.quizQuestions, set: fullSet })
      : (progress.subjectScores || []);
    saveObjectiveSetProgress(setId, {
      wrongByQuestionId,
      statsByQuestionId,
      totalQuestions: fullTotalQuestions,
      currentIndex: isFullSetAttempt ? fullTotalQuestions : Math.max(0, Number(progress.currentIndex || 0)),
      completed: isFullSetAttempt ? true : !!progress.completed,
      score: isFullSetAttempt ? { correct, incorrect } : (progress.score || {}),
      subjectScores,
      answers: isFullSetAttempt ? { ...(state.quizAnswers || {}) } : (progress.answers || {}),
      elapsedSeconds,
      lastAttemptAt: new Date().toISOString(),
      lastReviewScore: { correct, incorrect },
    });
  }
}

function finishObjectiveExam() {
  if (!isObjectiveExamSession()) return;
  const elapsedSeconds = getQuizElapsedSeconds();
  const results = state.quizQuestions.map((question, index) => {
    const selectedLabel = getObjectiveSelectedLabel(question, index);
    const isCorrect = !!selectedLabel && (question.correctLabels || []).includes(selectedLabel);
    const record = buildObjectiveResultRecord(question, selectedLabel, isCorrect, index);
    record.resultKey = getObjectiveAnswerKey(question, index);
    return record;
  });

  const correct = results.filter(result => result.isCorrect).length;
  state.quizResults = results;
  state.quizScore = {
    correct,
    incorrect: results.length - correct,
  };
  state.quizElapsedSeconds = elapsedSeconds;
  state.quizStartedAt = null;
  state.objectiveSubjectReview = null;
  state.objectiveSubjectResult = null;
  clearQuizTimer();
  applyObjectiveExamResults(results, elapsedSeconds);
  state.quizIndex = state.quizQuestions.length;
  renderQuizResult();
}

function submitObjectiveAnswer(question) {
  if (!state.quizSelectedChoiceLabel || state.quizSubmission) return;
  const isCorrect = (question.correctLabels || []).includes(state.quizSelectedChoiceLabel);
  state.quizSubmission = {
    selectedLabel: state.quizSelectedChoiceLabel,
    isCorrect,
  };
  if (isCorrect) {
    state.quizScore.correct++;
  } else {
    state.quizScore.incorrect++;
  }
  state.quizRevealed = true;
  recordObjectiveResult(question, state.quizSelectedChoiceLabel, isCorrect);
  updateObjectiveWrongRecord(question, isCorrect, state.quizSelectedChoiceLabel);
  persistCurrentObjectiveSetProgress({
    currentIndex: Math.min(state.quizIndex + 1, state.quizQuestions.length),
    lastSelectedLabel: state.quizSelectedChoiceLabel,
    lastWasCorrect: isCorrect,
    completed: state.quizIndex + 1 >= state.quizQuestions.length,
  });
  renderQuiz();
}

function markFillBlankResult(isCorrect) {
  if (isCorrect) {
    state.quizScore.correct++;
  } else {
    state.quizScore.incorrect++;
  }
  nextQuizQuestion();
}

function getQuizSubmitDisabled(q) {
  return q.kind === 'objective' && !state.quizSelectedChoiceLabel;
}

function getQuizSubmitLabel(q) {
  return q.kind === 'objective' ? '채점하기' : '정답 확인하기';
}

function getQuizPostRevealActions(q) {
  if (q.kind === 'objective') {
    return `
      <div class="quiz-actions">
        <button class="btn-quiz-action next" id="btn-next-question">다음 문제</button>
      </div>
    `;
  }

  return `
    <div class="quiz-actions">
      <button class="btn-quiz-action knew" id="btn-knew">맞혔어요</button>
      <button class="btn-quiz-action didnt-know" id="btn-didnt">틀렸어요</button>
    </div>
  `;
}

function bindQuizPromptEvents(q) {
  document.querySelectorAll('[data-objective-period-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetIndex = getObjectivePeriodJumpIndex(button.dataset.objectivePeriodJump);
      if (targetIndex < 0 || targetIndex === state.quizIndex) return;
      goToObjectiveExamQuestion(targetIndex);
      window.scrollTo(0, 0);
    });
  });

  if (q.kind !== 'objective') {
    document.querySelectorAll('[data-quiz-blank]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.quizBlank || 0);
        state.quizRevealedBlanks = {
          ...state.quizRevealedBlanks,
          [index]: true,
        };
        const answers = normalizeClozeAnswers(q);
        state.quizRevealed = isEveryBlankRevealed(q.question, answers, state.quizRevealedBlanks);
        renderQuiz();
      });
    });
    return;
  }

  if (state.quizRevealed) return;
  document.querySelectorAll('.quiz-choice-item[data-choice]').forEach(button => {
    button.addEventListener('click', () => {
      handleObjectiveChoiceSelect(button.dataset.choice);
    });
  });
}

function bindQuizActionEvents(q) {
  if (isObjectiveSubjectReviewMode()) {
    document.getElementById('btn-subject-review-prev')?.addEventListener('click', () => {
      goToObjectiveSubjectReviewQuestion(state.quizIndex - 1);
    });
    document.getElementById('btn-subject-review-next')?.addEventListener('click', () => {
      goToObjectiveSubjectReviewQuestion(state.quizIndex + 1);
    });
    document.getElementById('btn-subject-review-done')?.addEventListener('click', () => {
      endObjectiveSubjectReview();
    });
    return;
  }

  if (isObjectiveExamSession()) {
    document.getElementById('btn-prev-question')?.addEventListener('click', () => {
      goToObjectiveExamQuestion(state.quizIndex - 1);
    });
    document.getElementById('btn-next-question')?.addEventListener('click', () => {
      if (isObjectiveSubjectBoundaryIndex(state.quizIndex)) {
        showObjectiveSubjectResultForCurrentQuestion();
        return;
      }
      goToObjectiveExamQuestion(state.quizIndex + 1);
    });
    document.getElementById('btn-finish-objective-exam')?.addEventListener('click', finishObjectiveExam);
    return;
  }

  if (!state.quizRevealed) {
    if (q.kind === 'objective') {
      const submitButton = document.getElementById('btn-reveal');
      if (submitButton) {
        submitButton.textContent = getQuizSubmitLabel(q);
        submitButton.disabled = getQuizSubmitDisabled(q);
      }
      submitButton?.addEventListener('click', () => {
        submitObjectiveAnswer(q);
      });
      return;
    }

    return;
  }

  if (q.kind === 'objective') {
    const nextQuestionButton = document.getElementById('btn-next-question');
    if (nextQuestionButton) {
      nextQuestionButton.addEventListener('click', () => {
        nextQuizQuestion();
      });
      return;
    }

    const primaryButton = document.getElementById('btn-knew');
    const secondaryButton = document.getElementById('btn-didnt');
    if (primaryButton) {
      primaryButton.textContent = '다음 문제';
      primaryButton.classList.remove('knew');
      primaryButton.classList.add('next');
    }
    if (secondaryButton) {
      secondaryButton.style.display = 'none';
    }
    primaryButton?.addEventListener('click', () => {
      nextQuizQuestion();
    });
    return;
  }

  document.getElementById('btn-knew').addEventListener('click', () => {
    markFillBlankResult(true);
  });
  document.getElementById('btn-didnt').addEventListener('click', () => {
    markFillBlankResult(false);
  });
}

// ??? ROUTER ?????????????????????????????????????????????????
function navigate(page, params = {}) {
  clearAutoPlayTimer();
  clearTimeout(state.coreSummarySearchTimer);
  if (page !== 'quiz') clearQuizTimer();
  state.currentPage = page;
  Object.assign(state, params);
  render();
  window.scrollTo(0, 0);
}

// ??? RENDER ENGINE ??????????????????????????????????????????
const app = document.getElementById('app');

function renderAppLoading() {
  const isError = !!state.dataLoadError;
  const detailText = isError
    ? escapeHtml(state.dataLoadError)
    : '처음 실행에서는 데이터 준비에 몇 초 정도 걸릴 수 있어요.';

  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">${isError ? '!' : '📚'}</div>
      <div class="loading-text">${isError ? '데이터를 불러오지 못했어요' : '학습 데이터를 준비하는 중...'}</div>
      <div class="auth-note" style="margin-top:12px;max-width:280px;text-align:center">${detailText}</div>
      ${isError ? '<button class="auth-submit" id="btn-retry-data-load" style="margin-top:16px;width:auto;padding:12px 18px">다시 시도</button>' : ''}
    </div>
  `;

  document.getElementById('btn-retry-data-load')?.addEventListener('click', () => {
    loadAppData(true);
  });
}

function render() {
  if (!state.currentUser) {
    state.currentPage = 'auth';
  }
  if (state.currentPage !== 'auth' && !state.dataReady) {
    renderAppLoading();
    return;
  }
  switch (state.currentPage) {
    case 'auth':     renderSimpleAuth(); break;
    case 'home':     renderHome(); break;
    case 'lectures': renderLectures(); break;
    case 'objective': renderObjectiveHub(); break;
    case 'wrong-note': renderObjectiveWrongNotePage(); break;
    case 'practical': renderPracticalSummary(); break;
    case 'summaries': renderCoreSummary(); break;
    case 'theory':   renderTheory(); break;
    case 'quiz':     renderQuiz(); break;
    case 'stats':    renderStats(); break;
    default:         state.currentUser ? renderHome() : renderSimpleAuth();
  }
  mountAiChatWidget();
}

// ??? HOME PAGE ??????????????????????????????????????????????
function renderSimpleAuth() {
  const errorHtml = state.authError
    ? `<div class="auth-error">${escapeHtml(state.authError)}</div>`
    : '';
  const loadingHtml = state.dataLoading
    ? `<div class="auth-note">학습 데이터를 준비 중이에요. 로그인은 바로 가능하고, 데이터가 준비되면 홈 화면이 이어서 열려요.</div>`
    : '';
  const loadErrorHtml = state.dataLoadError
    ? `<div class="auth-error">데이터 로드 문제: ${escapeHtml(state.dataLoadError)}</div>`
    : '';

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-shell">
        <div class="auth-hero">
          <div class="auth-eyebrow">Study Login</div>
          <h1 class="auth-title">이름만 입력하고 바로 학습 시작</h1>
          <p class="auth-subtitle">같은 이름으로 다시 들어오면 이어서 학습하고, 처음 입력한 이름이면 새 학습 기록이 자동으로 만들어집니다.</p>
        </div>

        <div class="auth-card">
          <form class="auth-form" id="auth-form-simple">
            <label class="auth-field">
              <span class="auth-label">사용자 이름</span>
              <input
                class="auth-input"
                id="auth-username-simple"
                type="text"
                autocomplete="nickname"
                maxlength="20"
                placeholder="예: 김민수"
                required
              />
            </label>
            ${errorHtml}
            ${loadErrorHtml}
            <button class="auth-submit" type="submit">이 이름으로 시작하기</button>
          </form>

          ${loadingHtml}
          <div class="auth-note">
            비밀번호 없이 이 기기 브라우저에만 저장됩니다. 같은 이름이면 기존 기록을 이어서 불러오고, 로그아웃하면 다른 이름으로도 바로 들어갈 수 있어요.
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('auth-form-simple')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('auth-username-simple')?.value || '';

    try {
      const user = signInOrCreateUser(username);
      completeLogin(user);
      navigate('home');
    } catch (error) {
      state.authError = error.message || '로그인 처리 중 문제가 생겼습니다.';
      renderSimpleAuth();
    }
  });
}

function renderHome() {
  const prog = getTotalProgress();
  const lastLecture = state.lastLectureId
    ? state.manifest?.find(l => l.lecture_id === state.lastLectureId)
    : null;

  const hours = new Date().getHours();
  const greetMap = { morning: '좋은 아침이에요', afternoon: '오후도 화이팅', evening: '밤에도 열공해요' };
  const currentUser = state.currentUser;
  const greeting = hours < 12 ? greetMap.morning : hours < 18 ? greetMap.afternoon : greetMap.evening;
  const accountCard = currentUser ? `
    <div class="account-card">
      <div class="account-info">
        <div class="account-label">현재 사용자</div>
        <div class="account-name">${escapeHtml(currentUser.display_name)}</div>
        <div class="account-sub">학습 기록은 이 이름으로 저장되고 있어요</div>
      </div>
      <button class="account-logout" id="btn-logout">로그아웃</button>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="page" id="page-home">
      <div class="home-hero">
        <div class="home-greeting">${greeting}</div>
        <h1 class="home-title">
          <span class="highlight">정보처리기사</span>,<br/>주제별로 압축 학습해요
        </h1>
      </div>

      ${accountCard}

      <div class="progress-card">
        <div class="progress-label">전체 주제 학습 진행률</div>
        <div class="progress-number">
          ${prog.pct}<span>%</span>
          <span style="margin-left:8px;font-size:14px;opacity:0.7">${prog.done} / ${prog.total}주제</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width: ${prog.pct}%"></div>
        </div>
      </div>

      ${lastLecture ? `
        <div class="continue-card" id="btn-continue" data-id="${lastLecture.lecture_id}">
          <div class="continue-label">이어서 학습하기</div>
          <div class="continue-title">${lastLecture.title}</div>
          <div class="continue-sub">${lastLecture.number}주제 · ${getSubjectForItem(lastLecture).name}</div>
        </div>
      ` : ''}

      <div class="section-title">과목별 학습</div>
      <div class="subject-grid">
        ${SUBJECTS.map(s => {
          const pct = getSubjectProgress(s.id);
          const count = getSubjectLectures(s.id).length;
          return `
            <button class="subject-card" data-subject="${s.id}">
              <div class="subject-emoji" style="background: ${s.color}11">${s.emoji}</div>
              <div class="subject-info">
                <div class="subject-name">${s.name}</div>
                <div class="subject-count">${count}개 주제</div>
              </div>
              <div class="subject-progress" style="color: ${s.color}">${pct}%</div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    ${renderBottomNav('home')}
  `;

  document.getElementById('btn-continue')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    startLecture(id);
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    logoutCurrentUser();
  });

  document.querySelectorAll('.subject-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const subjectId = parseInt(btn.dataset.subject, 10);
      navigate('lectures', { lectureFilter: subjectId, searchQuery: '' });
    });
  });

  bindNavEvents();
}

// ??? TOPIC LIST PAGE ????????????????????????????????????????
function renderLectures() {
  const subject = SUBJECTS.find(s => s.id === state.lectureFilter);
  let lectures = state.lectureFilter
    ? getSubjectLectures(state.lectureFilter)
    : (state.manifest || []);

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    lectures = lectures.filter(l =>
      l.title.toLowerCase().includes(q)
      || (l.preview_text || '').toLowerCase().includes(q)
      || (l.keywords || []).some(keyword => keyword.toLowerCase().includes(q))
    );
  }

  const title = subject ? subject.name : '전체 주제';

  app.innerHTML = `
    <div class="page" id="page-lectures">
      <div class="page-header">
        <button class="btn-back" id="btn-lec-back">←</button>
        <div class="header-title">${title}</div>
        <div class="header-sub">${lectures.length}개 주제</div>
      </div>

      <div class="search-wrap">
        <input class="search-input" id="search-input"
          type="text" placeholder="주제 검색..." value="${state.searchQuery}" />
      </div>

      <div class="lecture-list" id="lecture-list">
        ${lectures.length === 0 ? `
          <div class="empty-state">
            <div class="empty-emoji">🔎</div>
            <div class="empty-text">검색 결과가 없어요</div>
          </div>
        ` : lectures.map(l => {
          const subj = getSubjectForItem(l);
          const isDone = state.completedLectures.has(l.lecture_id);
          return `
            <button class="lecture-item" data-id="${l.lecture_id}">
              <div class="lecture-num" style="background: ${subj.color}">${l.number}</div>
              <div class="lecture-info">
                <div class="lecture-title">${l.title}</div>
                <div class="lecture-duration">${subj.name} · 소스 ${l.source_count}개 · ${escapeHtml(l.preview_text || '')}</div>
              </div>
              <div class="lecture-check ${isDone ? 'done' : ''}">
                ${isDone ? '✓' : ''}
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    ${renderBottomNav('home')}
  `;

  document.getElementById('btn-lec-back').addEventListener('click', () => navigate('home'));

  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderLectures();
    document.getElementById('search-input')?.focus();
  });

  document.querySelectorAll('.lecture-item').forEach(btn => {
    btn.addEventListener('click', () => startLecture(btn.dataset.id));
  });

  bindNavEvents();
}

// ??? START TOPIC ????????????????????????????????????????????
async function openLectureAtSubtopic(lectureId, subtopicIndex = null) {
  clearAutoPlayTimer();
  clearQuizTimer();
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">📖</div>
      <div class="loading-text">관련 이론을 불러오는 중...</div>
    </div>
  `;

  try {
    const lecture = await fetchLecture(lectureId);
    const segments = lecture.segments || [];
    const targetIndex = subtopicIndex
      ? Math.max(0, segments.findIndex(segment => Number(segment.subtopic_index) === Number(subtopicIndex)))
      : 0;
    state.currentLecture = lecture;
    state.currentLectureId = lectureId;
    state.quizContext = null;
    state.currentSegIdx = targetIndex >= 0 ? targetIndex : 0;
    state.currentSentIdx = 0;
    state.shownSentences = [];
    state.autoPlay = false;
    revealNextSentence();
    state.lastLectureId = lectureId;
    saveStorage();
    navigate('theory');
  } catch (err) {
    console.error('Failed to load related theory', err);
    navigate('lectures');
  }
}

function openObjectiveTheoryTarget(target) {
  if (!target) return;
  if (target.mode === 'lecture' && target.lectureId) {
    openLectureAtSubtopic(target.lectureId, target.subtopicIndex);
    return;
  }
  if (target.mode === 'subject' && target.subjectId) {
    state.lectureFilter = Number(target.subjectId);
    state.searchQuery = '';
    navigate('lectures');
  }
}

async function startLecture(lectureId) {
  clearAutoPlayTimer();
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">📖</div>
      <div class="loading-text">강의 흐름을 불러오는 중...</div>
    </div>
  `;

  try {
    const lecture = await fetchLecture(lectureId);
    state.currentLecture = lecture;
    state.currentLectureId = lectureId;
    state.quizContext = null;
    state.currentSegIdx = 0;
    state.currentSentIdx = 0;
    state.shownSentences = [];
    state.autoPlay = false;
    revealNextSentence();
    state.lastLectureId = lectureId;
    saveStorage();
    navigate('theory');
  } catch (err) {
    console.error('Failed to load lecture', err);
    app.innerHTML = `
      <div class="empty-state" style="height:100dvh">
        <div class="empty-emoji">⚠️</div>
        <div class="empty-text">주제를 불러오지 못했어요<br/><button onclick="navigate('home')" style="margin-top:16px;padding:12px 24px;border:none;border-radius:12px;background:#3182F6;color:white;font-weight:700;cursor:pointer">홈으로</button></div>
      </div>
    `;
  }
}

// ??? THEORY PAGE ????????????????????????????????????????????
function clearAutoPlayTimer() {
  if (state.autoPlayTimer) {
    clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }
}

function getAutoPlayDelay(text = '') {
  const base = 900 + (text.length * 55);
  return Math.max(1400, Math.min(base, 3600));
}

function scheduleAutoPlay(nextText = '') {
  clearAutoPlayTimer();
  if (!state.autoPlay) return;
  state.autoPlayTimer = setTimeout(() => {
    handleTheoryNext();
  }, getAutoPlayDelay(nextText));
}

function jumpToSubtopic(subtopicIndex) {
  const lecture = state.currentLecture;
  if (!lecture) return;
  const targetIndex = (lecture.segments || []).findIndex(seg => seg.subtopic_index === subtopicIndex);
  if (targetIndex < 0) return;

  clearAutoPlayTimer();
  state.currentSegIdx = targetIndex;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  revealNextSentence();
  renderTheory();
}

function toggleAutoPlay() {
  state.autoPlay = !state.autoPlay;
  renderTheory();
}

function positionLatestBubble() {
  const body = document.getElementById('theory-body');
  const latestBubble = body?.querySelector('.speech-bubble.latest');
  if (!body || !latestBubble) return;

  const bodyRect = body.getBoundingClientRect();
  const bubbleRect = latestBubble.getBoundingClientRect();
  const bubbleCenter = body.scrollTop + (bubbleRect.top - bodyRect.top) + (bubbleRect.height / 2);
  const targetTop = Math.max(0, bubbleCenter - (body.clientHeight * 0.30));
  const behavior = 'auto';

  body.scrollTo({ top: targetTop, behavior });
}

function revealNextSentence() {
  const lecture = state.currentLecture;
  if (!lecture) return false;

  const segments = lecture.segments || [];
  const subtopics = lecture.subtopics || [];
  while (state.currentSegIdx < segments.length) {
    const currentSeg = segments[state.currentSegIdx];
    const sentences = currentSeg?.spoken_sentences || [];
    const currentSubtopic = subtopics.find(sub => sub.subtopic_index === currentSeg?.subtopic_index) || null;

    if (state.currentSentIdx < sentences.length) {
      const nextSentence = sentences[state.currentSentIdx];
      state.shownSentences.push({
        text: nextSentence,
        highlightKeywords: mergeHighlightKeywords(currentSeg?.highlight_keywords),
      });
      state.currentSentIdx++;
      return true;
    }

    if (state.currentSegIdx < segments.length - 1) {
      state.currentSegIdx++;
      state.currentSentIdx = 0;
      continue;
    }

    return false;
  }

  return false;
}

function renderTheory() {
  const lecture = state.currentLecture;
  if (!lecture) return navigate('home');

  const theoryContext = getCurrentTheoryContext();
  if (!theoryContext) {
    showTheoryComplete();
    return;
  }

  const {
    segments,
    subtopics,
    currentSeg,
    currentSubtopic,
    nextSeg,
    isLastSentence,
    isLastSegment,
    isSubtopicBoundary,
  } = theoryContext;
  const practice = isSubtopicBoundary
    ? getSubtopicPracticeForContext(state.currentLectureId, currentSubtopic)
    : null;
  if (!currentSeg) {
    showTheoryComplete();
    return;
  }

  const sentences = currentSeg.spoken_sentences || [];
  const progressPct = segments.length > 0
    ? Math.round(((state.currentSegIdx + (state.currentSentIdx >= sentences.length ? 1 : 0)) / segments.length) * 100)
    : 0;
  const currentSourceUrl = currentSeg.youtube_url_normalized || currentSubtopic.youtube_url_normalized || '';

  const sentencesHtml = state.shownSentences.map((entry, i) => {
    const isLatest = i === state.shownSentences.length - 1;
    const text = typeof entry === 'string' ? entry : entry?.text || '';
    const highlightKeywords = typeof entry === 'string' ? [] : entry?.highlightKeywords || [];
    return `<div class="speech-bubble ${isLatest ? 'latest' : ''}">${renderHighlightedText(text, highlightKeywords)}</div>`;
  }).join('');

  const currentSegmentKeywords = mergeHighlightKeywords(currentSeg.highlight_keywords).slice(0, 6);
  const keywordChipsHtml = currentSegmentKeywords.length ? `
    <div class="lecture-keyword-row">
      ${currentSegmentKeywords.map(keyword => `
        <span class="lecture-keyword-chip ${keyword.emphasis === 'primary' ? 'primary' : 'secondary'}">
          ${escapeHtml(keyword.keyword)}
        </span>
      `).join('')}
    </div>
  ` : '';

  let btnText = '다음 문장 보기';
  let btnClass = '';
  if (isLastSentence && isLastSegment) {
    btnText = practice ? '소주제 문제로' : '주제 학습 완료!';
    btnClass = 'complete';
  } else if (isLastSentence) {
    const nextSubtopicIndex = nextSeg?.subtopic_index;
    btnText = nextSubtopicIndex && nextSubtopicIndex !== currentSubtopic.subtopic_index
      ? (practice ? '소주제 문제로' : '다음 소주제로')
      : '다음 화면으로';
  } else {
    btnText = '다음으로';
  }
  const nextAutoText = !isLastSentence
    ? sentences[state.currentSentIdx]
    : (segments[state.currentSegIdx + 1]?.subtopic_title || lecture.lecture.title);

  app.innerHTML = `
    <div class="theory-page" id="page-theory">
      <div class="theory-header">
        <button class="btn-back" id="btn-theory-back">뒤로</button>
        <div class="theory-header-info">
          <div class="theory-header-title">${lecture.lecture.title}</div>
          <div class="theory-header-sub">
            ${lecture.lecture.subject_name} · 소주제 ${currentSubtopic.subtopic_index} / ${subtopics.length || 1}
          </div>
        </div>
        <button class="btn-theory-tool" id="btn-autoplay" title="연속 재생 전환">
          ${state.autoPlay ? '멈춤' : '재생'}
        </button>
        ${currentSourceUrl ? `<a class="btn-youtube" href="${currentSourceUrl}" target="_blank" rel="noopener" title="원본 영상 보기">영상</a>` : ''}
      </div>

      <div class="segment-progress">
        <div class="segment-progress-fill" style="width:${progressPct}%"></div>
      </div>

      <div class="subtopic-strip" id="subtopic-strip">
        ${(subtopics.length ? subtopics : [currentSubtopic]).map(sub => `
          <button class="subtopic-chip ${sub.subtopic_index === currentSubtopic.subtopic_index ? 'current' : ''} ${sub.subtopic_index < currentSubtopic.subtopic_index ? 'done' : ''}" data-subtopic="${sub.subtopic_index}">
            <span class="chip-index">${String(sub.subtopic_index).padStart(2, '0')}</span>
            <span class="chip-title">${escapeHtml(sub.title)}</span>
          </button>
        `).join('')}
      </div>

      <div class="theory-body" id="theory-body">
        <div class="lecture-now-card">
          <div class="lecture-now-label">현재 소주제</div>
          <div class="lecture-now-title">${escapeHtml(currentSubtopic.title)}</div>
          <div class="lecture-now-meta">
            실제 강의 기준 진행 중${currentSeg.start_time_hms ? ` · ${escapeHtml(currentSeg.start_time_hms)}` : ''}
          </div>
          ${keywordChipsHtml}
        </div>

        <div class="speech-area" id="speech-area">
          ${sentencesHtml}
        </div>
      </div>

      <div class="theory-footer">
        <div class="theory-footer-tools">
          <button class="btn-secondary" id="btn-toggle-play">
            ${state.autoPlay ? '연속 재생 끄기' : '연속 재생 켜기'}
          </button>
        </div>
        <button class="btn-next ${btnClass}" id="btn-next">${btnText}</button>
      </div>
    </div>
  `;

  setTimeout(positionLatestBubble, 50);

  document.getElementById('btn-theory-back').addEventListener('click', () => {
    state.autoPlay = false;
    navigate('home');
  });

  document.getElementById('btn-autoplay')?.addEventListener('click', toggleAutoPlay);
  document.getElementById('btn-toggle-play')?.addEventListener('click', toggleAutoPlay);
  document.getElementById('btn-next').addEventListener('click', handleTheoryNext);
  document.querySelectorAll('.subtopic-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      jumpToSubtopic(parseInt(btn.dataset.subtopic, 10));
    });
  });

  const onKey = (e) => {
    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') {
      e.preventDefault();
      handleTheoryNext();
    }
  };
  document.addEventListener('keydown', onKey, { once: true });

  const activeChip = document.querySelector('.subtopic-chip.current');
  activeChip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  scheduleAutoPlay(nextAutoText);
}

function handleTheoryNext() {
  const theoryContext = getCurrentTheoryContext();
  if (theoryContext?.isSubtopicBoundary) {
    const practice = getSubtopicPracticeForContext(state.currentLectureId, theoryContext.currentSubtopic);
    if (practice) {
      showSubtopicCheckpoint(theoryContext, practice);
      return;
    }
  }

  if (revealNextSentence()) {
    renderTheory();
  } else {
    showTheoryComplete();
  }
}

function showTheoryComplete() {
  const lecture = state.currentLecture;
  clearAutoPlayTimer();
  markCurrentLectureComplete();
  state.quizContext = null;

  app.innerHTML = `
    <div class="theory-complete">
      <div class="complete-emoji">🏁</div>
      <div class="complete-title">주제 학습 완료!</div>
      <div class="complete-sub">
        <strong>${lecture.lecture.title}</strong> 주제를<br/>
        끝까지 학습했어요.
      </div>
      <button class="btn-quiz" id="btn-start-quiz">복습 문제 풀기</button>
      <button class="btn-skip-quiz" id="btn-skip-quiz">다음으로 가기</button>
    </div>
  `;

  document.getElementById('btn-start-quiz').addEventListener('click', () => {
    const questions = generateQuiz(state.currentLecture);
    state.quizQuestions = questions;
    state.quizIndex = 0;
    state.quizRevealed = false;
    state.quizRevealedBlanks = {};
    state.quizScore = { correct: 0, incorrect: 0 };
    state.quizSelectedChoiceLabel = null;
    state.quizSubmission = null;
    state.quizAnswers = {};
    state.quizResults = [];
    state.quizStartedAt = null;
    state.quizElapsedSeconds = 0;
    state.quizContext = null;
    navigate('quiz');
  });

  document.getElementById('btn-skip-quiz').addEventListener('click', () => {
    goToNextLectureOrHome();
  });
}

function goToNextLectureOrHome() {
  if (!state.manifest || !state.currentLectureId) return navigate('home');

  const currentIdx = state.manifest.findIndex(l => l.lecture_id === state.currentLectureId);
  if (currentIdx >= 0 && currentIdx < state.manifest.length - 1) {
    const nextLecture = state.manifest[currentIdx + 1];
    startLecture(nextLecture.lecture_id);
  } else {
    navigate('home');
  }
}

// ??? QUIZ PAGE ??????????????????????????????????????????????
function renderQuiz() {
  const questions = state.quizQuestions;
  if (!questions || questions.length === 0) {
    navigate('home');
    return;
  }

  if (state.quizIndex >= questions.length) {
    renderQuizResult();
    return;
  }

  const isSubjectReview = isObjectiveSubjectReviewMode();
  if (state.objectiveSubjectResult && !isSubjectReview) {
    renderObjectiveSubjectCheckpoint();
    return;
  }

  const q = questions[state.quizIndex];
  if (isObjectiveExamSession() && !isSubjectReview) ensureObjectiveSubjectTimer(q, state.quizIndex);
  const progress = Math.round((state.quizIndex / questions.length) * 100);
  const showObjectiveShell = isObjectiveQuizShell(q);
  const isObjectiveExam = isObjectiveExamSession();
  const periodStripHtml = showObjectiveShell ? renderObjectivePeriodStrip(q) : '';
  const scoreStripHtml = showObjectiveShell ? renderQuizScoreStrip() : '';

  app.innerHTML = `
    <div class="quiz-page ${showObjectiveShell ? 'has-bottom-nav' : ''} ${state.quizRevealed ? 'is-revealed' : ''}" id="page-quiz">
      <div class="quiz-header">
        ${showObjectiveShell ? '<button class="quiz-back-btn" id="btn-quiz-back" type="button" aria-label="뒤로가기">←</button>' : ''}
        <div class="quiz-progress-wrap">
          <div class="quiz-progress-row">
            <div class="quiz-progress-text">${state.quizIndex + 1} / ${questions.length}</div>
            ${periodStripHtml ? `<div class="quiz-current-period">${getObjectivePeriodNumber(q, state.quizIndex)}과목</div>` : ''}
          </div>
          ${periodStripHtml}
          ${scoreStripHtml}
          <div class="quiz-progress-bar">
            <div class="fill" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>

      <div class="quiz-body">
        <div class="quiz-card">
          <div class="quiz-type">📚 ${q.type}</div>
          <div class="quiz-question" id="quiz-q">
            ${renderQuizPrompt(q)}
          </div>

          ${isSubjectReview ? `
            ${renderQuizRevealPanel(q)}
            ${renderObjectiveSubjectReviewActions()}
          ` : isObjectiveExam ? renderObjectiveExamActions() : !state.quizRevealed && q.kind === 'objective' ? `
            <div class="quiz-actions">
              <button class="btn-quiz-action reveal" id="btn-reveal" ${getQuizSubmitDisabled(q) ? 'disabled' : ''}>${getQuizSubmitLabel(q)}</button>
            </div>
          ` : state.quizRevealed ? `
            ${renderQuizRevealPanel(q)}
            ${getQuizPostRevealActions(q)}
          ` : ''}
        </div>
      </div>
    </div>

    ${showObjectiveShell ? renderBottomNav('objective') : ''}
  `;

  document.getElementById('btn-quiz-back')?.addEventListener('click', handleQuizBack);
  bindQuizPromptEvents(q);
  bindQuizActionEvents(q);
  if (isObjectiveExam && !isSubjectReview) startQuizTimer();
  if (showObjectiveShell) bindNavEvents();
  mountAiChatWidget();
}

function formatQuizRevealed(q) {
  const answers = normalizeClozeAnswers(q);
  return renderInteractiveClozePrompt(q.question, answers, getAllRevealedBlankMap(q.question, answers), 'data-quiz-blank');
}

function applyObjectiveSubjectReviewQuestion(targetIndex) {
  const review = state.objectiveSubjectReview;
  if (!review) return;

  const startIndex = Math.max(0, Number(review.startIndex || 0));
  const endIndex = Math.max(startIndex, Math.min(Number(review.endIndex || startIndex), state.quizQuestions.length - 1));
  const nextIndex = Math.max(startIndex, Math.min(Number(targetIndex || startIndex), endIndex));
  const question = state.quizQuestions[nextIndex];
  const record = getObjectiveSubjectReviewRecord(question, nextIndex);
  const selectedLabel = record?.selectedLabel || getObjectiveSelectedLabel(question, nextIndex);
  const isCorrect = record
    ? !!record.isCorrect
    : !!selectedLabel && (question.correctLabels || []).includes(selectedLabel);

  state.quizIndex = nextIndex;
  state.quizRevealed = true;
  state.quizRevealedBlanks = {};
  state.quizSelectedChoiceLabel = selectedLabel;
  state.quizSubmission = {
    selectedLabel,
    isCorrect,
  };
}

function startObjectiveSubjectReview() {
  const result = state.objectiveSubjectResult;
  if (!result) return;

  state.objectiveSubjectReview = {
    subjectNumber: result.subjectNumber,
    startIndex: result.startIndex,
    endIndex: result.endIndex,
    returnIndex: result.nextIndex,
  };
  applyObjectiveSubjectReviewQuestion(result.startIndex);
  renderQuiz();
  window.scrollTo(0, 0);
}

function goToObjectiveSubjectReviewQuestion(targetIndex) {
  if (!isObjectiveSubjectReviewMode()) return;
  applyObjectiveSubjectReviewQuestion(targetIndex);
  renderQuiz();
  window.scrollTo(0, 0);
}

function endObjectiveSubjectReview() {
  const result = state.objectiveSubjectResult;
  state.objectiveSubjectReview = null;
  state.quizRevealed = false;
  state.quizRevealedBlanks = {};
  state.quizSubmission = null;
  if (result) {
    state.quizIndex = Math.max(0, Math.min(Number(result.endIndex || 0), state.quizQuestions.length - 1));
    state.quizSelectedChoiceLabel = getObjectiveSelectedLabel(state.quizQuestions[state.quizIndex], state.quizIndex);
    renderObjectiveSubjectCheckpoint();
  } else {
    renderQuiz();
  }
  window.scrollTo(0, 0);
}

function renderObjectiveSubjectReviewActions() {
  const review = state.objectiveSubjectReview;
  if (!review) return '';

  const startIndex = Math.max(0, Number(review.startIndex || 0));
  const endIndex = Math.max(startIndex, Number(review.endIndex || startIndex));
  const isFirst = state.quizIndex <= startIndex;
  const isLast = state.quizIndex >= endIndex;
  return `
    <div class="quiz-actions quiz-exam-actions">
      <button class="btn-quiz-action secondary" id="btn-subject-review-prev" ${isFirst ? 'disabled' : ''}>이전</button>
      <button class="btn-quiz-action next" id="${isLast ? 'btn-subject-review-done' : 'btn-subject-review-next'}">
        ${isLast ? '채점 결과로' : '다음 문제'}
      </button>
    </div>
  `;
}

function goToObjectiveExamQuestion(targetIndex) {
  if (!isObjectiveExamSession()) return;
  state.objectiveSubjectReview = null;
  state.objectiveSubjectResult = null;
  state.quizIndex = Math.max(0, Math.min(Number(targetIndex || 0), state.quizQuestions.length - 1));
  state.quizRevealed = false;
  state.quizRevealedBlanks = {};
  state.quizSubmission = null;
  state.quizSelectedChoiceLabel = getObjectiveSelectedLabel(state.quizQuestions[state.quizIndex], state.quizIndex);
  ensureObjectiveSubjectTimer(state.quizQuestions[state.quizIndex], state.quizIndex);
  persistCurrentObjectiveSetProgress({
    currentIndex: state.quizIndex,
    answers: state.quizAnswers,
    elapsedSeconds: getQuizElapsedSeconds(),
  });
  renderQuiz();
}

function nextQuizQuestion() {
  if (isObjectiveExamSession()) {
    goToObjectiveExamQuestion(state.quizIndex + 1);
    return;
  }

  state.quizIndex++;
  state.quizRevealed = false;
  state.quizRevealedBlanks = {};
  state.quizSelectedChoiceLabel = null;
  state.quizSubmission = null;
  persistCurrentObjectiveSetProgress({
    currentIndex: Math.min(state.quizIndex, state.quizQuestions.length),
    completed: state.quizIndex >= state.quizQuestions.length,
  });
  renderQuiz();
}

function renderObjectiveSubjectCheckpointWrongList(result) {
  const wrongResults = Array.isArray(result?.wrongResults) ? result.wrongResults : [];
  if (!wrongResults.length) {
    return '<div class="quiz-result-perfect">틀린 문제가 없어요.</div>';
  }

  return `
    <div class="quiz-result-wrong-list objective-subject-wrong-list">
      ${wrongResults.map((record, index) => {
        const selected = record.selectedLabel
          ? `${record.selectedLabel}번${record.selectedText ? ` · ${record.selectedText}` : ''}`
          : '선택하지 않음';
        return `
          <div class="quiz-result-wrong-item">
            <div class="quiz-result-wrong-top">
              <span>${record.questionNumber ? `${record.questionNumber}번` : `${index + 1}번`}</span>
              <strong>오답</strong>
            </div>
            <p>${escapeHtml(record.questionText || '')}</p>
            <em>선택: ${escapeHtml(selected)}</em>
            <em>정답: ${escapeHtml(record.answer || (record.correctLabels || []).join(', '))}</em>
            ${record.explanation ? `<div class="quiz-result-explanation">${escapeHtml(record.explanation)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderObjectiveSubjectCheckpoint() {
  const result = state.objectiveSubjectResult;
  if (!result) {
    renderQuiz();
    return;
  }

  const wrongCount = result.wrongResults?.length || 0;
  const nextLabel = result.nextIndex >= state.quizQuestions.length
    ? '최종 채점하기'
    : `${Math.min(5, result.subjectNumber + 1)}과목 계속 풀기`;
  const wrongListHtml = result.showWrongList ? renderObjectiveSubjectCheckpointWrongList(result) : '';
  const savedLabel = result.savedToNotebook ? '오답노트 저장됨' : '오답노트에 저장하기';

  app.innerHTML = `
    <div class="quiz-result quiz-subject-checkpoint has-bottom-nav">
      <div class="result-emoji">📝</div>
      <div class="result-title">${escapeHtml(result.shortTitle)} 채점 결과</div>
      <div class="result-score">${result.score}점입니다 !!!!</div>
      <div class="result-detail">
        ${result.total}문제 중 ${result.correct}문제를 맞혔어요 · ${escapeHtml(formatDurationKorean(result.elapsedSeconds))} 걸렸어요
      </div>
      <div class="quiz-subject-mini">
        <span>정답 ${result.correct}</span>
        <span>오답 ${wrongCount}</span>
        ${result.unanswered ? `<span>미답 ${result.unanswered}</span>` : ''}
      </div>
      <div class="quiz-subject-actions">
        <button class="btn-quiz-action secondary" id="btn-subject-show-wrong" ${wrongCount ? '' : 'disabled'}>
          ${result.showWrongList ? '오답 접기' : '오답 보러가기'}
        </button>
        <button class="btn-quiz-action knew" id="btn-subject-save-note" ${wrongCount && !result.savedToNotebook ? '' : 'disabled'}>
          ${wrongCount ? savedLabel : '저장할 오답 없음'}
        </button>
        <button class="btn-quiz-action review" id="btn-subject-review">복기하기</button>
        <button class="btn-quiz-action next" id="btn-subject-continue">${escapeHtml(nextLabel)}</button>
      </div>
      ${wrongListHtml}
    </div>
    ${renderBottomNav('objective')}
  `;

  document.getElementById('btn-subject-show-wrong')?.addEventListener('click', () => {
    state.objectiveSubjectResult = {
      ...state.objectiveSubjectResult,
      showWrongList: !state.objectiveSubjectResult.showWrongList,
    };
    renderObjectiveSubjectCheckpoint();
  });

  document.getElementById('btn-subject-save-note')?.addEventListener('click', () => {
    saveObjectiveSubjectResultToNotebook();
    renderObjectiveSubjectCheckpoint();
  });

  document.getElementById('btn-subject-review')?.addEventListener('click', () => {
    startObjectiveSubjectReview();
  });

  document.getElementById('btn-subject-continue')?.addEventListener('click', () => {
    continueObjectiveExamAfterSubjectResult();
  });

  bindNavEvents();
  mountAiChatWidget();
}

function continueObjectiveExamAfterSubjectResult() {
  const result = state.objectiveSubjectResult;
  if (!result) {
    renderQuiz();
    return;
  }

  state.objectiveSubjectResult = null;
  state.objectiveSubjectReview = null;
  if (result.nextIndex >= state.quizQuestions.length) {
    finishObjectiveExam();
    return;
  }

  const nextQuestion = state.quizQuestions[result.nextIndex];
  const nextSubject = getObjectivePeriodNumber(nextQuestion, result.nextIndex);
  if (nextSubject) {
    state.objectiveSubjectTimerBaselines = {
      ...(state.objectiveSubjectTimerBaselines || {}),
      [String(nextSubject)]: state.quizElapsedSeconds,
    };
  }
  goToObjectiveExamQuestion(result.nextIndex);
}

function renderObjectiveResultBreakdown() {
  const results = Array.isArray(state.quizResults) ? state.quizResults : [];
  if (!results.length) return '';

  const wrongResults = results.filter(result => !result.isCorrect);
  const correctResults = results.filter(result => result.isCorrect);
  const wrongListHtml = wrongResults.length ? `
    <div class="quiz-result-wrong-list">
      ${wrongResults.map((result, index) => {
        const questionNumber = Number(result.questionNumber || index + 1);
        const selected = result.selectedLabel
          ? `${result.selectedLabel}번${result.selectedText ? ` · ${result.selectedText}` : ''}`
          : '선택하지 않음';
        const resultIndex = results.indexOf(result);
        return `
          <div class="quiz-result-wrong-item">
            <div class="quiz-result-wrong-top">
              <span>${questionNumber ? `${questionNumber}번` : '오답'}</span>
              <strong>오답</strong>
            </div>
            <p>${escapeHtml(result.questionText || '')}</p>
            <em>선택: ${escapeHtml(selected)}</em>
            <em>정답: ${escapeHtml(result.answer || (result.correctLabels || []).join(', '))}</em>
            ${result.explanation ? `<div class="quiz-result-explanation">${escapeHtml(result.explanation)}</div>` : ''}
            ${result.theoryTarget ? `
              <button class="quiz-result-theory-btn" type="button" data-result-theory="${resultIndex}">
                ${escapeHtml(result.theoryTarget.label || '관련 이론 보기')}
              </button>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  ` : '<div class="quiz-result-perfect">틀린 문제가 없어요.</div>';

  return `
    <div class="quiz-result-breakdown">
      <div class="quiz-result-breakdown-head">
        <span>객관식 채점표</span>
        <strong>정답 ${correctResults.length} · 오답 ${wrongResults.length}</strong>
      </div>
      <div class="quiz-result-time">풀이 시간 ${escapeHtml(formatDuration(state.quizElapsedSeconds || getQuizElapsedSeconds()))}</div>
      ${wrongListHtml}
    </div>
  `;
}

// ??? STATS PAGE ?????????????????????????????????????????????
function renderQuizResult() {
  persistCurrentObjectiveSetProgress({
    currentIndex: state.quizQuestions.length,
    completed: true,
  });

  const total = state.quizScore.correct + state.quizScore.incorrect;
  const pct = total > 0 ? Math.round((state.quizScore.correct / total) * 100) : 0;

  let emoji = '📝';
  let message = '복습을 마쳤어요';
  if (pct >= 80) {
    emoji = '🎉';
    message = '아주 잘했어요!';
  } else if (pct >= 60) {
    emoji = '🌟';
    message = '나름 잘하고 있어요';
  } else if (pct >= 40) {
    emoji = '💡';
    message = '조금만 더 복습하면 좋아요';
  } else if (total > 0) {
    emoji = '📚';
    message = '한번 더 보면 좋아요';
  }

  const secondaryActionLabel = getQuizSecondaryActionLabel();
  const showObjectiveShell = isObjectiveQuizShell(state.quizQuestions[state.quizQuestions.length - 1]);
  const subjectResultScoresHtml = showObjectiveShell ? renderObjectiveSubjectResultScores() : '';
  const resultBreakdownHtml = showObjectiveShell ? renderObjectiveResultBreakdown() : '';

  app.innerHTML = `
    <div class="quiz-result ${showObjectiveShell ? 'has-bottom-nav' : ''}">
      <div class="result-emoji">${emoji}</div>
      <div class="result-title">${message}</div>
      <div class="result-score">${pct}%</div>
      <div class="result-detail">${total}문제 중 ${state.quizScore.correct}문제를 맞혔어요${showObjectiveShell ? ` · ${formatDuration(state.quizElapsedSeconds)} 소요` : ''}</div>
      ${subjectResultScoresHtml}
      ${resultBreakdownHtml}
      <button class="btn-home" id="btn-next-lecture">${getQuizPrimaryActionLabel()}</button>
      ${secondaryActionLabel ? `<button class="btn-skip-quiz" id="btn-quiz-secondary" style="margin-top:8px">${secondaryActionLabel}</button>` : ''}
      <button class="btn-skip-quiz" id="btn-quiz-home" style="margin-top:8px">홈으로</button>
    </div>
    ${showObjectiveShell ? renderBottomNav('objective') : ''}
  `;

  document.getElementById('btn-next-lecture').addEventListener('click', async () => {
    await handleQuizPrimaryAction();
  });

  document.getElementById('btn-quiz-secondary')?.addEventListener('click', () => {
    handleQuizSecondaryAction();
  });

  document.getElementById('btn-quiz-home').addEventListener('click', () => {
    state.quizContext = null;
    navigate('home');
  });

  document.querySelectorAll('[data-result-theory]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = state.quizResults[Number(button.dataset.resultTheory || -1)];
      openObjectiveTheoryTarget(result?.theoryTarget);
    });
  });

  if (showObjectiveShell) bindNavEvents();
  mountAiChatWidget();
}

function renderObjectiveHub() {
  if (!state.objectiveSetsReady && !state.objectiveSetsLoading && !state.objectiveSetsError) {
    loadObjectiveSets();
  }

  const objectiveSets = state.objectiveSets || [];

  const loadingHtml = state.objectiveSetsLoading
    ? `<div class="auth-note" style="margin:20px 20px 16px">객관식 문제 세트를 불러오는 중이에요.</div>`
    : '';
  const errorHtml = state.objectiveSetsError
    ? `<div class="auth-error" style="margin:20px 20px 16px">${escapeHtml(state.objectiveSetsError)}</div>`
    : '';
  const setListHtml = objectiveSets.length ? `
      <div class="objective-list objective-list-compact">
        ${objectiveSets.map((set) => `
          <button class="objective-item" data-objective-set="${escapeHtml(set.id)}">
            <div class="objective-item-head">
              <span class="objective-item-badge">${escapeHtml(set.subject || '객관식')}</span>
              <span class="objective-item-subject">${getObjectiveSetQuestionCount(set)}문제</span>
            </div>
            <div class="objective-item-title">${escapeHtml(set.title || '객관식 문제 세트')}</div>
            <div class="objective-item-meta">${escapeHtml(getObjectiveSetSectionSummary(set) || set.description || '문제를 풀고 바로 정답과 해설을 확인할 수 있어요.')}</div>
            ${renderObjectiveSetProgress(set)}
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state" style="margin:0 20px 20px">
        <div class="empty-emoji">📝</div>
        <div class="empty-text">
          아직 등록된 객관식 세트가 없어요.<br/>
          문제 JSON을 추가하면 이곳에서 바로 풀 수 있습니다.
        </div>
      </div>
    `;

  app.innerHTML = `
    <div class="page" id="page-objective">
      ${loadingHtml}
      ${errorHtml}
      ${setListHtml}
    </div>

    ${renderBottomNav('objective')}
  `;

  document.querySelectorAll('[data-objective-set]').forEach((button) => {
    button.addEventListener('click', () => {
      startObjectiveSetSession(button.dataset.objectiveSet);
    });
  });

  document.querySelectorAll('[data-objective-theory-set][data-objective-theory-question]').forEach((button) => {
    button.addEventListener('click', () => {
      const set = state.objectiveSets.find(item => item.id === button.dataset.objectiveTheorySet);
      const sourceQuestion = (set?.questions || []).find(item =>
        String(item.id || item.question_id || item.number) === String(button.dataset.objectiveTheoryQuestion)
      );
      if (!set || !sourceQuestion) return;
      const question = buildObjectiveSetQuestionPayload(set, sourceQuestion, 0);
      openObjectiveTheoryTarget(getObjectiveTheoryTarget(question));
    });
  });

  bindNavEvents();
  mountAiChatWidget();
}

function renderObjectiveWrongNotePage() {
  if (!state.objectiveSetsReady && !state.objectiveSetsLoading && !state.objectiveSetsError) {
    loadObjectiveSets();
  }

  const objectiveSets = state.objectiveSets || [];
  const allEntries = getObjectiveWrongEntries(objectiveSets);
  const countBySetId = allEntries.reduce((map, entry) => {
    const setId = String(entry.set.id || '');
    map.set(setId, (map.get(setId) || 0) + 1);
    return map;
  }, new Map());
  const groups = objectiveSets
    .map(set => ({ set, count: countBySetId.get(String(set.id || '')) || 0 }))
    .filter(group => group.count > 0);
  const firstGroupSetId = groups.length ? String(groups[0].set.id || '') : 'all';
  const availableSetIds = new Set(groups.map(group => String(group.set.id || '')));
  const requestedSetId = String(state.objectiveWrongNoteSetFilter || firstGroupSetId);
  const activeSetId = availableSetIds.has(requestedSetId)
    ? requestedSetId
    : firstGroupSetId;
  if (state.objectiveWrongNoteSetFilter !== activeSetId) {
    state.objectiveWrongNoteSetFilter = activeSetId;
  }
  const activeGroup = groups.find(group => String(group.set.id || '') === activeSetId);
  const activeLabel = getObjectiveSetRoundLabel(activeGroup?.set);
  const entries = allEntries.filter(entry => String(entry.set.id || '') === activeSetId);
  const filterHtml = allEntries.length ? `
    <div class="wrong-note-filter-row" aria-label="오답노트 회차 필터">
      ${groups.map(({ set, count }) => {
        const setId = String(set.id || '');
        const isActive = activeSetId === setId;
        return `
          <button
            class="wrong-note-filter-chip ${isActive ? 'active' : ''}"
            type="button"
            data-wrong-note-set="${escapeHtml(setId)}"
            aria-pressed="${isActive}"
          >
            ${escapeHtml(getObjectiveSetRoundLabel(set))} <em>${count}</em>
          </button>
        `;
      }).join('')}
    </div>
  ` : '';
  const loadingHtml = state.objectiveSetsLoading
    ? `<div class="auth-note wrong-note-state">객관식 오답노트를 불러오는 중이에요.</div>`
    : '';
  const errorHtml = state.objectiveSetsError
    ? `<div class="auth-error wrong-note-state">${escapeHtml(state.objectiveSetsError)}</div>`
    : '';
  const emptyHtml = !state.objectiveSetsLoading && !state.objectiveSetsError && entries.length === 0
    ? `
      <div class="empty-state wrong-note-empty">
        <div class="empty-emoji">🧾</div>
        <div class="empty-text">
          저장된 오답이 없어요.<br/>
          과목 채점 화면에서 오답노트에 저장하면 이곳에 모입니다.
        </div>
      </div>
    `
    : '';

  app.innerHTML = `
    <div class="page wrong-note-page" id="page-wrong-note">
      <div class="wrong-note-hero">
        <div>
          <div class="home-kicker">객관식 복습</div>
          <h1 class="home-title">오답노트</h1>
          <p class="wrong-note-sub">틀린 문제만 모아서 다시 보고, 바로 재도전할 수 있어요.</p>
        </div>
        <div class="wrong-note-count">
          <strong>${entries.length}</strong>
          <span>문제</span>
        </div>
      </div>

      ${filterHtml}

      ${entries.length ? `
        <button class="objective-wrong-card wrong-note-start-card" type="button" data-objective-wrong-review="${escapeHtml(activeSetId)}">
          <div class="objective-wrong-top">
            <span>오답 다시 풀기</span>
            <strong>${entries.length}문제</strong>
          </div>
          <div class="objective-wrong-title">${escapeHtml(activeLabel)} 오답 재도전</div>
          <div class="objective-wrong-meta">선택한 회차 오답만 다시 풀어요</div>
        </button>
      ` : ''}

      ${loadingHtml}
      ${errorHtml}
      ${emptyHtml}
    </div>
    ${renderBottomNav('wrong-note')}
  `;

  document.querySelectorAll('[data-wrong-note-set]').forEach((button) => {
    button.addEventListener('click', () => {
      state.objectiveWrongNoteSetFilter = button.dataset.wrongNoteSet || 'all';
      renderObjectiveWrongNotePage();
    });
  });

  document.querySelectorAll('[data-objective-wrong-review]').forEach((button) => {
    button.addEventListener('click', () => {
      startObjectiveWrongReviewSession(button.dataset.objectiveWrongReview || 'all');
    });
  });

  bindNavEvents();
  mountAiChatWidget();
}

function getPracticalDetails(item) {
  if (Array.isArray(item?.details)) return item.details;
  if (item?.details) return [item.details];
  return [];
}

function cleanPracticalText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizePracticalCloze(item, cloze, index) {
  const prompt = cleanPracticalText(cloze?.prompt || '');
  const answers = normalizeClozeAnswers(cloze);
  if (!prompt || !answers.length) return null;
  const details = getPracticalDetails(item);
  const sourceText = cloze?.source === 'detail'
    ? details.join(' ')
    : (item.summary || details.join(' '));
  return {
    id: `${item.id}-reviewed-${index + 1}`,
    label: cleanPracticalText(cloze.label || `검수 ${index + 1}`),
    prompt,
    answers,
    answer: answers.join(' / '),
    fullText: cleanPracticalText(sourceText || item.title || prompt),
  };
}

function buildPracticalDetailCloze(detail, index, item) {
  const text = cleanPracticalText(detail);
  if (!text) return null;

  const numberMatch = text.match(/^\((\d+)\)\s*(.+)$/);
  const label = numberMatch ? `(${numberMatch[1]})` : `(${index + 1})`;
  const body = numberMatch ? numberMatch[2].trim() : text;
  const equalIndex = body.indexOf('=');
  let mainTerm = '';
  let aliasTerm = '';
  let rest = '';

  if (equalIndex > -1) {
    mainTerm = body.slice(0, equalIndex).trim();
    const afterEqual = body.slice(equalIndex + 1).trim();
    const aliasMatch = afterEqual.match(/^(.+?\([^()]+\))\s*(.*)$/);
    if (aliasMatch) {
      aliasTerm = aliasMatch[1].trim();
      rest = aliasMatch[2].trim();
    } else {
      const parts = afterEqual.split(/\s+/);
      aliasTerm = parts.shift() || '';
      rest = parts.join(' ').trim();
    }
  } else {
    const termMatch = body.match(/^(.+?\([^()]+\))\s*(.*)$/);
    if (termMatch) {
      mainTerm = termMatch[1].trim();
      rest = termMatch[2].trim();
    } else {
      const colonMatch = body.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (colonMatch) {
        mainTerm = colonMatch[1].trim();
        rest = colonMatch[2].trim();
      }
    }
  }

  if (!mainTerm) return null;

  const answer = aliasTerm ? `${mainTerm} = ${aliasTerm}` : mainTerm;
  const prompt = [
    label,
    '____',
    aliasTerm ? '= ____' : '',
    rest,
  ].filter(Boolean).join(' ');

  return {
    id: `${item.id}-detail-${index + 1}`,
    label,
    prompt,
    answers: aliasTerm ? [mainTerm, aliasTerm] : [mainTerm],
    answer,
    fullText: text,
  };
}

function getPracticalClozes(item) {
  const reviewedClozes = Array.isArray(item?.reviewed_clozes)
    ? item.reviewed_clozes
      .map((cloze, index) => normalizePracticalCloze(item, cloze, index))
      .filter(Boolean)
    : [];

  if (reviewedClozes.length) return reviewedClozes;

  const detailClozes = getPracticalDetails(item)
    .map((detail, index) => buildPracticalDetailCloze(detail, index, item))
    .filter(Boolean);

  if (detailClozes.length) return detailClozes;

  return [{
    id: `${item.id}-main`,
    label: '핵심',
    prompt: cleanPracticalText(item.cloze?.prompt || item.summary || ''),
    answers: normalizeClozeAnswers({ answers: item.cloze?.answers, answer: item.cloze?.answer || item.title }),
    answer: cleanPracticalText(item.cloze?.answer || item.title || ''),
    fullText: cleanPracticalText(item.summary || ''),
  }];
}

function getPracticalTitleCloze(item) {
  const title = cleanPracticalText(item.title || '');
  const sourcePrompt = cleanPracticalText(item.cloze?.prompt || '');
  const summary = cleanPracticalText(item.summary || getPracticalDetails(item)[0] || '');
  const prompt = sourcePrompt || ['____', summary ? `: ${summary}` : ''].join('');
  const leadingBlankMatch = sourcePrompt.match(/^(?:\{\{blank\}\}|_{2,})\s*([^:：]+)/i);
  const visibleTitleSuffix = cleanPracticalText(leadingBlankMatch?.[1] || '');
  const titleAnswer = visibleTitleSuffix && title.endsWith(visibleTitleSuffix)
    ? cleanPracticalText(title.slice(0, -visibleTitleSuffix.length))
    : title;
  return {
    id: `${item.id}-title`,
    label: '제목',
    prompt,
    answers: [titleAnswer || title],
    answer: titleAnswer || title,
    fullText: `제목: ${title}`,
  };
}

function getPracticalQuestionClozes(item) {
  const seenPrompts = new Set();
  const clozes = item.title_cloze_enabled === false
    ? getPracticalClozes(item)
    : [getPracticalTitleCloze(item), ...getPracticalClozes(item)];

  return clozes
    .filter(Boolean)
    .filter((cloze) => {
      const key = cleanPracticalText(cloze.prompt);
      if (!key || seenPrompts.has(key)) return false;
      seenPrompts.add(key);
      return true;
    });
}

function getPracticalCardSummary(item, clozes) {
  const details = getPracticalDetails(item);
  if (details.length > 1) {
    return `하위 개념 ${details.length}개`;
  }

  const summary = cleanPracticalText(item.summary || '');
  if (summary && (!clozes.length || summary !== clozes[0].fullText)) {
    return summary;
  }

  return '핵심 개념';
}

function getPracticalAllItems() {
  return (state.practicalSummary?.sections || []).flatMap(section => section.items || []);
}

function getPracticalItemProgress(itemId) {
  const progress = state.practicalProgress?.by_item_id?.[itemId] || {};
  return {
    correct: Number(progress.correct || 0),
    incorrect: Number(progress.incorrect || 0),
    attempts: Number(progress.attempts || 0),
    lastResult: progress.lastResult || null,
    updatedAt: progress.updatedAt || null,
  };
}

function getPracticalMemoryStats() {
  const items = getPracticalAllItems();
  const progressMap = state.practicalProgress?.by_item_id || {};
  let correct = 0;
  let incorrect = 0;
  let attemptedCount = 0;
  let masteredCount = 0;

  const weakItems = items.map((item) => {
    const progress = getPracticalItemProgress(item.id);
    correct += progress.correct;
    incorrect += progress.incorrect;
    if (progress.attempts > 0) attemptedCount++;
    if (progress.correct > 0 && progress.correct >= progress.incorrect && progress.lastResult === 'correct') {
      masteredCount++;
    }
    return { item, progress, score: progress.incorrect - progress.correct };
  }).filter(entry => entry.progress.incorrect > 0 && entry.score >= 0)
    .sort((a, b) => (b.score - a.score) || (b.progress.incorrect - a.progress.incorrect) || a.item.global_number - b.item.global_number);

  const attempts = correct + incorrect;
  return {
    total: items.length,
    attemptedCount,
    masteredCount,
    correct,
    incorrect,
    attempts,
    memoryPct: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
    weakItems,
    trackedCount: Object.keys(progressMap).length,
  };
}

function recordPracticalResult(itemId, result, options = {}) {
  if (!itemId || !state.currentUser?.user_id) return;
  const shouldRender = options.render !== false;

  const byItemId = {
    ...(state.practicalProgress?.by_item_id || {}),
  };
  const current = getPracticalItemProgress(itemId);
  const next = {
    correct: current.correct + (result === 'correct' ? 1 : 0),
    incorrect: current.incorrect + (result === 'incorrect' ? 1 : 0),
    attempts: current.attempts + 1,
    lastResult: result,
    updatedAt: new Date().toISOString(),
  };

  byItemId[itemId] = next;
  state.practicalProgress = {
    by_item_id: byItemId,
    updatedAt: new Date().toISOString(),
  };
  savePracticalProgress();
  if (shouldRender) {
    renderPracticalSummary();
  }
}

function filterPracticalSections() {
  const summary = state.practicalSummary || { sections: [] };
  const query = state.practicalSearchQuery.trim().toLowerCase();
  const unitFilter = state.practicalUnitFilter;
  const weakIds = new Set(getPracticalMemoryStats().weakItems.map(entry => entry.item.id));

  return (summary.sections || []).map((section) => {
    if (unitFilter !== 'all' && unitFilter !== 'weak' && String(section.unit) !== String(unitFilter)) {
      return { ...section, items: [] };
    }

    const items = (section.items || []).filter((item) => {
      if (unitFilter === 'weak' && !weakIds.has(item.id)) return false;
      if (!query) return true;
      const haystack = [
        item.title,
        item.summary,
        item.cloze?.prompt,
        item.cloze?.answer,
        ...getPracticalDetails(item),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return { ...section, items };
  }).filter(section => section.items.length > 0);
}

function getPracticalStudyItems(filteredSections = filterPracticalSections()) {
  return filteredSections.flatMap(section => (section.items || []).map(item => ({
    ...item,
    sectionUnit: section.unit,
    sectionTitle: section.title,
  })));
}

function getPracticalStudyQuestions(filteredSections = filterPracticalSections()) {
  return filteredSections.flatMap(section => (section.items || []).flatMap((item) => {
    const clozes = getPracticalQuestionClozes(item);
    return clozes.map((cloze, clozeIndex) => ({
      id: `${item.id}::${cloze.id}`,
      item,
      cloze,
      clozeIndex,
      clozeCount: clozes.length,
      sectionUnit: section.unit,
      sectionTitle: section.title,
    }));
  }));
}

function normalizePracticalStudyIndex(count) {
  if (count <= 0) {
    state.practicalStudyIndex = 0;
    return 0;
  }

  if (state.practicalStudyIndex < 0) {
    state.practicalStudyIndex = 0;
  }
  if (state.practicalStudyIndex >= count) {
    state.practicalStudyIndex = count - 1;
  }

  return state.practicalStudyIndex;
}

function pickRandomPracticalIndex(count, currentIndex = state.practicalStudyIndex) {
  if (count <= 1) return 0;

  let nextIndex = currentIndex;
  for (let attempt = 0; attempt < 8 && nextIndex === currentIndex; attempt++) {
    nextIndex = Math.floor(Math.random() * count);
  }

  return nextIndex === currentIndex ? (currentIndex + 1) % count : nextIndex;
}

function renderPracticalStudyControls(count) {
  const mode = state.practicalStudyMode === 'random' ? 'random' : 'sequential';
  const disabled = count <= 1 ? 'disabled' : '';

  return `
    <div class="practical-study-controls">
      <div class="practical-study-modes" role="group" aria-label="실기 학습 방식">
        <button class="practical-study-mode ${mode === 'sequential' ? 'active' : ''}" data-practical-study-mode="sequential">순차</button>
        <button class="practical-study-mode ${mode === 'random' ? 'active' : ''}" data-practical-study-mode="random">랜덤</button>
      </div>
      <div class="practical-study-nav">
        <button class="practical-study-nav-btn" data-practical-study-action="prev" ${disabled}>이전</button>
        <button class="practical-study-nav-btn primary" data-practical-study-action="next" ${disabled}>다음</button>
      </div>
    </div>
  `;
}

function renderPracticalQuizModeControls() {
  const mode = state.practicalStudyMode === 'random' ? 'random' : 'sequential';
  return `
    <div class="practical-quiz-mode-toggle" role="group" aria-label="실기 빈칸 학습 방식">
      <button class="${mode === 'sequential' ? 'active' : ''}" data-practical-study-mode="sequential">순차</button>
      <button class="${mode === 'random' ? 'active' : ''}" data-practical-study-mode="random">랜덤</button>
    </div>
  `;
}

function movePracticalQuestion(direction, questionCount) {
  if (questionCount <= 0) {
    state.practicalStudyIndex = 0;
    state.practicalRevealed = false;
    state.practicalRevealedBlanks = {};
    renderPracticalSummary();
    return;
  }

  if (direction === 'prev') {
    state.practicalStudyIndex = (state.practicalStudyIndex - 1 + questionCount) % questionCount;
  } else if (state.practicalStudyMode === 'random') {
    state.practicalStudyIndex = pickRandomPracticalIndex(questionCount);
  } else {
    state.practicalStudyIndex = (state.practicalStudyIndex + 1) % questionCount;
  }
  state.practicalRevealed = false;
  state.practicalRevealedBlanks = {};
  renderPracticalSummary();
}

function submitPracticalQuizResult(question, result, questionCount) {
  if (!question?.item?.id) return;
  recordPracticalResult(question.item.id, result, { render: false });
  movePracticalQuestion('next', questionCount);
}

function renderPracticalUnitChips(sections) {
  const allCount = state.practicalSummary?.source?.item_count || sections.reduce((sum, section) => sum + (section.item_count || 0), 0);
  const weakCount = getPracticalMemoryStats().weakItems.length;
  return `
    <div class="practical-chip-row">
      <button class="practical-chip ${state.practicalUnitFilter === 'all' ? 'active' : ''}" data-practical-unit="all">
        전체 <span>${allCount}</span>
      </button>
      <button class="practical-chip weak ${state.practicalUnitFilter === 'weak' ? 'active' : ''}" data-practical-unit="weak">
        오답 복습 <span>${weakCount}</span>
      </button>
      ${sections.map(section => `
        <button class="practical-chip ${String(state.practicalUnitFilter) === String(section.unit) ? 'active' : ''}" data-practical-unit="${section.unit}">
          ${String(section.unit).padStart(2, '0')} <span>${section.item_count || (section.items || []).length}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderPracticalMemoryPanel(stats) {
  const weakItems = stats.weakItems.slice(0, 5);
  return `
    <div class="practical-memory-panel">
      <div class="practical-memory-grid">
        <div class="practical-memory-stat primary">
          <div class="practical-memory-label">암기률</div>
          <div class="practical-memory-value">${stats.memoryPct}<span>%</span></div>
          <div class="practical-memory-sub">맞힘 ${stats.correct} · 틀림 ${stats.incorrect}</div>
        </div>
        <div class="practical-memory-stat">
          <div class="practical-memory-label">학습한 항목</div>
          <div class="practical-memory-value">${stats.attemptedCount}<span>/${stats.total}</span></div>
          <div class="practical-memory-sub">누적 확인 항목</div>
        </div>
      </div>

      <div class="practical-weak-review">
        <div class="practical-weak-head">
          <div>
            <div class="practical-section-kicker">오답 집중</div>
            <h2>자주 틀리는 개념 복습</h2>
          </div>
          <button class="practical-weak-filter" data-practical-unit="weak">모아보기</button>
        </div>
        ${weakItems.length ? `
          <div class="practical-weak-list">
            ${weakItems.map(({ item, progress }) => `
              <button class="practical-weak-item" data-practical-focus="${escapeHtml(item.id)}">
                <span>${String(item.global_number).padStart(3, '0')}</span>
                <strong>오답 항목 복습</strong>
                <em>오답 ${progress.incorrect} · 정답 ${progress.correct}</em>
              </button>
            `).join('')}
          </div>
        ` : `
          <div class="practical-weak-empty">아직 누적된 오답 개념이 없어요.</div>
        `}
      </div>
    </div>
  `;
}

function renderPracticalDetails(item) {
  const details = getPracticalDetails(item).slice(0, 8);
  if (!details.length) return '';
  return `
    <ul class="practical-detail-list">
      ${details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}
    </ul>
  `;
}

function renderPracticalClozeBlock(cloze) {
  const answers = normalizeClozeAnswers(cloze);
  const revealedBlanks = getAllRevealedBlankMap(cloze.prompt, answers);
  return `
    <div class="practical-cloze">
      <div class="practical-cloze-label">빈칸 암기 ${escapeHtml(cloze.label)}</div>
      <p>${renderInteractiveClozePrompt(cloze.prompt, answers, revealedBlanks, 'data-static-practical-blank')}</p>
    </div>
  `;
}

function renderPracticalItemCard(item) {
  const progress = getPracticalItemProgress(item.id);
  const statusClass = progress.lastResult === 'correct'
    ? 'remembered'
    : progress.lastResult === 'incorrect'
      ? 'missed'
      : '';
  const itemAccuracy = progress.attempts > 0 ? Math.round((progress.correct / progress.attempts) * 100) : 0;
  const detailClozes = getPracticalClozes(item);
  const clozes = getPracticalQuestionClozes(item);

  return `
    <article class="practical-card ${statusClass}" id="practical-card-${escapeHtml(item.id)}">
      <div class="practical-card-head">
        <span class="practical-number">${String(item.global_number).padStart(3, '0')}</span>
        <h3><span class="practical-title-blank">____</span></h3>
      </div>

      <div class="practical-summary">${escapeHtml(getPracticalCardSummary(item, detailClozes))}</div>

      <div class="practical-cloze-list">
        ${clozes.map(renderPracticalClozeBlock).join('')}
      </div>

      <div class="practical-memory-actions">
        <div class="practical-item-score">
          ${progress.attempts > 0
            ? `암기 ${itemAccuracy}% · 맞힘 ${progress.correct} · 틀림 ${progress.incorrect}`
            : '아직 암기 기록 없음'}
        </div>
        <div class="practical-action-buttons">
          <button class="practical-result-btn correct" data-practical-result="${escapeHtml(item.id)}" data-result="correct">외웠어요</button>
          <button class="practical-result-btn incorrect" data-practical-result="${escapeHtml(item.id)}" data-result="incorrect">틀렸어요</button>
        </div>
      </div>
    </article>
  `;
}

function renderPracticalSummary() {
  if (!state.practicalSummaryReady && !state.practicalSummaryLoading && !state.practicalSummaryError) {
    loadPracticalSummary();
  }

  const summary = state.practicalSummary || { source: { section_count: 0, item_count: 0 }, sections: [] };
  const sections = summary.sections || [];
  const filteredSections = filterPracticalSections();
  const studyQuestions = getPracticalStudyQuestions(filteredSections);
  const visibleCount = studyQuestions.length;
  const currentIndex = normalizePracticalStudyIndex(visibleCount);
  const currentQuestion = studyQuestions[currentIndex] || null;
  const currentAnswers = currentQuestion ? normalizeClozeAnswers(currentQuestion.cloze) : [];
  const progress = visibleCount > 0 ? Math.round((currentIndex / visibleCount) * 100) : 0;

  const loadingHtml = state.practicalSummaryLoading
    ? `<div class="auth-note practical-state-note">실기 정리 데이터를 불러오는 중이에요.</div>`
    : '';
  const errorHtml = state.practicalSummaryError
    ? `<div class="auth-error practical-state-note">${escapeHtml(state.practicalSummaryError)}</div>`
    : '';
  const emptyHtml = !state.practicalSummaryLoading && !state.practicalSummaryError && visibleCount === 0
    ? `<div class="empty-state practical-empty"><div class="empty-emoji">🔎</div><div class="empty-text">조건에 맞는 실기 정리가 없어요</div></div>`
    : '';
  const questionHtml = currentQuestion ? `
    <div class="quiz-body practical-quiz-body">
      <div class="quiz-card practical-quiz-card" id="practical-card-${escapeHtml(currentQuestion.item.id)}">
        <div class="quiz-type">📚 ${String(currentQuestion.sectionUnit).padStart(2, '0')}단원 ${escapeHtml(currentQuestion.sectionTitle || '')}</div>
        <div class="practical-quiz-mini-label">
          <span>${String(currentQuestion.item.global_number).padStart(3, '0')}</span>
          <span>${escapeHtml(currentQuestion.cloze.label)}</span>
        </div>
        <div class="quiz-question practical-quiz-question">
          ${renderInteractiveClozePrompt(
            currentQuestion.cloze.prompt,
            currentAnswers,
            state.practicalRevealedBlanks,
            'data-practical-blank'
          )}
        </div>

        ${state.practicalRevealed ? `
          <div class="quiz-actions">
            <button class="btn-quiz-action knew" data-practical-quiz-result="correct">외웠어요</button>
            <button class="btn-quiz-action didnt-know" data-practical-quiz-result="incorrect">틀렸어요</button>
          </div>
        ` : ''}

        <div class="practical-quiz-nav-row">
          <button data-practical-study-action="prev" ${visibleCount <= 1 ? 'disabled' : ''}>이전</button>
          <button data-practical-study-action="next" ${visibleCount <= 1 ? 'disabled' : ''}>건너뛰기</button>
        </div>
      </div>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="quiz-page practical-quiz-page" id="page-practical">
      <div class="quiz-header practical-quiz-header">
        <button class="practical-back-btn" id="btn-practical-back" type="button" aria-label="홈으로 돌아가기">←</button>
        <div class="practical-progress-wrap">
          <div class="quiz-progress-text">${visibleCount > 0 ? currentIndex + 1 : 0} / ${visibleCount}</div>
          <div class="quiz-progress-bar">
            <div class="fill" style="width: ${progress}%"></div>
          </div>
        </div>
        ${renderPracticalQuizModeControls()}
      </div>

      ${loadingHtml}
      ${errorHtml}
      ${emptyHtml}
      ${questionHtml}
    </div>

    ${renderBottomNav('practical')}
  `;

  document.getElementById('btn-practical-back')?.addEventListener('click', () => {
    state.practicalRevealed = false;
    state.practicalRevealedBlanks = {};
    navigate('home');
  });

  document.querySelectorAll('[data-practical-unit]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalUnitFilter = button.dataset.practicalUnit || 'all';
      state.practicalStudyIndex = 0;
      state.practicalRevealed = false;
      state.practicalRevealedBlanks = {};
      renderPracticalSummary();
    });
  });

  document.querySelectorAll('[data-practical-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalUnitFilter = 'weak';
      state.practicalSearchQuery = '';
      const targetId = button.dataset.practicalFocus;
      const focusedItems = getPracticalStudyQuestions(filterPracticalSections());
      const focusedIndex = focusedItems.findIndex(entry => entry.id === targetId || entry.item.id === targetId);
      state.practicalStudyIndex = focusedIndex >= 0 ? focusedIndex : 0;
      state.practicalRevealed = false;
      state.practicalRevealedBlanks = {};
      renderPracticalSummary();
      setTimeout(() => {
        document.getElementById(`practical-card-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  });

  document.querySelectorAll('[data-practical-study-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalStudyMode = button.dataset.practicalStudyMode === 'random' ? 'random' : 'sequential';
      if (state.practicalStudyMode === 'random') {
        const items = getPracticalStudyQuestions();
        state.practicalStudyIndex = pickRandomPracticalIndex(items.length);
      }
      state.practicalRevealed = false;
      state.practicalRevealedBlanks = {};
      renderPracticalSummary();
    });
  });

  document.querySelectorAll('[data-practical-study-action]').forEach((button) => {
    button.addEventListener('click', () => {
      movePracticalQuestion(button.dataset.practicalStudyAction, visibleCount);
    });
  });

  document.querySelectorAll('[data-practical-blank]').forEach((button) => {
    button.addEventListener('click', () => {
      const blankIndex = Number(button.dataset.practicalBlank || 0);
      state.practicalRevealedBlanks = {
        ...state.practicalRevealedBlanks,
        [blankIndex]: true,
      };
      state.practicalRevealed = isEveryBlankRevealed(
        currentQuestion?.cloze?.prompt || '',
        currentAnswers,
        state.practicalRevealedBlanks
      );
      renderPracticalSummary();
    });
  });

  document.querySelectorAll('[data-practical-quiz-result]').forEach((button) => {
    button.addEventListener('click', () => {
      submitPracticalQuizResult(currentQuestion, button.dataset.practicalQuizResult, visibleCount);
    });
  });

  bindNavEvents();
}

function getCoreSummarySubjectOptions(sections = []) {
  const subjectMap = new Map();
  sections.forEach((section) => {
    if (!section?.subject_id) return;
    subjectMap.set(String(section.subject_id), section.subject || `${section.subject_id}과목`);
  });
  return [...subjectMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([id, name]) => ({ id, name }));
}

function getFilteredCoreSummarySections() {
  const sections = state.coreSummary?.sections || [];
  const query = state.coreSummarySearchQuery.trim().toLowerCase();
  const subjectFilter = String(state.coreSummarySubjectFilter || 'all');

  return sections.filter((section) => {
    const subjectMatch = subjectFilter === 'all' || String(section.subject_id) === subjectFilter;
    if (!subjectMatch) return false;
    if (!query) return true;

    const haystack = [
      section.subject,
      section.chapter,
      section.chapter_title,
      section.title,
      section.importance,
      ...(section.keywords || []),
      ...(section.pdf_pages || []),
      ...(section.book_pages || []),
      ...((section.items || []).flatMap(item => [item.title, item.body])),
      ...((section.clozeItems || []).flatMap((item) => [
        item.displayText,
        item.sourceSummary,
        ...(item.answers || []).map(answer => answer?.answer || answer),
        ...(item.hint?.keywords || []),
      ])),
      ...((section.pages || []).map(page => page.text)),
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function renderCoreSummaryPage(page) {
  const text = String(page?.text || '').trim();
  const html = escapeHtml(text).replace(/\n/g, '<br>');
  return `
    <article class="core-page-card">
      <div class="core-page-head">
        <span>PDF p.${escapeHtml(String(page?.page || ''))}</span>
      </div>
      <div class="core-page-text">${html || 'OCR 텍스트 없음'}</div>
    </article>
  `;
}

function formatPageRange(values = []) {
  const pages = (values || []).filter(value => value !== null && value !== undefined && value !== '');
  if (!pages.length) return '';
  if (pages.length === 1) return String(pages[0]);
  return `${pages[0]}-${pages[pages.length - 1]}`;
}

function getCoreClozeRevealedMap(clozeId) {
  return state.coreSummaryRevealedBlanks?.[clozeId] || {};
}

function renderCoreKeywordRow(section) {
  const keywords = (section.keywords || []).slice(0, 10);
  if (!keywords.length) return '';
  return `
    <div class="core-keyword-row">
      ${keywords.map(keyword => `<span>${escapeHtml(keyword)}</span>`).join('')}
    </div>
  `;
}

function renderCoreVisualRefs(visualRefs = []) {
  return '';
}

function renderCoreClozeCard(cloze, index) {
  const answers = normalizeClozeAnswers(cloze);
  const revealedMap = getCoreClozeRevealedMap(cloze.id);
  const prompt = cloze.displayText || cloze.prompt || '';
  const fullyRevealed = isEveryBlankRevealed(prompt, answers, revealedMap);
  return `
    <article class="core-cloze-card" data-core-cloze-id="${escapeHtml(cloze.id || `core-cloze-${index}`)}">
      <div class="core-cloze-head">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <em>${escapeHtml(cloze.answerMode === 'multi' ? `${answers.length}개 빈칸` : '단일 빈칸')}</em>
      </div>
      <div class="core-cloze-prompt">
        ${renderInteractiveClozePrompt(prompt, answers, revealedMap, 'data-core-cloze-blank')}
      </div>
      ${fullyRevealed && cloze.sourceSummary ? `<div class="core-cloze-source">${escapeHtml(cloze.sourceSummary)}</div>` : ''}
      ${renderCoreVisualRefs(cloze.visualRefs)}
    </article>
  `;
}

function renderCoreClozeSection(section) {
  const clozes = section.clozeItems || [];
  const bookRange = formatPageRange(section.book_pages || []);
  const pdfRange = formatPageRange(section.pdf_pages || []);
  return `
    <div class="core-detail-tags">
      ${section.importance ? `<span class="importance-${escapeHtml(section.importance).toLowerCase()}">중요도 ${escapeHtml(section.importance)}</span>` : ''}
      ${bookRange ? `<span>교재 p.${escapeHtml(bookRange)}</span>` : ''}
      ${pdfRange ? `<span>PDF p.${escapeHtml(pdfRange)}</span>` : ''}
      <span>${clozes.length}문항</span>
    </div>
    ${renderCoreKeywordRow(section)}
    ${renderCoreVisualRefs(section.visualRefs)}
    <div class="core-cloze-list">
      ${clozes.map(renderCoreClozeCard).join('')}
    </div>
  `;
}

function renderCoreSummaryDetail(section) {
  if (!section) {
    return `<div class="empty-state core-summary-empty"><div class="empty-emoji">📚</div><div class="empty-text">요약 섹션을 선택해 주세요</div></div>`;
  }

  const pages = section.pages || [];
  const clozes = section.clozeItems || [];
  const itemPreview = (section.items || []).slice(0, 8).map(item => `
    <span class="core-item-pill">${escapeHtml(item.number || '')} ${escapeHtml(item.title || '핵심')}</span>
  `).join('');
  const detailMeta = clozes.length
    ? `${clozes.length}문항`
    : `${pages.length}쪽`;

  return `
    <section class="core-summary-detail">
      <div class="core-detail-head">
        <div>
          <div class="core-detail-kicker">${escapeHtml(section.subject || '')} ${section.chapter ? `· ${escapeHtml(section.chapter)}` : ''}${section.chapter_title ? ` · ${escapeHtml(section.chapter_title)}` : ''}</div>
          <h2>${escapeHtml(section.title || '핵심요약')}</h2>
        </div>
        <div class="core-detail-meta">${detailMeta}</div>
      </div>
      ${itemPreview ? `<div class="core-item-pills">${itemPreview}</div>` : ''}
      ${clozes.length ? renderCoreClozeSection(section) : `
        <div class="core-page-list">
          ${pages.map(renderCoreSummaryPage).join('')}
        </div>
      `}
    </section>
  `;
}

function renderCoreSummary() {
  if (!state.coreSummaryReady && !state.coreSummaryLoading && !state.coreSummaryError) {
    loadCoreSummary();
  }

  const summary = state.coreSummary || { source: { section_count: 0, item_count: 0, page_count: 0 }, sections: [] };
  const sections = summary.sections || [];
  const filteredSections = getFilteredCoreSummarySections();
  const subjects = getCoreSummarySubjectOptions(sections);

  if (!state.coreSummaryOpenSectionId && filteredSections.length > 0) {
    state.coreSummaryOpenSectionId = filteredSections[0].id;
  }
  if (filteredSections.length > 0 && !filteredSections.some(section => section.id === state.coreSummaryOpenSectionId)) {
    state.coreSummaryOpenSectionId = filteredSections[0].id;
  }

  const openSection = filteredSections.find(section => section.id === state.coreSummaryOpenSectionId) || filteredSections[0] || null;
  const loadingHtml = state.coreSummaryLoading
    ? `<div class="auth-note core-summary-state">요약본 데이터를 불러오는 중이에요.</div>`
    : '';
  const errorHtml = state.coreSummaryError
    ? `<div class="auth-error core-summary-state">${escapeHtml(state.coreSummaryError)}</div>`
    : '';
  const emptyHtml = !state.coreSummaryLoading && !state.coreSummaryError && filteredSections.length === 0
    ? `<div class="empty-state core-summary-empty"><div class="empty-emoji">🔎</div><div class="empty-text">조건에 맞는 요약본이 없어요</div></div>`
    : '';

  app.innerHTML = `
    <div class="page" id="page-core-summary">
      <div class="core-summary-hero">
        <div>
          <div class="home-kicker">필기 기본서</div>
          <h1 class="home-title">📚 요약본</h1>
          <p class="core-summary-sub">${escapeHtml(summary.source?.ocr_warning || '')}</p>
        </div>
        <div class="core-summary-metrics">
          <span>${summary.source?.section_count || sections.length}섹션</span>
          <span>${summary.source?.item_count || 0}문항</span>
          <span>${summary.source?.blank_count || 0}빈칸</span>
        </div>
      </div>

      <div class="core-summary-toolbar">
        <input
          type="search"
          class="practical-search core-summary-search"
          id="core-summary-search"
          placeholder="요약 검색"
          value="${escapeHtml(state.coreSummarySearchQuery)}"
        />
        <div class="practical-chip-row core-summary-chip-row">
          <button class="practical-chip ${state.coreSummarySubjectFilter === 'all' ? 'active' : ''}" data-core-summary-subject="all">전체</button>
          ${subjects.map(subject => `
            <button class="practical-chip ${String(state.coreSummarySubjectFilter) === subject.id ? 'active' : ''}" data-core-summary-subject="${subject.id}">
              ${escapeHtml(subject.name)}
            </button>
          `).join('')}
        </div>
      </div>

      ${loadingHtml}
      ${errorHtml}
      ${emptyHtml}

      <div class="core-summary-layout">
        <aside class="core-summary-list">
          ${filteredSections.map(section => `
            <button class="core-section-button ${section.id === openSection?.id ? 'active' : ''}" data-core-summary-section="${escapeHtml(section.id)}">
              <span class="core-section-number">${String(section.number).padStart(2, '0')}</span>
              <span class="core-section-copy">
                <strong>${escapeHtml(section.title || '핵심요약')}</strong>
                <em>${escapeHtml(section.subject || '')} ${section.chapter ? `· ${escapeHtml(section.chapter)}` : ''}${section.chapter_title ? ` · ${escapeHtml(section.chapter_title)}` : ''} ${section.book_pages?.length ? `· p.${escapeHtml(formatPageRange(section.book_pages))}` : ''}</em>
              </span>
            </button>
          `).join('')}
        </aside>
        ${renderCoreSummaryDetail(openSection)}
      </div>

      ${renderBottomNav('summaries')}
    </div>
  `;

  document.querySelectorAll('[data-core-summary-subject]').forEach((button) => {
    button.addEventListener('click', () => {
      state.coreSummarySubjectFilter = button.dataset.coreSummarySubject || 'all';
      state.coreSummaryOpenSectionId = null;
      renderCoreSummary();
    });
  });

  document.getElementById('core-summary-search')?.addEventListener('input', (event) => {
    state.coreSummarySearchQuery = event.target.value || '';
    clearTimeout(state.coreSummarySearchTimer);
    state.coreSummarySearchTimer = setTimeout(() => {
      state.coreSummaryOpenSectionId = null;
      renderCoreSummary();
    }, 300);
  });

  document.querySelectorAll('[data-core-summary-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.coreSummaryOpenSectionId = button.dataset.coreSummarySection;
      renderCoreSummary();
    });
  });

  document.querySelectorAll('[data-core-cloze-blank]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-core-cloze-id]');
      const clozeId = card?.dataset.coreClozeId;
      if (!clozeId) return;
      const blankIndex = Number(button.dataset.coreClozeBlank || 0);
      state.coreSummaryRevealedBlanks = {
        ...state.coreSummaryRevealedBlanks,
        [clozeId]: {
          ...(state.coreSummaryRevealedBlanks?.[clozeId] || {}),
          [blankIndex]: true,
        },
      };
      renderCoreSummary();
    });
  });

  bindNavEvents();
}

function renderStats() {
  const prog = getTotalProgress();

  app.innerHTML = `
    <div class="page" id="page-stats">
      <div class="home-hero">
        <h1 class="home-title">📊 학습 통계</h1>
      </div>

      <div class="stats-content">
        <div class="stat-card">
          <div class="stat-label">전체 완료한 주제</div>
          <div class="stat-value">${prog.done} <span style="font-size:16px;color:var(--text-secondary);font-weight:500">/ ${prog.total}주제</span></div>
        </div>

        <div class="stat-card">
          <div class="stat-label">전체 진행률</div>
          <div class="stat-value" style="color:var(--blue-500)">${prog.pct}%</div>
          <div style="margin-top:8px;height:8px;background:var(--gray-100);border-radius:9999px;overflow:hidden">
            <div style="height:100%;width:${prog.pct}%;background:var(--blue-500);border-radius:9999px;transition:width 1s"></div>
          </div>
        </div>

        <div class="section-title" style="padding:0;margin-top:20px;margin-bottom:14px">과목별 현황</div>

        ${SUBJECTS.map(s => {
          const pct = getSubjectProgress(s.id);
          const count = getSubjectLectures(s.id).length;
          const done = getSubjectLectures(s.id).filter(l => state.completedLectures.has(l.lecture_id)).length;
          return `
            <div class="subject-stat">
              <div class="stat-name">${s.emoji} ${s.name}</div>
              <div class="stat-bar-wrap">
                <div class="stat-bar-fill" style="width:${pct}%;background:${s.color}"></div>
              </div>
              <div class="stat-pct" style="color:${s.color}">${done}/${count}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    ${renderBottomNav('stats')}
  `;

  bindNavEvents();
}


// ??? UTILITIES ??????????????????????????????????????????????
function renderBottomNav(current) {
  const items = [
    { id: 'home', icon: '🏠', label: '홈' },
    { id: 'objective', icon: '📝', label: '객관식' },
    { id: 'wrong-note', icon: '🧾', label: '오답노트' },
    { id: 'practical', icon: '📒', label: '실기' },
    { id: 'summaries', icon: '📚', label: '요약본' },
  ];

  return `
    <nav class="bottom-nav">
      ${items.map(item => `
        <button class="nav-item ${current === item.id ? 'active' : ''}" data-nav="${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function bindNavEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.nav;
      if (state.currentPage === 'quiz' && isObjectiveExamSession() && !isObjectiveSubjectReviewMode()) {
        persistCurrentObjectiveSetProgress({
          currentIndex: getObjectiveExamPersistIndex(),
          answers: state.quizAnswers,
          elapsedSeconds: getQuizElapsedSeconds(),
        });
      }
      if (target === 'home') {
        navigate('home');
        return;
      }
      navigate(target);
    });
  });
}

function shouldShowAiChatWidget() {
  return !!state.currentUser && state.dataReady && state.currentPage !== 'auth';
}

function getAiChatContext() {
  const parts = [
    `현재 화면: ${state.currentPage}`,
  ];

  if (state.currentPage === 'quiz' && state.quizQuestions[state.quizIndex]) {
    const q = state.quizQuestions[state.quizIndex];
    parts.push(`문제: ${q.question}`);
    parts.push(`보기: ${(q.choices || []).map(choice => `${choice.label}. ${choice.text}`).join(' / ')}`);
    if (state.quizSelectedChoiceLabel) parts.push(`사용자 선택: ${state.quizSelectedChoiceLabel}`);
    if (state.quizRevealed) parts.push(`정답: ${q.answer}`);
  }

  if (state.currentPage === 'objective') {
    const wrongCount = getObjectiveWrongEntries(state.objectiveSets || []).length;
    const resume = getLatestObjectiveResumeEntry(state.objectiveSets || []);
    parts.push(`객관식 오답 수: ${wrongCount}`);
    if (resume) parts.push(`이어풀기 위치: ${resume.currentIndex + 1}/${resume.total}`);
  }

  if (state.currentPage === 'wrong-note') {
    parts.push(`오답노트 저장 문제 수: ${getObjectiveWrongEntries(state.objectiveSets || []).length}`);
  }

  return parts.join('\n');
}

function formatAiMessageText(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function mountAiChatWidget() {
  document.getElementById('ai-chat-widget')?.remove();
  if (!shouldShowAiChatWidget()) return;

  const widget = document.createElement('div');
  widget.id = 'ai-chat-widget';
  widget.className = `ai-chat-widget ${state.aiChatOpen ? 'open' : ''}`;
  const messagesHtml = state.aiChatMessages.map(message => `
    <div class="ai-chat-message ${message.role}">
      ${formatAiMessageText(message.text)}
    </div>
  `).join('');

  widget.innerHTML = state.aiChatOpen ? `
    <section class="ai-chat-panel" aria-label="AI 질문창">
      <div class="ai-chat-head">
        <div>
          <strong>AI 질문</strong>
          <span>Vertex AI · gemini-3-flash-preview</span>
        </div>
        <button type="button" id="btn-ai-chat-close" aria-label="AI 질문창 닫기">×</button>
      </div>
      <div class="ai-chat-messages" id="ai-chat-messages">
        ${messagesHtml}
        ${state.aiChatLoading ? '<div class="ai-chat-message assistant">생각하는 중...</div>' : ''}
        ${state.aiChatError ? `<div class="ai-chat-error">${escapeHtml(state.aiChatError)}</div>` : ''}
      </div>
      <form class="ai-chat-form" id="ai-chat-form">
        <input id="ai-chat-input" type="text" placeholder="이 문제 왜 틀렸는지 물어보기" autocomplete="off" ${state.aiChatLoading ? 'disabled' : ''} />
        <button type="submit" ${state.aiChatLoading ? 'disabled' : ''}>전송</button>
      </form>
    </section>
  ` : `
    <button class="ai-chat-fab" type="button" id="btn-ai-chat-open" aria-label="AI 질문창 열기">
      AI
    </button>
  `;

  app.appendChild(widget);

  document.getElementById('btn-ai-chat-open')?.addEventListener('click', () => {
    state.aiChatOpen = true;
    state.aiChatError = '';
    mountAiChatWidget();
  });

  document.getElementById('btn-ai-chat-close')?.addEventListener('click', () => {
    state.aiChatOpen = false;
    mountAiChatWidget();
  });

  document.getElementById('ai-chat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('ai-chat-input');
    const message = input?.value?.trim();
    if (!message || state.aiChatLoading) return;
    input.value = '';
    await sendAiChatMessage(message);
  });

  const messageBox = document.getElementById('ai-chat-messages');
  if (messageBox) messageBox.scrollTop = messageBox.scrollHeight;
}

async function sendAiChatMessage(message) {
  state.aiChatMessages.push({ role: 'user', text: message });
  state.aiChatLoading = true;
  state.aiChatError = '';
  mountAiChatWidget();

  try {
    const response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context: getAiChatContext(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'AI 응답을 받지 못했어요.');
    }
    state.aiChatMessages.push({
      role: 'assistant',
      text: data.answer || '응답이 비어 있어요.',
    });
  } catch (err) {
    state.aiChatError = err.message || 'AI 연결에 실패했어요.';
  } finally {
    state.aiChatLoading = false;
    mountAiChatWidget();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ??? INIT ???????????????????????????????????????????????????
async function init() {
  state.currentUser = loadSessionUser();
  loadStorage();
  loadPracticalProgress();
  render();
  await loadAppData();
}

window.navigate = navigate;
window.addEventListener('beforeunload', () => {
  saveStorage();
  savePracticalProgress();
});

init();
