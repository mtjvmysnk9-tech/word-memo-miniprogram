const app = getApp();

Page({
  data: {
    tab: 'user',
    acc: '',
    pwd: '',
    nick: ''
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const patch = { tab: tab };
    if (tab === 'admin') { patch.acc = 'admin'; patch.pwd = 'admin123'; }
    if (tab === 'user') { patch.acc = ''; patch.pwd = ''; }
    this.setData(patch);
  },

  onAcc(e) { this.setData({ acc: e.detail.value }); },
  onPwd(e) { this.setData({ pwd: e.detail.value }); },
  onNick(e) { this.setData({ nick: e.detail.value }); },

  doLogin() {
    const core = app.core;
    const acc = this.data.acc.trim();
    const pwd = this.data.pwd;
    let r;
    if (this.data.tab === 'register') {
      r = core.Auth.register(acc, pwd, this.data.nick);
    } else {
      r = core.Auth.login(acc, pwd, this.data.tab === 'admin' ? 'admin' : null);
    }
    if (!r.ok) {
      wx.showToast({ title: r.msg, icon: 'none' });
      return;
    }
    app.refresh();
    wx.switchTab({ url: '/pages/home/home' });
  },

  doGuest() {
    app.core.Auth.guest();
    app.refresh();
    wx.switchTab({ url: '/pages/home/home' });
  },

  onLoad() {
    if (app.globalData.P) wx.switchTab({ url: '/pages/home/home' });
  }
});
