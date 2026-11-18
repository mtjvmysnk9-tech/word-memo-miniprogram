/**
 * 忆单词 WordMemo —— 业务核心层（三端共用：PC 网页 / 手机版 H5 / 微信小程序）
 *
 * 分层：
 *   Store  本地持久化适配层（浏览器 localStorage / 小程序 wx.setStorageSync）
 *   SRS    艾宾浩斯记忆曲线调度算法
 *   Auth   账号与角色（管理员 / 普通用户 / 游客）
 *   Repo   学习数据仓储（词状态、学习日志、错词本、收藏）
 *   Quiz   自动组卷与判分
 *   Stats  学习统计（打卡、词汇量曲线、记忆保持率）
 */
(function (factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WORD_MEMO_CORE = api;
})(function () {
  'use strict';

  var DAY = 86400000;
  var MIN = 60000;

  /* ---------------------------------------------------------------- Store */
  var hasWx = typeof wx !== 'undefined' && !!wx.setStorageSync;
  var LS = (function () {
    try {
      var probe = '__wm_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (e) {
      return null;
    }
  })();
  var mem = {};
  var Store = {
    backend: hasWx ? 'wx.setStorageSync' : LS ? 'localStorage' : 'memory',
    get: function (key, def) {
      try {
        var raw = hasWx ? wx.getStorageSync(key) : LS ? LS.getItem(key) : mem[key];
        if (raw === '' || raw == null) return def;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        return def;
      }
    },
    set: function (key, val) {
      try {
        var raw = JSON.stringify(val);
        if (hasWx) wx.setStorageSync(key, raw);
        else if (LS) LS.setItem(key, raw);
        else mem[key] = raw;
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        if (hasWx) wx.removeStorageSync(key);
        else if (LS) LS.removeItem(key);
        else delete mem[key];
      } catch (e) {}
    },
    /** 遍历本系统写入的全部键，用于复位 */
    eachKey: function (fn) {
      if (!LS) return;
      for (var i = 0; i < LS.length; i++) {
        var k = LS.key(i);
        if (k) fn(k);
      }
    }
  };

  /* ------------------------------------------------------------------ SRS */
  /* 艾宾浩斯记忆周期（分钟）：5分钟 → 30分钟 → 12小时 → 1天 → 2天 → 4天 → 7天 → 15天 → 30天 */
  var INTERVALS = [5, 30, 720, 1440, 2880, 5760, 10080, 21600, 43200];
  /* 复习反馈等级 */
  var GRADE = { FORGOT: 0, FUZZY: 1, KNOWN: 2, MASTERED: 3 };

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function dateKey(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  var SRS = {
    INTERVALS: INTERVALS,
    GRADE: GRADE,
    /** 记忆阶段名称，用于界面提示“当前处于第几个保持期” */
    stageName: function (level) {
      if (level <= 0) return '初次识记';
      if (level === 1) return '5 分钟保持';
      if (level === 2) return '30 分钟保持';
      if (level === 3) return '半天保持';
      if (level === 4) return '1 天保持';
      if (level === 5) return '2 天保持';
      if (level === 6) return '4 天保持';
      if (level === 7) return '7 天保持';
      if (level === 8) return '15 天保持';
      return '长期记忆';
    },
    /** 新建一条词记忆状态 */
    create: function (wordId) {
      return {
        id: wordId,
        level: 0,
        reps: 0,
        lapses: 0,
        correct: 0,
        wrong: 0,
        learned: false,
        createdAt: Date.now(),
        lastAt: 0,
        dueAt: 0
      };
    },
    /**
     * 按反馈更新记忆状态并回写下次到期时间
     * @returns 更新后的状态
     */
    review: function (state, grade, now) {
      var t = now || Date.now();
      var s = state || SRS.create();
      s.reps++;
      s.lastAt = t;
      if (grade === GRADE.FORGOT) {
        s.wrong++;
        s.lapses++;
        s.level = 0;
        s.dueAt = t + INTERVALS[0] * MIN;
      } else if (grade === GRADE.FUZZY) {
        s.wrong++;
        s.level = Math.max(0, s.level - 1);
        s.dueAt = t + Math.round(INTERVALS[s.level] * 0.5) * MIN;
      } else {
        s.correct++;
        var step = grade === GRADE.MASTERED ? 2 : 1;
        s.level = Math.min(INTERVALS.length - 1, s.level + step);
        var boost = grade === GRADE.MASTERED ? 1.3 : 1;
        s.dueAt = t + Math.round(INTERVALS[s.level] * boost) * MIN;
      }
      s.learned = true;
      return s;
    },
    /** 新学一个词：默认 5 分钟后进入首次复习 */
    learn: function (state, wordId) {
      var t = now();
      var s = state || SRS.create(wordId);
      s.level = 0;
      s.reps = Math.max(1, s.reps);
      s.learned = true;
      s.lastAt = t;
      s.createdAt = s.createdAt || t;
      s.dueAt = t + INTERVALS[0] * MIN;
      return s;
    },
    /** 是否到期需要复习 */
    isDue: function (state, now) {
      return !!state && state.learned && (state.dueAt || 0) <= (now || Date.now());
    },
    /** 距下次复习还剩多久，输出人读文本 */
    untilDue: function (state, now) {
      if (!state || !state.learned) return '未学习';
      var left = (state.dueAt || 0) - (now || Date.now());
      if (left <= 0) return '待复习';
      if (left < 60 * MIN) return Math.ceil(left / MIN) + ' 分钟后';
      if (left < DAY) return Math.ceil(left / (60 * MIN)) + ' 小时后';
      return Math.ceil(left / DAY) + ' 天后';
    },
    /** 记忆强度 0-100，用于雷达/进度条展示 */
    strength: function (state) {
      if (!state || !state.learned) return 0;
      var base = (state.level / (INTERVALS.length - 1)) * 100;
      var penalty = Math.min(30, (state.lapses || 0) * 6);
      return Math.max(0, Math.round(base - penalty));
    }
  };

  /* ----------------------------------------------------------------- Auth */
  var K_USERS = 'wm_users';
  var K_SESSION = 'wm_session';
  var K_CMS = 'wm_cms';
  var K_SEED = 'wm_seed_ver';
  var ADMIN_UID = 'u_admin';
  /* 2 = 去掉内置演示账号、管理员口令改为本人设定 */
  var SEED_VER = 2;

  /* 演示用口令散列：静态站点没有服务端，仅做不可读化处理，不具备真实安全性 */
  function hash(pw) {
    var h = 5381;
    var str = 'wm$' + String(pw || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
    return h.toString(16);
  }

  function now() {
    return Date.now();
  }

  /** 同一毫秒内连续注册或导入时用于区分标识 */
  function rid() {
    return Math.random().toString(36).slice(2, 6);
  }

  /**
   * 只放一个管理员骨架，pwd 为空表示口令尚未设定。
   * 代码与页面上都不存在默认口令，管理员口令由本人在首次进入管理端时设定并独自保管。
   */
  function seedUsers() {
    return [
      {
        uid: ADMIN_UID,
        account: 'admin',
        nickname: '系统管理员',
        role: 'admin',
        pwd: null,
        avatarColor: '#3b6ef5',
        bank: 'cet4',
        createdAt: now(),
        status: 1
      }
    ];
  }

  /** 旧版本把演示账号和默认口令写进了本机，升级时丢掉它们，保留自行注册的账号 */
  function migrateUsers(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if (u.uid === ADMIN_UID || u.uid === 'u_demo') continue;
      out.push(u);
    }
    return seedUsers().concat(out);
  }

  var Auth = {
    hash: hash,
    users: function () {
      var list = Store.get(K_USERS, null);
      if (!list || !list.length || Store.get(K_SEED, 0) < SEED_VER) {
        list = migrateUsers(list || []);
        Store.set(K_USERS, list);
        Store.set(K_SEED, SEED_VER);
      }
      return list;
    },
    saveUsers: function (list) {
      Store.set(K_USERS, list);
    },
    findByAccount: function (account) {
      var list = this.users();
      for (var i = 0; i < list.length; i++) if (list[i].account === account) return list[i];
      return null;
    },
    findByUid: function (uid) {
      var list = this.users();
      for (var i = 0; i < list.length; i++) if (list[i].uid === uid) return list[i];
      return null;
    },
    /** 账号密码登录，返回 {ok, msg, user} */
    login: function (account, pwd, expectRole) {
      if (!account || !pwd) return { ok: false, msg: '请填写账号和密码' };
      var u = this.findByAccount(account);
      if (!u) return { ok: false, msg: '账号不存在，可先注册' };
      if (u.status === 0) return { ok: false, msg: '该账号已被管理员停用' };
      if (!u.pwd) return { ok: false, msg: '管理员密码尚未设定，请先设置密码', needSet: true };
      if (u.pwd !== hash(pwd)) return { ok: false, msg: '密码不正确' };
      if (expectRole && u.role !== expectRole) return { ok: false, msg: '该账号不是' + (expectRole === 'admin' ? '管理员' : '普通用户') + '账号' };
      this.setSession(u);
      return { ok: true, msg: '登录成功', user: u };
    },
    register: function (account, pwd, nickname) {
      account = String(account || '').trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(account)) return { ok: false, msg: '账号需 3-20 位字母、数字或下划线' };
      if (String(pwd || '').length < 6) return { ok: false, msg: '密码至少 6 位' };
      if (this.findByAccount(account)) return { ok: false, msg: '账号已被占用' };
      var palette = ['#07c160', '#3b6ef5', '#f5a623', '#e0544a', '#8e5bf2', '#00b4c8'];
      var u = {
        uid: 'u_' + now().toString(36) + rid(),
        account: account,
        nickname: (nickname || '').trim() || account,
        role: 'user',
        pwd: hash(pwd),
        avatarColor: palette[Math.floor(Math.random() * palette.length)],
        bank: 'gk',
        createdAt: now(),
        status: 1
      };
      var list = this.users();
      list.push(u);
      this.saveUsers(list);
      this.setSession(u);
      return { ok: true, msg: '注册成功', user: u };
    },
    /** 管理员账号名（本机唯一，供管理端登录使用） */
    adminAccount: function () {
      var u = this.findByUid(ADMIN_UID);
      return u ? u.account : 'admin';
    },
    /** 管理员口令是否已由本人设定（未设定时管理端入口显示「设定密码」） */
    adminReady: function () {
      var u = this.findByUid(ADMIN_UID);
      return !!(u && u.pwd);
    },
    /** 首次进入管理端时由本人设定口令，两次输入一致才写入，成功后直接登录 */
    setAdminPwd: function (pwd, confirm) {
      if (String(pwd || '').length < 6) return { ok: false, msg: '管理员密码至少 6 位' };
      if (pwd !== confirm) return { ok: false, msg: '两次输入的密码不一致' };
      var list = this.users();
      var admin = null;
      for (var i = 0; i < list.length; i++) if (list[i].uid === ADMIN_UID) admin = list[i];
      if (!admin) {
        admin = seedUsers()[0];
        list.push(admin);
      }
      admin.pwd = hash(pwd);
      this.saveUsers(list);
      this.setSession(admin);
      return { ok: true, msg: '管理员密码已设定', user: admin };
    },
    /** 游客进入：无需账号，学习进度以游客身份保存在本地 */
    guest: function () {
      var u = {
        uid: 'guest',
        account: 'guest',
        nickname: '游客',
        role: 'guest',
        avatarColor: '#8a8f99',
        bank: 'gk',
        createdAt: now()
      };
      this.setSession(u);
      return u;
    },
    setSession: function (user) {
      Store.set(K_SESSION, { uid: user.uid, role: user.role, at: now() });
    },
    logout: function () {
      Store.remove(K_SESSION);
    },
    /** 当前登录者（游客返回 null，便于界面判断） */
    current: function () {
      var s = Store.get(K_SESSION, null);
      if (!s || s.role === 'guest') return null;
      return this.findByUid(s.uid);
    },
    isGuest: function () {
      var s = Store.get(K_SESSION, null);
      return !!(s && s.role === 'guest');
    },
    isAdmin: function () {
      var s = Store.get(K_SESSION, null);
      return !!(s && s.role === 'admin');
    },
    /** 谁能保存学习进度：管理员与普通用户按 uid 分桶，游客共用一个桶 */
    bucketOf: function () {
      var s = Store.get(K_SESSION, null);
      if (!s) return 'guest';
      return s.uid;
    },
    resetPwd: function (uid, pwd) {
      if (String(pwd || '').length < 6) return { ok: false, msg: '密码至少 6 位' };
      var list = this.users();
      for (var i = 0; i < list.length; i++) {
        if (list[i].uid === uid) {
          list[i].pwd = hash(pwd);
          this.saveUsers(list);
          return { ok: true, msg: '密码已重置' };
        }
      }
      return { ok: false, msg: '用户不存在' };
    },
    setStatus: function (uid, status) {
      var list = this.users();
      for (var i = 0; i < list.length; i++) {
        if (list[i].uid === uid) {
          list[i].status = status;
          this.saveUsers(list);
          return { ok: true };
        }
      }
      return { ok: false, msg: '用户不存在' };
    },
    update: function (uid, patch) {
      var list = this.users();
      for (var i = 0; i < list.length; i++) {
        if (list[i].uid === uid) {
          for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) list[i][k] = patch[k];
          this.saveUsers(list);
          return { ok: true, user: list[i] };
        }
      }
      return { ok: false };
    }
  };

  /* ----------------------------------------------------------------- Repo */
  /* 每个账号一份学习档案：{words:{词id:状态}, log:{日期:{new,review,quiz,minutes}}, wrong:[], fav:[]} */
  var Repo = {
    key: function (bucket) {
      return 'wm_profile_' + (bucket || Auth.bucketOf());
    },
    load: function (bucket) {
      var p = Store.get(this.key(bucket), null);
      if (!p) {
        p = { words: {}, log: {}, wrong: [], fav: [], settings: { dailyGoal: 20, bank: 'cet4' }, updatedAt: 0 };
      }
      p.words = p.words || {};
      p.log = p.log || {};
      p.wrong = p.wrong || [];
      p.fav = p.fav || [];
      p.settings = p.settings || { dailyGoal: 20, bank: 'cet4' };
      return p;
    },
    save: function (p, bucket) {
      p.updatedAt = now();
      Store.set(this.key(bucket), p);
      return p;
    },
    /** 记录一条学习轨迹并累计当天日志 */
    track: function (p, kind, minutes) {
      var k = dateKey();
      var d = p.log[k] || { new: 0, review: 0, quiz: 0, minutes: 0 };
      if (kind === 'new') d.new++;
      else if (kind === 'review') d.review++;
      else if (kind === 'quiz') d.quiz++;
      d.minutes += minutes || 0;
      p.log[k] = d;
      return d;
    },
    /** 累计当天专注时长（分钟，保留一位小数） */
    addMinutes: function (p, minutes) {
      if (!(minutes > 0)) return null;
      var k = dateKey();
      var d = p.log[k] || { new: 0, review: 0, quiz: 0, minutes: 0 };
      d.minutes = Math.round(((d.minutes || 0) + minutes) * 10) / 10;
      p.log[k] = d;
      return d;
    },
    learnWord: function (p, wordId) {
      var st = p.words[wordId];
      var isNew = !st || !st.learned;
      p.words[wordId] = SRS.learn(st, wordId);
      if (isNew) this.track(p, 'new');
      return { isNew: isNew, state: p.words[wordId] };
    },
    reviewWord: function (p, wordId, grade) {
      var st = p.words[wordId] || SRS.create(wordId);
      var wasNew = !st.learned;
      p.words[wordId] = SRS.review(st, grade);
      this.track(p, wasNew ? 'new' : 'review');
      this.syncWrong(p, wordId, grade);
      return p.words[wordId];
    },
    /** 错词本：答错进入，连续两次答对自动移出 */
    syncWrong: function (p, wordId, grade) {
      var idx = -1;
      for (var i = 0; i < p.wrong.length; i++) if (p.wrong[i].id === wordId) idx = i;
      if (grade === GRADE.FORGOT || grade === GRADE.FUZZY) {
        if (idx < 0) p.wrong.push({ id: wordId, n: 1, last: now(), cleared: 0 });
        else {
          p.wrong[idx].n++;
          p.wrong[idx].last = now();
          p.wrong[idx].cleared = 0;
        }
      } else if (idx >= 0) {
        p.wrong[idx].cleared = (p.wrong[idx].cleared || 0) + 1;
        if (p.wrong[idx].cleared >= 2) p.wrong.splice(idx, 1);
      }
    },
    toggleFav: function (p, wordId) {
      var idx = p.fav.indexOf(wordId);
      if (idx < 0) p.fav.push(wordId);
      else p.fav.splice(idx, 1);
      return idx < 0;
    },
    /** 待复习队列，按到期时间升序 */
    dueQueue: function (p, words, limit) {
      var t = now();
      var out = [];
      for (var i = 0; i < words.length; i++) {
        var st = p.words[words[i].id];
        if (st && st.learned && (st.dueAt || 0) <= t) out.push({ word: words[i], state: st });
      }
      out.sort(function (a, b) {
        return a.state.dueAt - b.state.dueAt;
      });
      return limit ? out.slice(0, limit) : out;
    },
    /** 未学习的新词，按词库顺序 */
    newWords: function (p, words, limit) {
      var out = [];
      for (var i = 0; i < words.length; i++) {
        var st = p.words[words[i].id];
        if (!st || !st.learned) out.push({ word: words[i], state: st });
      }
      return limit ? out.slice(0, limit) : out;
    },
    /** 今日学习量与目标差额 */
    today: function (p) {
      var d = p.log[dateKey()] || { new: 0, review: 0, quiz: 0, minutes: 0 };
      return d;
    }
  };

  /* ----------------------------------------------------------------- Quiz */
  var Quiz = {
    TYPES: ['meaning', 'spelling', 'listening', 'example'],
    TYPE_NAME: {
      meaning: '看词选义',
      spelling: '听音拼写',
      listening: '听音选词',
      example: '例句填空'
    },
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    },
    pick: function (arr, n) {
      return Quiz.shuffle(arr).slice(0, n);
    },
    /** 从候选词池取 3 个干扰项（调用方传入全部词表） */
    distractors: function(item, pool, n) {
      var cand = [];
      for (var i = 0; i < pool.length; i++) {
        var w = pool[i];
        if (w.id !== item.word.id && w.word.toLowerCase() !== item.word.word.toLowerCase()) cand.push(w);
      }
      return Quiz.pick(cand, n || 3);
    },
    /**
     * 自动组卷
     * @param items [{word, state}] 参与出题的词
     * @param pool  全部可选词（用于生成干扰项）
     */
    build: function (items, pool, types) {
      var ts = types && types.length ? types : this.TYPES;
      var questions = [];
      for (var i = 0; i < items.length; i++) {
        var w = items[i].word;
        var type = ts[i % ts.length];
        var opts = this.distractors({ word: w }, pool, 3);
        var q = { id: 'q' + i + '_' + w.id, wordId: w.id, type: type, stem: '', audio: false, options: [], answer: -1, hint: '' };
        if (type === 'meaning') {
          q.stem = w.word + '  ' + w.phonetic;
          q.audio = true;
          var meanings = [w.meaning];
          for (var k = 0; k < opts.length; k++) meanings.push(opts[k].meaning);
          q.options = Quiz.shuffle(meanings);
          q.answer = q.options.indexOf(w.meaning);
        } else if (type === 'listening') {
          q.stem = '听发音，选出正确的单词';
          q.audio = true;
          var words = [w.word];
          for (var m = 0; m < opts.length; m++) words.push(opts[m].word);
          q.options = Quiz.shuffle(words);
          q.answer = q.options.indexOf(w.word);
        } else if (type === 'spelling') {
          q.stem = '听发音，拼写出单词';
          q.audio = true;
          q.answerText = w.word;
          q.hint = w.word.charAt(0) + new Array(Math.max(0, w.word.length - 1)).join('_') + (w.word.length > 1 ? w.word.charAt(w.word.length - 1) : '');
          q.blank = w.word;
          q.options = [];
        } else {
          var sent = (w.example || 'No example.').replace(new RegExp('\\b' + w.word + '\\b', 'i'), '____');
          q.stem = sent;
          q.answerText = w.word;
          var ws = [w.word];
          for (var n = 0; n < opts.length; n++) ws.push(opts[n].word);
          q.options = Quiz.shuffle(ws);
          q.answer = q.options.indexOf(w.word);
        }
        questions.push(q);
      }
      return questions;
    },
    /** 判分：拼写题忽略大小写与空格 */
    check: function (q, value) {
      if (q.type === 'spelling') {
        return String(value || '').trim().toLowerCase() === String(q.answerText).toLowerCase();
      }
      return Number(value) === Number(q.answer);
    }
  };

  /* ---------------------------------------------------------------- Stats */
  var Stats = {
    /** 连续打卡天数 */
    streak: function (p) {
      var d = 0;
      var t = new Date();
      for (;;) {
        var k = dateKey(t.getTime());
        var rec = p.log[k];
        if (rec && (rec.new || rec.review || rec.quiz)) {
          d++;
          t = new Date(t.getTime() - DAY);
        } else if (d === 0 && k === dateKey()) {
          t = new Date(t.getTime() - DAY);
        } else break;
        if (d > 3650) break;
      }
      return d;
    },
    /** 最近 n 天的曲线数据 */
    series: function (p, n) {
      var out = [];
      var t = Date.now();
      for (var i = n - 1; i >= 0; i--) {
        var k = dateKey(t - i * DAY);
        var rec = p.log[k] || { new: 0, review: 0, quiz: 0, minutes: 0 };
        out.push({ date: k, value: (rec.new || 0) + (rec.review || 0) + (rec.quiz || 0), minutes: rec.minutes || 0 });
      }
      return out;
    },
    /** 记忆保持率：已学词中处于第 4 阶段（1 天以上保持期）以上的比例 */
    retention: function (p) {
      var ids = Object.keys(p.words);
      var learned = 0;
      var solid = 0;
      for (var i = 0; i < ids.length; i++) {
        var st = p.words[ids[i]];
        if (st && st.learned) {
          learned++;
          if (st.level >= 4) solid++;
        }
      }
      return { learned: learned, solid: solid, rate: learned ? Math.round((solid / learned) * 100) : 0 };
    },
    /** 正确率 */
    accuracy: function (p) {
      var ids = Object.keys(p.words);
      var c = 0;
      var w = 0;
      for (var i = 0; i < ids.length; i++) {
        c += p.words[ids[i]].correct || 0;
        w += p.words[ids[i]].wrong || 0;
      }
      var total = c + w;
      return { correct: c, wrong: w, rate: total ? Math.round((c / total) * 100) : 0 };
    },
    /** 掌握度分布：未学 / 模糊 / 熟悉 / 牢固 */
    mastery: function (p, words) {
      var buckets = { fresh: 0, weak: 0, fair: 0, strong: 0 };
      for (var i = 0; i < words.length; i++) {
        var st = p.words[words[i].id];
        if (!st || !st.learned) buckets.fresh++;
        else if (st.level <= 2) buckets.weak++;
        else if (st.level <= 5) buckets.fair++;
        else buckets.strong++;
      }
      return buckets;
    },
    /** 近 n 天热力图（每天学习量分档 0-4） */
    heatmap: function (p, days) {
      var arr = this.series(p, days);
      var max = 1;
      for (var i = 0; i < arr.length; i++) max = Math.max(max, arr[i].value);
      return arr.map(function (d) {
        return { date: d.date, value: d.value, level: d.value === 0 ? 0 : Math.min(4, Math.ceil((d.value / max) * 4)) };
      });
    }
  };

  /* ------------------------------------------------------- 后台内容（词库/公告） */
  var CMS = {
    data: function () {
      return Store.get(K_CMS, { custom: [], notice: '欢迎使用忆单词。本系统为毕业设计演示版，数据保存在你的浏览器本地。' });
    },
    save: function (d) {
      Store.set(K_CMS, d);
      return d;
    },
    /** 自定义词：后台新增/导入的词，所有账号共用 */
    customWords: function (bankId) {
      var list = this.data().custom || [];
      if (!bankId) return list;
      return list.filter(function (w) {
        return w.bank === bankId;
      });
    },
    addWords: function (rows) {
      var d = this.data();
      d.custom = d.custom || [];
      var existing = {};
      d.custom.forEach(function (w) {
        existing[w.bank + '|' + w.word.toLowerCase()] = 1;
      });
      var added = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var key = r.bank + '|' + String(r.word).toLowerCase();
        if (!r.word || existing[key]) continue;
        existing[key] = 1;
        d.custom.push({
          id: 'x_' + now().toString(36) + rid() + '_' + i,
          bank: r.bank,
          word: String(r.word).trim(),
          phonetic: r.phonetic || '',
          meaning: r.meaning || '',
          example: r.example || ''
        });
        added++;
      }
      this.save(d);
      return added;
    },
    removeWord: function (id) {
      var d = this.data();
      d.custom = (d.custom || []).filter(function (w) {
        return w.id !== id;
      });
      this.save(d);
    },
    editWord: function (id, patch) {
      var d = this.data();
      (d.custom || []).forEach(function (w) {
        if (w.id === id) for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) w[k] = patch[k];
      });
      this.save(d);
    },
    setNotice: function (text) {
      var d = this.data();
      d.notice = text;
      this.save(d);
    },
    /** 清空全部本地数据（演示复位）：账号回到只有未设口令的管理员骨架 */
    resetAll: function () {
      Store.remove(K_USERS);
      Store.remove(K_SEED);
      Store.remove(K_SESSION);
      Store.remove(K_CMS);
      var doomed = [];
      Store.eachKey(function (k) {
        if (k.indexOf('wm_profile_') === 0) doomed.push(k);
      });
      doomed.forEach(function (k) {
        Store.remove(k);
      });
    }
  };

  /* ------------------------------------------------- 词表（内置词库 + 后台自定义词） */
  var DATA = null;
  var Catalog = {
    init: function (dataApi) {
      DATA = dataApi;
      return Catalog;
    },
    ready: function () {
      return !!DATA;
    },
    banks: function () {
      return DATA ? DATA.banks : [];
    },
    bank: function (id) {
      if (!DATA) return { id: id, name: '', words: [] };
      var b = DATA.bank(id || 'gk');
      var extra = CMS.customWords(b.id);
      if (!extra.length) return b;
      return {
        id: b.id,
        name: b.name,
        level: b.level,
        desc: b.desc,
        count: b.words.length + extra.length,
        words: b.words.concat(extra)
      };
    },
    words: function (id) {
      return Catalog.bank(id).words;
    },
    all: function () {
      if (!DATA) return [];
      var out = DATA.allWords.slice();
      return out.concat(CMS.customWords());
    },
    find: function (wordId) {
      if (!wordId) return null;
      if (wordId.indexOf('x_') === 0) {
        var custom = CMS.customWords();
        for (var i = 0; i < custom.length; i++) if (custom[i].id === wordId) return custom[i];
        return null;
      }
      return DATA ? DATA.find(wordId) : null;
    },
    /** 关键词检索：单词前缀/包含 + 释义包含 */
    search: function (keyword, bankId, limit) {
      var kw = String(keyword || '').trim().toLowerCase();
      var pool = bankId && bankId !== 'all' ? Catalog.words(bankId) : Catalog.all();
      if (!kw) return pool.slice(0, limit || 50);
      var out = [];
      for (var i = 0; i < pool.length && out.length < (limit || 100); i++) {
        var w = pool[i];
        if (w.word.toLowerCase().indexOf(kw) >= 0 || String(w.meaning).indexOf(kw) >= 0) out.push(w);
      }
      return out;
    }
  };

  return {
    DAY: DAY,
    MIN: MIN,
    dateKey: dateKey,
    Store: Store,
    SRS: SRS,
    Auth: Auth,
    Repo: Repo,
    Quiz: Quiz,
    Stats: Stats,
    CMS: CMS,
    Catalog: Catalog
  };
});
