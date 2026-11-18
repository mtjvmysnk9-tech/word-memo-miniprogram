const app = getApp();
const CORE = app.core;

Page({
  data: {
    tab: 'overview',
    users: [],
    banks: [],
    bank: 'cet4',
    bankName: '',
    custom: [],
    wWord: '',
    wPho: '',
    wMean: '',
    wEx: '',
    csv: '',
    notice: '',
    intervals: [],
    env: '',
    totalUsers: 0,
    totalLearned: 0,
    totalAnswers: 0,
    bankRows: []
  },

  onShow() {
    if (!CORE.Auth.isAdmin()) {
      app.toast('仅管理员可访问');
      wx.navigateBack();
      return;
    }
    this.render();
  },

  render() {
    const fn = { overview: this.overview, users: this.users, words: this.words, sys: this.sys }[this.data.tab];
    fn.call(this);
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    this.render();
  },

  overview() {
    const users = CORE.Auth.users();
    let learnedAll = 0;
    let answers = 0;
    users.forEach((u) => {
      const p = CORE.Repo.load(u.uid);
      Object.keys(p.words).forEach((k) => {
        if (p.words[k].learned) learnedAll++;
        answers += (p.words[k].correct || 0) + (p.words[k].wrong || 0);
      });
    });
    this.setData({
      totalUsers: users.length,
      totalLearned: learnedAll,
      totalAnswers: answers,
      bankRows: CORE.Catalog.banks().map((b) => ({
        id: b.id, name: b.name, desc: b.desc, count: CORE.Catalog.words(b.id).length
      }))
    });
  },

  users() {
    const list = CORE.Auth.users().map((u) => {
      const p = CORE.Repo.load(u.uid);
      let n = 0;
      Object.keys(p.words).forEach((k) => { if (p.words[k].learned) n++; });
      return {
        uid: u.uid,
        account: u.account,
        nickname: u.nickname,
        role: u.role === 'admin' ? '管理员' : '普通用户',
        color: u.avatarColor,
        initial: (u.nickname || u.account).slice(0, 1),
        learned: n,
        status: u.status === 0 ? 0 : 1
      };
    });
    this.setData({ users: list });
  },

  resetPwd(e) {
    const uid = e.currentTarget.dataset.uid;
    wx.showModal({
      title: '重置密码',
      editable: true,
      placeholderText: '输入新密码（至少 6 位）',
      success: (r) => {
        if (!r.confirm) return;
        const res = CORE.Auth.resetPwd(uid, r.content || '');
        wx.showToast({ title: res.ok ? '已重置' : res.msg, icon: 'none' });
      }
    });
  },

  toggleStatus(e) {
    const uid = e.currentTarget.dataset.uid;
    const u = CORE.Auth.findByUid(uid);
    if (!u) return;
    if (app.globalData.user && u.uid === app.globalData.user.uid) {
      wx.showToast({ title: '不能停用当前登录账号', icon: 'none' });
      return;
    }
    CORE.Auth.setStatus(uid, u.status === 0 ? 1 : 0);
    wx.showToast({ title: u.status === 0 ? '已恢复' : '已停用', icon: 'none' });
    this.users();
  },

  words() {
    this.setData({
      banks: CORE.Catalog.banks().map((b) => ({ id: b.id, name: b.name, on: b.id === this.data.bank })),
      bankName: app.bankName(this.data.bank),
      custom: CORE.CMS.customWords(this.data.bank).map((w) => ({
        id: w.id, word: w.word, phonetic: w.phonetic, meaning: w.meaning, example: w.example
      }))
    });
  },

  pickBank(e) {
    this.setData({ bank: e.currentTarget.dataset.id });
    this.words();
  },

  onField(e) {
    const patch = {};
    patch[e.currentTarget.dataset.f] = e.detail.value;
    this.setData(patch);
  },

  addWord() {
    if (!this.data.wWord.trim()) {
      wx.showToast({ title: '单词不能为空', icon: 'none' });
      return;
    }
    const n = CORE.CMS.addWords([{
      bank: this.data.bank,
      word: this.data.wWord.trim(),
      phonetic: this.data.wPho.trim(),
      meaning: this.data.wMean.trim(),
      example: this.data.wEx.trim()
    }]);
    if (!n) {
      wx.showToast({ title: '该词已存在', icon: 'none' });
      return;
    }
    CORE.Catalog.init(app.words);
    this.setData({ wWord: '', wPho: '', wMean: '', wEx: '' });
    wx.showToast({ title: '已添加 1 词', icon: 'none' });
    this.words();
  },

  delWord(e) {
    CORE.CMS.removeWord(e.currentTarget.dataset.id);
    CORE.Catalog.init(app.words);
    this.words();
  },

  importCsv() {
    const rows = parseCsv(this.data.csv, this.data.bank);
    if (!rows.length) {
      wx.showToast({ title: '没有可解析的行', icon: 'none' });
      return;
    }
    const added = CORE.CMS.addWords(rows);
    CORE.Catalog.init(app.words);
    this.setData({ csv: '' });
    wx.showToast({ title: '导入 ' + added + ' 词，跳过 ' + (rows.length - added) + ' 词', icon: 'none' });
    this.words();
  },

  sys() {
    this.setData({
      notice: CORE.CMS.data().notice || '',
      intervals: CORE.SRS.INTERVALS.map((m, i) => ({
        i: i,
        name: CORE.SRS.stageName(i),
        text: m < 60 ? m + ' 分钟' : m < 1440 ? Math.round(m / 60) + ' 小时' : Math.round(m / 1440) + ' 天'
      })),
      env: CORE.Store.backend + ' · 词库 ' + CORE.Catalog.all().length + ' 词 · ' + app.words.version
    });
  },

  onNotice(e) { this.setData({ notice: e.detail.value }); },

  saveNotice() {
    CORE.CMS.setNotice(this.data.notice.trim());
    wx.showToast({ title: '公告已更新', icon: 'none' });
  },

  resetAll() {
    wx.showModal({
      title: '清空本机数据',
      content: '将删除所有账号、词库改动与学习记录，仅用于演示复位。确定继续？',
      confirmColor: '#fa5151',
      success: (r) => {
        if (!r.confirm) return;
        CORE.CMS.resetAll();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  }
});

/** 兼容英文逗号、中文逗号与制表符，支持引号包裹字段 */
function parseCsv(text, bank) {
  const rows = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === '，' || ch === '\t') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    const c = cells.map((s) => s.trim());
    if (/^(word|单词)$/i.test(c[0])) return;
    if (!c[0] || !c[2]) return;
    rows.push({ bank: bank, word: c[0], phonetic: c[1] || '', meaning: c[2] || '', example: c[3] || '' });
  });
  return rows;
}
