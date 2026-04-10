/* ============================================================
   정보처리기사 스터디메이트 — Main Application
   ============================================================ */

// ─── CONFIG ─────────────────────────────────────────────────
const DATA_BUNDLE = './data/topics-bundle.json';
const EMBEDDED_DATA_BUNDLE_KEY = '__STUDY_TOPIC_BUNDLE__';
const PRACTICE_BUNDLE = './data/subtopic-practice-bundle.json';
const EMBEDDED_PRACTICE_BUNDLE_KEY = '__STUDY_SUBTOPIC_PRACTICE_BUNDLE__';
const QUESTION_BANK_ROOT = './data/question-bank/';
const GUIDE_CHARACTER_FRAMES = {
  idle: Array.from({ length: 12 }, (_, i) =>
    `./assets/generated/characters/lecture-guide-professor-v3/idle/guide-professor-idle-v3-f${String(i + 1).padStart(2, '0')}.png`
  ),
  speaking: Array.from({ length: 16 }, (_, i) =>
    `./assets/generated/characters/lecture-guide-professor-v3/speaking/guide-professor-speaking-v3-f${String(i + 1).padStart(2, '0')}.png`
  ),
  pointing: Array.from({ length: 8 }, (_, i) =>
    `./assets/generated/characters/lecture-guide-professor-v3/pointing/guide-professor-pointing-v3-f${String(i + 1).padStart(2, '0')}.png`
  ),
};
const GUIDE_FRAME_DURATION_MS = {
  idle: 170,
  speaking: 92,
  pointing: 118,
};
const GUIDE_TALK_WINDOW_MS = 1650;
const AUTH_STORAGE_KEY = 'study_auth_v1';
const AUTH_SESSION_KEY = 'study_auth_session_v1';
const USER_PROGRESS_STORAGE_KEY = 'study_user_progress_v1';

const SUBJECTS = [
  { id: 1, name: '소프트웨어 설계', emoji: '📐', color: '#3182F6' },
  { id: 2, name: '소프트웨어 개발', emoji: '💻', color: '#30C85E' },
  { id: 3, name: '데이터베이스 구축', emoji: '🗄️', color: '#FF9500' },
  { id: 4, name: '프로그래밍 언어 활용', emoji: '⌨️', color: '#8B5CF6' },
  { id: 5, name: '정보시스템 구축관리', emoji: '🔒', color: '#F04452' },
];

// ─── STATE ──────────────────────────────────────────────────
const state = {
  currentPage: 'home',
  manifest: null,
  currentLecture: null,
  currentLectureId: null,

  currentSegIdx: 0,
  currentSentIdx: 0,
  shownSentences: [],
  autoPlay: false,
  autoPlayTimer: null,
  guideFrameTimer: null,
  guideSceneTimer: null,
  guideFrameMode: 'idle',
  guideFrameIndex: 0,
  lastRevealAt: 0,
  lastRevealText: '',

  quizQuestions: [],
  quizIndex: 0,
  quizRevealed: false,
  quizScore: { correct: 0, incorrect: 0 },
  quizSelectedChoiceLabel: null,
  quizSubmission: null,

  completedLectures: new Set(),
  lastLectureId: null,

  lectureFilter: null,
  searchQuery: '',
  topicMap: {},
  subtopicPracticeMap: {},
  questionBankTopicCache: {},
  quizContext: null,
  currentUser: null,
  authError: '',
};

// ─── STORAGE ────────────────────────────────────────────────
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
    updatedAt: null,
  };
}

