const app = getApp();
const CORE = app.core;

Page({
  data: {
    bankName: '',
    bankIndex: 0,
    banks: [],
    goal: 20,
    todayNew: 0,
    pct: 0,
    doneToday: 0,
    minutes: '0.0',
    streak: 0,
    freshCount: 0,
    dueCount: 0,
    wrongCount: 0,
    favCount: 0,
    accRate: 0,
    notice: '',
    bars: [],
    totalWords: 0
  },

  onShow() {
    if (!app.refresh()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.render();
  },

  render() {
    const P = app.globalData.P;
    const bank = app.globalData.bank;
    const words = CORE.Catalog.words(bank);
    const today = CORE.Repo.today(P);
    const goal = P.settings.dailyGoal || 20;
    const done = (today.new || 0) + (today.review || 0) + (today.quiz || 0);
    const series = CORE.Stats.series(P, 7);
    const max = Math.max(1, series.reduce((a, s) => Math.max(a, s.value), 0));
    const banks = CORE.Catalog.banks().map((b) => ({
      id: b.id,
      name: b.name,
      count: CORE.Catalog.words(b.id).length
    }));
    const idx = Math.max(0, banks.findIndex((b) => b.id === bank));

    this.setData({
      banks: banks,
      bankIndex: idx,
      bankName: banks[idx] ? banks[idx].name : '',
      goal: goal,
      todayNew: today.new || 0,
      doneToday: done,
      minutes: (today.minutes || 0).toFixed(1),
      pct: Math.min(100, Math.round((done / goal) * 100)),
      streak: CORE.Stats.streak(P),
      freshCount: CORE.Repo.newWords(P, words).length,
      dueCount: CORE.Repo.dueQueue(P, CORE.Catalog.all()).length,
      wrongCount: P.wrong.length,
      favCount: P.fav.length,
      accRate: CORE.Stats.accuracy(P).rate,
      notice: CORE.CMS.data().notice || '',
      totalWords: CORE.Catalog.all().length,
      bars: series.map((s) => ({
        label: s.date.slice(5).replace('-', '/'),
        value: s.value,
        h: Math.max(6, Math.round((s.value / max) * 110))
      }))
    });
  },

  onBankChange(e) {
    const b = this.data.banks[Number(e.detail.value)];
    if (!b) return;
    app.globalData.bank = b.id;
    app.globalData.P.settings.bank = b.id;
    if (app.globalData.user && app.globalData.user.uid !== 'guest') {
      CORE.Auth.update(app.globalData.user.uid, { bank: b.id });
    }
    app.save();
    this.render();
  },

  go(e) {
    const url = e.currentTarget.dataset.url;
    if (url.indexOf('/pages/quiz/quiz') === 0 || url.indexOf('/pages/review/review') === 0 || url.indexOf('/pages/study/study') === 0) {
      wx.switchTab({ url: url });
    } else {
      wx.navigateTo({ url: url });
    }
  },

  startStudy() {
    wx.switchTab({ url: '/pages/study/study' });
  }
});
