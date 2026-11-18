const app = getApp();
const CORE = app.core;
const PAGE_SIZE = 30;

Page({
  data: {
    tab: 'due',
    tabs: [],
    list: [],
    kw: '',
    banks: [],
    bankName: '',
    page: 1,
    pages: 1,
    total: 0,
    canStart: false,
    startCount: 0
  },

  onLoad(options) {
    if (options && options.tab) this.setData({ tab: options.tab });
  },

  onShow() {
    if (!app.ensureLogin()) return;
    this.render();
  },

  render() {
    const P = app.globalData.P;
    const all = CORE.Catalog.all();
    const due = CORE.Repo.dueQueue(P, all);
    const learned = all.filter((w) => P.words[w.id] && P.words[w.id].learned);
    const tabs = [
      { id: 'due', t: '今日到期', n: due.length },
      { id: 'learned', t: '全部已学', n: learned.length },
      { id: 'wrong', t: '错词本', n: P.wrong.length },
      { id: 'fav', t: '收藏', n: P.fav.length },
      { id: 'bank', t: '词库', n: CORE.Catalog.all().length }
    ];
    let source = [];
    if (this.data.tab === 'due') source = due.map((i) => i.word);
    else if (this.data.tab === 'learned') source = learned;
    else if (this.data.tab === 'wrong') source = P.wrong.map((r) => CORE.Catalog.find(r.id)).filter(Boolean);
    else if (this.data.tab === 'fav') source = P.fav.map((id) => CORE.Catalog.find(id)).filter(Boolean);
    else source = app.bankWords();

    const kw = this.data.kw.trim().toLowerCase();
    if (kw) {
      source = source.filter((w) => w.word.toLowerCase().indexOf(kw) >= 0 || String(w.meaning).indexOf(kw) >= 0);
    }
    const pages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
    const page = Math.min(this.data.page, pages);
    const slice = source.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    this.setData({
      tabs: tabs,
      tab: this.data.tab,
      banks: CORE.Catalog.banks().map((b) => ({ id: b.id, name: b.name, on: b.id === app.globalData.bank })),
      bankName: app.bankName(),
      total: source.length,
      pages: pages,
      page: page,
      canStart: this.data.tab !== 'bank' && source.length > 0,
      startCount: Math.min(source.length, 20),
      list: slice.map((w) => {
        const st = P.words[w.id];
        return {
          id: w.id,
          word: w.word,
          phonetic: w.phonetic,
          meaning: w.meaning,
          strength: st && st.learned ? Math.round(CORE.SRS.strength(st)) : 0,
          stage: st && st.learned ? CORE.SRS.stageName(st.level) : '未学',
          due: !!(st && st.learned && st.dueAt <= Date.now()),
          fav: P.fav.indexOf(w.id) >= 0
        };
      })
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.id, page: 1 });
    this.render();
  },

  pickBank(e) {
    app.globalData.bank = e.currentTarget.dataset.id;
    app.globalData.P.settings.bank = e.currentTarget.dataset.id;
    app.save();
    this.render();
  },

  onKw(e) { this.setData({ kw: e.detail.value, page: 1 }); this.render(); },

  next() {
    if (this.data.page < this.data.pages) {
      this.setData({ page: this.data.page + 1 });
      this.render();
    }
  },

  prev() {
    if (this.data.page > 1) {
      this.setData({ page: this.data.page - 1 });
      this.render();
    }
  },

  speak(e) { app.speak(e.currentTarget.dataset.w); },

  toggleFav(e) {
    const on = CORE.Repo.toggleFav(app.globalData.P, e.currentTarget.dataset.id);
    app.save();
    app.toast(on ? '已收藏' : '已取消收藏');
    this.render();
  },

  start() {
    const P = app.globalData.P;
    const tab = this.data.tab;
    let items = [];
    if (tab === 'due') items = CORE.Repo.dueQueue(P, CORE.Catalog.all(), 20);
    else if (tab === 'learned') {
      items = CORE.Catalog.all()
        .filter((w) => P.words[w.id] && P.words[w.id].learned)
        .slice(0, 20)
        .map((w) => ({ word: w, state: P.words[w.id] }));
    } else if (tab === 'wrong') {
      items = P.wrong.slice(0, 20).map((r) => ({ word: CORE.Catalog.find(r.id), state: P.words[r.id] })).filter((i) => i.word);
    } else {
      items = P.fav.slice(0, 20).map((id) => ({ word: CORE.Catalog.find(id), state: P.words[id] })).filter((i) => i.word);
    }
    if (!items.length) {
      wx.showToast({ title: '这个范围里还没有词', icon: 'none' });
      return;
    }
    app.globalData.session = {
      mode: tab === 'due' ? 'due' : tab, items: items, idx: 0, flipped: false, ok: 0, bad: 0,
      t0: Date.now(), lastAt: Date.now()
    };
    wx.switchTab({ url: '/pages/study/study' });
  }
});
