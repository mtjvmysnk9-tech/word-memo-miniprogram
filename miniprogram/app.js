/**
 * 忆单词 WordMemo —— 微信小程序端入口
 * 与 PC 版 / 手机版 H5 共用 utils/wordbank.js（词库）与 utils/core.js（七层内核）
 */
const WORDS = require('./utils/wordbank.js');
const CORE = require('./utils/core.js');

CORE.Catalog.init(WORDS);

App({
  core: CORE,
  words: WORDS,
  globalData: {
    user: null,
    P: null,
    bank: 'cet4',
    session: null,
    quiz: null
  },

  onLaunch() {
    if (!this.refresh()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  /** 读取登录态与学习档案；未登录返回 false */
  refresh() {
    const u = CORE.Auth.current();
    const guest = CORE.Auth.isGuest();
    if (!u && !guest) {
      this.globalData.user = null;
      this.globalData.P = null;
      this.globalData.session = null;
      this.globalData.quiz = null;
      return false;
    }
    this.globalData.user = u || { uid: 'guest', account: 'guest', nickname: '游客', role: 'guest', avatarColor: '#8a8f99', bank: 'cet4' };
    const p = CORE.Repo.load(u ? u.uid : 'guest');
    this.globalData.P = p;
    this.globalData.bank = (u && u.bank) || p.settings.bank || 'cet4';
    return true;
  },

  save() {
    const u = this.globalData.user;
    CORE.Repo.save(this.globalData.P, u ? u.uid : 'guest');
  },

  isAdmin() {
    return CORE.Auth.isAdmin();
  },

  /** 未登录时统一拦截到登录页 */
  ensureLogin() {
    if (this.globalData.P) return true;
    wx.navigateTo({ url: '/pages/login/login' });
    return false;
  },

  /** 发音：小程序无 speechSynthesis，走有道词典发音接口 */
  speak(word) {
    if (!word) return;
    if (!this._audio) {
      this._audio = wx.createInnerAudioContext();
      this._audio.obeyMuteSwitch = false;
    }
    this._audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=1';
    this._audio.play();
  },

  toast(msg) {
    wx.showToast({ title: msg || '操作完成', icon: 'none', duration: 1500 });
  },

  /** 当前词库的词表 */
  bankWords() {
    return CORE.Catalog.words(this.globalData.bank);
  },

  bankName(id) {
    const b = CORE.Catalog.bank(id || this.globalData.bank);
    return b ? b.name : '';
  },

  /** 距下次复习的人读文本 */
  dueText(state) {
    if (!state || !state.learned) return '未学习';
    const mins = Math.max(0, Math.round((state.dueAt - Date.now()) / 60000));
    if (mins <= 0) return '已到期';
    if (mins < 60) return mins + ' 分钟后';
    if (mins < 1440) return Math.round(mins / 60) + ' 小时后';
    return Math.round(mins / 1440) + ' 天后';
  }
});
