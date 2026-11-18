/**
 * 小程序端逻辑自检（Node 环境，桩掉 wx/App/Page/getApp）
 * 运行：node tools/selfcheck.js（结果同时打印到控制台并写入 tools/selfcheck-output.txt）
 * 用途：本机没有微信开发者工具时，用它验证小程序页面脚本的可运行性与算法逻辑。
 */
let fs = require('fs');
let path = require('path');

let ROOT = path.join(__dirname, '..', 'miniprogram');
let OUT = path.join(__dirname, 'selfcheck-output.txt');

/* ------------------------------------------------------------ wx 运行时桩 */
const store = {};
const navLog = [];
global.wx = {
  setStorageSync: (k, v) => { store[k] = String(v); },
  getStorageSync: (k) => (store[k] === undefined ? '' : store[k]),
  removeStorageSync: (k) => { delete store[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  showToast: (o) => navLog.push('toast:' + o.title),
  showModal: (o) => { if (o.success) o.success({ confirm: true, content: o.placeholderText ? 'newpass123' : '' }); },
  navigateTo: (o) => navLog.push('navigateTo:' + o.url),
  switchTab: (o) => navLog.push('switchTab:' + o.url),
  reLaunch: (o) => navLog.push('reLaunch:' + o.url),
  navigateBack: () => navLog.push('navigateBack'),
  createInnerAudioContext: () => ({ play() {}, src: '' })
};

/* 页面用 Date.now() 统计专注时长，同步执行几乎不耗时，这里用可控时钟模拟真实停留 */
let CLOCK = Date.now();
Date.now = () => CLOCK;
function step(ms) { CLOCK += ms === undefined ? 20000 : ms; }

/* 桩就绪后再加载内核，让 Store 走 wx.setStorageSync 分支 */
const WORDS = require(path.join(ROOT, 'utils/wordbank.js'));
const CORE = require(path.join(ROOT, 'utils/core.js'));
CORE.Catalog.init(WORDS);

const registry = {};
let appInstance = null;
global.App = (cfg) => {
  Object.keys(cfg).forEach((k) => { if (typeof cfg[k] === 'function') cfg[k] = cfg[k].bind(cfg); });
  cfg.core = CORE;
  cfg.words = WORDS;
  appInstance = cfg;
};
global.Page = (cfg) => { registry[global.__name] = cfg; };
global.getApp = () => appInstance;

function load(name, rel) {
  global.__name = name;
  try {
    delete require.cache[require.resolve(path.join(ROOT, rel))];
    require(path.join(ROOT, rel));
    return null;
  } catch (e) {
    return e.message;
  }
}

function makePage(name) {
  const cfg = registry[name];
  if (!cfg) throw new Error('page not registered: ' + name);
  const ctx = {};
  Object.keys(cfg).forEach((k) => { ctx[k] = cfg[k]; });
  ctx.data = JSON.parse(JSON.stringify(cfg.data || {}));
  ctx.setData = (patch) => { Object.keys(patch).forEach((k) => { ctx.data[k] = patch[k]; }); };
  return ctx;
}

const LOG = [];
const say = (...a) => LOG.push(a.join(' '));
const ok = (name, cond, extra) => say((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined && extra !== true ? ' :: ' + extra : ''));
const navs = () => navLog.join('|');

/* ---------------------------------------------------------------- 加载 */
say('backend=' + CORE.Store.backend + ' words=' + CORE.Catalog.all().length);
ok('app.js loads', !load('app', 'app.js') && !!appInstance, load('app', 'app.js'));
const pages = ['login', 'home', 'study', 'review', 'quiz', 'mine', 'stats', 'admin'];
const errs = pages.map((n) => [n, load(n, 'pages/' + n + '/' + n + '.js')]).filter((x) => x[1]);
ok('8 pages registered', Object.keys(registry).length === 8, Object.keys(registry).join(','));
ok('no page load errors', errs.length === 0, errs.map((e) => e[0] + ': ' + e[1]).join(' | '));

if (errs.length || Object.keys(registry).length !== 8) {
  fs.writeFileSync(OUT, LOG.join('\n'), 'utf8');
  process.exit(0);
}

/* ------------------------------------------------------------ 登录与启动 */
CORE.CMS.resetAll();
appInstance.onLaunch();
ok('launch redirects to login', navs().indexOf('reLaunch:/pages/login/login') >= 0, navs());

const ADMIN_PWD = 'own-pwd-8';
ok('ships without any default password', CORE.Auth.users().length === 1 && CORE.Auth.adminReady() === false, JSON.stringify(CORE.Auth.users().map((u) => u.account)));
const legacy = CORE.Auth.login('admin', 'admin123');
ok('legacy admin123 rejected', legacy.ok === false && legacy.needSet === true, legacy.msg);
ok('short admin password rejected', CORE.Auth.setAdminPwd('123', '123').ok === false);
ok('mismatched admin password rejected', CORE.Auth.setAdminPwd(ADMIN_PWD, 'other-99').ok === false);
ok('owner sets admin password', CORE.Auth.setAdminPwd(ADMIN_PWD, ADMIN_PWD).ok === true);
ok('admin password now required', CORE.Auth.adminReady() === true);
CORE.Auth.logout();
ok('wrong admin password rejected', CORE.Auth.login('admin', 'admin123', 'admin').ok === false);
ok('admin logs in with own password', CORE.Auth.login('admin', ADMIN_PWD, 'admin').ok === true);
CORE.Auth.logout();
const reg = CORE.Auth.register('learner', 'pw123456', '自学者');
ok('user registers own account', reg.ok, reg.msg);
const DEMO_UID = reg.user.uid;
CORE.Auth.update(DEMO_UID, { bank: 'cet4' });
ok('refresh returns true', appInstance.refresh() === true);

/* ---------------------------------------------------------------- 首页 */
const home = makePage('home');
home.onShow();
ok('home bankName', home.data.bankName === '四级高频', home.data.bankName);
ok('home freshCount', home.data.freshCount === 364, home.data.freshCount);
ok('home bars 7', home.data.bars.length === 7);
ok('home totalWords', home.data.totalWords === 894, home.data.totalWords);
home.onBankChange({ detail: { value: '0' } });
ok('home switch bank', appInstance.globalData.bank === 'gk', appInstance.globalData.bank);
home.render();
ok('home gk fresh', home.data.freshCount === 332, home.data.freshCount);
appInstance.globalData.bank = 'cet4';

/* ---------------------------------------------------------------- 学习 */
const study = makePage('study');
study.onShow();
ok('study setup view', study.data.view === 'setup', study.data.view);
ok('study banks chips', study.data.banks.length === 3);
study.startStudy();
ok('study card view', study.data.view === 'card', study.data.view);
ok('study first word', study.data.word === 'aboard', study.data.word);
study.flip();
ok('study flipped', study.data.flipped === true);
ok('study highlight parts', study.data.parts.length >= 2, JSON.stringify(study.data.parts));
study.toggleFav();
ok('study fav added', appInstance.globalData.P.fav.length === 1, appInstance.globalData.P.fav.length);
for (let g = 0; g < 20 && study.data.view === 'card'; g++) {
  step();
  study.grade({ currentTarget: { dataset: { g: String(g % 4) } } });
}
ok('study result view', study.data.view === 'result', study.data.view);
ok('study rate sane', study.data.rate >= 0 && study.data.rate <= 100, study.data.rate);

const P = appInstance.globalData.P;
const today = CORE.Repo.today(P);
ok('tracked 20 new', today.new === 20, JSON.stringify(today));
ok('minutes recorded', today.minutes > 0, today.minutes);
ok('wrong book filled', P.wrong.length > 0, P.wrong.length);
study.quit();
ok('quit clears session', appInstance.globalData.session === null);

/* ---------------------------------------------------------------- 复习 */
const review = makePage('review');
review.onShow();
ok('review tabs 5', review.data.tabs.length === 5);
ok('review wrong count matches', review.data.tabs[2].n === P.wrong.length, JSON.stringify(review.data.tabs));
review.switchTab({ currentTarget: { dataset: { id: 'wrong' } } });
ok('review wrong list', review.data.list.length > 0, review.data.list.length);
review.onKw({ detail: { value: 'zzzz' } });
ok('review search filters to zero', review.data.list.length === 0, review.data.total);
review.setData({ kw: '' });
review.render();
review.speak({ currentTarget: { dataset: { w: 'aboard' } } });
review.toggleFav({ currentTarget: { dataset: { id: 'cet4-1' } } });
review.start();
ok('review builds session', !!appInstance.globalData.session);
ok('review jumps to study', navs().indexOf('switchTab:/pages/study/study') >= 0);
review.pickBank({ currentTarget: { dataset: { id: 'cet6' } } });
ok('review pick bank', appInstance.globalData.bank === 'cet6', appInstance.globalData.bank);
appInstance.globalData.bank = 'cet4';
appInstance.globalData.session = null;

/* ---------------------------------------------------------------- 测试 */
appInstance.globalData.quiz = null;
const quiz = makePage('quiz');
quiz.onShow();
ok('quiz setup', quiz.data.view === 'setup', quiz.data.view);
ok('quiz scopes 5', quiz.data.scopes.length === 5, JSON.stringify(quiz.data.scopes.map((s) => s.n)));
quiz.pickCount({ currentTarget: { dataset: { n: '5' } } });
quiz.toggleType({ currentTarget: { dataset: { id: 'spelling' } } });
ok('quiz spelling off', quiz.data.types.filter((t) => t.id === 'spelling')[0].on === false);
quiz.start();
ok('quiz question view', quiz.data.view === 'quiz', quiz.data.view);
let guard = 0;
while (quiz.data.view === 'quiz' && guard++ < 30) {
  step(15000);
  if (quiz.data.options.length) quiz.choose({ currentTarget: { dataset: { i: 0 } } });
  else { quiz.setData({ answerText: 'abandon' }); quiz.submitText(); }
  quiz.playAudio();
  if (quiz.data.shown) quiz.next();
}
ok('quiz result view', quiz.data.view === 'result', quiz.data.view);
ok('quiz rate sane', typeof quiz.data.rate === 'number' && quiz.data.rate >= 0, quiz.data.rate);
ok('quiz tracked', CORE.Repo.today(P).quiz > 0, JSON.stringify(CORE.Repo.today(P)));
ok('quiz wronglist is array', Array.isArray(quiz.data.wrongList), quiz.data.wrongList.length);

/* ---------------------------------------------------------------- 我的 */
const mine = makePage('mine');
mine.onShow();
ok('mine name', mine.data.name === '自学者', mine.data.name);
ok('mine not admin', mine.data.isAdmin === false);
ok('mine bucket', mine.data.bucket.indexOf('wm_profile_') === 0, mine.data.bucket);
mine.onGoal({ detail: { value: '30' } });
ok('goal saved', P.settings.dailyGoal === 30, P.settings.dailyGoal);
mine.onBankChange({ detail: { value: '2' } });
ok('mine bank change', appInstance.globalData.bank === 'cet6', appInstance.globalData.bank);
appInstance.globalData.bank = 'cet4';
mine.changePwd();
ok('pwd changed', CORE.Auth.login('learner', 'newpass123').ok);
CORE.Auth.resetPwd(DEMO_UID, 'pw123456');
CORE.Auth.login('learner', 'pw123456');
appInstance.refresh();

/* ---------------------------------------------------------------- 统计 */
const stats = makePage('stats');
stats.onShow();
ok('stats bars 14', stats.data.bars.length === 14);
ok('stats heat 40', stats.data.heat.length === 40);
ok('stats stages 9', stats.data.stages.length === 9);
ok('stats logs', stats.data.logs.length >= 1, stats.data.logs.length);
ok('stats learned > 0', stats.data.learned > 0, stats.data.learned);
ok('stats minutes > 0', stats.data.minutes > 0, stats.data.minutes);
ok('stats dist 4', stats.data.dist.length === 4);

/* ------------------------------------------------------------ 管理后台 */
CORE.Auth.login('admin', ADMIN_PWD);
appInstance.refresh();
const admin = makePage('admin');
admin.onShow();
ok('admin overview', admin.data.totalUsers >= 2, admin.data.totalUsers);
ok('admin bankRows 3', admin.data.bankRows.length === 3, JSON.stringify(admin.data.bankRows.map((b) => b.count)));
admin.switchTab({ currentTarget: { dataset: { tab: 'users' } } });
ok('admin users list', admin.data.users.length >= 2, admin.data.users.length);
admin.resetPwd({ currentTarget: { dataset: { uid: DEMO_UID } } });
ok('reset pwd toast', navs().indexOf('已重置') >= 0, navLog.slice(-1)[0]);
admin.toggleStatus({ currentTarget: { dataset: { uid: DEMO_UID } } });
ok('status toggled', CORE.Auth.findByUid(DEMO_UID).status === 0, CORE.Auth.findByUid(DEMO_UID).status);
CORE.Auth.setStatus(DEMO_UID, 1);
admin.switchTab({ currentTarget: { dataset: { tab: 'words' } } });
admin.onField({ currentTarget: { dataset: { f: 'wWord' } }, detail: { value: 'meticulous' } });
admin.onField({ currentTarget: { dataset: { f: 'wMean' } }, detail: { value: 'adj. 一丝不苟的' } });
admin.addWord();
ok('word added', admin.data.custom.length === 1, JSON.stringify(admin.data.custom));
ok('catalog grew', CORE.Catalog.all().length === 895, CORE.Catalog.all().length);
admin.setData({ csv: 'serendipity,/ˌserənˈdɪpəti/,"n. 意外发现的美好",Life is full of serendipity.\nbadline,,,\n' });
admin.importCsv();
ok('csv import result', navLog.slice(-1)[0] === 'toast:导入 1 词，跳过 0 词', navLog.slice(-1)[0]);
admin.delWord({ currentTarget: { dataset: { id: admin.data.custom[0].id } } });
ok('delWord removes one', admin.data.custom.length === 1, JSON.stringify(admin.data.custom.map((w) => w.word)));
ok('catalog shrinks to 895', CORE.Catalog.all().length === 895, CORE.Catalog.all().length);
admin.delWord({ currentTarget: { dataset: { id: admin.data.custom[0].id } } });
ok('custom list emptied', admin.data.custom.length === 0, JSON.stringify(admin.data.custom));
ok('catalog back to 894', CORE.Catalog.all().length === 894, CORE.Catalog.all().length);
admin.switchTab({ currentTarget: { dataset: { tab: 'sys' } } });
ok('sys intervals 9', admin.data.intervals.length === 9);
ok('sys env words', admin.data.env.indexOf('894') >= 0, admin.data.env);
admin.setData({ notice: '自检公告' });
admin.saveNotice();
ok('notice saved', CORE.CMS.data().notice === '自检公告', CORE.CMS.data().notice);

/* ---------------------------------------------------------------- 退出 */
const learned = CORE.Repo.learnWord(appInstance.globalData.P, 'cet4-1').state;
ok('learnWord writes numeric dueAt', typeof learned.dueAt === 'number' && learned.dueAt > CLOCK, JSON.stringify(learned.dueAt));
ok('learnWord writes numeric lastAt', typeof learned.lastAt === 'number', JSON.stringify(learned.lastAt));
ok('untilDue readable', /分钟后|待复习/.test(CORE.SRS.untilDue(learned, CLOCK + 60000)), CORE.SRS.untilDue(learned, CLOCK + 60000));
const mine2 = makePage('mine');
mine2.logout();
ok('logout redirects', navs().indexOf('reLaunch:/pages/login/login') >= 0);
const login = makePage('login');
login.switchTab({ currentTarget: { dataset: { tab: 'admin' } } });
ok('login page shows no credential', login.data.acc === '' && login.data.pwd === '' && login.data.adminReady === true, JSON.stringify(login.data));
login.setData({ pwd: 'wrong-pwd-1' });
login.doLogin();
ok('admin tab verifies password', navLog.slice(-1)[0] === 'toast:密码不正确', navLog.slice(-1)[0]);
login.switchTab({ currentTarget: { dataset: { tab: 'register' } } });
login.setData({ acc: 'newbie', pwd: 'abc123', nick: '新同学' });
login.doLogin();
ok('register via page', !!CORE.Auth.findByAccount('newbie'), CORE.Auth.users().length);
login.doGuest();
ok('guest enters', CORE.Auth.isGuest() === true);
ok('guest bucket', CORE.Repo.load('guest') !== null);

/* ------------------------------------------------- 持久化（走 wx.setStorageSync） */
ok('backend is wx storage', CORE.Store.backend === 'wx.setStorageSync', CORE.Store.backend);
const savedKeys = Object.keys(store);
ok('wx storage written', savedKeys.length >= 3, savedKeys.join(','));
const reloaded = CORE.Repo.load(DEMO_UID);
ok('profile reloads from wx', !!reloaded && Object.keys(reloaded.words).length >= 20, reloaded && Object.keys(reloaded.words).length);
const reAuth = CORE.Auth.findByAccount('newbie');
ok('account survives reload', !!reAuth && reAuth.role === 'user', JSON.stringify(reAuth && { a: reAuth.account, r: reAuth.role }));
ok('uid unique per ms', new Set(CORE.Auth.users().map((u) => u.uid)).size === CORE.Auth.users().length, CORE.Auth.users().map((u) => u.uid).join(','));
CORE.CMS.resetAll();
ok('reset wipes wx storage', Object.keys(store).length === 0, Object.keys(store).join(','));
ok('reset reseeds admin skeleton', CORE.Auth.users().length === 1 && CORE.Auth.adminReady() === false, CORE.Auth.users().map((u) => u.account).join(','));

/* -------------------------------------------------- 旧版本本机数据升级 */
delete store.wm_seed_ver;
store.wm_users = JSON.stringify([
  { uid: 'u_admin', account: 'admin', role: 'admin', nickname: '系统管理员', pwd: CORE.Auth.hash('admin123') },
  { uid: 'u_demo', account: 'student', role: 'user', nickname: '演示同学', pwd: CORE.Auth.hash('123456') },
  { uid: 'u_m9xk1abc', account: 'keeper', role: 'user', nickname: '自己注册的同学', pwd: CORE.Auth.hash('pw123456') }
]);
const migrated = CORE.Auth.users();
ok('legacy demo account dropped', !CORE.Auth.findByAccount('student'), migrated.map((u) => u.account).join(','));
ok('legacy admin password cleared', CORE.Auth.adminReady() === false);
ok('self-registered account survives upgrade', !!CORE.Auth.findByAccount('keeper'), migrated.length);

const fails = LOG.filter((l) => l.indexOf('FAIL') === 0);
say('');
say(fails.length ? '>>> ' + fails.length + ' FAILURES' : '>>> all ' + LOG.filter((l) => l.indexOf('PASS') === 0).length + ' checks passed');
fs.writeFileSync(OUT, LOG.join('\n'), 'utf8');
