/*
 * 挖煤姬 meruki · Loon 增强脚本  v1.0
 * ---------------------------------------------------------------------------
 * 一个脚本同时承担四种角色（由 Loon 的 Script 规则分别触发，脚本内部自动分派）：
 *
 *   1) http-request  → 抓取并保存登录态 Cookie（kmgSession…），并承载"控制台"网页
 *   2) http-response → 去掉开屏广告（Sig.Front.AppFront.GetOpenAd）
 *                      去掉首页广告位（Sig.Front.SubSite.AppMercari.GetHomeInfoV2 里的 ads / banners）
 *   3) cron          → 每天自动签到（/api/user/signin/signin）
 *
 * 控制台：浏览器打开  https://app.meruki.cn/__loon__   （需 Loon 代理 + MITM 已开启）
 *
 * 说明：挖煤姬 h5（h5.meruki.cn）的接口返回的是普通 JSON（text/plain 或 application/json），
 *      不是加密体，所以直接改 JSON 即可，无需解码。
 * ---------------------------------------------------------------------------
 */

/* ============================ 常量 ============================ */

var K_COOKIE = 'meruki_cookie';       // 登录态 Cookie
var K_TIME   = 'meruki_cookie_time';  // 保存时间戳
var K_SRC    = 'meruki_cookie_src';   // 来源：manual / auto
var K_LAST   = 'meruki_last_result';  // 上次签到结果（控制台展示）
var K_NOTIFY = 'meruki_notified_date';// 当天已通知过的日期，避免重复推送

var PANEL = '/__loon__';

var API_CONFIG = 'https://app.meruki.cn/api/user/signin/config?from=SIG-H5&language=zh-CN&isNew=1&time_zone=Asia%2FShanghai&open_push=true';
var API_SIGNIN = 'https://app.meruki.cn/api/user/signin/signin?from=SIG-H5&language=zh-CN&isNew=1';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 isNew(1)/version(2.1.6)/downSafeArea(34.0)/topSafeArea(59.0)/appFrom(IOS)/sigSource(IOSMC)/deviceType(phone)/sigSource(IOSMC)';

/* ============================ 基础工具 ============================ */

function storeGet(k) {
  var v = $persistentStore.read(k);
  if (v === undefined || v === null) return '';
  return String(v);
}

function storeSet(k, v) {
  try { $persistentStore.write(String(v), k); } catch (e) { }
}

function storeDel(k) {
  try { $persistentStore.write(undefined, k); } catch (e) { }
}

/* 读取插件参数（[Argument]），支持空值回退 */
function arg(key, dft) {
  var a = (typeof $argument !== 'undefined' && $argument) ? $argument : null;
  if (a && typeof a === 'object') {
    var v = a[key];
    if (v === undefined || v === null) return dft;
    if (typeof v === 'string' && v.trim() === '') return dft;
    return v;
  }
  return dft;
}

function log() {
  try {
    var arr = [];
    for (var i = 0; i < arguments.length; i++) {
      var x = arguments[i];
      arr.push(typeof x === 'object' ? JSON.stringify(x) : String(x));
    }
    console.log('[meruki] ' + arr.join(' '));
  } catch (e) { }
}

function safeJSON(s) {
  if (!s) return null;
  if (typeof s === 'object') {
    // 少数情况下 body 是 Uint8Array
    try { s = String.fromCharCode.apply(null, s); } catch (e) { return null; }
  }
  s = String(s);
  var i = s.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch (e) { return null; }
}

/* ============================ Cookie 处理 ============================ */

/* 从任意 Cookie 头里抽出 kmgSession… 这一段 */
function pickSessionCookie(raw) {
  if (!raw) return '';
  var s = String(raw).replace(/\r?\n/g, ' ');
  var m = s.match(/kmgSession[^=;\s]*=[^;\s]+/);
  if (m) return m[0];
  return '';
}

