/**
 * 忆单词 WordMemo —— 手机版 H5（微信小程序视觉风格）
 * 与 PC 版、小程序端共用 assets/wordbank.js + assets/core.js
 */
(function () {
  'use strict';

  var D = window.WORD_MEMO;
  var C = window.WORD_MEMO_CORE;
  C.Catalog.init(D);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  var S = {
    user: null,
    P: null,
    page: 'home',
    stack: [],
    bank: 'cet4',
    session: null,
    quiz: null,
    startedAt: 0,
    kw: '',
    bankPage: 1,
    adminTab: 'overview',
    quizCount: 10,
    quizScope: 'bank',
    quizTypes: null,
    reviewTab: 'due'
  };
  var PAGE_SIZE = 20;

  var TABS = [
    { id: 'home', text: '首页', icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
    { id: 'study', text: '学习', icon: 'M4 5h11a3 3 0 013 3v11H7a3 3 0 01-3-3z M18 8v11' },
    { id: 'review', text: '复习', icon: 'M12 3a9 9 0 109 9h-9z M12 3v9h9' },
    { id: 'quiz', text: '测试', icon: 'M5 4h14v16H5z M8 9h8M8 13h8M8 17h5' },
    { id: 'mine', text: '我的', icon: 'M12 3a4 4 0 110 8 4 4 0 010-8z M4 21c0-4 3.6-6 8-6s8 2 8 6' }
  ];
  var TITLES = {
    home: '忆单词', study: '学习新词', review: '复习中心', quiz: '单词测试', mine: '我的',
    bank: '词库浏览', wrong: '错词本', fav: '收藏单词', stats: '学习统计', profile: '个人设置',
    admin: '管理后台', result: '本轮结果', intro: '艾宾浩斯记忆曲线'
  };

  /* ------------------------------------------------------------ 基础交互 */
  var toastTimer = null;
  function toast(msg, ok) {
    var t = $('#toast');
    t.innerHTML = (ok ? '<span class="ico"></span>' : '') + esc(msg);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1600);
  }
  function confirmBox(title, text, onOk, danger) {
    var m = $('#modal');
    m.innerHTML = '<div class="dialog"><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' +
      '<div class="acts"><button data-act="no">取消</button>' +
      '<button class="ok' + (danger ? ' danger' : '') + '" data-act="yes">确定</button></div></div>';
    m.hidden = false;
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'no' || e.target === m) { m.hidden = true; m.innerHTML = ''; }
      else if (a === 'yes') { m.hidden = true; m.innerHTML = ''; onOk && onOk(); }
    };
  }
  function promptBox(title, label, value, type, onOk) {
    var m = $('#modal');
    m.innerHTML = '<div class="dialog"><h4>' + esc(title) + '</h4>' +
      '<div class="body"><label style="font-size:12px;color:#888">' + esc(label) + '</label>' +
      '<input id="dlg-in" type="' + (type || 'text') + '" value="' + esc(value || '') + '" placeholder=" " /></div>' +
      '<div class="acts"><button data-act="no">取消</button><button class="ok" data-act="yes">确定</button></div></div>';
    m.hidden = false;
    setTimeout(function () { var i = $('#dlg-in'); i && i.focus(); }, 60);
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'no' || e.target === m) { m.hidden = true; m.innerHTML = ''; }
      else if (a === 'yes') {
        var v = $('#dlg-in').value;
        m.hidden = true; m.innerHTML = '';
        onOk && onOk(v);
      }
    };
  }
  function sheetBox(title, rows, onPick) {
    var sh = $('#sheet');
    sh.innerHTML = '<h4>' + esc(title) + '</h4>' + rows.map(function (r, i) {
      return '<button class="row' + (r.on ? ' on' : '') + '" data-row="' + i + '">' + esc(r.text) + (r.on ? ' ✓' : '') + '</button>';
    }).join('') + '<button class="cancel" data-row="-1">取消</button>';
    sh.hidden = false;
    sh.onclick = function (e) {
      var b = e.target.closest('[data-row]');
      if (!b) return;
      var i = Number(b.getAttribute('data-row'));
      sh.hidden = true;
      if (i >= 0) onPick(rows[i], i);
    };
  }
  function closeSheet() { $('#sheet').hidden = true; }

  var audio = null;
  var speakSeq = 0;
  function accent() { return (S.P && S.P.settings && S.P.settings.accent) || 'en-US'; }
  /** 浏览器朗读依赖本机语音包，缺包时静默无声，所以优先放有道真人音频，失败才回退 */
  function speak(word) {
    word = String(word || '').trim();
    if (!word) return;
    if (!audio) audio = new Audio();
    var seq = ++speakSeq, fell = false;
    function fallback() {
      if (seq !== speakSeq || fell) return;
      fell = true;
      speakBySynth(word);
    }
    audio.onerror = fallback;
    audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) +
      '&type=' + (accent() === 'en-GB' ? 2 : 1);
    var p = audio.play();
    if (p && p.catch) p.catch(fallback);
  }
  function speakBySynth(word) {
    if (!('speechSynthesis' in window) || !window.speechSynthesis.getVoices().length) {
      return toast('本机没有可用的英文语音包，发音无声');
    }
    var u = new SpeechSynthesisUtterance(word);
    u.lang = accent();
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /* --------------------------------------------------------------- 账号 */
  var loginTab = 'user';
  function renderLogin() {
    $('#tabbar').hidden = true;
    $('#nav-back').hidden = true;
    $('#nav-title').textContent = '登录';
    var adminPending = loginTab === 'admin' && !C.Auth.adminReady();
    $('#page').innerHTML =
      '<div class="login">' +
      '<div class="logo">忆</div>' +
      '<h2>忆单词</h2>' +
      '<div class="sub">基于艾宾浩斯记忆曲线的英语单词记忆系统</div>' +
      '<div class="tabs">' +
      '<button data-action="log-tab" data-tab="user" class="' + (loginTab === 'user' ? 'on' : '') + '">登录</button>' +
      '<button data-action="log-tab" data-tab="register" class="' + (loginTab === 'register' ? 'on' : '') + '">注册</button>' +
      '<button data-action="log-tab" data-tab="admin" class="' + (loginTab === 'admin' ? 'on' : '') + '">管理员</button>' +
      '</div>' +
      (loginTab === 'admin' ? '' : '<input class="in" id="lg-acc" placeholder="你自己设置的账号" autocapitalize="off" /><div class="gap"></div>') +
      '<input class="in" id="lg-pwd" type="password" placeholder="' + (adminPending ? '设定管理员密码（至少 6 位）' : '密码') + '" />' +
      '<div class="gap"></div>' +
      (adminPending ? '<input class="in" id="lg-pwd2" type="password" placeholder="再输入一次" /><div class="gap"></div>' : '') +
      (loginTab === 'register' ? '<input class="in" id="lg-nick" placeholder="昵称（选填）" /><div class="gap"></div>' : '') +
      '<button class="btn block" data-action="do-login">' +
      (loginTab === 'register' ? '注册并登录' : adminPending ? '设定密码并进入管理端' : '登录') +
      '</button>' +
      '<div class="or">— 其他方式 —</div>' +
      '<button class="btn soft block" data-action="do-guest"><span class="mini">游客登录，先看看</span></button>' +
      (loginTab === 'register' ? '' : '<button class="btn ghost block" style="margin-top:10px" data-action="log-tab" data-tab="register">注册新账号</button>') +
      '<div class="foot">账号与密码由使用者自己设置；管理员密码在首次进入管理端时由管理员本人设定，任何页面都不会显示<br>纯前端演示，数据仅保存在本机</div>' +
      '</div>';
  }

  function enter(user) {
    S.user = user || C.Auth.current();
    S.P = C.Repo.load(S.user ? S.user.uid : 'guest');
    S.bank = (S.user && S.user.bank) || S.P.settings.bank || 'cet4';
    S.stack = [];
    S.page = 'home';
    renderTabbar();
    go('home', true);
  }

  /* ------------------------------------------------------------ 框架渲染 */
  function renderTabbar() {
    $('#tabbar').hidden = false;
    var due = S.P ? C.Repo.dueQueue(S.P, C.Catalog.all()).length : 0;
    var wrong = S.P ? S.P.wrong.length : 0;
    $('#tabbar').innerHTML = TABS.map(function (t) {
      var badge = t.id === 'review' && due ? due : (t.id === 'wrong' ? wrong : '');
      return '<button data-action="tab" data-tab="' + t.id + '" class="' + (S.page === t.id ? 'on' : '') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="' + t.icon + '"/></svg>' +
        (badge ? '<span class="badge">' + badge + '</span>' : '') +
        '<span>' + t.text + '</span></button>';
    }).join('');
  }

  function go(page, replace) {
    if (!TITLES[page]) page = 'home';
    if (!replace && S.page !== page) S.stack.push(S.page);
    S.page = page;
    render();
  }
  function back() {
    var prev = S.stack.pop();
    S.page = prev || 'home';
    render();
  }

  function render() {
    var isTab = TABS.some(function (t) { return t.id === S.page; });
    $('#tabbar').hidden = false;
    $$('#tabbar button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === S.page);
    });
    $('#nav-back').hidden = isTab;
    $('#nav-title').textContent = TITLES[S.page] || '忆单词';
    var html = (PAGES[S.page] || PAGES.home)();
    $('#page').innerHTML = '<div class="page">' + html + '</div>';
    $('#page').scrollTop = 0;
    if (S.page === 'study' || S.page === 'review' || S.page === 'wrong' || S.page === 'fav') resumeSession();
  }

  function words() { return C.Catalog.words(S.bank); }
  function bankName(id) { var b = C.Catalog.bank(id); return b ? b.name : id; }
  function srsLine(st) {
    if (!st || !st.learned) return '未学习';
    var mins = Math.max(0, Math.round((st.dueAt - Date.now()) / 60000));
    var when = mins <= 0 ? '已到期' : (mins < 60 ? mins + ' 分钟后' : (mins < 1440 ? Math.round(mins / 60) + ' 小时后' : Math.round(mins / 1440) + ' 天后'));
    return C.SRS.stageName(st.level) + ' · ' + when;
  }

  /* --------------------------------------------------------------- 页面 */
  var PAGES = {};

  PAGES.home = function () {
    var goal = S.P.settings.dailyGoal || 20;
    var today = C.Repo.today(S.P);
    var done = (today.new || 0) + (today.review || 0) + (today.quiz || 0);
    var pct = Math.min(100, Math.round((done / goal) * 100));
    var due = C.Repo.dueQueue(S.P, C.Catalog.all()).length;
    var fresh = C.Repo.newWords(S.P, words()).length;
    var acc = C.Stats.accuracy(S.P);
    var streak = C.Stats.streak(S.P);
    var series = C.Stats.series(S.P, 7);
    var notice = C.CMS.data().notice || '';
    return '' +
      '<div class="banner"><small>当前词库 · ' + esc(bankName(S.bank)) + '</small>' +
      '<b>' + today.new + ' / ' + goal + ' 个新词</b>' +
      '<small>今日学习 ' + done + ' 项 · 专注 ' + (today.minutes || 0).toFixed(1) + ' 分钟 · 连续打卡 ' + streak + ' 天</small>' +
      '<div class="bar" style="margin-top:10px;background:rgba(255,255,255,.35)"><i style="width:' + pct + '%;background:#fff"></i></div></div>' +

      '<div class="grid4">' +
      cell('study', '#07c160', '学', '学新词', '今日 ' + fresh + ' 词可选') +
      cell('review', '#10aeff', '复', '待复习', due ? due + ' 词已到期' : '暂无到期') +
      cell('quiz', '#f5a623', '测', '单词测试', '自动组卷判分') +
      cell('wrong', '#fa5151', '错', '错词本', S.P.wrong.length + ' 词待攻克') +
      '</div>' +

      (notice ? '<div class="notice">📢 ' + esc(notice) + '</div>' : '') +

      '<div class="group-title">今日概览</div>' +
      '<div class="kpis">' +
      kpi(done, '今日学习') + kpi(acc.rate + '%', '累计正确率') + kpi(S.P.fav.length, '收藏') +
      '</div>' +

      '<div class="chart"><h4>近 7 天学习量</h4>' + bars(series) + '</div>' +

      '<div class="cell-group">' +
      tap('fav', '⭐', '#ffc300', '收藏单词', S.P.fav.length + ' 个') +
      tap('bank', '📖', '#3b6ef5', '词库浏览与搜索', '高考 / 四级 / 六级 共 ' + C.Catalog.all().length + ' 词') +
      tap('stats', '📈', '#8e5bf2', '学习统计', '记忆保持率 · 打卡日历') +
      tap('intro', '🧠', '#00b4c8', '艾宾浩斯记忆曲线', '看它怎么安排你的复习') +
      '</div>' +
      '<div style="text-align:center;color:#b2b2b2;font-size:12px;padding:6px 0 20px">忆单词 v1.0.0 · 手机版 H5</div>';
  };

  function cell(page, color, ch, title, desc) {
    return '<button class="g4" data-action="go" data-page="' + page + '">' +
      '<span class="gi" style="background:' + color + '">' + ch + '</span>' +
      '<span class="gt">' + esc(title) + '</span><span class="gd">' + esc(desc) + '</span></button>';
  }
  function tap(page, ch, color, title, desc) {
    return '<button class="cell tap" data-action="go" data-page="' + page + '">' +
      '<span class="ico" style="background:' + color + '">' + ch + '</span>' +
      '<span class="bd"><b>' + esc(title) + '</b><small>' + esc(desc) + '</small></span><span class="ft"></span></button>';
  }
  function kpi(v, label) { return '<div class="kpi"><b>' + esc(v) + '</b><small>' + esc(label) + '</small></div>'; }
  function bars(series) {
    var max = 1;
    series.forEach(function (s) { max = Math.max(max, s.value); });
    return '<div class="bars">' + series.map(function (s) {
      return '<div class="bcol"><span class="bval">' + s.value + '</span>' +
        '<i style="height:' + Math.max(3, Math.round((s.value / max) * 74)) + 'px"></i>' +
        '<em>' + s.date.slice(5).replace('-', '/') + '</em></div>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------ 学习 / 复习 */
  PAGES.study = function () {
    var goal = S.P.settings.dailyGoal || 20;
    var today = C.Repo.today(S.P);
    var fresh = C.Repo.newWords(S.P, words(), 200).length;
    if (S.session) return sessionView();
    return '' +
      '<div class="progress-top"><div class="line"><span>今日新词进度</span><span>' + today.new + ' / ' + goal + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, Math.round(today.new / goal * 100)) + '%"></i></div></div>' +
      '<div class="card"><h3>选择词库</h3>' + bankSeg() +
      '<div style="color:#888;font-size:13px;margin-top:8px">《' + esc(bankName(S.bank)) + '》共 ' + words().length + ' 词，其中 ' + fresh + ' 词未学习。每轮按每日目标 ' + goal + ' 词安排。</div></div>' +
      '<div class="btn-row"><button class="btn" data-action="start-study">开始学新词</button></div>' +
      '<div class="cell-group">' +
      tap('intro', '🧠', '#00b4c8', '记忆阶段怎么安排', '5 分钟 → 30 分钟 → 12 小时 → 1/2/4/7/15/30 天') +
      '</div>' +
      '<div class="card"><h3>已学词汇</h3>' +
      '<div style="display:flex;gap:14px;font-size:13px;color:#888">' +
      '<span>已学 <b style="color:#191919">' + Object.keys(S.P.words).length + '</b></span>' +
      '<span>牢固 <b style="color:#07c160">' + C.Stats.mastery(S.P, C.Catalog.all()).strong + '</b></span>' +
      '<span>待复习 <b style="color:#fa5151">' + C.Repo.dueQueue(S.P, C.Catalog.all()).length + '</b></span></div></div>';
  };

  function bankSeg() {
    return '<div class="chips" style="padding:6px 0 0">' + C.Catalog.banks().map(function (b) {
      var n = C.Catalog.words(b.id).length;
      var learned = 0;
      C.Catalog.words(b.id).forEach(function (w) { if (S.P.words[w.id] && S.P.words[w.id].learned) learned++; });
      return '<button class="chip' + (b.id === S.bank ? ' on' : '') + '" data-action="pick-bank" data-bank="' + b.id + '">' +
        esc(b.name) + ' ' + learned + '/' + n + '</button>';
    }).join('') + '</div>';
  }

  PAGES.review = function () {
    if (S.session) return sessionView();
    var all = C.Catalog.all();
    var due = C.Repo.dueQueue(S.P, all);
    var tabs = [
      { id: 'due', t: '今日到期', n: due.length },
      { id: 'all', t: '全部已学', n: Object.keys(S.P.words).length },
      { id: 'wrong', t: '错词本', n: S.P.wrong.length },
      { id: 'fav', t: '收藏', n: S.P.fav.length }
    ];
    var list = [];
    if (S.reviewTab === 'due') list = due.map(function (i) { return i.word; });
    else if (S.reviewTab === 'all') {
      all.forEach(function (w) { if (S.P.words[w.id] && S.P.words[w.id].learned) list.push(w); });
    } else if (S.reviewTab === 'wrong') {
      list = S.P.wrong.map(function (r) { return C.Catalog.find(r.id); }).filter(Boolean);
    } else {
      list = S.P.fav.map(function (id) { return C.Catalog.find(id); }).filter(Boolean);
    }
    return '' +
      '<div class="seg">' + tabs.map(function (t) {
        return '<button class="' + (S.reviewTab === t.id ? 'on' : '') + '" data-action="review-tab" data-tab="' + t.id + '">' + t.t + '(' + t.n + ')</button>';
      }).join('') + '</div>' +
      (list.length ? '<div class="btn-row" style="margin-top:4px"><button class="btn" data-action="start-review" data-from="' + S.reviewTab + '">开始复习（' + Math.min(list.length, 20) + ' 词）</button></div>' : '') +
      (list.length ? '<div class="searchbar"><input id="rv-kw" placeholder="搜索后点击词条可试听发音" value="' + esc(S.kw) + '" /></div>' + linesView(filterList(list)) : empty('还没有内容，先去学新词吧'));
  };

  function filterList(list) {
    var kw = S.kw.trim().toLowerCase();
    if (!kw) return list.slice(0, PAGE_SIZE * 3);
    return list.filter(function (w) {
      return w.word.toLowerCase().indexOf(kw) >= 0 || String(w.meaning).indexOf(kw) >= 0;
    }).slice(0, PAGE_SIZE * 3);
  }
  function linesView(list) {
    return '<div class="cell-group">' + list.map(function (w) {
      var st = S.P.words[w.id];
      var dueNow = st && st.learned && st.dueAt <= Date.now();
      return '<div class="wline"><span class="w">' + esc(w.word) + '</span>' +
        '<span class="m">' + esc(w.meaning) + '</span>' +
        '<span class="s' + (dueNow ? ' due' : '') + '">' + (st && st.learned ? Math.round(C.SRS.strength(st)) + '%' : '未学') + '</span>' +
        '<button class="spk" data-action="speak-word" data-word="' + esc(w.word) + '">♪</button></div>';
    }).join('') + '</div>';
  }
  function empty(text) { return '<div class="empty"><div class="box"></div>' + esc(text) + '</div>'; }

  /* -------------------------------------------------- 学习会话（翻转卡） */
  function buildSession(mode) {
    var items = [];
    var all = C.Catalog.all();
    if (mode === 'study') items = C.Repo.newWords(S.P, words(), S.P.settings.dailyGoal || 20);
    else if (mode === 'due') items = C.Repo.dueQueue(S.P, all, 20);
    else if (mode === 'all') {
      items = all.filter(function (w) { return S.P.words[w.id] && S.P.words[w.id].learned; })
        .slice(0, 20)
        .map(function (w) { return { word: w, state: S.P.words[w.id] }; });
    } else if (mode === 'wrong') {
      items = S.P.wrong.slice(0, 20).map(function (r) {
        return { word: C.Catalog.find(r.id), state: S.P.words[r.id] };
      }).filter(function (i) { return i.word; });
    } else if (mode === 'fav') {
      items = S.P.fav.slice(0, 20).map(function (id) {
        return { word: C.Catalog.find(id), state: S.P.words[id] };
      }).filter(function (i) { return i.word; });
    }
    if (!items.length) return null;
    return { mode: mode, items: items, idx: 0, flipped: false, ok: 0, bad: 0, t0: Date.now(), lastAt: Date.now() };
  }

  function resumeSession() { /* 会话仅在 start-* 时建立，切换标签会结束当前轮 */ }

  function sessionView() {
    var s = S.session;
    var it = s.items[s.idx];
    if (!it) return resultView();
    var w = it.word;
    var st = S.P.words[w.id];
    var pct = Math.round((s.idx / s.items.length) * 100);
    var front = '<div class="face front">' +
      '<div style="margin-bottom:10px"><span class="tag">' + esc(bankName(w.bank)) + '</span>' +
      (st && st.learned ? '<span class="tag">' + esc(C.SRS.stageName(st.level)) + '</span>' : '') + '</div>' +
      '<p class="word-big">' + esc(w.word) + '</p>' +
      '<div class="pho">' + esc(w.phonetic) + '<button class="spk" data-action="speak-cur">♪</button></div>' +
      '<div class="center-hint">点击卡片翻面查看释义</div>' +
      '<div class="srs-meta"><span>' + esc(srsLine(st)) + '</span><span>' + (s.idx + 1) + ' / ' + s.items.length + '</span></div>' +
      '</div>';
    var backFace = '<div class="face back">' +
      '<p class="word-big" style="font-size:26px">' + esc(w.word) + ' <span style="font-size:15px;color:#888">' + esc(w.phonetic) + '</span></p>' +
      '<div class="meaning">' + esc(w.meaning) + '</div>' +
      (w.example ? '<div class="example">' + hlExample(w) + '</div>' : '') +
      '<div class="srs-meta"><span>' + esc(srsLine(st)) + '</span><span>记忆度 ' + Math.round(C.SRS.strength(st)) + '%</span></div>' +
      '</div>';
    return '' +
      '<div class="progress-top"><div class="line"><span>' + sessionTitle(s.mode) + '</span><span>' + s.idx + ' / ' + s.items.length + ' · 对 ' + s.ok + ' 错 ' + s.bad + '</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="flipwrap" data-action="flip"><div class="flip' + (s.flipped ? ' on' : '') + '">' + front + backFace + '</div></div>' +
      (s.flipped ?
        '<div class="grades">' +
        grade(0, '不认识', '回到 5 分钟') + grade(1, '有点模糊', '保持期减半') +
        grade(2, '记得', '进入下一级') + grade(3, '很熟', '跳过一级') +
        '</div>' +
        '<div class="btn-row" style="margin-top:0"><button class="btn ghost sm" data-action="fav-cur">' + (S.P.fav.indexOf(w.id) >= 0 ? '取消收藏' : '加入收藏') + '</button>' +
        '<button class="btn ghost sm" data-action="end-session">结束本轮</button></div>'
        :
        '<div class="btn-row"><button class="btn ghost" data-action="flip">显示释义</button><button class="btn soft" data-action="end-session">退出</button></div>');
  }
  function grade(g, t, sub) {
    return '<button data-action="grade" data-g="' + g + '"><b>' + t + '</b><small>' + sub + '</small></button>';
  }
  function sessionTitle(mode) {
    return { study: '学新词', due: '到期复习', all: '全部已学复习', wrong: '错词攻克', fav: '收藏复习' }[mode] || '复习';
  }
  function hlExample(w) {
    var ex = String(w.example || '');
    var re = new RegExp('(' + String(w.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return esc(ex).replace(re, '<em>$1</em>');
  }

  function resultView() {
    var s = S.session;
    var total = s.items.length;
    var rate = total ? Math.round((s.ok / total) * 100) : 0;
    return '<div class="result"><div class="ring">' + ring(rate) +
      '<div class="pct"><b>' + rate + '%</b><small>本轮记住率</small></div></div>' +
      '<h3 style="margin:0 0 4px">' + sessionTitle(s.mode) + '完成</h3>' +
      '<div style="color:#888;font-size:13px">' + total + ' 词 · 对 ' + s.ok + ' · 错 ' + s.bad + ' · 用时 ' + Math.max(1, Math.round((Date.now() - s.t0) / 1000)) + ' 秒</div>' +
      '<div class="btn-row" style="justify-content:center"><button class="btn" data-action="tab" data-tab="home">回首页</button>' +
      '<button class="btn ghost" data-action="again">再来一轮</button></div>' +
      (s.bad ? '<div class="notice">答错的词已进入错词本，连续两次答对会自动移出。</div>' : '') + '</div>';
  }
  function ring(rate) {
    var r = 54, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 128 128" width="128" height="128">' +
      '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#ececec" stroke-width="10"/>' +
      '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#07c160" stroke-width="10" stroke-linecap="round" ' +
      'stroke-dasharray="' + (c * rate / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 64 64)"/></svg>';
  }

  function gradeCur(g) {
    var s = S.session;
    var w = s.items[s.idx].word;
    C.Repo.addMinutes(S.P, (Date.now() - s.lastAt) / 60000);
    s.lastAt = Date.now();
    C.Repo.reviewWord(S.P, w.id, Number(g));
    if (Number(g) >= 2) s.ok++; else s.bad++;
    C.Repo.save(S.P);
    s.idx++;
    s.flipped = false;
    render();
    renderTabbar();
  }

  /* --------------------------------------------------------------- 测试 */
  PAGES.quiz = function () {
    if (S.quiz) return S.quiz.done ? quizResult() : quizQuestion();
    var learned = C.Catalog.all().filter(function (w) { return S.P.words[w.id] && S.P.words[w.id].learned; });
    var due = C.Repo.dueQueue(S.P, C.Catalog.all());
    return '' +
      '<div class="card"><h3>自动组卷</h3><div style="color:#888;font-size:13px">按出题范围抽题，题型轮换，答错自动写入错词本。</div></div>' +
      '<div class="cell-group"><div class="cell noarrow"><span class="bd"><b>出题范围</b></span></div>' +
      scopeRow('bank', '当前词库《' + bankName(S.bank) + '》', words().length) +
      scopeRow('learned', '我已学过的词', learned.length) +
      scopeRow('due', '今日到期复习', due.length) +
      scopeRow('wrong', '错词本', S.P.wrong.length) +
      scopeRow('fav', '收藏夹', S.P.fav.length) +
      '</div>' +
      '<div class="field"><label>题量</label><div class="chips" style="padding:6px 0 0">' +
      [5, 10, 20, 30].map(function (n) {
        return '<button class="chip' + (S.quizCount === n ? ' on' : '') + '" data-action="quiz-count" data-n="' + n + '">' + n + ' 题</button>';
      }).join('') + '</div></div>' +
      '<div class="cell-group">' + tapQuizTypes() + '</div>' +
      '<div class="btn-row"><button class="btn" data-action="start-quiz">开始测试</button></div>' +
      (learned.length < 3 ? '<div class="notice">题库至少需要 3 个已学词才能生成干扰项，先去学几个新词吧。</div>' : '');
  };
  function scopeRow(id, title, n) {
    return '<button class="cell tap noarrow' + (S.quizScope === id ? ' on' : '') + '" data-action="quiz-scope" data-scope="' + id + '">' +
      '<span class="bd"><b>' + esc(title) + '</b></span><span class="ft">' + n + ' 词' + (S.quizScope === id ? ' ✓' : '') + '</span></button>';
  }
  function tapQuizTypes() {
    var ts = S.quizTypes || C.Quiz.TYPES;
    return '<div class="cell"><span class="bd"><b>题型</b><small>' + ts.map(function (t) { return C.Quiz.TYPE_NAME[t]; }).join(' · ') + '</small></span>' +
      '<span class="ft">选择</span><input type="hidden" /></div>';
  }
  function quizPool() {
    if (S.quizScope === 'learned') return C.Catalog.all().filter(function (w) { return S.P.words[w.id] && S.P.words[w.id].learned; });
    if (S.quizScope === 'due') return C.Repo.dueQueue(S.P, C.Catalog.all()).map(function (i) { return i.word; });
    if (S.quizScope === 'wrong') return S.P.wrong.map(function (r) { return C.Catalog.find(r.id); }).filter(Boolean);
    if (S.quizScope === 'fav') return S.P.fav.map(function (id) { return C.Catalog.find(id); }).filter(Boolean);
    return words();
  }
  function startQuiz() {
    var pool = quizPool();
    if (pool.length < 1) return toast('这个范围里还没有词');
    var items = C.Quiz.pick(pool, Math.min(S.quizCount, pool.length)).map(function (w) {
      return { word: w, state: S.P.words[w.id] };
    });
    S.quiz = {
      qs: C.Quiz.build(items, C.Catalog.all(), S.quizTypes),
      i: 0, picked: null, shown: false, results: [], t0: Date.now(), lastAt: Date.now(), text: ''
    };
    render();
  }
  function quizQuestion() {
    var q = S.quiz.qs[S.quiz.i];
    var cur = S.quiz.picked;
    var shown = S.quiz.shown;
    var stem = '';
    if (q.type === 'spelling') {
      stem = '<div class="card"><div class="tag">' + C.Quiz.TYPE_NAME[q.type] + '</div><div class="q-stem">' + esc(q.stem) + '</div>' +
        '<div class="blank">' + esc(q.hint) + '</div>' +
        '<input id="q-text" class="in" style="border:1px solid #e6e6e6;border-radius:8px;padding:11px 12px" placeholder="输入单词后回车" value="' + esc(S.quiz.text) + '" autocapitalize="off" autocomplete="off" />' +
        '<div class="btn-row" style="margin:12px 0 0"><button class="btn" data-action="quiz-submit-text">提交</button></div></div>';
    } else {
      stem = '<div class="card"><div class="tag">' + C.Quiz.TYPE_NAME[q.type] + '</div>' +
        (q.type === 'listening' ? '<div class="q-stem">' + esc(q.stem) + '</div><button class="btn soft block" data-action="quiz-audio">播放发音</button>' :
          '<div class="q-stem">' + esc(q.stem) + ' <button class="spk" data-action="quiz-audio">♪</button></div>') + '</div>';
    }
    var opts = '';
    if (q.type !== 'spelling') {
      opts = q.options.map(function (o, i) {
        var cls = '';
        if (shown) cls = i === q.answer ? 'right' : (i === cur ? 'wrong' : 'dim');
        return '<button class="opt ' + cls + '" data-action="quiz-answer" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' +
          '<i>' + 'ABCD'[i] + '</i><span>' + esc(o) + '</span></button>';
      }).join('');
    }
    var explain = shown ? '<div class="explain"><b>' + esc(q.answerText || q.options[q.answer]) + '</b><br>' +
      esc((C.Catalog.find(q.wordId) || {}).meaning || '') + '<br>' +
      '正确答案：' + (q.type === 'spelling' ? esc(q.answerText) : 'ABCD'[q.answer]) + '</div>' : '';
    return '<div class="progress-top"><div class="line"><span>第 ' + (S.quiz.i + 1) + ' / ' + S.quiz.qs.length + ' 题</span>' +
      '<span>得分 ' + S.quiz.results.filter(Boolean).length + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round(S.quiz.i / S.quiz.qs.length * 100) + '%"></i></div></div>' +
      stem + opts + explain +
      (shown ? '<div class="btn-row"><button class="btn" data-action="quiz-next">' + (S.quiz.i + 1 >= S.quiz.qs.length ? '查看成绩' : '下一题') + '</button></div>' : '') +
      (!shown ? '<div class="btn-row"><button class="btn ghost" data-action="quiz-quit">退出测试</button></div>' : '');
  }
  function quizAnswer(v) {
    var q = S.quiz;
    if (q.shown) return;
    var cur = q.qs[q.i];
    var ok = C.Quiz.check(cur, v);
    C.Repo.addMinutes(S.P, (Date.now() - q.lastAt) / 60000);
    q.lastAt = Date.now();
    q.results[q.i] = ok;
    q.picked = cur.type === 'spelling' ? null : Number(v);
    q.shown = true;
    q.text = '';
    C.Repo.reviewWord(S.P, cur.wordId, ok ? C.SRS.GRADE.KNOWN : C.SRS.GRADE.FORGOT);
    C.Repo.track(S.P, 'quiz');
    C.Repo.save(S.P);
    render();
  }
  function quizResult() {
    var q = S.quiz;
    var right = q.results.filter(Boolean).length;
    var rate = Math.round(right / q.qs.length * 100);
    var wrongs = q.qs.map(function (it, i) { return q.results[i] ? null : it; }).filter(Boolean);
    return '<div class="result"><div class="ring">' + ring(rate) +
      '<div class="pct"><b>' + rate + '</b><small>得分</small></div></div>' +
      '<h3 style="margin:0 0 4px">' + right + ' / ' + q.qs.length + ' 题正确</h3>' +
      '<div style="color:#888;font-size:13px">用时 ' + Math.max(1, Math.round((Date.now() - q.t0) / 1000)) + ' 秒 · 已计入学习统计</div></div>' +
      (wrongs.length ? '<div class="group-title">错题回顾</div><div class="cell-group">' + wrongs.map(function (it) {
        var w = C.Catalog.find(it.wordId) || {};
        return '<div class="wline"><span class="w">' + esc(w.word || '') + '</span><span class="m">' + esc(w.meaning || '') + '</span>' +
          '<button class="spk" data-action="speak-word" data-word="' + esc(w.word || '') + '">♪</button></div>';
      }).join('') + '</div>' : '<div class="notice">全部答对，继续保持！</div>') +
      '<div class="btn-row"><button class="btn" data-action="quiz-retry">再来一组</button>' +
      '<button class="btn ghost" data-action="tab" data-tab="home">回首页</button></div>';
  }

  /* --------------------------------------------------------------- 我的 */
  PAGES.mine = function () {
    var u = S.user;
    var name = u ? u.nickname : '游客';
    var acc = u ? u.account : 'guest';
    var color = u ? u.avatarColor : '#8a8f99';
    var role = u ? (u.role === 'admin' ? '管理员' : '普通用户') : '游客（进度不区分账号）';
    var ret = C.Stats.retention(S.P);
    var learnCount = 0;
    Object.keys(S.P.words).forEach(function (k) { if (S.P.words[k].learned) learnCount++; });
    return '' +
      '<div class="mehead"><span class="avatar" style="background:' + color + '">' + esc(name.slice(0, 1)) + '</span>' +
      '<div><b>' + esc(name) + '</b><small>' + esc(acc) + ' · ' + esc(role) + '</small></div></div>' +
      '<div class="kpis">' + kpi(learnCount, '已学词') + kpi(ret.rate + '%', '保持率') + kpi(C.Stats.streak(S.P), '连续打卡') + '</div>' +
      '<div class="cell-group">' +
      tap('stats', '📊', '#07c160', '学习统计', '曲线 · 热力图 · 掌握分布') +
      tap('profile', '⚙️', '#3b6ef5', '个人设置', '昵称 · 每日目标 · 默认词库') +
      tap('bank', '📚', '#f5a623', '词库浏览', C.Catalog.all().length + ' 词') +
      '</div>' +
      (C.Auth.isAdmin() ? '<div class="cell-group">' + tap('admin', '🛠', '#fa5151', '管理后台', '用户 · 词库 · 公告') + '</div>' : '') +
      '<div class="cell-group">' +
      '<button class="cell tap" data-action="about"><span class="ico" style="background:#8e5bf2">ℹ</span><span class="bd"><b>关于本系统</b><small>版本 / 算法 / 三端说明</small></span><span class="ft"></span></button>' +
      '</div>' +
      '<div class="cell-group">' +
      '<button class="cell" data-action="data-bucket"><span class="ico" style="background:#8a8f99">💾</span><span class="bd"><b>数据位置</b><small>localStorage 键：wm_profile_' + esc(u ? u.uid : 'guest') + '</small></span></button>' +
      '</div>' +
      (u ? '<div class="btn-row"><button class="btn warn" data-action="logout">退出登录</button></div>'
        : '<div class="btn-row"><button class="btn" data-action="logout">游客身份退出 · 注册后可保留多端进度</button></div>');
  };

  PAGES.stats = function () {
    var p = S.P;
    var series = C.Stats.series(p, 14);
    var heat = C.Stats.heatmap(p, 40);
    var m = C.Stats.mastery(p, C.Catalog.all());
    var acc = C.Stats.accuracy(p);
    var ret = C.Stats.retention(p);
    var total = m.fresh + m.weak + m.fair + m.strong || 1;
    var minutes = 0;
    Object.keys(p.log).forEach(function (k) { minutes += p.log[k].minutes || 0; });
    return '' +
      '<div class="kpis">' + kpi(Object.keys(p.words).length, '已学词数') + kpi(acc.rate + '%', '答对率') + kpi(Math.round(minutes) + '′', '累计时长') + '</div>' +
      '<div class="chart"><h4>近 14 天学习量（新学 + 复习 + 测试）</h4>' + bars(series) + '</div>' +
      '<div class="chart"><h4>记忆保持率</h4>' +
      '<div style="display:flex;align-items:baseline;gap:6px"><b style="font-size:26px;color:#07c160">' + ret.rate + '%</b>' +
      '<span style="color:#888;font-size:13px">已学 ' + ret.learned + ' 词中 ' + ret.solid + ' 词进入 1 天以上保持期</span></div>' +
      '<div class="dist" style="margin-top:12px">' +
      seg(m.fresh, total, '#ececec') + seg(m.weak, total, '#ffc9c9') + seg(m.fair, total, '#ffe3a3') + seg(m.strong, total, '#7ee0a8') + '</div>' +
      '<div class="legend">' +
      dot('#ececec', '未学 ' + m.fresh) + dot('#ffc9c9', '模糊 ' + m.weak) + dot('#ffe3a3', '熟悉 ' + m.fair) + dot('#7ee0a8', '牢固 ' + m.strong) + '</div></div>' +
      '<div class="chart"><h4>打卡热力图（近 40 天）</h4><div class="heat">' +
      heat.map(function (d) { return '<i class="l' + d.level + '" title="' + d.date + ' ' + d.value + '"></i>'; }).join('') + '</div>' +
      '<div class="legend" style="margin-top:10px">' + dot('#eef0f2', '0') + dot('#b8ecce', '少') + dot('#26c96f', '多') + '</div></div>' +
      '<div class="chart"><h4>各记忆阶段词数</h4>' + stageBars(p) + '</div>' +
      '<div class="chart"><h4>每日日志（近 10 天）</h4>' + logTable(p) + '</div>';
  };
  function seg(v, total, color) {
    return '<i style="background:' + color + ';width:' + (v / total * 100).toFixed(1) + '%"></i>';
  }
  function stageBars(p) {
    var counts = [];
    for (var i = 0; i < C.SRS.INTERVALS.length; i++) counts.push(0);
    Object.keys(p.words).forEach(function (k) {
      var st = p.words[k];
      if (st && st.learned) counts[Math.min(st.level, counts.length - 1)]++;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    return '<div class="hbars">' + counts.map(function (v, i) {
      return '<div class="hrow"><em>' + esc(C.SRS.stageName(i)) + '</em>' +
        '<span class="htrack"><i style="width:' + Math.round(v / max * 100) + '%"></i></span><b>' + v + '</b></div>';
    }).join('') + '</div>';
  }
  function logTable(p) {
    var keys = Object.keys(p.log).sort().reverse().slice(0, 10);
    if (!keys.length) return '<div style="color:#b2b2b2;font-size:13px">还没有记录</div>';
    return '<table class="tbl"><thead><tr><th>日期</th><th>新学</th><th>复习</th><th>测试</th><th>分钟</th></tr></thead><tbody>' +
      keys.map(function (k) {
        var d = p.log[k];
        return '<tr><td>' + k.slice(5) + '</td><td>' + (d.new || 0) + '</td><td>' + (d.review || 0) + '</td><td>' + (d.quiz || 0) + '</td><td>' + (d.minutes || 0) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function dot(color, text) { return '<span><em style="background:' + color + '"></em>' + esc(text) + '</span>'; }

  PAGES.profile = function () {
    var u = S.user;
    return '<div class="field"><label>昵称</label><input id="pf-nick" value="' + esc(u ? u.nickname : '游客') + '" /></div>' +
      '<div class="field"><label>每日新词目标</label><input id="pf-goal" type="number" min="5" max="100" value="' + (S.P.settings.dailyGoal || 20) + '" /></div>' +
      '<div class="field"><label>发音口音</label><select id="pf-accent"><option value="en-US"' + (S.P.settings.accent !== 'en-GB' ? ' selected' : '') + '>美音 en-US</option>' +
      '<option value="en-GB"' + (S.P.settings.accent === 'en-GB' ? ' selected' : '') + '>英音 en-GB</option></select></div>' +
      '<div class="card"><h3>默认词库</h3>' + bankSeg() + '</div>' +
      '<div class="btn-row"><button class="btn" data-action="save-profile">保存设置</button>' +
      (u && u.role !== 'guest' ? '<button class="btn ghost" data-action="change-pwd">修改密码</button>' : '') + '</div>' +
      '<div class="notice">目标词数决定每轮学新词与每日进度的分母；设置保存在本机 wm_profile_ 桶内。</div>';
  };

  PAGES.bank = function () {
    var list = C.Catalog.words(S.bank);
    var kw = S.kw.trim();
    var shown = kw ? C.Catalog.search(kw, S.bank, 400) : list;
    var pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    if (S.bankPage > pages) S.bankPage = pages;
    var slice = shown.slice((S.bankPage - 1) * PAGE_SIZE, S.bankPage * PAGE_SIZE);
    return '<div class="searchbar"><input id="bk-kw" placeholder="搜索单词或释义" value="' + esc(S.kw) + '" />' +
      '<button class="btn sm soft" data-action="bank-search">搜索</button></div>' +
      '<div class="chips">' + C.Catalog.banks().map(function (b) {
        return '<button class="chip' + (b.id === S.bank ? ' on' : '') + '" data-action="pick-bank" data-bank="' + b.id + '">' + esc(b.name) + '</button>';
      }).join('') + '</div>' +
      (shown.length ? linesView(slice) : empty('没有匹配的单词')) +
      (pages > 1 ? '<div class="pager"><button data-action="page-prev"' + (S.bankPage === 1 ? ' disabled' : '') + '>上一页</button>' +
        '<span>' + S.bankPage + ' / ' + pages + '</span><button data-action="page-next"' + (S.bankPage === pages ? ' disabled' : '') + '>下一页</button></div>' : '');
  };

  PAGES.wrong = function () { return listView(S.P.wrong.map(function (r) { return C.Catalog.find(r.id); }).filter(Boolean), '错词本', '答错会自动收录，连续两次答对自动移出。', 'wrong'); };
  PAGES.fav = function () { return listView(S.P.fav.map(function (id) { return C.Catalog.find(id); }).filter(Boolean), '收藏夹', '学习卡片上点「加入收藏」即可把词放进这里。', 'fav'); };
  function listView(list, title, desc, mode) {
    return '<div class="card"><h3>' + esc(title) + '（' + list.length + '）</h3>' +
      '<div style="color:#888;font-size:13px">' + esc(desc) + '</div>' +
      (list.length ? '<div class="btn-row" style="margin:12px 0 0"><button class="btn" data-action="start-review" data-from="' + mode + '">开始攻克</button></div>' : '') +
      '</div>' +
      (list.length ? linesView(list) : empty('这里还是空的'));
  }

  PAGES.intro = function () {
    return '<div class="card"><h3>艾宾浩斯遗忘曲线</h3>' +
      '<div style="font-size:13px;color:#555;line-height:1.8">系统在 5 分钟、30 分钟、12 小时、1/2/4/7/15/30 天九个保持节点安排复习。' +
      '每次复习后按你的自评结果调整阶段：「不认识」退回起点，「有点模糊」保持期减半，「记得」进入下一级，「很熟」跳过一级。' +
      '达到第 4 级（1 天以上）即计入记忆保持率。</div></div>' +
      '<div class="chart"><h4>九个保持节点</h4><div class="cell-group" style="margin:0">' +
      C.SRS.INTERVALS.map(function (m, i) {
        return '<div class="cell noarrow"><span class="ico" style="background:#07c160">' + (i + 1) + '</span>' +
          '<span class="bd"><b>' + esc(C.SRS.stageName(i)) + '</b><small>' + m + ' 分钟后第一次复习</small></span>' +
          '<span class="ft">' + (m < 60 ? m + '′' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd') + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><h3>三端同一套内核</h3>' +
      '<div style="font-size:13px;color:#555;line-height:1.8">电脑版 Web、手机版 H5 与微信小程序共用 wordbank.js（词库数据）与 core.js（Store / SRS / Auth / Repo / Quiz / Stats / CMS 七层）。' +
      '存储层自动适配 localStorage 与 wx.setStorageSync，因此同一份算法参数在三端表现一致。</div></div>';
  };

  /* --------------------------------------------------------------- 后台 */
  PAGES.admin = function () {
    var tabs = [['overview', '概览'], ['users', '用户'], ['words', '词库'], ['sys', '系统']];
    return '<div class="seg">' + tabs.map(function (t) {
      return '<button class="' + (S.adminTab === t[0] ? 'on' : '') + '" data-action="admin-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>' + ADMIN[S.adminTab]();
  };
  var ADMIN = {};
  ADMIN.overview = function () {
    var users = C.Auth.users();
    var learnedAll = 0, answers = 0;
    users.forEach(function (u) {
      var p = C.Repo.load(u.uid);
      Object.keys(p.words).forEach(function (k) { if (p.words[k].learned) learnedAll++; });
      Object.keys(p.words).forEach(function (k) { answers += (p.words[k].correct || 0) + (p.words[k].wrong || 0); });
    });
    var m = C.Stats.mastery(C.Repo.load(C.Auth.bucketOf()), C.Catalog.all());
    return '<div class="kpis">' + kpi(users.length, '注册用户') + kpi(learnedAll, '全站已学词次') + kpi(answers, '累计作答') + '</div>' +
      '<div class="chart"><h4>词库构成</h4><div class="cell-group" style="margin:0">' +
      C.Catalog.banks().map(function (b) {
        return '<div class="cell noarrow"><span class="bd"><b>' + esc(b.name) + '</b><small>' + esc(b.desc || '') + '</small></span>' +
          '<span class="ft">' + C.Catalog.words(b.id).length + ' 词</span></div>';
      }).join('') + '</div></div>' +
      '<div class="chart"><h4>系统层数据</h4><div class="legend">' +
      dot('#07c160', '未学 ' + m.fresh) + dot('#fa5151', '模糊 ' + m.weak) + dot('#f5a623', '熟悉 ' + m.fair) + dot('#10aeff', '牢固 ' + m.strong) + '</div></div>';
  };
  ADMIN.users = function () {
    var users = C.Auth.users();
    return '<div class="cell-group">' + users.map(function (u) {
      var p = C.Repo.load(u.uid);
      var n = 0;
      Object.keys(p.words).forEach(function (k) { if (p.words[k].learned) n++; });
      return '<div class="cell noarrow"><span class="ico" style="background:' + (u.avatarColor || '#8a8f99') + '">' + esc((u.nickname || u.account).slice(0, 1)) + '</span>' +
        '<span class="bd"><b>' + esc(u.nickname || u.account) + ' · ' + esc(u.account) + '</b>' +
        '<small>' + (u.role === 'admin' ? '管理员' : '普通用户') + ' · 已学 ' + n + ' 词 · ' + (u.status === 0 ? '<span style="color:#fa5151">已停用</span>' : '正常') + '</small></span></div>' +
        '<div class="cell noarrow" style="padding-top:0"><button class="btn sm ghost" data-action="u-pwd" data-uid="' + u.uid + '">重置密码</button>' +
        '<button class="btn sm ghost" data-action="u-toggle" data-uid="' + u.uid + '">' + (u.status === 0 ? '恢复账号' : '停用账号') + '</button></div>';
    }).join('') + '</div>';
  };
  ADMIN.words = function () {
    var custom = C.CMS.customWords(S.bank);
    return '<div class="card"><h3>新增单词</h3>' +
      '<div class="field" style="padding-left:0;padding-right:0"><label>单词</label><input id="w-word" placeholder="abandon" autocapitalize="off" /></div>' +
      '<div class="field" style="padding-left:0;padding-right:0"><label>音标</label><input id="w-pho" placeholder="/əˈbændən/" /></div>' +
      '<div class="field" style="padding-left:0;padding-right:0"><label>释义</label><input id="w-mean" placeholder="v. 放弃；抛弃" /></div>' +
      '<div class="field" style="padding-left:0;padding-right:0"><label>例句</label><input id="w-ex" placeholder="He had to abandon the plan." /></div>' +
      '<div class="chips" style="padding:8px 0 0">' + C.Catalog.banks().map(function (b) {
        return '<button class="chip' + (b.id === S.bank ? ' on' : '') + '" data-action="pick-bank" data-bank="' + b.id + '">' + esc(b.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="btn-row" style="margin:12px 0 0"><button class="btn" data-action="w-add">添加</button>' +
      '<button class="btn ghost" data-action="w-import">批量导入</button></div></div>' +
      '<div class="group-title">自定义词（' + custom.length + '）· 全站共用</div>' +
      (custom.length ? '<div class="cell-group">' + custom.map(function (w) {
        return '<div class="wline"><span class="w">' + esc(w.word) + '</span><span class="m">' + esc(w.meaning) + '</span>' +
          '<button class="btn sm warn" data-action="w-del" data-id="' + w.id + '">删除</button></div>';
      }).join('') + '</div>' : empty('该词库还没有自定义词')) +
      '<div class="notice">导入格式：每行 <code>word,phonetic,meaning,example</code>，可带英文引号。重复词会自动跳过。</div>';
  };
  ADMIN.sys = function () {
    return '<div class="card"><h3>系统公告</h3>' +
      '<div class="field" style="padding:0"><textarea id="sys-notice">' + esc(C.CMS.data().notice || '') + '</textarea></div>' +
      '<div class="btn-row" style="margin:12px 0 0"><button class="btn" data-action="save-notice">保存公告</button></div></div>' +
      '<div class="chart"><h4>记忆曲线参数（只读）</h4>' +
      '<table class="tbl"><thead><tr><th>阶段</th><th>间隔</th></tr></thead><tbody>' +
      C.SRS.INTERVALS.map(function (m, i) {
        return '<tr><td>' + (i + 1) + ' · ' + esc(C.SRS.stageName(i)) + '</td><td>' + m + ' 分钟</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="chart"><h4>运行环境</h4><div style="font-size:13px;color:#666;line-height:1.9">' +
      '存储后端：' + esc(C.Store.backend) + '<br>词库版本：' + esc(D.version) + '（' + C.Catalog.all().length + ' 词）<br>' +
      '内核：wordbank.js + core.js（三端共用）</div></div>' +
      '<div class="btn-row"><button class="btn warn" data-action="reset-all">清空本机全部数据</button></div>';
  };

  /* ----------------------------------------------------------- 事件绑定 */
  document.addEventListener('click', function (e) {
    var m = $('#modal');
    if (!m.hidden && e.target === m) { m.hidden = true; m.innerHTML = ''; return; }
    if ($('#sheet').hidden === false && e.target.closest('#page')) closeSheet();
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var act = el.getAttribute('data-action');
    var A = {
      'log-tab': function () {
        loginTab = el.getAttribute('data-tab');
        renderLogin();
      },
      'do-login': function () {
        var pwd = $('#lg-pwd').value;
        var r;
        if (loginTab === 'admin') {
          r = C.Auth.adminReady()
            ? C.Auth.login(C.Auth.adminAccount(), pwd, 'admin')
            : C.Auth.setAdminPwd(pwd, $('#lg-pwd2') ? $('#lg-pwd2').value : '');
        } else if (loginTab === 'register') {
          r = C.Auth.register($('#lg-acc').value.trim(), pwd, $('#lg-nick') ? $('#lg-nick').value : '');
        } else {
          r = C.Auth.login($('#lg-acc').value.trim(), pwd, null);
          if (r.ok && r.user.role === 'admin') {
            C.Auth.logout();
            return toast('这是管理员账号，请切到「管理员」标签登录');
          }
        }
        if (!r.ok) return toast(r.msg);
        toast(r.msg, true);
        enter(r.user);
      },
      'do-guest': function () { var u = C.Auth.guest(); enter(u); toast('已以游客身份进入', true); },
      'tab': function () { S.stack = []; go(el.getAttribute('data-tab'), true); },
      'go': function () { go(el.getAttribute('data-page')); },
      'back': back,
      'pick-bank': function () {
        S.bank = el.getAttribute('data-bank');
        S.bankPage = 1;
        if (S.session) S.session = null;
        C.Repo.save(S.P);
        if (S.user) C.Auth.update(S.user.uid, { bank: S.bank });
        render();
      },
      'start-study': function () {
        S.session = buildSession('study');
        if (!S.session) return toast('该词库已学完，换个词库或去复习');
        render();
      },
      'start-review': function () {
        var from = el.getAttribute('data-from') || S.reviewTab;
        S.session = buildSession(from === 'due' ? 'due' : from);
        if (!S.session) return toast('没有可复习的词');
        render();
      },
      'again': function () {
        var mode = S.session ? S.session.mode : 'study';
        S.session = buildSession(mode);
        if (!S.session) { S.session = null; toast('本轮已完成'); }
        render();
      },
      'review-tab': function () { S.reviewTab = el.getAttribute('data-tab'); render(); },
      'flip': function () { if (S.session) { S.session.flipped = !S.session.flipped; if (S.session.flipped) speak(S.session.items[S.session.idx].word.word); render(); } },
      'speak-cur': function () { speak(S.session ? S.session.items[S.session.idx].word.word : ''); },
      'speak-word': function () { speak(el.getAttribute('data-word')); },
      'grade': function () { gradeCur(el.getAttribute('data-g')); },
      'fav-cur': function () {
        var w = S.session.items[S.session.idx].word;
        var on = C.Repo.toggleFav(S.P, w.id);
        C.Repo.save(S.P);
        toast(on ? '已加入收藏' : '已取消收藏');
        render();
      },
      'end-session': function () { S.session = null; render(); },
      'quiz-scope': function () { S.quizScope = el.getAttribute('data-scope'); render(); },
      'quiz-count': function () { S.quizCount = Number(el.getAttribute('data-n')); render(); },
      'start-quiz': function () { startQuiz(); },
      'quiz-answer': function () { quizAnswer(Number(el.getAttribute('data-i'))); },
      'quiz-submit-text': function () {
        var inp = $('#q-text');
        quizAnswer(inp ? inp.value : '');
      },
      'quiz-audio': function () {
        var q = S.quiz.qs[S.quiz.i];
        var w = C.Catalog.find(q.wordId);
        w && speak(w.word);
      },
      'quiz-next': function () {
        if (S.quiz.i + 1 >= S.quiz.qs.length) S.quiz.done = true;
        else { S.quiz.i++; S.quiz.picked = null; S.quiz.shown = false; S.quiz.text = ''; S.quiz.lastAt = Date.now(); }
        render();
      },
      'quiz-quit': function () { S.quiz = null; render(); },
      'quiz-retry': function () { startQuiz(); },
      'save-profile': function () {
        var nick = $('#pf-nick').value.trim() || '游客';
        var goal = Math.max(5, Math.min(100, Number($('#pf-goal').value) || 20));
        S.P.settings.dailyGoal = goal;
        S.P.settings.bank = S.bank;
        S.P.settings.accent = $('#pf-accent').value;
        C.Repo.save(S.P);
        if (S.user) C.Auth.update(S.user.uid, { nickname: nick, bank: S.bank });
        S.user = C.Auth.current() || S.user;
        toast('已保存', true);
        go('mine', true);
      },
      'change-pwd': function () {
        promptBox('修改密码', '请输入新密码（至少 6 位）', '', 'password', function (v) {
          if (String(v).length < 6) return toast('密码至少 6 位');
          var r = C.Auth.resetPwd(S.user.uid, v);
          toast(r.ok ? '密码已更新' : r.msg, r.ok);
        });
      },
      'logout': function () {
        confirmBox('退出登录', '学习进度已保存在本机，退出后可重新登录同一账号继续。', function () {
          C.Auth.logout();
          S.session = null;
          S.quiz = null;
          S.user = null;
          $('#tabbar').hidden = true;
          renderLogin();
        });
      },
      'about': function () {
        confirmBox('关于忆单词', '基于微信小程序的英语单词记忆学习系统 v1.0.0 · 词库 ' + C.Catalog.all().length + ' 词 · 艾宾浩斯九级记忆曲线 · 三端共用同一内核（本科毕业设计演示版）', function () { });
      },
      'data-bucket': function () { toast('数据键 wm_profile_' + (S.user ? S.user.uid : 'guest')); },
      'admin-tab': function () { S.adminTab = el.getAttribute('data-tab'); render(); },
      'u-pwd': function () {
        promptBox('重置密码', '为该用户设置新密码（至少 6 位）', '', 'password', function (v) {
          var r = C.Auth.resetPwd(el.getAttribute('data-uid'), v);
          toast(r.ok ? '已重置' : r.msg, r.ok);
        });
      },
      'u-toggle': function () {
        var uid = el.getAttribute('data-uid');
        var u = C.Auth.findByUid(uid);
        if (!u) return;
        if (u.uid === (S.user && S.user.uid)) return toast('不能停用当前登录账号');
        C.Auth.setStatus(uid, u.status === 0 ? 1 : 0);
        toast(u.status === 0 ? '已恢复' : '已停用');
        render();
      },
      'w-add': function () {
        var word = $('#w-word').value.trim();
        if (!word) return toast('单词不能为空');
        var n = C.CMS.addWords([{
          bank: S.bank, word: word, phonetic: $('#w-pho').value.trim(),
          meaning: $('#w-mean').value.trim(), example: $('#w-ex').value.trim()
        }]);
        if (!n) return toast('该词已存在');
        C.Catalog.init(D);
        toast('已添加 1 词', true);
        render();
      },
      'w-del': function () {
        C.CMS.removeWord(el.getAttribute('data-id'));
        C.Catalog.init(D);
        toast('已删除');
        render();
      },
      'w-import': function () {
        var sh = $('#sheet');
        sh.innerHTML = '<h4>批量导入（CSV / TSV）</h4><div style="padding:12px 16px">' +
          '<textarea id="imp-text" style="width:100%;height:150px;background:#f5f5f5;border:0;border-radius:8px;padding:10px" ' +
          'placeholder="word,phonetic,meaning,example&#10;apple,/&quot;æpl/,&quot;n. 苹果&quot;,&quot;An apple a day.&quot;"></textarea>' +
          '<div class="btn-row" style="margin:12px 0 0"><button class="btn" id="imp-ok">导入到《' + esc(bankName(S.bank)) + '》</button>' +
          '<button class="btn ghost" id="imp-no">取消</button></div></div>';
        sh.hidden = false;
        $('#imp-no').onclick = closeSheet;
        $('#imp-ok').onclick = function () {
          var rows = parseCsv($('#imp-text').value, S.bank);
          var n = C.CMS.addWords(rows);
          C.Catalog.init(D);
          closeSheet();
          toast(n ? '成功导入 ' + n + ' 词，跳过 ' + (rows.length - n) + ' 词' : '没有可导入的新行', !!n);
          render();
        };
      },
      'save-notice': function () {
        C.CMS.setNotice($('#sys-notice').value.trim());
        toast('公告已更新', true);
      },
      'reset-all': function () {
        confirmBox('清空数据', '将删除本机所有账号、词库改动与学习记录，仅用于演示复位。确定继续？', function () {
          C.CMS.resetAll();
          location.reload();
        }, true);
      },
      'page-prev': function () { if (S.bankPage > 1) { S.bankPage--; render(); } },
      'page-next': function () { S.bankPage++; render(); },
      'bank-search': function () { S.bankPage = 1; render(); }
    };
    if (A[act]) A[act]();
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' && e.key === 'Enter') {
      if (e.target.id === 'lg-pwd' || e.target.id === 'lg-acc') { var b = $('[data-action=do-login]'); b && b.click(); return; }
      if (e.target.id === 'q-text') { quizAnswer(e.target.value); return; }
      if (e.target.id === 'bk-kw' || e.target.id === 'rv-kw') { S.bankPage = 1; render(); return; }
    }
    if (e.target.tagName === 'TEXTAREA') return;
    if (S.session && !S.session.flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); S.session.flipped = true; render(); }
    else if (S.session && S.session.flipped && ['1', '2', '3', '4'].indexOf(e.key) >= 0) gradeCur(Number(e.key) - 1);
    else if (e.key === 'Escape') { $('#modal').hidden = true; $('#modal').innerHTML = ''; closeSheet(); }
  });

  /* 搜索框重渲染会替换节点，需回焦并保留光标，否则手机输入两个字符就断 */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'bk-kw' && e.target.id !== 'rv-kw') return;
    S.kw = e.target.value;
    S.bankPage = 1;
    var id = e.target.id;
    clearTimeout(window.__kwTimer);
    window.__kwTimer = setTimeout(function () {
      render();
      var i = document.getElementById(id);
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }, 260);
  });

  function parseCsv(text, bank) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var cells = [];
      var cur = '';
      var inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',' || ch === '，' || ch === '\t') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      cells = cells.map(function (s) { return s.trim(); });
      if (/^(word|单词)$/i.test(cells[0])) return;
      if (!cells[0] || !cells[2]) return;
      rows.push({ bank: bank, word: cells[0], phonetic: cells[1] || '', meaning: cells[2] || '', example: cells[3] || '' });
    });
    return rows;
  }

  /* ------------------------------------------------------------- 启动 */
  $('#nav-back').addEventListener('click', back);

  function tickClock() {
    var d = new Date();
    var el = $('#sb-time');
    if (el) el.textContent = d.getHours() + ':' + pad(d.getMinutes());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  tickClock();
  setInterval(tickClock, 20000);

  if (C.Auth.current() || C.Auth.isGuest()) enter(C.Auth.current());
  else renderLogin();
})();
