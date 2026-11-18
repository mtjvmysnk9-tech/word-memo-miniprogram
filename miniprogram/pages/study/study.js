const app = getApp();
const CORE = app.core;

const GRADES = [
  { g: 0, t: '不认识', s: '回到 5 分钟', cls: 'g0' },
  { g: 1, t: '有点模糊', s: '保持期减半', cls: 'g1' },
  { g: 2, t: '记得', s: '进入下一级', cls: 'g2' },
  { g: 3, t: '很熟', s: '跳过一级', cls: 'g3' }
];
const MODE_NAME = { study: '学新词', due: '到期复习', all: '全部已学复习', wrong: '错词攻克', fav: '收藏复习' };

Page({
  data: {
    view: 'setup',
    banks: [],
    bankName: '',
    goal: 20,
    todayNew: 0,
    pct: 0,
    freshCount: 0,
    learnedCount: 0,
    strongCount: 0,
    dueCount: 0,
    grades: GRADES,
    modeName: '',
    idx: 0,
    total: 0,
    ok: 0,
    bad: 0,
    barPct: 0,
    flipped: false,
    isFav: false,
    word: '',
    phonetic: '',
    meaning: '',
    parts: [],
    stageText: '',
    strength: 0,
    rate: 0,
    seconds: 0
  },

  onShow() {
    if (!app.ensureLogin()) return;
    const s = app.globalData.session;
    if (s) this.renderCard();
    else this.renderSetup();
  },

  renderSetup() {
    const P = app.globalData.P;
    const words = app.bankWords();
    const today = CORE.Repo.today(P);
    const goal = P.settings.dailyGoal || 20;
    const mastery = CORE.Stats.mastery(P, CORE.Catalog.all());
    this.setData({
      view: 'setup',
      banks: CORE.Catalog.banks().map((b) => ({
        id: b.id,
        name: b.name,
        total: CORE.Catalog.words(b.id).length,
        learned: CORE.Catalog.words(b.id).filter((w) => P.words[w.id] && P.words[w.id].learned).length,
        on: b.id === app.globalData.bank
      })),
      bankName: app.bankName(),
      goal: goal,
      todayNew: today.new || 0,
      pct: Math.min(100, Math.round((today.new || 0) / goal * 100)),
      freshCount: CORE.Repo.newWords(P, words).length,
      learnedCount: Object.keys(P.words).length,
      strongCount: mastery.strong,
      dueCount: CORE.Repo.dueQueue(P, CORE.Catalog.all()).length
    });
  },

  pickBank(e) {
    app.globalData.bank = e.currentTarget.dataset.id;
    app.globalData.P.settings.bank = e.currentTarget.dataset.id;
    if (app.globalData.user && app.globalData.user.uid !== 'guest') {
      CORE.Auth.update(app.globalData.user.uid, { bank: e.currentTarget.dataset.id });
    }
    app.save();
    this.renderSetup();
  },

  startStudy() {
    const P = app.globalData.P;
    const items = CORE.Repo.newWords(P, app.bankWords(), P.settings.dailyGoal || 20);
    if (!items.length) {
      wx.showToast({ title: '该词库已学完，换个词库或去复习', icon: 'none' });
      return;
    }
    app.globalData.session = newSession('study', items);
    this.renderCard();
  },

  startDue() {
    const items = CORE.Repo.dueQueue(app.globalData.P, CORE.Catalog.all(), 20);
    if (!items.length) {
      wx.showToast({ title: '当前没有到期需要复习的词', icon: 'none' });
      return;
    }
    app.globalData.session = newSession('due', items);
    this.renderCard();
  },

  renderCard() {
    const s = app.globalData.session;
    if (!s || s.idx >= s.items.length) { this.renderResult(); return; }
    const it = s.items[s.idx];
    const w = it.word;
    const P = app.globalData.P;
    const st = P.words[w.id];
    this.setData({
      view: 'card',
      modeName: MODE_NAME[s.mode] || '复习',
      idx: s.idx,
      total: s.items.length,
      ok: s.ok,
      bad: s.bad,
      barPct: Math.round((s.idx / s.items.length) * 100),
      flipped: s.flipped,
      isFav: P.fav.indexOf(w.id) >= 0,
      word: w.word,
      phonetic: w.phonetic,
      meaning: w.meaning,
      parts: highlight(w.example || '', w.word),
      stageText: app.dueText(st) + (st && st.learned ? ' · ' + CORE.SRS.stageName(st.level) : ''),
      strength: st && st.learned ? Math.round(CORE.SRS.strength(st)) : 0
    });
  },

  flip() {
    const s = app.globalData.session;
    if (!s) return;
    s.flipped = !s.flipped;
    if (s.flipped) app.speak(s.items[s.idx].word.word);
    this.setData({ flipped: s.flipped });
  },

  speakNow() {
    const s = app.globalData.session;
    if (s) app.speak(s.items[s.idx].word.word);
  },

  grade(e) {
    const s = app.globalData.session;
    if (!s) return;
    const g = Number(e.currentTarget.dataset.g);
    const w = s.items[s.idx].word;
    CORE.Repo.addMinutes(app.globalData.P, (Date.now() - s.lastAt) / 60000);
    s.lastAt = Date.now();
    CORE.Repo.reviewWord(app.globalData.P, w.id, g);
    if (g >= 2) s.ok++; else s.bad++;
    app.save();
    s.idx++;
    s.flipped = false;
    if (s.idx >= s.items.length) this.renderResult();
    else this.renderCard();
  },

  toggleFav() {
    const s = app.globalData.session;
    if (!s) return;
    const on = CORE.Repo.toggleFav(app.globalData.P, s.items[s.idx].word.id);
    app.save();
    app.toast(on ? '已加入收藏' : '已取消收藏');
    this.setData({ isFav: on });
  },

  quit() {
    wx.showModal({
      title: '结束本轮',
      content: '已完成的进度会保存，确定退出当前学习吗？',
      success: (r) => {
        if (r.confirm) {
          app.globalData.session = null;
          this.renderSetup();
        }
      }
    });
  },

  renderResult() {
    const s = app.globalData.session;
    const total = s.items.length;
    this.setData({
      view: 'result',
      modeName: MODE_NAME[s.mode] || '复习',
      total: total,
      ok: s.ok,
      bad: s.bad,
      rate: total ? Math.round((s.ok / total) * 100) : 0,
      seconds: Math.max(1, Math.round((Date.now() - s.t0) / 1000))
    });
  },

  again() {
    const s = app.globalData.session;
    const mode = s ? s.mode : 'study';
    app.globalData.session = null;
    if (mode === 'study') this.startStudy();
    else if (mode === 'due') this.startDue();
    else this.renderSetup();
  },

  backHome() {
    app.globalData.session = null;
    wx.switchTab({ url: '/pages/home/home' });
  }
});

function newSession(mode, items) {
  return { mode: mode, items: items, idx: 0, flipped: false, ok: 0, bad: 0, t0: Date.now(), lastAt: Date.now() };
}

/** 把例句中的目标词切成高亮片段，避免在 WXML 里做正则 */
function highlight(text, word) {
  const out = [];
  if (!text) return out;
  const lower = text.toLowerCase();
  const target = String(word).toLowerCase();
  let i = 0;
  while (i < lower.length) {
    const at = lower.indexOf(target, i);
    if (at < 0) {
      out.push({ t: text.slice(i), hl: 0 });
      break;
    }
    if (at > i) out.push({ t: text.slice(i, at), hl: 0 });
    out.push({ t: text.slice(at, at + target.length), hl: 1 });
    i = at + target.length;
  }
  return out;
}