/* 规范化用户粘贴的内容：允许整行 Cookie、允许带 "Cookie:" 前缀 */
function normalizeCookie(input) {
  var s = String(input || '').replace(/\r?\n/g, ' ').trim();
  s = s.replace(/^cookie\s*:\s*/i, '');
  if (!s) return '';

  var parts = [];
  var m = s.match(/kmgSession[^=;\s]*=[^;\s]+/);
  var d = s.match(/deviceId=[^;\s]+/);

  if (m) {
    parts.push(m[0]);
    if (d) parts.push(d[0]);
  } else {
    // 没匹配到 kmgSession，则原样保留（后面会通过接口验证）
    parts.push(s.replace(/;\s*$/, ''));
  }
  return parts.join('; ');
}

/* 当前生效的 Cookie：插件参数优先，其次本地保存 */
function currentCookie() {
  var fromArg = normalizeCookie(arg('cookie', ''));
  if (fromArg) return { value: fromArg, source: 'arg' };
  var saved = storeGet(K_COOKIE);
  if (saved) return { value: saved, source: storeGet(K_SRC) || 'store' };
  return { value: '', source: 'none' };
}

/* ============================ 签到 ============================ */

function apiHeaders(cookie) {
  return {
    'Accept': '*/*',
    'Accept-Language': 'zh-Hans;q=0.9,zh-TW;q=0.8,en;q=0.7',
    'Content-Type': 'application/json',
    'Origin': 'https://h5.meruki.cn',
    'Referer': 'https://h5.meruki.cn/',
    'Cookie': cookie,
    'User-Agent': UA
  };
}

/* 查询签到状态（同时校验 Cookie 是否有效） */
function fetchConfig(cookie, cb) {
  $httpClient.get({
    url: API_CONFIG,
    headers: apiHeaders(cookie),
    timeout: 15000,
    'auto-redirect': true
  }, function (err, resp, data) {
    if (err) return cb({ ok: false, reason: '网络请求失败：' + err });
    if (resp && resp.status && resp.status !== 200) {
      return cb({ ok: false, reason: '接口返回 HTTP ' + resp.status });
    }
    var j = safeJSON(data);
    if (!j) {
      return cb({ ok: false, reason: '返回内容无法解析（登录态可能已失效）', raw: String(data || '').slice(0, 160) });
    }
    if (j.code !== 200) {
      return cb({ ok: false, reason: '接口错误 code=' + j.code + (j.msg ? ' ' + j.msg : ''), needCookie: true });
    }
    var d = j.data || {};
    cb({
      ok: true,
      signedToday: !!d.is_signin,
      point: (d.point !== undefined && d.point !== null) ? d.point : null
    });
  });
}

/* 完整签到流程：查状态 → 未签到则签到 */
function doSignin(cb) {
  var ck = currentCookie();
  if (!ck.value) {
    return cb({ ok: false, reason: '还没有拿到登录 Cookie', needCookie: true });
  }

  fetchConfig(ck.value, function (st) {
    if (!st.ok) {
      return cb({ ok: false, reason: st.reason, needCookie: st.needCookie, raw: st.raw });
    }
    if (st.signedToday) {
      return cb({ ok: true, already: true, point: st.point });
    }

    $httpClient.post({
      url: API_SIGNIN,
      headers: apiHeaders(ck.value),
      body: '',
      timeout: 15000
    }, function (err2, resp2, data2) {
      if (err2) return cb({ ok: false, reason: '签到请求失败：' + err2 });
      if (resp2 && resp2.status && resp2.status !== 200) {
        return cb({ ok: false, reason: '签到接口返回 HTTP ' + resp2.status, needCookie: true });
      }
      var j = safeJSON(data2);
      if (!j) return cb({ ok: false, reason: '签到返回无法解析', raw: String(data2 || '').slice(0, 160) });
      if (j.code !== 200) {
        return cb({ ok: false, reason: '签到失败 code=' + j.code + (j.msg ? ' ' + j.msg : ''), needCookie: true });
      }
      var d = j.data || {};
      cb({
        ok: true,
        already: false,
        point: (d.point !== undefined && d.point !== null) ? d.point : null,
        gain: (d.reward_point !== undefined && d.reward_point !== null) ? d.reward_point : null,
        rewardMsg: d.msg || '',
        title: d.title || '',
        content: d.content || ''
      });
    });
  });
}

