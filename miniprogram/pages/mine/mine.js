const app = getApp();
const CORE = app.core;

Page({
  data: {
    name: '',
    account: '',
    roleText: '',
    color: '#8a8f99',
    initial: '忆',
    learned: 0,
    retention: 0,
    streak: 0,
    goal: 20,
    banks: [],
    bankIndex: 0,
    isAdmin: false,
    bucket: 'wm_profile_guest',
    isGuest: true,
    totalWords: 0
  },

  onShow() {
    if (!app.ensureLogin()) return;
    this.render();
  },

  render() {
    const u = app.globalData.user;
    const P = app.globalData.P;
    const ret = CORE.Stats.retention(P);
    const banks = CORE.Catalog.banks();
    let learned = 0;
    Object.keys(P.words).forEach((k) => { if (P.words[k].learned) learned++; });
    this.setData({
      name: u ? u.nickname : '游客',
      account: u ? u.account : 'guest',
      roleText: u ? (u.role === 'admin' ? '管理员' : '普通用户') : '游客（进度不区分账号）',
      color: u ? u.avatarColor : '#8a8f99',
      initial: (u ? u.nickname : '游客').slice(0, 1),
      learned: learned,
      retention: ret.rate,
      streak: CORE.Stats.streak(P),
      goal: P.settings.dailyGoal || 20,
      banks: banks,
      bankIndex: Math.max(0, banks.findIndex((b) => b.id === app.globalData.bank)),
      isAdmin: CORE.Auth.isAdmin(),
      isGuest: CORE.Auth.isGuest(),
      bucket: 'wm_profile_' + (u ? u.uid : 'guest'),
      totalWords: CORE.Catalog.all().length
    });
  },

  onGoal(e) {
    const v = Math.max(5, Math.min(100, Number(e.detail.value) || 20));
    app.globalData.P.settings.dailyGoal = v;
    app.save();
    this.setData({ goal: v });
  },

  onBankChange(e) {
    const b = this.data.banks[Number(e.detail.value)];
    app.globalData.bank = b.id;
    app.globalData.P.settings.bank = b.id;
    if (app.globalData.user && app.globalData.user.uid !== 'guest') {
      CORE.Auth.update(app.globalData.user.uid, { bank: b.id });
    }
    app.save();
    this.render();
  },

  save() {
    app.save();
    app.toast('设置已保存');
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

  changePwd() {
    wx.showModal({
      title: '修改密码',
      editable: true,
      placeholderText: '请输入新密码（至少 6 位）',
      success: (r) => {
        if (!r.confirm) return;
        const res = CORE.Auth.resetPwd(app.globalData.user.uid, r.content || '');
        wx.showToast({ title: res.ok ? '密码已更新' : res.msg, icon: 'none' });
      }
    });
  },

  about() {
    wx.showModal({
      title: '关于忆单词',
      content: '基于微信小程序的英语单词记忆学习系统 v1.0.0\n词库 ' + CORE.Catalog.all().length + ' 词 · 艾宾浩斯九级记忆曲线\n本科毕业设计演示版，数据仅存于本机',
      showCancel: false
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '学习进度已保存在本机缓存，重新登录同一账号可继续。',
      success: (r) => {
        if (!r.confirm) return;
        CORE.Auth.logout();
        app.globalData.session = null;
        app.globalData.quiz = null;
        app.refresh();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  }
});
