/* ============================================================
   정보처리기사 스터디메이트 — Main Application
   ============================================================ */

// ─── CONFIG ─────────────────────────────────────────────────
const DATA_BUNDLE = './data/topics-bundle.json';

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

  quizQuestions: [],
  quizIndex: 0,
  quizRevealed: false,
  quizScore: { knew: 0, didnt: 0 },

  completedLectures: new Set(),
  lastLectureId: null,

  lectureFilter: null,
  searchQuery: '',
  topicMap: {},
};

// ─── STORAGE ────────────────────────────────────────────────
const STORAGE_KEY = 'study_topics_v2';

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.completedLectures = new Set(data.completedLectures || []);
    state.lastLectureId = data.lastLectureId || null;
  } catch (e) {
    console.warn('Storage load failed', e);
  }
}

function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completedLectures: [...state.completedLectures],
      lastLectureId: state.lastLectureId,
    }));
  } catch (e) {
    console.warn('Storage save failed', e);
  }
}

// ─── DATA API ───────────────────────────────────────────────
async function fetchManifest() {
  const resp = await fetch(DATA_BUNDLE);
  if (!resp.ok) throw new Error('Failed to load topic bundle');
  const data = await resp.json();
  state.topicMap = data.topics || {};
  return (data.manifest?.items || []).filter(item => item.status === 'success');
}

async function fetchLecture(lectureId) {
  const lecture = state.topicMap?.[lectureId];
  if (!lecture) throw new Error('Topic not found');
  return lecture;
}

// ─── HELPERS ────────────────────────────────────────────────
function getSubjectForItem(item) {
  return SUBJECTS.find(s => s.id === item.subject_id) || SUBJECTS[0];
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
  const desiredCount = Math.min(20, Math.max(12, (lecture.subtopics?.length || 1) * 4));
  const questions = [];
  const seenQuestionKeys = new Set();
  const seenSourceTexts = new Set();

  function addQuestion(question, answer, original, type = '빈칸 채우기') {
    const q = (question || '').trim();
    const a = (answer || '').trim();
    const o = (original || '').trim();
    if (!q || !a || a.length < 2) return;
    if (q === a) return;
    const key = `${q}|||${a}`;
    if (seenQuestionKeys.has(key)) return;
    seenQuestionKeys.add(key);
    questions.push({ question: q, answer: a, original: o || q, type });
  }

  function addQuestionsFromText(text, type = '빈칸 채우기') {
    const trimmed = (text || '').trim();
    if (trimmed.length < 8) return;
    if (seenSourceTexts.has(trimmed)) return;
    seenSourceTexts.add(trimmed);

    const parenMatch = trimmed.match(/\(([A-Za-z][A-Za-z0-9\s\/;:+-]+)\)/);
    if (parenMatch) {
      addQuestion(trimmed.replace(parenMatch[0], '(________)'), parenMatch[1].trim(), trimmed, type);
    }

    const engMatch = trimmed.match(/\b([A-Z]{2,}|[A-Z][a-zA-Z]{2,})\b/);
    if (engMatch) {
      addQuestion(trimmed.replace(engMatch[0], '________'), engMatch[1], trimmed, type);
    }

    const colonMatch = trimmed.match(/[:：]\s*(.{2,20}?)(?:[,，.。을를이가은는]|$)/);
    if (colonMatch) {
      addQuestion(trimmed.replace(colonMatch[1], '________'), colonMatch[1].trim(), trimmed, type);
    }

    const quoteMatch = trimmed.match(/['"]([^'"]{2,20})['"]/);
    if (quoteMatch) {
      addQuestion(trimmed.replace(quoteMatch[1], '________'), quoteMatch[1].trim(), trimmed, type);
    }

    const termAtStart = trimmed.match(/^(?:우리\s*)?([A-Za-z가-힣0-9\/+.-]{2,18}?)(?:은|는|이|가)\s/);
    if (termAtStart) {
      addQuestion(trimmed.replace(termAtStart[1], '________'), termAtStart[1].trim(), trimmed, type);
    }

    const calledMatch = trimmed.match(/(?:보고|를|을)\s*(.{2,18}?)(?:라고|이라고)\s*(?:부른다|부릅니다|불러요|한다)/);
    if (calledMatch) {
      addQuestion(trimmed.replace(calledMatch[1], '________'), calledMatch[1].trim(), trimmed, type);
    }
  }

  for (const seg of lecture.segments) {
    for (const line of (seg.screen_text_lines || [])) {
      if ((line || '').trim().startsWith('포함 소주제')) continue;
      addQuestionsFromText(line, '핵심 문장');
    }
  }

  for (const seg of lecture.segments) {
    for (const sent of (seg.spoken_sentences || [])) {
      if ((sent || '').trim().length < 14) continue;
      addQuestionsFromText(sent, '강의 대사');
    }
  }

  for (const subtopic of (lecture.subtopics || [])) {
    const summaryLine = `${subtopic.title} 소주제를 복습합니다.`;
    addQuestion('이 주제에서 복습 중인 소주제는 ______ 입니다.', subtopic.title, summaryLine, '소주제 확인');
  }

  const unique = [];
  const seenAnswers = new Set();
  for (const q of questions) {
    const answerKey = q.answer.toLowerCase();
    if (seenAnswers.has(answerKey)) continue;
    seenAnswers.add(answerKey);
    unique.push(q);
    if (unique.length >= desiredCount) break;
  }

  return unique.length > 0 ? unique : [{
    question: '이 주제의 핵심 키워드는 무엇인가요?',
    answer: lecture.lecture.title,
    original: lecture.summary.overall_summary,
    type: '주제 확인',
  }];
}