/* 把签到结果压成一句人话 */
function resultText(r) {
  if (!r) return '没有结果';
  if (!r.ok) return r.reason || '未知错误';
  if (r.already) return '今天已经签过了，累计 ' + (r.point === null ? '—' : r.point) + ' 积分';
  var t = '签到成功，+' + (r.gain === null || r.gain === undefined ? '?' : r.gain) + ' 积分';
  if (r.point !== null && r.point !== undefined) t += '，累计 ' + r.point + ' 积分';
  return t;
}

/* ============================ 通知 ============================ */

function notify(title, sub, body, openUrl) {
  try {
    if (openUrl) {
      $notification.post(title, sub, body, { openUrl: openUrl });
    } else {
      $notification.post(title, sub, body);
    }
  } catch (e) { }
}

function saveLastResult(r) {
  storeSet(K_LAST, JSON.stringify({
    t: Date.now(),
    ok: !!r.ok,
    already: !!r.already,
    point: r.point,
    gain: r.gain,
    reason: r.reason || '',
    text: resultText(r)
  }));
}

/* ============================ 定时任务 ============================ */

/* 本机日期 YYYY-MM-DD，用来做"一天只推一次"的判定 */
function todayStr() {
  var d = new Date();
  function p(x) { return x < 10 ? '0' + x : '' + x; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function runCron() {
  var today = todayStr();

  doSignin(function (r) {
    saveLastResult(r);

    if (arg('notify', true)) {
      if (r.ok && r.already) {
        // 已经签过就不重复打扰，一天最多提醒一次
        if (storeGet(K_NOTIFY) !== today) {
          notify('挖煤姬 · 签到', '今天已签到', resultText(r));
          storeSet(K_NOTIFY, today);
        }
      } else if (r.ok) {
        var body = resultText(r);
        if (r.title) body += '\n' + r.title;
        if (r.content) body += '\n' + r.content;
        notify('挖煤姬 · 签到成功', '+' + (r.gain === null || r.gain === undefined ? '?' : r.gain) + ' 积分', body);
        storeSet(K_NOTIFY, today);
      } else {
        notify('挖煤姬 · 签到失败', r.reason || '未知错误',
          r.needCookie ? '点此打开控制台更新登录 Cookie' : '稍后 Loon 会再试一次',
          r.needCookie ? 'https://app.meruki.cn' + PANEL : null);
      }
    }

    log('cron done', resultText(r));
    $done();
  });
}

/* ============================ 请求阶段：抓 Cookie + 控制台 ============================ */

function captureCookie(headers) {
  var raw = '';
  if (headers) {
    for (var k in headers) {
      if (String(k).toLowerCase() === 'cookie') { raw = headers[k]; break; }
    }
  }
  var ck = pickSessionCookie(raw);
  if (!ck) return;

  var dev = (String(raw).match(/deviceId=[^;\s]+/) || [''])[0];
  var full = dev ? ck + '; ' + dev : ck;

  var old = storeGet(K_COOKIE);
  var oldSrc = storeGet(K_SRC);
  if (old === full) return;

  // 插件参数里手填了 Cookie 时，不覆盖它的优先级，但照样记录一份最新的
  storeSet(K_COOKIE, full);
  storeSet(K_TIME, String(Date.now()));
  storeSet(K_SRC, 'auto');

  if (!old && oldSrc !== 'manual') {
    notify('挖煤姬 · 已自动获取登录态', 'Cookie 已保存', '后续每天会自动签到；如需更换账号，打开控制台 ' + 'https://app.meruki.cn' + PANEL);
  }
  log('cookie captured, len=' + full.length);
}

/* 开屏广告的几种可能命名，宁可多匹配不要漏 */
var SPLASH_RE = /(GetOpenAd|OpenAd|SplashAd|StartAd|OpenScreen|GetAppOpenAd|LaunchAd)/i;

/* 直接吐给 App 的"没有广告"响应，字段照抄线上返回的结构 */
function splashPayload() {
  return JSON.stringify({
    code: 200,
    data: {
      Img: '', ImgEn: '', ImgEnUrl: '', ImgZhTW: '', ImgZhTWUrl: '',
      ImgJa: '', ImgJaUrl: '', WaitSecond: 0, Open: false, Url: '',
      StartAt: '', EndAt: ''
    }
  });
}

function onRequest() {
  var url = $request.url || '';

  if (url.indexOf(PANEL) >= 0) {
    return handlePanel(url);
  }

  captureCookie($request.headers);

  /*
   * 开屏广告在【请求阶段】就掐掉：不依赖响应体、不依赖 requires-body、不依赖 gzip 解码，
   * 少一层环节就少一个"偶尔漏掉"的可能，顺带省一次网络往返。
   */
  if (SPLASH_RE.test(url)) {
    if (arg('blockSplash', true)) {
      log('splash blocked at request: ' + url.slice(0, 120));
      return $done({
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: splashPayload()
        }
      });
    }
    return $done({});
  }

  $done({});
}

/* ============================ 响应阶段：去广告（兜底） ============================ */

function onResponse() {
  var url = $request.url || '';
  var body = $response.body;

  if (typeof body !== 'string' || body.length === 0) {
    return $done({});
  }

  /* --- 开屏广告（请求阶段没拦住时的兜底） --- */
  if (SPLASH_RE.test(url)) {
    if (!arg('blockSplash', true)) return $done({});
    var o = safeJSON(body);
    if (!o || typeof o !== 'object') return $done({});
    o.data = {
      Img: '', ImgEn: '', ImgEnUrl: '', ImgZhTW: '', ImgZhTWUrl: '',
      ImgJa: '', ImgJaUrl: '', WaitSecond: 0, Open: false, Url: '',
      StartAt: '', EndAt: ''
    };
    log('openAd blocked (response)');
    return $done({ body: JSON.stringify(o) });
  }

  /* --- 首页广告位 / 轮播图 --- */
  if (/Sig\.Front\.SubSite\.AppMercari\.GetHomeInfoV2/i.test(url)) {
    var j = safeJSON(body);
    if (!j || !j.data) return $done({});

    var changed = false;

    if (arg('blockHomeAd', true) && Array.isArray(j.data.ads) && j.data.ads.length > 0) {
      j.data.ads = [];
      changed = true;
    }

    if (arg('blockBanner', false)) {
      var keys = ['banners0', 'banners1', 'banners2', 'banners3'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(j.data[keys[i]]) && j.data[keys[i]].length > 0) {
          j.data[keys[i]] = [];
          changed = true;
        }
      }
    }

    if (!changed) return $done({});
    log('home ads cleaned');
    return $done({ body: JSON.stringify(j) });
  }

  $done({});
}

