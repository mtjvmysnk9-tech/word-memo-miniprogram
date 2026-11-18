const app = getApp();
const CORE = app.core;

const SCOPES = [
  { id: 'bank', t: '当前词库' },
  { id: 'learned', t: '我已学过的词' },
  { id: 'due', t: '今日到期复习' },
  { id: 'wrong', t: '错词本' },
  { id: 'fav', t: '收藏夹' }
];

Page({
  data: {
    view: 'setup',
    scopes: [],
    scope: 'bank',
    count: 10,
    counts: [5, 10, 20, 30],
    types: [],
    letter: 'ABCD',
    // 题目
    qIndex: 1,
    qTotal: 10,
    qScore: 0,
    typeName: '',
    stem: '',
    isSpelling: false,
    hint: '',
    answerText: '',
    options: [],
    shown: false,
    explain: '',
    explainMeaning: '',
    // 结果
    rate: 0,
    right: 0,
    seconds: 0,
    wrongList: []
  },

  onShow() {
    if (!app.ensureLogin()) return;
    if (app.globalData.quiz) this.renderQuiz();
    else this.renderSetup();
  },

  renderSetup() {
    const enabled = this.data.types.length
      ? this.data.types.filter((t) => t.on).map((t) => t.id)
      : CORE.Quiz.TYPES;
    this.setData({
      view: 'setup',
      scopes: SCOPES.map((s) => ({
        id: s.id,
        t: s.t,
        n: this.poolSize(s.id),
        on: s.id === this.data.scope
      })),
      types: CORE.Quiz.TYPES.map((t) => ({
        id: t,
        name: CORE.Quiz.TYPE_NAME[t],
        on: enabled.indexOf(t) >= 0
      })),
      qTotal: this.data.count
    });
  },

  poolSize(id) {
    const P = app.globalData.P;
    if (!P) return 0;
    if (id === 'learned') return CORE.Catalog.all().filter((w) => P.words[w.id] && P.words[w.id].learned).length;
    if (id === 'due') return CORE.Repo.dueQueue(P, CORE.Catalog.all()).length;
    if (id === 'wrong') return P.wrong.length;
    if (id === 'fav') return P.fav.length;
    return app.bankWords().length;
  },

  pool(id) {
    const P = app.globalData.P;
    if (id === 'learned') return CORE.Catalog.all().filter((w) => P.words[w.id] && P.words[w.id].learned);
    if (id === 'due') return CORE.Repo.dueQueue(P, CORE.Catalog.all()).map((i) => i.word);
    if (id === 'wrong') return P.wrong.map((r) => CORE.Catalog.find(r.id)).filter(Boolean);
    if (id === 'fav') return P.fav.map((wid) => CORE.Catalog.find(wid)).filter(Boolean);
    return app.bankWords();
  },

  pickScope(e) {
    this.setData({ scope: e.currentTarget.dataset.id });
    this.renderSetup();
  },

  pickCount(e) {
    this.setData({ count: Number(e.currentTarget.dataset.n) });
    this.renderSetup();
  },

  toggleType(e) {
    const types = this.data.types.map((t) => {
      if (t.id !== e.currentTarget.dataset.id) return t;
      return { id: t.id, name: t.name, on: !t.on };
    });
    if (!types.some((t) => t.on)) {
      wx.showToast({ title: '至少保留一种题型', icon: 'none' });
      return;
    }
    this.setData({ types: types });
    this.renderSetup();
  },

  start() {
    const pool = this.pool(this.data.scope);
    if (!pool.length) {
      wx.showToast({ title: '这个范围里还没有词', icon: 'none' });
      return;
    }
    const items = CORE.Quiz.pick(pool, Math.min(this.data.count, pool.length)).map((w) => ({ word: w, state: app.globalData.P.words[w.id] }));
    const types = this.data.types.filter((t) => t.on).map((t) => t.id);
    app.globalData.quiz = {
      qs: CORE.Quiz.build(items, CORE.Catalog.all(), types),
      i: 0,
      picked: null,
      shown: false,
      results: [],
      text: '',
      t0: Date.now(),
      lastAt: Date.now(),
      done: false
    };
    this.renderQuiz();
  },

  renderQuiz() {
    const q = app.globalData.quiz;
    if (!q) { this.renderSetup(); return; }
    if (q.done) { this.renderResult(); return; }
    const cur = q.qs[q.i];
    const word = CORE.Catalog.find(cur.wordId);
    const options = cur.options.map((text, i) => {
      let cls = '';
      if (q.shown) cls = i === cur.answer ? 'right' : (i === q.picked ? 'wrong' : 'dim');
      return { i: i, text: text, cls: cls, letter: 'ABCD'[i] };
    });
    this.setData({
      view: 'quiz',
      qIndex: q.i + 1,
      qTotal: q.qs.length,
      qScore: q.results.filter(Boolean).length,
      typeName: CORE.Quiz.TYPE_NAME[cur.type],
      isSpelling: cur.type === 'spelling',
      stem: cur.type === 'listening' ? '听发音，选出正确的单词' : cur.stem,
      hint: cur.hint || '',
      answerText: q.text,
      options: cur.type === 'spelling' ? [] : options,
      shown: q.shown,
      explain: q.shown ? (cur.answerText || cur.options[cur.answer]) : '',
      explainMeaning: q.shown ? word.meaning : '',
      barPct: Math.round((q.i / q.qs.length) * 100)
    });
  },

  playAudio() {
    const q = app.globalData.quiz;
    if (!q) return;
    const w = CORE.Catalog.find(q.qs[q.i].wordId);
    if (w) app.speak(w.word);
  },

  onText(e) { this.setData({ answerText: e.detail.value }); },

  submitText() {
    this.answer(this.data.answerText);
  },

  choose(e) {
    if (this.data.shown) return;
    this.answer(Number(e.currentTarget.dataset.i));
  },

  answer(value) {
    const q = app.globalData.quiz;
    if (!q || q.shown) return;
    const cur = q.qs[q.i];
    const ok = CORE.Quiz.check(cur, value);
    CORE.Repo.addMinutes(app.globalData.P, (Date.now() - q.lastAt) / 60000);
    q.lastAt = Date.now();
    q.results[q.i] = ok;
    q.picked = cur.type === 'spelling' ? null : Number(value);
    q.shown = true;
    CORE.Repo.reviewWord(app.globalData.P, cur.wordId, ok ? CORE.SRS.GRADE.KNOWN : CORE.SRS.GRADE.FORGOT);
    CORE.Repo.track(app.globalData.P, 'quiz');
    app.save();
    this.renderQuiz();
  },

  next() {
    const q = app.globalData.quiz;
    if (q.i + 1 >= q.qs.length) {
      q.done = true;
      this.renderResult();
      return;
    }
    q.i++;
    q.picked = null;
    q.shown = false;
    q.text = '';
    q.lastAt = Date.now();
    this.renderQuiz();
  },

  renderResult() {
    const q = app.globalData.quiz;
    const right = q.results.filter(Boolean).length;
    const wrongList = q.qs.map((it, i) => (q.results[i] ? null : CORE.Catalog.find(it.wordId))).filter(Boolean)
      .map((w) => ({ id: w.id, word: w.word, meaning: w.meaning }));
    this.setData({
      view: 'result',
      rate: Math.round((right / q.qs.length) * 100),
      right: right,
      qTotal: q.qs.length,
      seconds: Math.max(1, Math.round((Date.now() - q.t0) / 1000)),
      wrongList: wrongList
    });
  },

  speakWord(e) { app.speak(e.currentTarget.dataset.w); },

  retry() {
    app.globalData.quiz = null;
    this.start();
  },

  quit() {
    app.globalData.quiz = null;
    this.renderSetup();
  },

  goHome() {
    app.globalData.quiz = null;
    wx.switchTab({ url: '/pages/home/home' });
  }
});