function applyProgressState(progress) {
  const safeProgress = progress || createEmptyProgress();
  state.completedLectures = new Set(safeProgress.completedLectures || []);
  state.lastLectureId = safeProgress.lastLectureId || null;
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

function hashCredential(value) {
  const input = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name || user.username,
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

function writeProgressStore(store) {
  writeJsonStorage(USER_PROGRESS_STORAGE_KEY, {
    by_user_id: store?.by_user_id || {},
  });
}

function getStoredProgressForUser(userId) {
  if (!userId) return createEmptyProgress();
  const store = readProgressStore();
  return store.by_user_id[userId] || createEmptyProgress();
}

function loadSessionUser() {
  const session = readJsonStorage(AUTH_SESSION_KEY, null);
  if (!session?.user_id) return null;
  const authStore = readAuthStore();
  return sanitizeUser(authStore.users.find(user => user.user_id === session.user_id));
}

function persistSessionUser(user) {
  if (!user?.user_id) return;
  writeJsonStorage(AUTH_SESSION_KEY, { user_id: user.user_id });
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
  const hasUserProgress = (progress.completedLectures || []).length > 0 || !!progress.lastLectureId;
  if (!hasUserProgress) {
    const legacyProgress = readJsonStorage(STORAGE_KEY, null);
    if (legacyProgress?.completedLectures || legacyProgress?.lastLectureId) {
      const migrated = {
        completedLectures: legacyProgress.completedLectures || [],
        lastLectureId: legacyProgress.lastLectureId || null,
        updatedAt: new Date().toISOString(),
      };
      const store = readProgressStore();
      store.by_user_id[state.currentUser.user_id] = migrated;
      writeProgressStore(store);
      applyProgressState(migrated);
      return;
    }
  }

  applyProgressState(progress);
}

function saveStorage() {
  if (!state.currentUser?.user_id) return;

  const payload = {
    completedLectures: [...state.completedLectures],
    lastLectureId: state.lastLectureId,
    updatedAt: new Date().toISOString(),
  };
  const store = readProgressStore();
  store.by_user_id[state.currentUser.user_id] = payload;
  writeProgressStore(store);
  writeJsonStorage(STORAGE_KEY, payload);
}

function createUserAccount(displayName, username, password) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedDisplayName = normalizeDisplayName(displayName) || normalizedUsername;
  const trimmedPassword = String(password || '').trim();

  if (normalizedUsername.length < 3) {
    throw new Error('아이디는 3자 이상으로 입력해 주세요.');
  }
  if (trimmedPassword.length < 4) {
    throw new Error('비밀번호는 4자 이상으로 입력해 주세요.');
  }

  const authStore = readAuthStore();
  if (authStore.users.some(user => user.username === normalizedUsername)) {
    throw new Error('이미 사용 중인 아이디입니다.');
  }

  const user = {
    user_id: `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    username: normalizedUsername,
    display_name: normalizedDisplayName,
    password_hash: hashCredential(trimmedPassword),
    created_at: new Date().toISOString(),
  };
  authStore.users.push(user);
  writeAuthStore(authStore);
  return sanitizeUser(user);
}

function signInUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const trimmedPassword = String(password || '').trim();
  const authStore = readAuthStore();
  const user = authStore.users.find(item => item.username === normalizedUsername);
  if (!user || user.password_hash !== hashCredential(trimmedPassword)) {
    throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
  }
  return sanitizeUser(user);
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
  let user = findUserByLookupKey(authStore, lookupKey);
  let didChangeStore = false;

  if (!user) {
    user = {
      user_id: `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      username: lookupKey,
      lookup_key: lookupKey,
      display_name: normalizedName,
      created_at: new Date().toISOString(),
    };
    authStore.users.push(user);
    didChangeStore = true;
  } else {
    if (!user.lookup_key) {
      user.lookup_key = lookupKey;
      didChangeStore = true;
    }
    if (!user.username) {
      user.username = lookupKey;
      didChangeStore = true;
    }
    if (!user.display_name) {
      user.display_name = normalizedName;
      didChangeStore = true;
    }
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
}

function logoutCurrentUser() {
  saveStorage();
  clearSessionUser();
  state.currentUser = null;
  state.authError = '';
  applyProgressState(createEmptyProgress());
  state.currentLecture = null;
  state.currentLectureId = null;
  state.currentSegIdx = 0;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  state.quizQuestions = [];
  state.quizIndex = 0;
  state.quizRevealed = false;
  state.quizSelectedChoiceLabel = null;
  state.quizSubmission = null;
  navigate('auth');
}

// ─── DATA API ───────────────────────────────────────────────
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

// ─── HELPERS ────────────────────────────────────────────────
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

// ─── QUIZ GENERATION ────────────────────────────────────────
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

async function resolvePracticeActivities(practice) {
  const resolved = [];

  for (const activity of (practice?.activities || [])) {
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
        alt: activity.resolved_question.figure_alt || `${activity.resolved_question.question} 관련 그림`,
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

function resumeLectureAtSegment(segmentIndex) {
  if (!state.currentLecture) return navigate('home');
  state.currentSegIdx = segmentIndex;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  state.guideFrameMode = 'idle';
  state.guideFrameIndex = 0;
  state.lastRevealAt = 0;
  state.lastRevealText = '';
  revealNextSentence();
  navigate('theory');
}

function markCurrentLectureComplete() {
  if (!state.currentLectureId) return;
  state.completedLectures.add(state.currentLectureId);
  saveStorage();
}

function getQuizPrimaryActionLabel() {
  if (state.quizContext?.mode === 'subtopic_practice' && Number.isInteger(state.quizContext.resumeSegIdx)) {
    return '다음 소주제로 →';
  }
  return '다음 주제 →';
}

function handleQuizPrimaryAction() {
  if (state.quizContext?.mode === 'subtopic_practice' && Number.isInteger(state.quizContext.resumeSegIdx)) {
    const targetIndex = state.quizContext.resumeSegIdx;
    state.quizContext = null;
    resumeLectureAtSegment(targetIndex);
    return;
  }
  state.quizContext = null;
  goToNextLectureOrHome();
}

function showSubtopicCheckpoint(context, practice) {
  clearAutoPlayTimer();
  clearGuideTimers();
  if (context.isLastSegment) {
    markCurrentLectureComplete();
  }

  app.innerHTML = `
    <div class="theory-complete">
      <div class="complete-emoji">🧩</div>
      <div class="complete-title">소주제 학습 완료!</div>
      <div class="complete-sub">
        <strong>${escapeHtml(context.currentSubtopic.title)}</strong> 학습이 끝났어요.<br/>
        핵심 키워드 빈칸 문제와 연결된 객관식 문제를 바로 풀어볼까요?
      </div>
      <button class="btn-quiz" id="btn-start-subtopic-practice">소주제 문제 풀기 →</button>
      <button class="btn-skip-quiz" id="btn-skip-subtopic-practice">${context.isLastSegment ? '다음 주제로' : '다음 소주제로'}</button>
    </div>
  `;

  document.getElementById('btn-start-subtopic-practice').addEventListener('click', async () => {
    app.innerHTML = `
      <div class="loading-screen">
        <div class="loading-logo">🧠</div>
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
      state.quizScore = { correct: 0, incorrect: 0 };
      state.quizSelectedChoiceLabel = null;
      state.quizSubmission = null;
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
          <div class="empty-emoji">😵</div>
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

function renderQuizPrompt(q) {
  if (q.kind !== 'objective') {
    const emphasisKeywords = q.highlightKeyword ? [{ keyword: q.highlightKeyword, emphasis: 'primary' }] : [];
    return state.quizRevealed
      ? formatQuizRevealed(q)
      : renderHighlightedText(q.question, emphasisKeywords);
  }

  const figureHtml = q.figure ? `
    <div class="quiz-figure-wrap">
      <img class="quiz-figure-image" src="${q.figure.src}" alt="${escapeHtml(q.figure.alt || '문제 그림')}" />
    </div>
  ` : '';

  const choicesHtml = `
    <div class="quiz-choice-list">
      ${(q.choices || []).map(choice => {
        const isSelected = state.quizSelectedChoiceLabel === choice.label;
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
    const explanation = q.explanation || q.explanationSource || q.original || '';
    return `
      <div class="quiz-answer-card">
        <div class="quiz-answer-label">정답</div>
        <div class="quiz-answer-text">${escapeHtml(q.answer)}</div>
        ${explanation ? `<div class="quiz-answer-explanation">${escapeHtml(explanation)}</div>` : ''}
      </div>
    `;
  }

  const selectedLabel = state.quizSubmission?.selectedLabel || state.quizSelectedChoiceLabel || '';
  const selectedChoice = (q.choices || []).find(choice => choice.label === selectedLabel);
  const isCorrect = !!state.quizSubmission?.isCorrect;
  const selectedText = selectedChoice ? `${selectedChoice.label}번 ${selectedChoice.text}` : '선택하지 않음';
  const explanation = q.detailedSummary || q.explanation || q.explanationSource || q.original || '';

  return `
    <div class="quiz-answer-card ${isCorrect ? 'is-correct' : 'is-incorrect'}">
      <div class="quiz-answer-label">채점 결과</div>
      <div class="quiz-answer-status">${escapeHtml(isCorrect ? '정답입니다' : '정답을 다시 확인해 보세요')}</div>
      <div class="quiz-answer-selected">선택한 답: ${escapeHtml(selectedText)}</div>
      <div class="quiz-answer-selected">정답: ${escapeHtml(q.answer)}</div>
      ${explanation ? `<div class="quiz-answer-explanation">${escapeHtml(explanation)}</div>` : ''}
    </div>
    ${renderExplanationList('풀이 순서', q.solvingSteps || [])}
    ${renderChoiceAnalysisList(q.choiceAnalysis || [])}
    ${renderExplanationList('실수 포인트', q.examTraps || [])}
    ${renderExplanationList('마무리 체크', q.answerChecklist || [])}
    ${renderExplanationList('암기 포인트', q.memoryCues || [], 'compact')}
  `;
}

function handleObjectiveChoiceSelect(choiceLabel) {
  state.quizSelectedChoiceLabel = choiceLabel;
  renderQuiz();
}

function submitObjectiveAnswer(question) {
  if (!state.quizSelectedChoiceLabel) return;
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
  return q.kind === 'objective' ? '선택한 답 제출하기' : '정답 확인하기';
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
      <button class="btn-quiz-action knew" id="btn-knew">맞았어요 ✓</button>
      <button class="btn-quiz-action didnt-know" id="btn-didnt">틀렸어요 ✕</button>
    </div>
  `;
}

function bindQuizPromptEvents(q) {
  if (q.kind !== 'objective' || state.quizRevealed) return;
  document.querySelectorAll('.quiz-choice-item[data-choice]').forEach(button => {
    button.addEventListener('click', () => {
      handleObjectiveChoiceSelect(button.dataset.choice);
    });
  });
}

function bindQuizActionEvents(q) {
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

    document.getElementById('btn-reveal').addEventListener('click', () => {
      state.quizRevealed = true;
      renderQuiz();
    });
    return;
  }

  if (q.kind === 'objective') {
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

// ─── ROUTER ─────────────────────────────────────────────────
function navigate(page, params = {}) {
  clearAutoPlayTimer();
  clearGuideTimers();
  state.currentPage = page;
  Object.assign(state, params);
  render();
  window.scrollTo(0, 0);
}

// ─── RENDER ENGINE ──────────────────────────────────────────
const app = document.getElementById('app');

function render() {
  if (!state.currentUser) {
    state.currentPage = 'auth';
  }
  switch (state.currentPage) {
    case 'auth':     renderSimpleAuth(); break;
    case 'home':     renderHome(); break;
    case 'lectures': renderLectures(); break;
    case 'theory':   renderTheory(); break;
    case 'quiz':     renderQuiz(); break;
    case 'stats':    renderStats(); break;
    default:         state.currentUser ? renderHome() : renderSimpleAuth();
  }
}

// ─── HOME PAGE ──────────────────────────────────────────────
function renderAuth() {
  renderSimpleAuth();
  return;
  const isSignup = state.authMode === 'signup';
  const errorHtml = state.authError
    ? `<div class="auth-error">${escapeHtml(state.authError)}</div>`
    : '';

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-shell">
        <div class="auth-hero">
          <div class="auth-eyebrow">Study Login</div>
          <h1 class="auth-title">학습 상황을 계정별로 저장해요</h1>
          <p class="auth-subtitle">간단한 로컬 로그인으로 같은 기기 안에서 사용자별 진도와 이어보기를 따로 보관합니다.</p>
        </div>

        <div class="auth-card">
          <div class="auth-tabs">
            <button class="auth-tab ${!isSignup ? 'active' : ''}" id="btn-auth-login">로그인</button>
            <button class="auth-tab ${isSignup ? 'active' : ''}" id="btn-auth-signup">회원가입</button>
          </div>

          <form class="auth-form" id="auth-form">
            ${isSignup ? `
              <label class="auth-field">
                <span class="auth-label">표시 이름</span>
                <input class="auth-input" id="auth-display-name" type="text" maxlength="20" placeholder="예: 민수" />
              </label>
            ` : ''}
            <label class="auth-field">
              <span class="auth-label">아이디</span>
              <input class="auth-input" id="auth-username" type="text" autocomplete="username" placeholder="영문/숫자 3자 이상" required />
            </label>
            <label class="auth-field">
              <span class="auth-label">비밀번호</span>
              <input class="auth-input" id="auth-password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="4자 이상" required />
            </label>
            ${errorHtml}
            <button class="auth-submit" type="submit">${isSignup ? '계정 만들고 시작하기' : '로그인하고 이어서 학습하기'}</button>
          </form>

          <div class="auth-note">
            현재 브라우저의 저장소를 사용하므로, 같은 기기에서는 계정별로 학습 상황이 따로 저장됩니다.
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-auth-login')?.addEventListener('click', () => {
    state.authMode = 'login';
    state.authError = '';
    renderAuth();
  });

  document.getElementById('btn-auth-signup')?.addEventListener('click', () => {
    state.authMode = 'signup';
    state.authError = '';
    renderAuth();
  });

  document.getElementById('auth-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('auth-username')?.value || '';
    const password = document.getElementById('auth-password')?.value || '';
    const displayName = document.getElementById('auth-display-name')?.value || '';

    try {
      const user = isSignup
        ? createUserAccount(displayName, username, password)
        : signInUser(username, password);
      completeLogin(user);
      navigate('home');
    } catch (error) {
      state.authError = error.message || '로그인 처리 중 문제가 발생했습니다.';
      renderAuth();
    }
  });
}

function renderSimpleAuth() {
  const errorHtml = state.authError
    ? `<div class="auth-error">${escapeHtml(state.authError)}</div>`
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
            <button class="auth-submit" type="submit">이 이름으로 시작하기</button>
          </form>

          <div class="auth-note">
            비밀번호 없이 이 기기 브라우저에만 저장됩니다. 같은 이름이면 기존 기록을 이어서 불러오고, 로그아웃하면 다른 이름으로도 바로 들어올 수 있어요.
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
  const greetMap = { morning: '좋은 아침이에요 ☀️', afternoon: '오후도 화이팅! 💪', evening: '밤에도 열공! 🌙' };
  const currentUser = state.currentUser;
  const greeting = hours < 12 ? greetMap.morning : hours < 18 ? greetMap.afternoon : greetMap.evening;
  const accountCard = currentUser ? `
    <div class="account-card">
      <div class="account-info">
        <div class="account-label">현재 사용자</div>
        <div class="account-name">${escapeHtml(currentUser.display_name)}</div>
        <div class="account-sub">학습 기록이 이 이름으로 저장되고 있어요</div>
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
          <div class="continue-label">▶ 이어서 학습하기</div>
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

// ─── TOPIC LIST PAGE ────────────────────────────────────────
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
            <div class="empty-emoji">🔍</div>
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
                <div class="lecture-duration">${subj.name} · 소주제 ${l.source_count}개 · ${escapeHtml(l.preview_text || '')}</div>
              </div>
              <div class="lecture-check ${isDone ? 'done' : ''}">
                ${isDone ? '✓' : ''}
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    ${renderBottomNav('lectures')}
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

// ─── START TOPIC ────────────────────────────────────────────
async function startLecture(lectureId) {
  clearAutoPlayTimer();
  clearGuideTimers();
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-logo">📖</div>
      <div class="loading-text">강의 흐름 불러오는 중...</div>
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
    state.guideFrameMode = 'idle';
    state.guideFrameIndex = 0;
    state.lastRevealAt = 0;
    state.lastRevealText = '';
    revealNextSentence();
    state.lastLectureId = lectureId;
    saveStorage();
    navigate('theory');
  } catch (err) {
    console.error('Failed to load lecture', err);
    app.innerHTML = `
      <div class="empty-state" style="height:100dvh">
        <div class="empty-emoji">😵</div>
        <div class="empty-text">주제를 불러오지 못했어요<br/><button onclick="navigate('home')" style="margin-top:16px;padding:12px 24px;border:none;border-radius:12px;background:#3182F6;color:white;font-weight:700;cursor:pointer">홈으로</button></div>
      </div>
    `;
  }
}

// ─── THEORY PAGE ────────────────────────────────────────────
function clearAutoPlayTimer() {
  if (state.autoPlayTimer) {
    clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }
}

function clearGuideFrameTimer() {
  if (state.guideFrameTimer) {
    clearTimeout(state.guideFrameTimer);
    state.guideFrameTimer = null;
  }
}

function clearGuideSceneTimer() {
  if (state.guideSceneTimer) {
    clearTimeout(state.guideSceneTimer);
    state.guideSceneTimer = null;
  }
}

function clearGuideTimers() {
  clearGuideFrameTimer();
  clearGuideSceneTimer();
}

function getGuideTalkWindowMs(text = '') {
  const weighted = GUIDE_TALK_WINDOW_MS + ((text || '').trim().length * 28);
  return Math.max(920, Math.min(weighted, 2400));
}

function getGuideCharacterMode(isLastSentence, isLastSegment) {
  const now = Date.now();
  const talking = state.lastRevealAt > 0
    && (now - state.lastRevealAt) < getGuideTalkWindowMs(state.lastRevealText);

  if (talking) return 'speaking';
  if (isLastSentence && !isLastSegment) return 'pointing';
  return 'idle';
}

function getGuideFrameConfig(mode) {
  const normalizedMode = GUIDE_CHARACTER_FRAMES[mode] ? mode : 'idle';
  return {
    mode: normalizedMode,
    frames: GUIDE_CHARACTER_FRAMES[normalizedMode],
    duration: GUIDE_FRAME_DURATION_MS[normalizedMode] || GUIDE_FRAME_DURATION_MS.idle,
  };
}

function getGuideFrameSrc(mode) {
  const config = getGuideFrameConfig(mode);
  if (state.guideFrameMode !== config.mode) {
    state.guideFrameMode = config.mode;
    state.guideFrameIndex = 0;
  }

  const frameCount = config.frames.length || 1;
  if (state.guideFrameIndex >= frameCount) {
    state.guideFrameIndex = 0;
  }
  return config.frames[state.guideFrameIndex] || config.frames[0] || '';
}

function scheduleGuideSceneRerender(delayMs) {
  clearGuideSceneTimer();
  if (!delayMs || delayMs < 40) return;
  state.guideSceneTimer = setTimeout(() => {
    if (state.currentPage === 'theory') {
      renderTheory();
    }
  }, delayMs);
}

function scheduleGuideFrameAdvance(mode) {
  clearGuideFrameTimer();
  const stageEl = document.querySelector('.guide-dock-stage');
  const frameEl = document.getElementById('guide-character-frame');
  if (!stageEl || !frameEl || state.currentPage !== 'theory') return;

  const config = getGuideFrameConfig(mode);
  if (state.guideFrameMode !== config.mode) {
    state.guideFrameMode = config.mode;
    state.guideFrameIndex = 0;
    frameEl.src = config.frames[0] || '';
  }

  stageEl.classList.remove('guide-dock-stage--idle', 'guide-dock-stage--speaking', 'guide-dock-stage--pointing');
  stageEl.classList.add(`guide-dock-stage--${config.mode}`);

  const tick = () => {
    const currentFrameEl = document.getElementById('guide-character-frame');
    const currentStageEl = document.querySelector('.guide-dock-stage');
    if (!currentFrameEl || !currentStageEl || state.currentPage !== 'theory') return;

    state.guideFrameIndex = (state.guideFrameIndex + 1) % config.frames.length;
    currentFrameEl.src = config.frames[state.guideFrameIndex] || config.frames[0] || '';
    state.guideFrameTimer = setTimeout(tick, config.duration);
  };

  state.guideFrameTimer = setTimeout(tick, config.duration);
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
  clearGuideTimers();
  state.currentSegIdx = targetIndex;
  state.currentSentIdx = 0;
  state.shownSentences = [];
  state.guideFrameMode = 'idle';
  state.guideFrameIndex = 0;
  state.lastRevealAt = 0;
  state.lastRevealText = '';
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
        highlightKeywords: mergeHighlightKeywords(
          currentSeg?.highlight_keywords,
          getSubtopicHighlightKeywords(currentSubtopic),
        ),
      });
      state.currentSentIdx++;
      state.lastRevealAt = Date.now();
      state.lastRevealText = nextSentence || '';
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

  const guideMode = getGuideCharacterMode(isLastSentence, isLastSegment);
  const guideFrameSrc = getGuideFrameSrc(guideMode);
  const currentHighlightKeywords = getSubtopicHighlightKeywords(currentSubtopic);
  const currentSegmentKeywords = mergeHighlightKeywords(currentSeg.highlight_keywords, currentHighlightKeywords).slice(0, 6);
  const keywordChipsHtml = currentSegmentKeywords.length ? `
    <div class="lecture-keyword-row">
      ${currentSegmentKeywords.map(keyword => `
        <span class="lecture-keyword-chip ${keyword.emphasis === 'primary' ? 'primary' : 'secondary'}">
          ${escapeHtml(keyword.keyword)}
        </span>
      `).join('')}
    </div>
  ` : '';

  let btnText = '다음 문장 →';
  let btnClass = '';
  if (isLastSentence && isLastSegment) {
    btnText = practice ? '소주제 문제로 →' : '주제 학습 완료! 🎉';
    btnClass = 'complete';
  } else if (isLastSentence) {
    const nextSubtopicIndex = nextSeg?.subtopic_index;
    btnText = nextSubtopicIndex && nextSubtopicIndex !== currentSubtopic.subtopic_index
      ? (practice ? '소주제 문제로 →' : '다음 소주제로 →')
      : '다음 장면으로 →';
  } else {
    btnText = '다음 대사 →';
  }
  const nextAutoText = !isLastSentence
    ? sentences[state.currentSentIdx]
    : (segments[state.currentSegIdx + 1]?.subtopic_title || lecture.lecture.title);

  app.innerHTML = `
    <div class="theory-page" id="page-theory">
      <div class="theory-header">
        <button class="btn-back" id="btn-theory-back">←</button>
        <div class="theory-header-info">
          <div class="theory-header-title">${lecture.lecture.title}</div>
          <div class="theory-header-sub">
            ${lecture.lecture.subject_name} · 소주제 ${currentSubtopic.subtopic_index} / ${subtopics.length || 1}
          </div>
        </div>
        <button class="btn-theory-tool" id="btn-autoplay" title="연속 재생 전환">
          ${state.autoPlay ? '❚❚' : '▶'}
        </button>
        ${currentSourceUrl ? `<a class="btn-youtube" href="${currentSourceUrl}" target="_blank" rel="noopener" title="원본 영상 열기">↗</a>` : ''}
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
            실제 강의 대사 진행 중
            ${currentSeg.start_time_hms ? ` · ${escapeHtml(currentSeg.start_time_hms)}` : ''}
          </div>
          ${keywordChipsHtml}
        </div>

        <div class="speech-area" id="speech-area">
          ${sentencesHtml}
        </div>
      </div>

      <div class="theory-footer">
        <div class="guide-dock" aria-hidden="true">
          <div class="guide-dock-stage guide-dock-stage--${guideMode}">
            <img
              id="guide-character-frame"
              class="guide-character-frame"
              src="${guideFrameSrc}"
              alt=""
            />
          </div>
        </div>
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
  scheduleGuideFrameAdvance(guideMode);
  if (guideMode === 'speaking') {
    const remaining = Math.max(120, getGuideTalkWindowMs(state.lastRevealText) - (Date.now() - state.lastRevealAt));
    scheduleGuideSceneRerender(remaining + 40);
  } else {
    clearGuideSceneTimer();
  }

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
  clearGuideTimers();
  markCurrentLectureComplete();
  state.quizContext = null;

  app.innerHTML = `
    <div class="theory-complete">
      <div class="complete-emoji">🎓</div>
      <div class="complete-title">주제 학습 완료!</div>
      <div class="complete-sub">
        <strong>${lecture.lecture.title}</strong> 주제를<br/>
        끝까지 학습했어요
      </div>
      <button class="btn-quiz" id="btn-start-quiz">복습 문제 풀기 →</button>
      <button class="btn-skip-quiz" id="btn-skip-quiz">다음에 풀기</button>
    </div>
  `;

  document.getElementById('btn-start-quiz').addEventListener('click', () => {
    const questions = generateQuiz(state.currentLecture);
    state.quizQuestions = questions;
    state.quizIndex = 0;
    state.quizRevealed = false;
    state.quizScore = { correct: 0, incorrect: 0 };
    state.quizSelectedChoiceLabel = null;
    state.quizSubmission = null;
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

// ─── QUIZ PAGE ──────────────────────────────────────────────
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

  const q = questions[state.quizIndex];
  const progress = Math.round((state.quizIndex / questions.length) * 100);

  app.innerHTML = `
    <div class="quiz-page" id="page-quiz">
      <div class="quiz-header">
        <div class="quiz-progress-text">${state.quizIndex + 1} / ${questions.length}</div>
        <div class="quiz-progress-bar">
          <div class="fill" style="width: ${progress}%"></div>
        </div>
      </div>

      <div class="quiz-body">
        <div class="quiz-card">
          <div class="quiz-type">📝 ${q.type}</div>
          <div class="quiz-question" id="quiz-q">
            ${renderQuizPrompt(q)}
          </div>

          ${!state.quizRevealed ? `
            <div class="quiz-actions">
              <button class="btn-quiz-action reveal" id="btn-reveal">정답 확인하기</button>
            </div>
          ` : `
            ${renderQuizRevealPanel(q)}
            <div class="quiz-actions">
              <button class="btn-quiz-action knew" id="btn-knew">알고 있었어요 ✓</button>
              <button class="btn-quiz-action didnt-know" id="btn-didnt">몰랐어요 ✗</button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  bindQuizPromptEvents(q);
  bindQuizActionEvents(q);
}

function formatQuizRevealed(q) {
  return escapeHtml(q.question).replace(
    /_{4,}/g,
    `<span class="blank revealed">${escapeHtml(q.answer)}</span>`
  );
}

function nextQuizQuestion() {
  state.quizIndex++;
  state.quizRevealed = false;
  state.quizSelectedChoiceLabel = null;
  state.quizSubmission = null;
  renderQuiz();
}

function renderQuizResult() {
  const total = state.quizScore.correct + state.quizScore.incorrect;
  const pct = total > 0 ? Math.round((state.quizScore.correct / total) * 100) : 0;

  let emoji;
  let message;
  if (pct >= 80) { emoji = '🏆'; message = '완벽해요!'; }
  else if (pct >= 60) { emoji = '👍'; message = '잘하고 있어요!'; }
  else if (pct >= 40) { emoji = '💪'; message = '조금 더 복습해봐요'; }
  else { emoji = '📖'; message = '다시 한번 학습해봐요'; }

  app.innerHTML = `
    <div class="quiz-result">
      <div class="result-emoji">${emoji}</div>
      <div class="result-title">${message}</div>
      <div class="result-score">${pct}%</div>
      <div class="result-detail">
        ${total}문제 중 ${state.quizScore.knew}문제를 알고 있었어요
      </div>
      <button class="btn-home" id="btn-next-lecture">${getQuizPrimaryActionLabel()}</button>
      <button class="btn-skip-quiz" id="btn-quiz-home" style="margin-top:8px">홈으로</button>
    </div>
  `;

  const resultDetail = document.querySelector('.result-detail');
  if (resultDetail) {
    resultDetail.textContent = `${total}문제 중 ${state.quizScore.correct}문제를 맞혔어요`;
  }

  document.getElementById('btn-next-lecture').addEventListener('click', () => {
    handleQuizPrimaryAction();
  });

  document.getElementById('btn-quiz-home').addEventListener('click', () => {
    state.quizContext = null;
    navigate('home');
  });
}

// ─── STATS PAGE ─────────────────────────────────────────────
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

// ─── BOTTOM NAV ─────────────────────────────────────────────
function renderBottomNav(current) {
  const items = [
    { id: 'home', icon: '🏠', label: '홈' },
    { id: 'lectures', icon: '📚', label: '주제' },
    { id: 'stats', icon: '📊', label: '통계' },
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
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'lectures') {
        navigate('lectures', { lectureFilter: null, searchQuery: '' });
      } else {
        navigate(target);
      }
    });
  });
}

// ─── UTILITIES ──────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── INIT ───────────────────────────────────────────────────
async function init() {
  state.currentUser = loadSessionUser();
  loadStorage();

  try {
    const [manifest, practiceBundle] = await Promise.all([
      fetchManifest(),
      fetchPracticeBundle(),
    ]);
    state.manifest = manifest;
    state.subtopicPracticeMap = buildSubtopicPracticeMap(practiceBundle?.items || []);
    render();
  } catch (err) {
    console.error('Failed to initialize', err);
    app.innerHTML = `
      <div class="empty-state" style="height:100dvh">
        <div class="empty-emoji">😵</div>
        <div class="empty-text">데이터를 불러오지 못했어요<br/><small style="color:var(--text-tertiary)">${escapeHtml(err.message)}</small></div>
      </div>
    `;
  }
}

window.navigate = navigate;
window.addEventListener('beforeunload', () => {
  saveStorage();
});

init();