// ─── ROUTER ─────────────────────────────────────────────────
function navigate(page, params = {}) {
  clearAutoPlayTimer();
  state.currentPage = page;
  Object.assign(state, params);
  render();
  window.scrollTo(0, 0);
}

// ─── RENDER ENGINE ──────────────────────────────────────────
const app = document.getElementById('app');

function render() {
  switch (state.currentPage) {
    case 'home':     renderHome(); break;
    case 'lectures': renderLectures(); break;
    case 'theory':   renderTheory(); break;
    case 'quiz':     renderQuiz(); break;
    case 'stats':    renderStats(); break;
    default:         renderHome();
  }
}

// ─── HOME PAGE ──────────────────────────────────────────────
function renderHome() {
  const prog = getTotalProgress();
  const lastLecture = state.lastLectureId
    ? state.manifest?.find(l => l.lecture_id === state.lastLectureId)
    : null;

  const hours = new Date().getHours();
  const greetMap = { morning: '좋은 아침이에요 ☀️', afternoon: '오후도 화이팅! 💪', evening: '밤에도 열공! 🌙' };
  const greeting = hours < 12 ? greetMap.morning : hours < 18 ? greetMap.afternoon : greetMap.evening;

  app.innerHTML = `
    <div class="page" id="page-home">
      <div class="home-hero">
        <div class="home-greeting">${greeting}</div>
        <h1 class="home-title">
          <span class="highlight">정보처리기사</span>,<br/>주제별로 압축 학습해요
        </h1>
      </div>

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
  while (state.currentSegIdx < segments.length) {
    const currentSeg = segments[state.currentSegIdx];
    const sentences = currentSeg?.spoken_sentences || [];

    if (state.currentSentIdx < sentences.length) {
      state.shownSentences.push(sentences[state.currentSentIdx]);
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

  const segments = lecture.segments || [];
  const subtopics = lecture.subtopics || [];
  const currentSeg = segments[state.currentSegIdx];
  if (!currentSeg) {
    showTheoryComplete();
    return;
  }

  const sentences = currentSeg.spoken_sentences || [];
  const currentSubtopic = subtopics.find(sub => sub.subtopic_index === currentSeg.subtopic_index)
    || { subtopic_index: currentSeg.subtopic_index || 1, title: currentSeg.subtopic_title || lecture.lecture.title, youtube_url_normalized: currentSeg.youtube_url_normalized || '' };
  const progressPct = segments.length > 0
    ? Math.round(((state.currentSegIdx + (state.currentSentIdx >= sentences.length ? 1 : 0)) / segments.length) * 100)
    : 0;
  const currentSourceUrl = currentSeg.youtube_url_normalized || currentSubtopic.youtube_url_normalized || '';

  const sentencesHtml = state.shownSentences.map((s, i) => {
    const isLatest = i === state.shownSentences.length - 1;
    return `<div class="speech-bubble ${isLatest ? 'latest' : ''}">${escapeHtml(s)}</div>`;
  }).join('');

  const isLastSentence = state.currentSentIdx >= sentences.length;
  const isLastSegment = state.currentSegIdx >= segments.length - 1;

  let btnText = '다음 문장 →';
  let btnClass = '';
  if (isLastSentence && isLastSegment) {
    btnText = '주제 학습 완료! 🎉';
    btnClass = 'complete';
  } else if (isLastSentence) {
    const nextSeg = segments[state.currentSegIdx + 1];
    const nextSubtopicIndex = nextSeg?.subtopic_index;
    btnText = nextSubtopicIndex && nextSubtopicIndex !== currentSubtopic.subtopic_index
      ? '다음 소주제로 →'
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
  if (revealNextSentence()) {
    renderTheory();
  } else {
    showTheoryComplete();
  }
}

function showTheoryComplete() {
  const lecture = state.currentLecture;
  clearAutoPlayTimer();
  state.completedLectures.add(state.currentLectureId);
  saveStorage();

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
    state.quizScore = { knew: 0, didnt: 0 };
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
            ${state.quizRevealed ? formatQuizRevealed(q) : escapeHtml(q.question)}
          </div>

          ${!state.quizRevealed ? `
            <div class="quiz-actions">
              <button class="btn-quiz-action reveal" id="btn-reveal">정답 확인하기</button>
            </div>
          ` : `
            <div style="margin-bottom:16px;padding:14px 18px;background:var(--green-50);border-radius:var(--r-lg);font-size:15px;font-weight:600;color:var(--green-500);">
              정답: ${escapeHtml(q.answer)}
            </div>
            <div class="quiz-actions">
              <button class="btn-quiz-action knew" id="btn-knew">알고 있었어요 ✓</button>
              <button class="btn-quiz-action didnt-know" id="btn-didnt">몰랐어요 ✗</button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  if (!state.quizRevealed) {
    document.getElementById('btn-reveal').addEventListener('click', () => {
      state.quizRevealed = true;
      renderQuiz();
    });
  } else {
    document.getElementById('btn-knew').addEventListener('click', () => {
      state.quizScore.knew++;
      nextQuizQuestion();
    });
    document.getElementById('btn-didnt').addEventListener('click', () => {
      state.quizScore.didnt++;
      nextQuizQuestion();
    });
  }
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
  renderQuiz();
}

function renderQuizResult() {
  const total = state.quizScore.knew + state.quizScore.didnt;
  const pct = total > 0 ? Math.round((state.quizScore.knew / total) * 100) : 0;

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
      <button class="btn-home" id="btn-next-lecture">다음 주제 →</button>
      <button class="btn-skip-quiz" id="btn-quiz-home" style="margin-top:8px">홈으로</button>
    </div>
  `;

  document.getElementById('btn-next-lecture').addEventListener('click', () => {
    goToNextLectureOrHome();
  });

  document.getElementById('btn-quiz-home').addEventListener('click', () => {
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
  loadStorage();

  try {
    state.manifest = await fetchManifest();
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

init();
