const app = getApp();

Page({
  data: {
    tab: 'user',
    acc: '',
    pwd: '',
    pwd2: '',
    nick: '',
    adminReady: false
  },

  switchTab(e) {
    this.setData({
      tab: e.currentTarget.dataset.tab,
      pwd: '',
      pwd2: '',
      adminReady: app.core.Auth.adminReady()
    });
  },

  onAcc(e) { this.setData({ acc: e.detail.value }); },
  onPwd(e) { this.setData({ pwd: e.detail.value }); },
  onPwd2(e) { this.setData({ pwd2: e.detail.value }); },
  onNick(e) { this.setData({ nick: e.detail.value }); },

  doLogin() {
    const core = app.core;
    const tab = this.data.tab;
    let r;
    if (tab === 'admin') {
      r = core.Auth.adminReady()
        ? core.Auth.login(core.Auth.adminAccount(), this.data.pwd, 'admin')
        : core.Auth.setAdminPwd(this.data.pwd, this.data.pwd2);
    } else if (tab === 'register') {
      r = core.Auth.register(this.data.acc.trim(), this.data.pwd, this.data.nick);
    } else {
      r = core.Auth.login(this.data.acc.trim(), this.data.pwd, null);
      if (r.ok && r.user.role === 'admin') {
        core.Auth.logout();
        wx.showToast({ title: '请切到「管理员」标签登录', icon: 'none' });
        return;
      }
    }
    if (!r.ok) {
      wx.showToast({ title: r.msg, icon: 'none' });
      return;
    }
    this.setData({ adminReady: core.Auth.adminReady() });
    app.refresh();
    wx.switchTab({ url: '/pages/home/home' });
  },

  doGuest() {
    app.core.Auth.guest();
    app.refresh();
    wx.switchTab({ url: '/pages/home/home' });
  },

  onLoad() {
    this.setData({ adminReady: app.core.Auth.adminReady() });
    if (app.globalData.P) wx.switchTab({ url: '/pages/home/home' });
  }
});
