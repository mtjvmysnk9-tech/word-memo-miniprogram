const app = getApp();
const CORE = app.core;

Page({
  data: {
    learned: 0,
    accuracy: 0,
    minutes: 0,
    retention: 0,
    solid: 0,
    learnedTotal: 0,
    bars: [],
    dist: [],
    heat: [],
    stages: [],
    logs: [],
    streak: 0,
    todayNew: 0,
    due: 0
  },

  onShow() {
    if (!app.ensureLogin()) return;
    this.render();
  },

  render() {
    const P = app.globalData.P;
    const all = CORE.Catalog.all();
    const series = CORE.Stats.series(P, 14);
    const max = Math.max(1, series.reduce((a, s) => Math.max(a, s.value), 0));
    const m = CORE.Stats.mastery(P, all);
    const total = m.fresh + m.weak + m.fair + m.strong || 1;
    const heat = CORE.Stats.heatmap(P, 40);
    const acc = CORE.Stats.accuracy(P);
    const ret = CORE.Stats.retention(P);
    const stages = [];
    for (let i = 0; i < CORE.SRS.INTERVALS.length; i++) stages.push({ i: i, name: CORE.SRS.stageName(i), n: 0 });
    Object.keys(P.words).forEach((k) => {
      const st = P.words[k];
      if (st && st.learned) {
        const idx = Math.min(st.level, stages.length - 1);
        stages[idx].n++;
      }
    });
    const smax = Math.max(1, stages.reduce((a, s) => Math.max(a, s.n), 0));
    stages.forEach((s) => { s.w = Math.round((s.n / smax) * 100); });

    let minutes = 0;
    let learned = 0;
    Object.keys(P.words).forEach((k) => { if (P.words[k].learned) learned++; });
    const logs = Object.keys(P.log).sort().reverse().slice(0, 10).map((k) => {
      const d = P.log[k];
      minutes += d.minutes || 0;
      return { k: k, d: d };
    });
    Object.keys(P.log).forEach((k) => { if (logs.findIndex((l) => l.k === k) < 0) minutes += P.log[k].minutes || 0; });

    this.setData({
      learned: learned,
      accuracy: acc.rate,
      minutes: Math.round(minutes),
      retention: ret.rate,
      solid: ret.solid,
      learnedTotal: ret.learned,
      streak: CORE.Stats.streak(P),
      todayNew: (CORE.Repo.today(P).new || 0),
      due: CORE.Repo.dueQueue(P, all).length,
      bars: series.map((s) => ({
        label: s.date.slice(8),
        value: s.value,
        h: Math.max(6, Math.round((s.value / max) * 110))
      })),
      dist: [
        { n: m.fresh, color: '#ececec', label: '未学', w: (m.fresh / total * 100).toFixed(1) },
        { n: m.weak, color: '#ffc9c9', label: '模糊', w: (m.weak / total * 100).toFixed(1) },
        { n: m.fair, color: '#ffe3a3', label: '熟悉', w: (m.fair / total * 100).toFixed(1) },
        { n: m.strong, color: '#7ee0a8', label: '牢固', w: (m.strong / total * 100).toFixed(1) }
      ],
      heat: heat.map((d) => ({ date: d.date, level: 'l' + d.level, value: d.value })),
      stages: stages,
      logs: logs
    });
  }
});