/* ============================ 控制台（网页） ============================ */

function parseQuery(q) {
  var out = {};
  if (!q) return out;
  var arr = q.split('&');
  for (var i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    var idx = arr[i].indexOf('=');
    var k = idx < 0 ? arr[i] : arr[i].slice(0, idx);
    var v = idx < 0 ? '' : arr[i].slice(idx + 1);
    try {
      out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch (e) {
      out[k] = v;
    }
  }
  return out;
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(ts) {
  var n = Number(ts);
  if (!n) return '—';
  var d = new Date(n);
  function p(x) { return x < 10 ? '0' + x : '' + x; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function maskCookie(ck) {
  if (!ck) return '未设置';
  var main = String(ck).split(';')[0];
  if (main.length <= 24) return main;
  return main.slice(0, 14) + '…' + main.slice(-6);
}

function sourceLabel(src) {
  if (src === 'arg') return '插件参数';
  if (src === 'manual') return '控制台保存';
  if (src === 'auto') return '自动抓取';
  if (src === 'store') return '本地保存';
  return '未设置';
}

function respond(htmlStr) {
  $done({
    response: {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      },
      body: htmlStr
    }
  });
}

function page(msg) {
  var ck = currentCookie();
  var timeStr = fmtTime(storeGet(K_TIME));
  var lastRaw = storeGet(K_LAST);
  var last = null;
  if (lastRaw) { try { last = JSON.parse(lastRaw); } catch (e) { last = null; } }

  var argCookie = normalizeCookie(arg('cookie', ''));
  var warn = '';
  if (argCookie) {
    warn = '<div class="banner warn">检测到插件参数里填了 Cookie，它的优先级高于本页面保存的值。'
      + '想用这里的按钮管理登录态，请先到 Loon → 插件 → 本插件 → 参数里把 Cookie 清空。</div>';
  }

  var banner = '';
  if (msg && msg.text) {
    banner = '<div class="banner ' + (msg.type === 'err' ? 'err' : (msg.type === 'warn' ? 'warn' : 'ok')) + '">'
      + esc(msg.text) + '</div>';
  }

  var detail = '';
  if (msg && msg.detail) {
    detail = '<div class="banner info">' + esc(msg.detail) + '</div>';
  }

  var lastLine = '暂无记录';
  if (last) {
    lastLine = esc(last.text || '') + '<span class="muted"> · ' + esc(fmtTime(last.t)) + '</span>';
  }

  var html = ''
    + '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>挖煤姬 · Loon 控制台</title>'
    + '<style>'
    + ':root{color-scheme:light dark}'
    + '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}'
    + 'body{margin:0;padding:22px 16px 48px;font:15px/1.55 -apple-system,"PingFang SC","Helvetica Neue",sans-serif;background:#f2f3f5;color:#15171a}'
    + '@media (prefers-color-scheme:dark){body{background:#0d0e11;color:#f2f3f5}'
    + '.card{background:#191b20!important;border-color:#2a2d34!important}'
    + '.k{color:#8b909a!important}.muted{color:#7c818b!important}'
    + 'textarea{background:#0f1114!important;color:#f2f3f5!important;border-color:#2a2d34!important}'
    + '.btn.ghost{background:#232730!important;color:#f2f3f5!important}}'
    + 'h1{font-size:20px;margin:0 0 2px;font-weight:700;letter-spacing:.2px}'
    + 'h1 span{font-size:12px;font-weight:500;color:#8b909a;margin-left:6px}'
    + '.sub{font-size:12px;color:#8b909a;margin:0 0 18px}'
    + '.card{background:#fff;border:1px solid #e6e8ec;border-radius:16px;padding:16px;margin-bottom:14px}'
    + '.row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:14px;border-bottom:1px dashed rgba(128,128,128,.18)}'
    + '.row:last-child{border-bottom:0}'
    + '.k{color:#6b7280;flex:none}'
    + '.v{text-align:right;word-break:break-all;font-variant-numeric:tabular-nums}'
    + '.btn{display:block;text-align:center;padding:13px;border-radius:13px;background:#ff6b35;color:#fff;'
    + 'text-decoration:none;font-weight:600;border:0;width:100%;font-size:15px;margin-top:10px;cursor:pointer}'
    + '.btn.ghost{background:#eef0f4;color:#15171a}'
    + '.banner{border-radius:12px;padding:11px 13px;font-size:13.5px;margin-bottom:12px;line-height:1.5;white-space:pre-line}'
    + '.banner.ok{background:rgba(22,163,74,.12);color:#15803d}'
    + '.banner.err{background:rgba(220,38,38,.12);color:#dc2626}'
    + '.banner.warn{background:rgba(234,179,8,.16);color:#a16207}'
    + '.banner.info{background:rgba(59,130,246,.12);color:#2563eb}'
    + '@media (prefers-color-scheme:dark){.banner.ok{color:#4ade80}.banner.err{color:#f87171}.banner.warn{color:#fbbf24}.banner.info{color:#93c5fd}}'
    + 'textarea{width:100%;min-height:118px;padding:11px;border-radius:12px;border:1px solid #dfe2e8;'
    + 'font:12.5px/1.5 ui-monospace,Menlo,monospace;resize:vertical}'
    + 'label.t{display:block;font-size:13px;font-weight:600;margin:2px 0 8px}'
    + '.muted{color:#8b909a;font-size:12px}'
    + '.foot{text-align:center;font-size:11.5px;color:#9aa0aa;margin-top:18px}'
    + '</style></head><body>'

    + '<h1>挖煤姬<span>Loon 控制台</span></h1>'
    + '<p class="sub">签到 · 去广告 · 登录态管理</p>'

    + banner + detail + warn

    + '<div class="card">'
    + '<div class="row"><span class="k">登录态来源</span><span class="v">' + esc(sourceLabel(ck.source)) + '</span></div>'
    + '<div class="row"><span class="k">Cookie</span><span class="v">' + esc(maskCookie(ck.value)) + '</span></div>'
    + '<div class="row"><span class="k">保存时间</span><span class="v">' + esc(timeStr) + '</span></div>'
    + '<div class="row"><span class="k">上次签到</span><span class="v">' + lastLine + '</span></div>'
    + '</div>'

    + '<div class="card">'
    + '<a class="btn" href="?do=signin">立即签到</a>'
    + '<a class="btn ghost" href="?do=check">检测登录态 / 今日状态</a>'
    + '<a class="btn ghost" href="?do=clear">清除已保存的 Cookie</a>'
    + '</div>'

    + '<div class="card">'
    + '<label class="t">更新登录 Cookie</label>'
    + '<form method="get" action="">'
    + '<input type="hidden" name="do" value="save">'
    + '<textarea name="ck" placeholder="粘贴抓包里的 Cookie 整行即可，脚本会自动挑出 kmgSession…= 这一段&#10;例如：kmgSessionNO03HxWh=xxxxxx; deviceId=xxxx">' + '</textarea>'
    + '<button class="btn" type="submit">保存 Cookie</button>'
    + '</form>'
    + '<p class="muted" style="margin:12px 0 0">只要开着 Loon 正常用一次 App，Cookie 就会自动保存，通常不需要手动填。</p>'
    + '</div>'

    + '<p class="foot">本页面由 Loon 脚本本地生成<br>不经过挖煤姬服务器</p>'
    + '</body></html>';

  return html;
}

function handlePanel(url) {
  var qi = url.indexOf('?');
  var q = qi >= 0 ? url.slice(qi + 1) : '';
  var p = parseQuery(q);
  var act = p.do || '';

  if (act === 'save') {
    var ck = normalizeCookie(p.ck);
    if (!ck) {
      return respond(page({ type: 'err', text: '没识别到有效的 Cookie，请把整行 Cookie 粘进输入框再保存。' }));
    }
    storeSet(K_COOKIE, ck);
    storeSet(K_TIME, String(Date.now()));
    storeSet(K_SRC, 'manual');
    log('cookie saved manually, len=' + ck.length);
    return respond(page({ type: 'ok', text: 'Cookie 已保存（' + ck.length + ' 字符）。可以点「检测登录态」验证一下。' }));
  }

  if (act === 'clear') {
    storeDel(K_COOKIE);
    storeDel(K_TIME);
    storeDel(K_SRC);
    return respond(page({ type: 'ok', text: '已清除本地保存的 Cookie。' }));
  }

  if (act === 'check') {
    var c = currentCookie();
    if (!c.value) {
      return respond(page({ type: 'err', text: '本地还没有 Cookie：先用 App 走一次（Loon 开启），或手动粘贴保存。' }));
    }
    return fetchConfig(c.value, function (st) {
      if (!st.ok) {
        return respond(page({
          type: 'err',
          text: '登录态无效：' + (st.reason || '未知原因'),
          detail: st.raw ? ('返回片段：' + st.raw) : ''
        }));
      }
      return respond(page({
        type: st.signedToday ? 'ok' : 'warn',
        text: st.signedToday
          ? ('登录态正常；今天已签到，累计 ' + (st.point === null ? '—' : st.point) + ' 积分。')
          : ('登录态正常；今天还没签到，累计 ' + (st.point === null ? '—' : st.point) + ' 积分。')
      }));
    });
  }

  if (act === 'signin') {
    return doSignin(function (r) {
      saveLastResult(r);
      var detail = '';
      if (r.ok && !r.already) {
        var lines = [];
        if (r.title) lines.push(r.title);
        if (r.content) lines.push(r.content);
        detail = lines.join('\n');
      }
      return respond(page({
        type: r.ok ? (r.already ? 'warn' : 'ok') : 'err',
        text: resultText(r),
        detail: detail || (r.raw ? ('返回片段：' + r.raw) : '')
      }));
    });
  }

  return respond(page(null));
}

/* ============================ 入口分派 ============================ */

(function main() {
  if (typeof $response !== 'undefined' && $response) {
    return onResponse();
  }
  if (typeof $request !== 'undefined' && $request) {
    return onRequest();
  }
  return runCron();
})();
