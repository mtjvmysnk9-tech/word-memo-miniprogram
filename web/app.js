/* 忆单词 WordMemo · 电脑版应用层
 * 依赖：../assets/wordbank.js (window.WORD_MEMO)  ../assets/core.js (window.WORD_MEMO_CORE)
 */
(function () {
  'use strict';

  var D = window.WORD_MEMO;
  var C = window.WORD_MEMO_CORE;
  C.Catalog.init(D);

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var S = {
    user: null,
    P: null,
    route: 'home',
    bank: 'cet4',
    session: null,
    quiz: null,
    bankPage: 1,
    bankKw: '',
    bankStatus: 'all',
    adminTab: 'overview',
    startedAt: 0
  };
  var PAGE_SIZE = 15;

  /* ------------------------------------------------------------ 基础工具 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('on');
    }, 2000);
  }
  function speak(word) {
    if (!('speechSynthesis' in window)) return toast('当前浏览器不支持语音朗读');
    var u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function save() {
    C.Repo.save(S.P);
    renderNav();
  }
  function words() {
    return C.Catalog.words(S.bank);
  }
  function fmtDate(k) {
    return k;
  }
  function openModal(title, html) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modal-body').innerHTML = '';
  }

  /* ---------------------------------------------------------------- 登录 */
  var loginTab = 'user';
  function renderLogin() {
    $('#app').hidden = true;
    var root = $('#login');
    root.hidden = false;
    var isGuest = C.Auth.isGuest();
    root.innerHTML =
      '<section class="login-hero">' +
      '<div><h2>忆单词 WordMemo</h2>' +
      '<p>基于微信小程序的英语单词记忆学习系统 · 以艾宾浩斯记忆曲线调度新学、复习与测试，帮助学习者把短期记忆推进为长期记忆。</p>' +
      '<div class="login-feats">' +
      '<div><b>记忆曲线调度</b><span>9 级保持期，到期自动进入复习队列</span></div>' +
      '<div><b>分级词库</b><span>高考核心 / 四级高频 / 六级高频，共 ' + D.allWords.length + ' 词</span></div>' +
      '<div><b>四种题型自动组卷</b><span>看词选义、听音选词、听音拼写、例句填空</span></div>' +
      '<div><b>错词本与学习统计</b><span>错题自动收录，连续答对两次自动移出</span></div>' +
      '</div></div>' +
      '<div class="login-meta">本科毕业设计演示系统 · 人工智能 · 2026<br/>数据保存在本机浏览器，不上传任何服务器</div>' +
      '</section>' +
      '<section class="login-panel"><div class="card">' +
      '<h3>登录系统</h3><p class="tip">' +
      (isGuest ? '你正以游客身份浏览，登录后进度将与账号绑定。' : '请选择身份进入。管理员可维护词库与用户。') +
      '</p>' +
      '<div class="tabs">' +
      '<button data-action="login-tab" data-tab="user" class="' + (loginTab === 'user' ? 'on' : '') + '">普通用户</button>' +
      '<button data-action="login-tab" data-tab="admin" class="' + (loginTab === 'admin' ? 'on' : '') + '">管理员</button>' +
      '</div>' +
      '<div class="field"><label>账号</label><input id="lg-acc" placeholder="' +
      (loginTab === 'admin' ? 'admin' : 'student 或你自己注册的账号') +
      '" autocomplete="username" /></div>' +
      '<div class="field"><label>密码</label><input id="lg-pwd" type="password" placeholder="请输入密码" autocomplete="current-password" /></div>' +
      '<div class="field"' + (loginTab === 'register' ? '' : ' hidden') + '><label>昵称（选填）</label><input id="lg-nick" placeholder="学习伙伴都这么称呼你" /></div>' +
      '<div class="err" id="lg-err"></div>' +
      '<button class="btn block" data-action="do-login">' +
      (loginTab === 'register' ? '注册并进入' : loginTab === 'admin' ? '以管理员身份登录' : '登录') +
      '</button>' +
      '<div class="row" style="margin-top:12px">' +
      (loginTab === 'register'
        ? '<button class="btn ghost sm" data-action="login-tab" data-tab="user">已有账号，去登录</button>'
        : '<button class="btn ghost sm" data-action="login-tab" data-tab="register">注册新账号</button>') +
      '<span class="spacer"></span>' +
      '<button class="btn soft sm" data-action="do-guest">游客登录，先看看</button>' +
      '</div>' +
      '<div class="hint-box">演示账号 · 管理员 <code>admin / admin123</code><br/>普通用户 <code>student / 123456</code>，也可以自行注册。</div>' +
      '</div></section>';
    var acc = $('#lg-acc');
    if (acc) {
      acc.focus();
      $('#lg-pwd').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doLogin();
      });
      acc.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doLogin();
      });
    }
  }

  function doLogin() {
    var acc = $('#lg-acc').value.trim();
    var pwd = $('#lg-pwd').value;
    var err = $('#lg-err');
    var r;
    if (loginTab === 'register') {
      r = C.Auth.register(acc, pwd, $('#lg-nick') ? $('#lg-nick').value : '');
    } else {
      r = C.Auth.login(acc, pwd, loginTab === 'admin' ? 'admin' : null);
      if (r.ok && loginTab === 'user' && r.user.role === 'admin') {
        err.textContent = '这是管理员账号，请切换到管理员标签登录';
        C.Auth.logout();
        return;
      }
    }
    if (!r.ok) return void (err.textContent = r.msg);
    enter(r.user);
  }

  function enter(user) {
    S.user = user || C.Auth.current();
    S.P = C.Repo.load(S.user ? S.user.uid : 'guest');
    S.bank = (S.user && S.user.bank) || S.P.settings.bank || 'cet4';
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderWho();
    route(location.hash.replace('#/', '') || 'home');
    if (S.user) toast('欢迎回来，' + S.user.nickname);
  }

  function renderWho() {
    var u = S.user;
    $('#who').innerHTML = u
      ? '<b>' + esc(u.nickname) + '</b>' + (u.role === 'admin' ? '管理员' : '普通用户') + ' · ' + esc(u.account)
      : '<b>游客</b>进度只保存在本机';
    $('#lg-out') && ($('#lg-out').textContent = u ? '退出' : '退出游客');
  }

  /* ------------------------------------------------------------ 导航路由 */
  var NAV = [
    { g: '学习' },
    { id: 'home', t: '概览' },
    { id: 'study', t: '学新词' },
    { id: 'review', t: '复习', badge: 'due' },
    { id: 'quiz', t: '测试' },
    { g: '内容' },
    { id: 'bank', t: '词库' },
    { id: 'wrong', t: '错词本', badge: 'wrong' },
    { id: 'fav', t: '收藏' },
    { g: '数据' },
    { id: 'stats', t: '学习统计' },
    { id: 'profile', t: '我的' },
    { g: '系统', admin: true },
    { id: 'admin', t: '管理后台', admin: true }
  ];

  function renderNav() {
    var isAdmin = S.user && S.user.role === 'admin';
    var due = C.Repo.dueQueue(S.P, C.Catalog.all()).length;
    var html = '';
    for (var i = 0; i < NAV.length; i++) {
      var n = NAV[i];
      if (n.g) {
        if (n.admin && !isAdmin) continue;
        html += '<div class="nav-group">' + n.g + '</div>';
        continue;
      }
      if (n.admin && !isAdmin) continue;
      var b = '';
      if (n.badge === 'due' && due) b = '<span class="dot">' + Math.min(99, due) + '</span>';
      if (n.badge === 'wrong' && S.P.wrong.length) b = '<span class="dot">' + Math.min(99, S.P.wrong.length) + '</span>';
      html += '<a href="#/' + n.id + '" class="' + (S.route === n.id ? 'on' : '') + '"><span>' + n.t + '</span>' + b + '</a>';
    }
    $('#nav').innerHTML = html;
  }

  var TITLES = {
    home: ['概览', '今天该学什么，一目了然'],
    study: ['学新词', '按词库顺序推进，学习结果立刻写入记忆曲线'],
    review: ['复习', '只练到期的词，这是记忆保持的关键环节'],
    quiz: ['测试', '四种题型自动组卷，答错的词自动进入错词本'],
    bank: ['词库', '浏览、检索、试听与收藏全部词条'],
    wrong: ['错词本', '连续答对两次自动移出'],
    fav: ['收藏', '你手动标记的生词'],
    stats: ['学习统计', '打卡、词汇量增长与记忆保持率'],
    profile: ['我的', '账号信息与学习偏好'],
    admin: ['管理后台', '用户、词库与系统参数维护']
  };

  function go(name) {
    S.session = null;
    if (location.hash === '#/' + name) route(name);
    else location.hash = '#/' + name;
  }

  function route(name) {
    if (!VIEWS[name]) name = 'home';
    if (!C.Auth.current() && !C.Auth.isGuest()) return renderLogin();
    if (name === 'admin' && !(S.user && S.user.role === 'admin')) {
      toast('需要管理员权限');
      name = 'home';
    }
    S.route = name;
    var t = TITLES[name] || TITLES.home;
    $('#page-title').textContent = t[0];
    $('#page-sub').textContent = t[1];
    renderNav();
    $('#view').innerHTML = VIEWS[name]();
    if (name === 'study' || name === 'review') resumeSession(name);
  }
  var VIEWS = {};
  /* 学习会话页由 renderSession 直接渲染，这里只占位 */
  VIEWS.study = function () {
    return '';
  };
  VIEWS.review = function () {
    return '';
  };

  /* ---------------------------------------------------------------- 概览 */
  VIEWS.home = function () {
    var all = C.Catalog.all();
    var due = C.Repo.dueQueue(S.P, all);
    var news = C.Repo.newWords(S.P, words());
    var today = C.Repo.today(S.P);
    var goal = S.P.settings.dailyGoal || 20;
    var doneToday = (today.new || 0) + (today.review || 0) + (today.quiz || 0);
    var pct = Math.min(100, Math.round((doneToday / goal) * 100));
    var acc = C.Stats.accuracy(S.P);
    var ret = C.Stats.retention(S.P);
    var series = C.Stats.series(S.P, 7);
    var notice = C.CMS.data().notice || '';

    return (
      '<div class="grid g4" style="margin-bottom:16px">' +
      statCard('今日学习', doneToday + ' / ' + goal, '完成度 ' + pct + '%', '今') +
      statCard('待复习', due.length, '到期即进入队列', '复') +
      statCard('可学新词', news.length, '当前词库《' + C.Catalog.bank(S.bank).name + '》', '新') +
      statCard('连续打卡', C.Stats.streak(S.P) + ' 天', '累计答对率 ' + acc.rate + '%', '连') +
      '</div>' +
      '<div class="grid g2">' +
      '<div class="pane"><h4>今日进度<small>目标 ' + goal + ' 个词</small></h4><div class="body">' +
      '<div class="row between" style="margin-bottom:8px"><span>新学 ' + (today.new || 0) + ' · 复习 ' + (today.review || 0) + ' · 测试 ' + (today.quiz || 0) + ' 题</span><b>' + pct + '%</b></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="row" style="margin-top:18px">' +
      '<button class="btn" data-action="go-study">开始学新词</button>' +
      '<button class="btn soft" data-action="go-review">复习到期 ' + due.length + ' 词</button>' +
      '<button class="btn ghost" data-action="go-quiz">来一组测试</button>' +
      '</div>' +
      '<div class="notice" style="margin-top:18px">系统公告：' + esc(notice) + '</div>' +
      '</div></div>' +
      '<div class="pane"><h4>近 7 天学习量<small>新学 + 复习 + 测试</small></h4><div class="body">' +
      barChart(series, 'date', 'value') +
      '</div></div>' +
      '</div>' +
      '<div class="grid g3" style="margin-top:16px">' +
      '<div class="pane"><h4>记忆保持率</h4><div class="body">' +
      '<div class="result-num" style="color:var(--ok)">' + ret.rate + '%</div>' +
      '<p class="sub">已学 ' + ret.learned + ' 词，其中 ' + ret.solid + ' 词已进入 1 天以上保持期。</p>' +
      donut([{ v: ret.solid, c: '#2f5cff' }, { v: Math.max(0, ret.learned - ret.solid), c: '#c9d6ff' }, { v: Math.max(0, all.length - ret.learned), c: '#eef1f7' }]) +
      '<div class="legend" style="margin-top:10px"><span><i style="background:#2f5cff"></i>牢固</span><span><i style="background:#c9d6ff"></i>易忘</span><span><i style="background:#eef1f7"></i>未学</span></div>' +
      '</div></div>' +
      '<div class="pane"><h4>错词本</h4><div class="body">' +
      '<div class="result-num">' + S.P.wrong.length + '</div>' +
      '<p class="sub">答错自动收录，连续两次答对移出。建议每天专项重练。</p>' +
      '<button class="btn ghost sm" data-action="go-wrong">去重练错词</button>' +
      '</div></div>' +
      '<div class="pane"><h4>切换词库</h4><div class="body">' +
      bankSelect() +
      '<p class="sub" style="margin-top:12px">词库决定「学新词」与「测试」的默认出题范围，切换后进度互不影响。</p>' +
      '</div></div>' +
      '</div>'
    );
  };
  function statCard(t, v, s, mark) {
    return '<div class="stat"><i>' + mark + '</i><span>' + t + '</span><b>' + v + '</b><span>' + s + '</span></div>';
  }
  function bankSelect() {
    var bs = C.Catalog.banks();
    var h = '<select data-action="switch-bank">';
    for (var i = 0; i < bs.length; i++) {
      h += '<option value="' + bs[i].id + '"' + (bs[i].id === S.bank ? ' selected' : '') + '>' + bs[i].name + '（' + bs[i].count + ' 词）</option>';
    }
    return h + '</select>';
  }

  /* ------------------------------------------------------------------ 图表 */
  function barChart(rows, kLabel, kValue) {
    var w = 560;
    var h = 210;
    var pad = 26;
    var max = 1;
    rows.forEach(function (r) {
      max = Math.max(max, r[kValue]);
    });
    var bw = (w - pad * 2) / rows.length;
    var out = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
    for (var g = 0; g <= 4; g++) {
      var y = pad + ((h - pad * 2) / 4) * g;
      out += '<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y + '" stroke="#eef1f7" />';
    }
    rows.forEach(function (r, i) {
      var bh = ((h - pad * 2) * r[kValue]) / max;
      var x = pad + i * bw + bw * 0.2;
      var y = h - pad - bh;
      out += '<rect x="' + x + '" y="' + y + '" width="' + bw * 0.6 + '" height="' + Math.max(1, bh) + '" rx="3" fill="#2f5cff" opacity="0.85"><title>' + esc(r[kLabel]) + '：' + r[kValue] + '</title></rect>';
      out += '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(String(r[kLabel]).slice(5)) + '</text>';
    });
    return out + '</svg>';
  }
  function lineChart(rows) {
    var w = 560;
    var h = 210;
    var pad = 28;
    var max = 1;
    rows.forEach(function (r) {
      max = Math.max(max, r.v);
    });
    var step = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;
    var pts = rows.map(function (r, i) {
      return pad + i * step + ',' + (h - pad - ((h - pad * 2) * r.v) / max);
    });
    var out = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
    for (var g = 0; g <= 4; g++) {
      var y = pad + ((h - pad * 2) / 4) * g;
      out += '<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y + '" stroke="#eef1f7" />';
    }
    if (pts.length) {
      out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#2f5cff" stroke-width="2" />';
      out += '<polygon points="' + pad + ',' + (h - pad) + ' ' + pts.join(' ') + ' ' + (pad + (rows.length - 1) * step) + ',' + (h - pad) + '" fill="#2f5cff" opacity="0.08" />';
      rows.forEach(function (r, i) {
        out += '<circle cx="' + (pad + i * step) + '" cy="' + (h - pad - ((h - pad * 2) * r.v) / max) + '" r="3" fill="#fff" stroke="#2f5cff"><title>' + esc(r.d) + '：' + r.v + '</title></circle>';
      });
    }
    return out + '</svg>';
  }
  function donut(parts) {
    var total = 0;
    parts.forEach(function (p) {
      total += p.v;
    });
    if (!total) return '<div class="empty">还没有学习数据</div>';
    var r = 46;
    var cir = 2 * Math.PI * r;
    var off = 0;
    var out = '<svg viewBox="0 0 120 120" style="width:150px;height:150px;display:block;margin:14px auto 0">';
    parts.forEach(function (p) {
      var len = (p.v / total) * cir;
      out += '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + p.c + '" stroke-width="15" stroke-dasharray="' + len + ' ' + (cir - len) + '" stroke-dashoffset="' + -off + '" transform="rotate(-90 60 60)" />';
      off += len;
    });
    return out + '</svg>';
  }

  /* ------------------------------------------------------------------ 词库 */
  VIEWS.bank = function () {
    var list = bankFiltered();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (S.bankPage > pages) S.bankPage = pages;
    var rows = list.slice((S.bankPage - 1) * PAGE_SIZE, S.bankPage * PAGE_SIZE);
    var html =
      '<div class="pane"><h4>词库浏览<small>' +
      C.Catalog.bank(S.bank).name +
      ' · 命中 ' +
      total +
      ' 条</small></h4>' +
      '<div class="body row" style="border-bottom:1px solid var(--line)">' +
      bankSelect() +
      '<input id="bk-kw" value="' +
      esc(S.bankKw) +
      '" placeholder="搜索单词或释义" style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;min-width:220px;outline:0" />' +
      '<select id="bk-status" data-action="filter-status">' +
      ['all:全部', 'fresh:未学习', 'weak:识记中', 'strong:已牢固', 'fav:仅收藏'].map(function (o) {
        var kv = o.split(':');
        return '<option value="' + kv[0] + '"' + (S.bankStatus === kv[0] ? ' selected' : '') + '>' + kv[1] + '</option>';
      }).join('') +
      '</select>' +
      '<span class="spacer"></span>' +
      '<button class="btn ghost sm" data-action="clear-filter">重置筛选</button>' +
      '</div>';

    if (!rows.length) {
      html += '<div class="empty"><b>没有匹配的词条</b>换个关键词或切换词库试试</div>';
    } else {
      html += '<div class="table-wrap"><table class="tb"><thead><tr><th>单词</th><th>音标</th><th>释义</th><th style="width:130px">记忆度</th><th style="width:160px">操作</th></tr></thead><tbody>';
      rows.forEach(function (w) {
        var st = S.P.words[w.id];
        var strength = C.SRS.strength(st);
        var isFav = S.P.fav.indexOf(w.id) >= 0;
        html +=
          '<tr><td><b>' + esc(w.word) + '</b></td><td style="color:var(--sub)">' + esc(w.phonetic) + '</td><td>' + esc(w.meaning) + '</td>' +
          '<td><div class="bar"><i style="width:' + strength + '%"></i></div><small style="color:var(--sub)">' + (st && st.learned ? C.SRS.stageName(st.level) : '未学习') + '</small></td>' +
          '<td><div class="row">' +
          '<button class="icon-btn" data-action="speak" data-w="' + esc(w.word) + '" title="朗读">音</button>' +
          '<button class="icon-btn ' + (isFav ? 'on' : '') + '" data-action="fav" data-id="' + w.id + '" title="收藏">★</button>' +
          '<button class="btn ghost sm" data-action="detail" data-id="' + w.id + '">详情</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html +=
      '<div class="pager"><span>第 ' + S.bankPage + ' / ' + pages + ' 页</span>' +
      '<button data-action="page" data-p="prev"' + (S.bankPage <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<button data-action="page" data-p="next"' + (S.bankPage >= pages ? ' disabled' : '') + '>下一页</button></div>';
    return html + '</div>';
  };
  function bankFiltered() {
    var list = words();
    if (S.bankKw) list = list.filter(function (w) {
      return w.word.toLowerCase().indexOf(S.bankKw.toLowerCase()) >= 0 || String(w.meaning).indexOf(S.bankKw) >= 0;
    });
    if (S.bankStatus === 'fav') list = list.filter(function (w) { return S.P.fav.indexOf(w.id) >= 0; });
    if (S.bankStatus === 'fresh') list = list.filter(function (w) { var s = S.P.words[w.id]; return !s || !s.learned; });
    if (S.bankStatus === 'weak') list = list.filter(function (w) { var s = S.P.words[w.id]; return s && s.learned && s.level <= 4; });
    if (S.bankStatus === 'strong') list = list.filter(function (w) { var s = S.P.words[w.id]; return s && s.learned && s.level > 4; });
    return list;
  }
  function detailHtml(w) {
    var st = S.P.words[w.id];
    return (
      '<div class="row between"><div><div style="font-size:34px;font-weight:700">' + esc(w.word) + '</div>' +
      '<div style="color:var(--sub)">' + esc(w.phonetic) + '</div></div>' +
      '<button class="btn soft" data-action="speak" data-w="' + esc(w.word) + '">试听发音</button></div>' +
      '<p style="font-size:18px;margin:16px 0 4px">' + esc(w.meaning) + '</p>' +
      (w.example ? '<div class="ex" style="margin:14px 0;padding:14px;background:#f7f9ff;border-left:3px solid var(--pri);border-radius:8px">' + esc(w.example) + '</div>' : '') +
      '<table class="tb"><tbody>' +
      '<tr><th style="width:110px">所属词库</th><td>' + C.Catalog.bank(w.bank).name + '</td></tr>' +
      '<tr><th>记忆阶段</th><td>' + (st && st.learned ? C.SRS.stageName(st.level) + '（第 ' + st.level + ' 级）' : '尚未学习') + '</td></tr>' +
      '<tr><th>下次复习</th><td>' + (st && st.learned ? C.SRS.untilDue(st) : '—') + '</td></tr>' +
      '<tr><th>累计作答</th><td>对 ' + ((st && st.correct) || 0) + ' / 错 ' + ((st && st.wrong) || 0) + '，遗忘 ' + ((st && st.lapses) || 0) + ' 次</td></tr>' +
      '</tbody></table>' +
      '<div class="row" style="margin-top:18px">' +
      '<button class="btn" data-action="learn-now" data-id="' + w.id + '">立即标记为已学</button>' +
      '<button class="btn ghost" data-action="fav" data-id="' + w.id + '">' + (S.P.fav.indexOf(w.id) >= 0 ? '取消收藏' : '加入收藏') + '</button>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------- 学习会话（三合一） */
  function buildSession(mode) {
    var items = [];
    if (mode === 'study') {
      items = C.Repo.newWords(S.P, words(), S.P.settings.dailyGoal || 20);
    } else if (mode === 'review') {
      items = C.Repo.dueQueue(S.P, C.Catalog.all(), 60);
    } else if (mode === 'wrong') {
      S.P.wrong.forEach(function (r) {
        var w = C.Catalog.find(r.id);
        if (w) items.push({ word: w, state: S.P.words[r.id] });
      });
    } else if (mode === 'fav') {
      S.P.fav.forEach(function (id) {
        var w = C.Catalog.find(id);
        if (w) items.push({ word: w, state: S.P.words[id] });
      });
    }
    S.session = { mode: mode, items: items, idx: 0, flipped: false, ok: 0, bad: 0 };
    S.startedAt = Date.now();
    return S.session;
  }
  function resumeSession(mode) {
    if (!S.session || S.session.mode !== mode) buildSession(mode);
    renderSession();
  }
  var SESSION_TITLE = { study: '学新词', review: '到期复习', wrong: '错词重练', fav: '收藏复习' };
  function renderSession() {
    var s = S.session;
    var view = $('#view');
    if (!s.items.length) {
      view.innerHTML =
        '<div class="pane"><div class="empty"><b>这里暂时没有需要' + (s.mode === 'study' ? '学习的新词' : '复习的词') + '</b>' +
        (s.mode === 'review' ? '所有已学词汇都还没到复习时间，先去学新词吧。' : s.mode === 'wrong' ? '错词本是空的，保持得不错。' : s.mode === 'fav' ? '还没有收藏任何单词，去词库点 ★ 收藏。' : '当前词库已全部学过，去切换词库或复习到期词汇。') +
        '<div class="row" style="justify-content:center;margin-top:16px">' +
        '<button class="btn" data-action="go-study">学新词</button>' +
        '<button class="btn ghost" data-action="go-review">去复习</button>' +
        '<a class="btn ghost" href="#/bank">浏览词库</a></div></div></div>';
      return;
    }
    if (s.idx >= s.items.length) return renderSessionSummary();

    var it = s.items[s.idx];
    var w = it.word;
    var st = it.state || S.P.words[w.id];
    var pct = Math.round((s.idx / s.items.length) * 100);
    var bars = '';
    for (var i = 0; i < 9; i++) bars += '<i class="' + (st && st.level >= i ? 'on' : '') + '"></i>';

    view.innerHTML =
      '<div class="study-wrap">' +
      '<div class="study-head"><span>' + SESSION_TITLE[s.mode] + ' · 第 ' + (s.idx + 1) + ' / ' + s.items.length + ' 个</span>' +
      '<span>' + esc(C.Catalog.bank(w.bank).name) + ' · 当前记忆度 ' + C.SRS.strength(st) + '%</span></div>' +
      '<div class="bar" style="margin-bottom:16px"><i style="width:' + pct + '%"></i></div>' +
      '<div class="flip' + (s.flipped ? ' on' : '') + '" data-action="flip"><div class="flip-in">' +
      '<div class="face"><div class="row between"><span class="tag">' + esc(w.word.charAt(0).toUpperCase() + w.word.slice(1)) + '</span>' +
      '<span class="row"><button class="icon-btn" data-action="speak" data-w="' + esc(w.word) + '">音</button></span></div>' +
      '<div class="w">' + esc(w.word) + '</div><div class="ph">' + esc(w.phonetic) + '</div>' +
      '<div class="mini-bar">' + bars + '</div>' +
      '<div class="foot-hint">回想释义，点击卡片或按空格翻面</div></div>' +
      '<div class="face back"><div class="row between"><span class="tag gray">' + esc(w.word) + '</span>' +
      '<span style="color:var(--sub);font-size:12.5px">' + (st && st.learned ? C.SRS.stageName(st.level) : '初次识记') + '</span></div>' +
      '<div class="mn">' + esc(w.meaning) + '</div>' +
      (w.example ? '<div class="ex">' + esc(w.example) + '</div>' : '') +
      '<div class="foot-hint">按 1/2/3/4 自评记忆效果</div></div>' +
      '</div></div>' +
      '<div class="grade-row">' +
      '<button class="g0" data-action="grade" data-g="0"><b>不认识</b><span>回到 5 分钟后</span></button>' +
      '<button class="g1" data-action="grade" data-g="1"><b>有点模糊</b><span>保持期减半</span></button>' +
      '<button class="g2" data-action="grade" data-g="2"><b>记得</b><span>进入下一保持期</span></button>' +
      '<button class="g3" data-action="grade" data-g="3"><b>很熟</b><span>跳过一级</span></button>' +
      '</div>' +
      '<div class="row" style="margin-top:14px;justify-content:center">' +
      '<button class="btn ghost sm" data-action="fav" data-id="' + w.id + '">' + (S.P.fav.indexOf(w.id) >= 0 ? '取消收藏' : '加入收藏') + '</button>' +
      '<button class="btn ghost sm" data-action="speak" data-w="' + esc(w.word) + '">再听一遍</button>' +
      '<button class="btn ghost sm" data-action="quit-session">结束本轮</button>' +
      '</div></div>';
  }
  function grade(g) {
    var s = S.session;
    if (!s || s.idx >= s.items.length) return;
    var w = s.items[s.idx].word;
    C.Repo.addMinutes(S.P, (Date.now() - S.startedAt) / 60000);
    C.Repo.reviewWord(S.P, w.id, Number(g));
    if (Number(g) >= 2) s.ok++;
    else s.bad++;
    S.startedAt = Date.now();
    s.flipped = false;
    s.idx++;
    save();
    renderSession();
  }
  function renderSessionSummary() {
    var s = S.session;
    var total = s.items.length;
    var rate = total ? Math.round((s.ok / total) * 100) : 0;
    $('#view').innerHTML =
      '<div class="pane" style="max-width:640px;margin:0 auto"><div class="body" style="text-align:center;padding:40px">' +
      '<div class="result-num" style="color:var(--pri)">' + rate + '%</div>' +
      '<p class="sub">本轮' + SESSION_TITLE[s.mode] + ' ' + total + ' 个词，自评掌握 ' + s.ok + ' 个，需继续巩固 ' + s.bad + ' 个。</p>' +
      '<div class="row" style="justify-content:center;margin-top:20px">' +
      '<button class="btn" data-action="again">再来一组</button>' +
      '<button class="btn soft" data-action="go-quiz">测一测</button>' +
      '<a class="btn ghost" href="#/stats">查看统计</a></div></div></div>';
  }

  /* ------------------------------------------------------------------ 测试 */
  VIEWS.quiz = function () {
    if (S.quiz) return renderQuiz();
    var due = C.Repo.dueQueue(S.P, C.Catalog.all()).length;
    var t = C.Quiz.TYPES;
    return (
      '<div class="pane" style="max-width:720px;margin:0 auto"><h4>自动组卷<small>系统按艾宾浩斯阶段与题型轮换出题</small></h4><div class="body">' +
      '<div class="grid g2">' +
      '<div class="field"><label>出题范围</label><select id="qz-scope">' +
      '<option value="bank">当前词库《' + C.Catalog.bank(S.bank).name + '》</option>' +
      '<option value="learned">我已学过的词（' + C.Stats.retention(S.P).learned + '）</option>' +
      '<option value="due">今日到期复习（' + due + '）</option>' +
      '<option value="wrong">错词本（' + S.P.wrong.length + '）</option>' +
      '<option value="fav">收藏夹（' + S.P.fav.length + '）</option>' +
      '</select></div>' +
      '<div class="field"><label>题量</label><select id="qz-count"><option>5</option><option selected>10</option><option>20</option><option>30</option></select></div>' +
      '</div>' +
      '<div class="field"><label>题型</label><div class="checks">' +
      t.map(function (x) {
        return '<label><input type="checkbox" class="qz-type" value="' + x + '" checked /> ' + C.Quiz.TYPE_NAME[x] + '</label>';
      }).join('') +
      '</div></div>' +
      '<div class="err" id="qz-err"></div>' +
      '<button class="btn block" data-action="start-quiz">开始测试</button>' +
      '<p class="sub" style="margin-top:14px">说明：答错的词自动写入错词本；判分结果会更新每个词的记忆阶段。</p>' +
      '</div></div>'
    );
  };
  function startQuiz() {
    var scope = $('#qz-scope').value;
    var count = Number($('#qz-count').value);
    var types = Array.prototype.slice.call(document.querySelectorAll('.qz-type:checked')).map(function (i) { return i.value; });
    var pool = C.Catalog.all();
    var cand = [];
    if (scope === 'bank') cand = C.Repo.newWords(S.P, words()).concat(C.Repo.dueQueue(S.P, words()));
    if (scope === 'learned') cand = pool.filter(function (w) { return S.P.words[w.id] && S.P.words[w.id].learned; }).map(function (w) { return { word: w, state: S.P.words[w.id] }; });
    if (scope === 'due') cand = C.Repo.dueQueue(S.P, pool);
    if (scope === 'wrong') cand = S.P.wrong.map(function (r) { var w = C.Catalog.find(r.id); return w ? { word: w, state: S.P.words[r.id] } : null; }).filter(Boolean);
    if (scope === 'fav') cand = S.P.fav.map(function (id) { var w = C.Catalog.find(id); return w ? { word: w, state: S.P.words[id] } : null; }).filter(Boolean);
    if (scope === 'bank') cand = cand.length ? cand : C.Quiz.pick(words().map(function (w) { return { word: w, state: S.P.words[w.id] }; }), count);
    if (!cand.length) {
      $('#qz-err').textContent = '该范围内暂无可出题的单词，换个范围或先学几个词。';
      return;
    }
    var items = C.Quiz.pick(cand, Math.min(count, cand.length));
    S.quiz = { qs: C.Quiz.build(items, pool, types), idx: 0, results: [], picked: null, shown: false, started: Date.now(), lastAt: Date.now() };
    route('quiz');
  }
  function renderQuiz() {
    var q = S.quiz;
    if (q.idx >= q.qs.length) return renderQuizResult();
    var cur = q.qs[q.idx];
    var letters = ['A', 'B', 'C', 'D'];
    var body = '';
    if (cur.type === 'spelling') {
      body =
        '<div class="spell"><input id="qz-input" placeholder="输入完整单词" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
        '<div class="hintline">' + esc(cur.hint) + '　共 ' + cur.blank.length + ' 个字母</div></div>';
    } else {
      body = '<div class="opts">' + cur.options.map(function (o, i) {
        var cls = '';
        if (q.shown) {
          if (i === cur.answer) cls = ' class="right"';
          else if (q.picked === i) cls = ' class="wrong"';
        }
        return '<button' + cls + ' data-action="answer" data-i="' + i + '"' + (q.shown ? ' disabled' : '') + '><span class="k">' + letters[i] + '</span><span>' + esc(o) + '</span></button>';
      }).join('') + '</div>';
    }
    var prog = '<div class="q-head"><span>第 ' + (q.idx + 1) + ' / ' + q.qs.length + ' 题 · ' + C.Quiz.TYPE_NAME[cur.type] + '</span>' +
      '<span>已答对 ' + q.results.filter(function (r) { return r.ok; }).length + ' 题</span></div>' +
      '<div class="bar" style="margin-bottom:18px"><i style="width:' + Math.round((q.idx / q.qs.length) * 100) + '%"></i></div>';

    var explain = '';
    if (q.shown) {
      var w = C.Catalog.find(cur.wordId);
      explain =
        '<div class="explain ' + (q.results[q.results.length - 1].ok ? '' : 'bad') + '">' +
        '<b>' + esc(w.word) + '</b> ' + esc(w.phonetic) + ' · ' + esc(w.meaning) +
        (w.example ? '<div style="margin-top:6px;color:var(--sub)">' + esc(w.example) + '</div>' : '') +
        '<div style="margin-top:6px">记忆阶段已更新为「' + C.SRS.stageName(S.P.words[w.id].level) + '」，下次复习：' + C.SRS.untilDue(S.P.words[w.id]) + '</div>' +
        '</div>';
    }

    return (
      '<div class="study-wrap">' + prog +
      '<div class="pane"><div class="body">' +
      '<div class="q-stem">' + esc(cur.stem) + '</div>' +
      '<div class="q-sub">' + (cur.audio ? '<button class="btn ghost sm" data-action="speak" data-w="' + esc(C.Catalog.find(cur.wordId).word) + '">播放发音</button>' : '从当前范围中随机抽取') + '</div>' +
      body + explain +
      '<div class="row end" style="margin-top:18px">' +
      (cur.type === 'spelling' && !q.shown ? '<button class="btn" data-action="answer-text">提交答案</button>' : '') +
      (q.shown ? '<button class="btn" data-action="next-q">下一题 →</button>' : '') +
      '<button class="btn ghost" data-action="quit-quiz">交卷并结束</button>' +
      '</div></div></div></div>'
    );
  }
  function answerQuiz(value) {
    var q = S.quiz;
    if (q.shown) return;
    var cur = q.qs[q.idx];
    var ok = C.Quiz.check(cur, value);
    C.Repo.addMinutes(S.P, (Date.now() - q.lastAt) / 60000);
    q.lastAt = Date.now();
    q.picked = cur.type === 'spelling' ? null : Number(value);
    q.results.push({ id: cur.wordId, ok: ok, type: cur.type });
    var w = C.Catalog.find(cur.wordId);
    C.Repo.reviewWord(S.P, cur.wordId, ok ? C.SRS.GRADE.KNOWN : C.SRS.GRADE.FORGOT);
    C.Repo.track(S.P, 'quiz');
    q.shown = true;
    save();
    $('#view').innerHTML = renderQuiz();
    if (cur.audio && !ok) speak(w.word);
  }
  function renderQuizResult() {
    var q = S.quiz;
    var right = q.results.filter(function (r) { return r.ok; }).length;
    var rate = q.results.length ? Math.round((right / q.results.length) * 100) : 0;
    var wrongList = q.results.filter(function (r) { return !r.ok; });
    var html =
      '<div class="pane" style="max-width:760px;margin:0 auto"><h4>测试结果<small>用时 ' +
      Math.max(1, Math.round((Date.now() - q.started) / 1000)) + ' 秒</small></h4><div class="body" style="text-align:center">' +
      '<div class="result-num" style="color:' + (rate >= 60 ? 'var(--ok)' : 'var(--bad)') + '">' + rate + ' 分</div>' +
      '<p class="sub">共 ' + q.results.length + ' 题，答对 ' + right + ' 题，答错 ' + wrongList.length + ' 题。错词已写入错词本。</p>' +
      '<div class="row" style="justify-content:center;margin:16px 0">' +
      '<button class="btn" data-action="quit-quiz-reset">再测一组</button>' +
      '<a class="btn ghost" href="#/wrong">查看错词本</a></div>';
    if (wrongList.length) {
      html += '<div class="word-list" style="text-align:left">' + wrongList.map(function (r) {
        var w = C.Catalog.find(r.id);
        return '<div class="wcard"><div class="grow"><b>' + esc(w.word) + '</b><span class="ph">' + esc(w.phonetic) + '</span>' +
          '<div class="mn">' + esc(w.meaning) + '</div></div>' +
          '<span class="tag warn">' + C.Quiz.TYPE_NAME[r.type] + '</span>' +
          '<button class="icon-btn" data-action="speak" data-w="' + esc(w.word) + '">音</button></div>';
      }).join('') + '</div>';
    }
    S.quiz = null;
    return html + '</div></div>';
  }

  /* -------------------------------------------------------------- 错词/收藏 */
  VIEWS.wrong = function () { return listPane(S.P.wrong.map(function (r) { return r.id; }), '错词本', '答错自动收录，连续两次答对后移出。', 'wrong'); };
  VIEWS.fav = function () { return listPane(S.P.fav, '收藏', '在词库或学习卡片中点 ★ 收藏的单词。', 'fav'); };
  function listPane(ids, title, desc, mode) {
    var items = ids.map(function (id) { return C.Catalog.find(id); }).filter(Boolean);
    if (!items.length) {
      return '<div class="pane"><div class="empty"><b>' + title + '是空的</b>' + desc + '</div></div>';
    }
    return (
      '<div class="pane"><h4>' + title + '<small>' + items.length + ' 个词 · ' + desc + '</small></h4>' +
      '<div class="body row" style="border-bottom:1px solid var(--line)">' +
      '<button class="btn" data-action="start-session" data-mode="' + mode + '">开始专项重练</button>' +
      '<button class="btn ghost" data-action="clear-list" data-t="' + title + '">清空列表</button>' +
      '<span class="spacer"></span><span style="color:var(--sub);font-size:12.5px">按记忆度排序</span></div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr><th>单词</th><th>音标</th><th>释义</th><th>记忆度</th><th>操作</th></tr></thead><tbody>' +
      items.map(function (w) {
        var st = S.P.words[w.id];
        return '<tr><td><b>' + esc(w.word) + '</b></td><td style="color:var(--sub)">' + esc(w.phonetic) + '</td><td>' + esc(w.meaning) + '</td>' +
          '<td>' + C.SRS.strength(st) + '%　' + (st && st.learned ? C.SRS.stageName(st.level) : '未学习') + '</td>' +
          '<td><div class="row"><button class="icon-btn" data-action="speak" data-w="' + esc(w.word) + '">音</button>' +
          '<button class="btn ghost sm" data-action="detail" data-id="' + w.id + '">详情</button></div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>'
    );
  }

  /* ------------------------------------------------------------------ 统计 */
  VIEWS.stats = function () {
    var all = C.Catalog.all();
    var acc = C.Stats.accuracy(S.P);
    var ret = C.Stats.retention(S.P);
    var mas = C.Stats.mastery(S.P, all);
    var heat = C.Stats.heatmap(S.P, 70);
    var days = Object.keys(S.P.log).filter(function (k) {
      var r = S.P.log[k];
      return r.new || r.review || r.quiz;
    });
    var totalMin = 0;
    days.forEach(function (k) { totalMin += S.P.log[k].minutes || 0; });
    var cum = [];
    var n = 0;
    var sorted = days.slice().sort();
    var learnedIds = Object.keys(S.P.words).filter(function (id) { return S.P.words[id].learned; });
    for (var i = 0; i < sorted.length; i++) {
      n += (S.P.log[sorted[i]].new || 0);
      cum.push({ d: sorted[i], v: n });
    }
    var bankRows = C.Catalog.banks().map(function (b) {
      var learned = 0;
      b.words.forEach(function (w) {
        if (S.P.words[w.id] && S.P.words[w.id].learned) learned++;
      });
      return { name: b.name, total: b.count, learned: learned };
    });

    return (
      '<div class="grid g4" style="margin-bottom:16px">' +
      statCard('累计学习天数', days.length, '天', '天') +
      statCard('已接触词汇', learnedIds.length + ' / ' + all.length, '覆盖率 ' + Math.round((learnedIds.length / all.length) * 100) + '%', '词') +
      statCard('平均正确率', acc.rate + '%', '对 ' + acc.correct + ' / 错 ' + acc.wrong, '准') +
      statCard('专注时长', Math.round(totalMin) + ' 分钟', '按每次会话累计', '时') +
      '</div>' +
      '<div class="grid g2">' +
      '<div class="pane"><h4>词汇量增长曲线<small>各词库累计新学词数</small></h4><div class="body">' +
      (cum.length > 1 ? lineChart(cum) : '<div class="empty"><b>数据不足</b>再坚持几天就能看到曲线</div>') +
      '</div></div>' +
      '<div class="pane"><h4>掌握度分布</h4><div class="body">' +
      donut([
        { v: mas.strong, c: '#07a35a' },
        { v: mas.fair, c: '#2f5cff' },
        { v: mas.weak, c: '#f0932b' },
        { v: mas.fresh, c: '#e6e9f2' }
      ]) +
      '<div class="legend" style="justify-content:center;margin-top:12px">' +
      '<span><i style="background:#07a35a"></i>牢固 ' + mas.strong + '</span>' +
      '<span><i style="background:#2f5cff"></i>熟悉 ' + mas.fair + '</span>' +
      '<span><i style="background:#f0932b"></i>识记中 ' + mas.weak + '</span>' +
      '<span><i style="background:#e6e9f2"></i>未学 ' + mas.fresh + '</span></div>' +
      '</div></div></div>' +
      '<div class="pane" style="margin-top:16px"><h4>学习打卡（近 10 周）<small>颜色越深当天学习量越大</small></h4><div class="body">' +
      '<div class="heat">' + heat.map(function (h) {
        return '<i class="l' + h.level + '" title="' + h.date + '：' + h.value + ' 个词"></i>';
      }).join('') + '</div>' +
      '<div class="legend" style="margin-top:10px"><span>少</span><i style="background:#eef1f7"></i><i style="background:#cddaff"></i><i style="background:#9fb6ff"></i><i style="background:#6b8dff"></i><i style="background:#2f5cff"></i><span>多</span></div>' +
      '</div></div>' +
      '<div class="pane" style="margin-top:16px"><h4>各词库进度</h4><div class="table-wrap"><table class="tb">' +
      '<thead><tr><th>词库</th><th style="width:90px">总词数</th><th style="width:90px">已学</th><th style="width:220px">完成度</th></tr></thead><tbody>' +
      bankRows.map(function (r) {
        var pct = r.total ? Math.round((r.learned / r.total) * 100) : 0;
        return '<tr><td>' + r.name + '</td><td>' + r.total + '</td><td>' + r.learned + '</td><td><div class="bar"><i style="width:' + pct + '%"></i></div>' + pct + '%</td></tr>';
      }).join('') +
      '</tbody></table></div></div>' +
      '<div class="pane" style="margin-top:16px"><h4>近 14 天明细</h4><div class="table-wrap"><table class="tb">' +
      '<thead><tr><th>日期</th><th>新学</th><th>复习</th><th>测试</th><th>合计</th></tr></thead><tbody>' +
      C.Stats.series(S.P, 14).reverse().map(function (r) {
        var d = S.P.log[r.date] || {};
        return '<tr><td>' + fmtDate(r.date) + '</td><td>' + (d.new || 0) + '</td><td>' + (d.review || 0) + '</td><td>' + (d.quiz || 0) + '</td><td>' + r.value + '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>'
    );
  }

  /* ------------------------------------------------------------------ 我的 */
  VIEWS.profile = function () {
    var u = S.user;
    var ret = C.Stats.retention(S.P);
    if (!u) {
      return (
        '<div class="pane" style="max-width:640px;margin:0 auto"><h4>游客模式</h4><div class="body">' +
        '<p>你正以游客身份使用系统，学习进度保存在本机。注册或登录后进度会与新账号绑定。</p>' +
        '<div class="row"><button class="btn" data-action="switch-account">登录 / 注册</button>' +
        '<button class="btn ghost" data-action="wipe-mine">清空本机游客进度</button></div>' +
        '</div></div>'
      );
    }
    return (
      '<div class="grid g2">' +
      '<div class="pane"><h4>账号信息</h4><div class="body">' +
      '<div class="row" style="gap:14px;align-items:center;margin-bottom:16px">' +
      '<span style="width:52px;height:52px;border-radius:50%;background:' + u.avatarColor + ';color:#fff;display:grid;place-items:center;font-size:20px;font-weight:700">' + esc(u.nickname.charAt(0)) + '</span>' +
      '<div><b style="font-size:17px">' + esc(u.nickname) + '</b><div style="color:var(--sub);font-size:12.5px">' + esc(u.account) + ' · ' + (u.role === 'admin' ? '管理员' : '普通用户') + '</div></div></div>' +
      '<div class="field"><label>昵称</label><input id="pf-nick" value="' + esc(u.nickname) + '" /></div>' +
      '<div class="field"><label>默认词库</label>' + bankSelect().replace('data-action="switch-bank"', 'data-action="switch-bank" id="pf-bank"') + '</div>' +
      '<div class="field"><label>每日新词目标</label><input id="pf-goal" type="number" min="5" max="100" value="' + (S.P.settings.dailyGoal || 20) + '" /></div>' +
      '<div class="row"><button class="btn" data-action="save-profile">保存设置</button>' +
      '<button class="btn ghost" data-action="change-pwd">修改密码</button></div>' +
      '</div></div>' +
      '<div class="pane"><h4>我的数据</h4><div class="body">' +
      '<div class="grid g2" style="gap:12px">' +
      statCard('已学词', ret.learned, '牢固率 ' + ret.rate + '%', '词') +
      statCard('错词本', S.P.wrong.length, '待清理', '错') +
      statCard('收藏', S.P.fav.length, '自定义生词', '藏') +
      statCard('连续打卡', C.Stats.streak(S.P) + ' 天', '今日 ' + (C.Repo.today(S.P).new || 0) + ' 新词', '连') +
      '</div>' +
      '<div class="row" style="margin-top:18px">' +
      '<button class="btn ghost" data-action="wipe-mine">清空我的学习记录</button>' +
      '<button class="btn ghost" data-action="logout">退出登录</button>' +
      '</div>' +
      '<p class="sub" style="margin-top:14px">本系统为纯静态演示：账号口令以自定义散列保存在浏览器 localStorage，不含服务端校验，请勿用于真实业务。</p>' +
      '</div></div></div>'
    );
  };

  /* ---------------------------------------------------------------- 管理台 */
  VIEWS.admin = function () {
    var tabs = [['overview', '数据总览'], ['users', '用户管理'], ['words', '词库管理'], ['sys', '系统设置']];
    var html = '<div class="tabs" style="max-width:520px">' + tabs.map(function (t) {
      return '<button data-action="admin-tab" data-t="' + t[0] + '" class="' + (S.adminTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    return html + '<div style="margin-top:16px">' + ADMIN[S.adminTab]() + '</div>';
  };
  var ADMIN = {};
  ADMIN.overview = function () {
    var users = C.Auth.users();
    var totalWords = C.Catalog.all().length;
    var learnedAll = 0;
    var allAnswers = 0;
    users.forEach(function (u) {
      var p = C.Repo.load(u.uid);
      Object.keys(p.words).forEach(function (id) {
        if (p.words[id].learned) learnedAll++;
        allAnswers += (p.words[id].correct || 0) + (p.words[id].wrong || 0);
      });
    });
    var rows = users.map(function (u) {
      var p = C.Repo.load(u.uid);
      var l = 0;
      Object.keys(p.words).forEach(function (id) { if (p.words[id].learned) l++; });
      return { u: u, learned: l, wrong: p.wrong.length, streak: C.Stats.streak(p) };
    });
    return (
      '<div class="grid g4" style="margin-bottom:16px">' +
      statCard('注册用户', users.length, '含 1 个管理员', '用') +
      statCard('词条总量', totalWords, '内置 + 自定义', '词') +
      statCard('全站已学', learnedAll, '人次', '学') +
      statCard('累计作答', allAnswers, '含测试与复习', '答') +
      '</div>' +
      '<div class="pane"><h4>用户学习情况</h4><div class="table-wrap"><table class="tb">' +
      '<thead><tr><th>账号</th><th>昵称</th><th>角色</th><th>已学词</th><th>错词</th><th>连续打卡</th><th>状态</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.u.account) + '</td><td>' + esc(r.u.nickname) + '</td><td>' + (r.u.role === 'admin' ? '管理员' : '用户') + '</td>' +
          '<td>' + r.learned + '</td><td>' + r.wrong + '</td><td>' + r.streak + ' 天</td>' +
          '<td>' + (r.u.status === 0 ? '<span class="tag bad">已停用</span>' : '<span class="tag ok">正常</span>') + '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>'
    );
  };
  ADMIN.users = function () {
    var users = C.Auth.users();
    return (
      '<div class="pane"><h4>用户管理<small>停用后该账号无法登录，历史学习记录保留</small></h4>' +
      '<div class="table-wrap"><table class="tb"><thead><tr><th>账号</th><th>昵称</th><th>角色</th><th>注册时间</th><th>状态</th><th style="width:230px">操作</th></tr></thead><tbody>' +
      users.map(function (u) {
        return '<tr><td><b>' + esc(u.account) + '</b></td><td>' + esc(u.nickname) + '</td><td>' + (u.role === 'admin' ? '<span class="tag">管理员</span>' : '普通用户') + '</td>' +
          '<td>' + new Date(u.createdAt).toLocaleDateString() + '</td>' +
          '<td>' + (u.status === 0 ? '<span class="tag bad">已停用</span>' : '<span class="tag ok">正常</span>') + '</td>' +
          '<td><div class="row">' +
          '<button class="btn ghost sm" data-action="reset-pwd" data-uid="' + u.uid + '">重置密码</button>' +
          (u.role === 'admin' ? '' : '<button class="btn ghost sm" data-action="toggle-user" data-uid="' + u.uid + '" data-s="' + (u.status === 0 ? 1 : 0) + '">' + (u.status === 0 ? '恢复' : '停用') + '</button>') +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>'
    );
  };
  ADMIN.words = function () {
    var custom = C.CMS.customWords();
    return (
      '<div class="grid g2">' +
      '<div class="pane"><h4>新增词条</h4><div class="body">' +
      '<div class="field"><label>词库</label><select id="aw-bank">' + C.Catalog.banks().map(function (b) {
        return '<option value="' + b.id + '">' + b.name + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>单词 *</label><input id="aw-word" placeholder="example" /></div>' +
      '<div class="field"><label>音标</label><input id="aw-ph" placeholder="/ɪɡˈzɑːmpl/" /></div>' +
      '<div class="field"><label>词性与释义 *</label><input id="aw-mn" placeholder="n. 例子；榜样" /></div>' +
      '<div class="field"><label>例句</label><input id="aw-ex" placeholder="This is a good example." /></div>' +
      '<div class="err" id="aw-err"></div>' +
      '<button class="btn block" data-action="add-word">保存词条</button>' +
      '</div></div>' +
      '<div class="pane"><h4>批量导入<small>每行一条：单词,音标,释义,例句</small></h4><div class="body">' +
      '<div class="field"><label>导入到词库</label><select id="im-bank">' + C.Catalog.banks().map(function (b) {
        return '<option value="' + b.id + '">' + b.name + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>粘贴 CSV 文本</label><textarea id="im-text" rows="8" placeholder="prestige,/preˈstiːʒ/,n. 声望,The college enjoys great prestige.,,ignore,/ˌɪɡˈnɔː(r)/,v. 忽视,Do not ignore the warning."></textarea></div>' +
      '<p class="sub">单词与释义为必填；重复词自动跳过；含逗号的字段请用英文双引号包裹。</p>' +
      '<button class="btn soft block" data-action="import-csv">解析并导入</button>' +
      '</div></div>' +
      '</div>' +
      '<div class="pane" style="margin-top:16px"><h4>自定义词条<small>共 ' + custom.length + ' 条，即时对所有账号生效</small></h4>' +
      (custom.length
        ? '<div class="table-wrap"><table class="tb"><thead><tr><th>词库</th><th>单词</th><th>音标</th><th>释义</th><th>例句</th><th>操作</th></tr></thead><tbody>' +
          custom.map(function (w) {
            return '<tr><td>' + C.Catalog.bank(w.bank).name + '</td><td><b>' + esc(w.word) + '</b></td><td>' + esc(w.phonetic) + '</td><td>' + esc(w.meaning) + '</td>' +
              '<td style="color:var(--sub)">' + esc(w.example) + '</td>' +
              '<td><button class="btn ghost sm" data-action="del-word" data-id="' + w.id + '">删除</button></td></tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="empty"><b>暂无自定义词条</b>内置 ' + D.allWords.length + ' 词已随系统发布，可在上方扩充</div>') +
      '</div>'
    );
  };
  ADMIN.sys = function () {
    var d = C.CMS.data();
    return (
      '<div class="grid g2">' +
      '<div class="pane"><h4>系统公告</h4><div class="body">' +
      '<div class="field"><label>公告内容（显示在用户概览页）</label><textarea id="sys-notice" rows="5">' + esc(d.notice || '') + '</textarea></div>' +
      '<button class="btn" data-action="save-notice">发布公告</button></div></div>' +
      '<div class="pane"><h4>记忆曲线参数</h4><div class="body">' +
      '<table class="tb"><tbody>' +
      C.SRS.INTERVALS.map(function (m, i) {
        var label = m < 60 ? m + ' 分钟' : m < 1440 ? m / 60 + ' 小时' : m / 1440 + ' 天';
        var note = i === 0 ? '新学后的首个间隔；自评「不认识」也回到本级'
          : i === C.SRS.INTERVALS.length - 1 ? '最高档，达到即视为已掌握'
          : '自评「记得」从下一级升入，「很熟」可跳两级';
        return '<tr><td>第 ' + i + ' 级保持期</td><td><b>' + label + '</b></td><td style="color:var(--sub)">' + note + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<p class="sub" style="margin-top:10px">演示版参数在 core.js 中集中定义，便于论文中的算法对照实验。</p>' +
      '<p class="sub" style="margin-top:8px">存储后端：' + esc(C.Store.backend) + '　词库版本：' + esc(D.version) +
      '（共 ' + C.Catalog.all().length + ' 词，其中后台增补 ' + (d.custom || []).length + ' 词）</p>' +
      '</div></div>' +
      '<div class="pane" style="margin-top:16px"><h4>危险操作</h4><div class="body">' +
      '<p class="sub">复位将清除所有账号、词库改动与学习记录，回到初始演示数据。</p>' +
      '<button class="btn bad" data-action="reset-all">复位全部本地数据</button>' +
      '</div></div>' +
      '</div>'
    );
  };

  /* -------------------------------------------------------------- CSV 解析 */
  function parseCsv(text) {
    var rows = [];
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var f = csvLine(lines[i]);
      if (/^(word|单词)$/i.test(String(f[0] || '').trim())) continue;
      if (f.length >= 3 && f[0].trim() && f[2].trim()) {
        rows.push({ word: f[0].trim(), phonetic: (f[1] || '').trim(), meaning: f[2].trim(), example: (f[3] || '').trim() });
      }
    }
    return rows;
  }
  function csvLine(line) {
    var out = [];
    var cur = '';
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (q) {
        if (c === '"') {
          if (line.charAt(i + 1) === '"') {
            cur += '"';
            i++;
          } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === '，' || c === '\t') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  /* -------------------------------------------------------------- 事件总线 */
  document.addEventListener('click', function (e) {
    if (e.target.id === 'modal') {
      closeModal();
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action');
    if (a !== 'flip') e.preventDefault();

    switch (a) {
      case 'login-tab': {
        loginTab = el.getAttribute('data-tab');
        renderLogin();
        break;
      }
      case 'do-login':
        doLogin();
        break;
      case 'do-guest': {
        var g = C.Auth.guest();
        S.user = null;
        enter(null);
        toast('已以游客身份进入，进度保存在本机');
        break;
      }
      case 'logout':
        C.Auth.logout();
        S.user = null;
        S.P = null;
        S.session = null;
        S.quiz = null;
        loginTab = 'user';
        location.hash = '#/home';
        renderLogin();
        break;
      case 'switch-account':
        C.Auth.logout();
        renderLogin();
        break;
      case 'go-study':
      case 'go-review':
      case 'go-quiz':
      case 'go-wrong':
        go(a.slice(3));
        break;
      case 'switch-bank':
        break;
      case 'speak':
        speak(el.getAttribute('data-w'));
        break;
      case 'flip':
        if (S.session && !e.target.closest('.icon-btn')) {
          S.session.flipped = !S.session.flipped;
          $('.flip') && $('.flip').classList.toggle('on', S.session.flipped);
        }
        break;
      case 'grade':
        grade(el.getAttribute('data-g'));
        break;
      case 'again':
        S.session = null;
        route(S.route);
        break;
      case 'quit-session':
        S.session = null;
        location.hash = '#/home';
        break;
      case 'fav': {
        var on = C.Repo.toggleFav(S.P, el.getAttribute('data-id'));
        save();
        toast(on ? '已加入收藏' : '已取消收藏');
        if (S.route === 'fav' || S.route === 'bank') route(S.route);
        else if ($('#modal').hidden === false) closeModal();
        break;
      }
      case 'detail':
        openModal('词条详情', detailHtml(C.Catalog.find(el.getAttribute('data-id'))));
        break;
      case 'learn-now': {
        var lw = el.getAttribute('data-id');
        if (!S.P.words[lw] || !S.P.words[lw].learned) C.Repo.learnWord(S.P, lw);
        else C.Repo.reviewWord(S.P, lw, C.SRS.GRADE.KNOWN);
        save();
        closeModal();
        toast('已记录，' + C.SRS.untilDue(S.P.words[lw]) + '后提醒复习');
        route(S.route);
        break;
      }
      case 'page': {
        S.bankPage += el.getAttribute('data-p') === 'next' ? 1 : -1;
        route('bank');
        break;
      }
      case 'clear-filter':
        S.bankKw = '';
        S.bankStatus = 'all';
        S.bankPage = 1;
        route('bank');
        break;
      case 'start-session':
        buildSession(el.getAttribute('data-mode'));
        renderSession();
        break;
      case 'clear-list': {
        var t = el.getAttribute('data-t');
        if (!confirm('确认清空' + t + '？')) break;
        if (t === '错词本') S.P.wrong = [];
        else S.P.fav = [];
        save();
        route(S.route);
        break;
      }
      case 'start-quiz':
        startQuiz();
        break;
      case 'answer':
        answerQuiz(el.getAttribute('data-i'));
        break;
      case 'answer-text':
        answerQuiz($('#qz-input') ? $('#qz-input').value : '');
        break;
      case 'next-q':
        S.quiz.idx++;
        S.quiz.shown = false;
        S.quiz.picked = null;
        $('#view').innerHTML = renderQuiz();
        break;
      case 'quit-quiz':
        if (S.quiz && S.quiz.results.length) {
          S.quiz.idx = S.quiz.qs.length;
          $('#view').innerHTML = renderQuizResult();
        } else {
          S.quiz = null;
          route('quiz');
        }
        break;
      case 'quit-quiz-reset':
        S.quiz = null;
        route('quiz');
        break;
      case 'admin-tab':
        S.adminTab = el.getAttribute('data-t');
        route('admin');
        break;
      case 'reset-pwd': {
        var uid = el.getAttribute('data-uid');
        var nu = C.Auth.findByUid(uid);
        var np = prompt('为账号 ' + nu.account + ' 设置新密码（至少 6 位）', 'wm123456');
        if (np === null) break;
        var r = C.Auth.resetPwd(uid, np);
        toast(r.msg || (r.ok ? '密码已重置' : '失败'));
        break;
      }
      case 'toggle-user': {
        var ru = C.Auth.setStatus(el.getAttribute('data-uid'), Number(el.getAttribute('data-s')));
        toast(ru.ok ? '已更新' : '操作失败');
        route('admin');
        break;
      }
      case 'add-word': {
        var word = $('#aw-word').value.trim();
        var meaning = $('#aw-mn').value.trim();
        if (!word || !meaning) {
          $('#aw-err').textContent = '单词与释义为必填项';
          break;
        }
        var added = C.CMS.addWords([
          { bank: $('#aw-bank').value, word: word, phonetic: $('#aw-ph').value, meaning: meaning, example: $('#aw-ex').value }
        ]);
        if (!added) {
          $('#aw-err').textContent = '该词在所选词库中已存在';
          break;
        }
        $('#aw-err').textContent = '';
        ['#aw-word', '#aw-ph', '#aw-mn', '#aw-ex'].forEach(function (id) { $(id).value = ''; });
        toast('词条已发布');
        route('admin');
        break;
      }
      case 'import-csv': {
        var rows = parseCsv($('#im-text').value);
        if (!rows.length) return toast('没有解析出有效数据，请检查格式');
        var bk = $('#im-bank').value;
        rows.forEach(function (r) { r.bank = bk; });
        var n = C.CMS.addWords(rows);
        toast('导入完成：新增 ' + n + ' 条，跳过 ' + (rows.length - n) + ' 条重复或空行');
        route('admin');
        break;
      }
      case 'del-word':
        C.CMS.removeWord(el.getAttribute('data-id'));
        toast('已删除');
        route('admin');
        break;
      case 'save-notice':
        C.CMS.setNotice($('#sys-notice').value);
        toast('公告已更新');
        break;
      case 'reset-all':
        if (!confirm('将清除所有账号与学习数据，确认复位？')) break;
        C.CMS.resetAll();
        location.hash = '#/home';
        location.reload();
        break;
      case 'wipe-mine':
        if (!confirm('确认清空本账号的全部学习记录？')) break;
        Store_removeProfile();
        toast('已清空');
        location.hash = '#/home';
        location.reload();
        break;
      case 'save-profile': {
        var nick = $('#pf-nick').value.trim() || S.user.nickname;
        var goal = Math.max(5, Math.min(100, Number($('#pf-goal').value) || 20));
        var bk2 = $('#pf-bank').value;
        C.Auth.update(S.user.uid, { nickname: nick, bank: bk2 });
        S.P.settings.dailyGoal = goal;
        S.P.settings.bank = bk2;
        S.bank = bk2;
        S.user.nickname = nick;
        S.user.bank = bk2;
        save();
        renderWho();
        toast('设置已保存');
        route('profile');
        break;
      }
      case 'change-pwd': {
        var oldp = prompt('请输入当前密码');
        if (oldp === null) break;
        if (C.Auth.hash(oldp) !== S.user.pwd) {
          toast('原密码不正确');
          break;
        }
        var newp = prompt('请输入新密码（至少 6 位）');
        if (!newp) break;
        var rr = C.Auth.resetPwd(S.user.uid, newp);
        toast(rr.msg);
        break;
      }
      case 'close-modal':
        closeModal();
        break;
    }
  });
  function Store_removeProfile() {
    C.Store.remove('wm_profile_' + (S.user ? S.user.uid : 'guest'));
  }

  document.addEventListener('change', function (e) {
    if (e.target.id === 'bk-status') {
      S.bankStatus = e.target.value;
      S.bankPage = 1;
      route('bank');
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.getAttribute('data-action') === 'switch-bank') {
      S.bank = el.value;
      S.session = null;
      if (S.user) C.Auth.update(S.user.uid, { bank: S.bank });
      if (S.P) {
        S.P.settings.bank = S.bank;
        save();
      }
      toast('已切换到《' + C.Catalog.bank(S.bank).name + '》');
      route(S.route);
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'bk-kw') {
      S.bankKw = e.target.value;
      S.bankPage = 1;
      clearTimeout(window.__bkTimer);
      window.__bkTimer = setTimeout(function () {
        var pos = window.scrollY;
        route('bank');
        var i = $('#bk-kw');
        if (i) {
          i.focus();
          i.setSelectionRange(i.value.length, i.value.length);
        }
        window.scrollTo(0, pos);
      }, 260);
    }
    if (e.target.id === 'quick-search') {
      S.bankKw = e.target.value;
      S.bankStatus = 'all';
      S.bankPage = 1;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Enter' && e.target.id === 'quick-search') {
        location.hash = '#/bank';
        route('bank');
      }
      if (e.key === 'Enter' && e.target.id === 'bk-kw') {
        S.bankKw = e.target.value;
        route('bank');
      }
      if (e.key === 'Enter' && e.target.id === 'qz-input') {
        answerQuiz(e.target.value);
      }
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (!$('#modal').hidden) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (S.session && S.route !== 'quiz') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        S.session.flipped = !S.session.flipped;
        $('.flip') && $('.flip').classList.toggle('on', S.session.flipped);
      } else if (S.session.flipped && ['1', '2', '3', '4'].indexOf(e.key) >= 0) {
        grade(Number(e.key) - 1);
      }
    }
    if (e.key === '/' ) {
      e.preventDefault();
      $('#quick-search') && $('#quick-search').focus();
    }
  });

  /* ---------------------------------------------------------------- 启动 */
  window.addEventListener('hashchange', function () {
    route(location.hash.replace('#/', '') || 'home');
  });

  function boot() {
    var u = C.Auth.current();
    if (u || C.Auth.isGuest()) enter(u);
    else renderLogin();
  }
  boot();
})();
