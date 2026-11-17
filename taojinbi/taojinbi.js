/*
 * 淘金币（淘宝）自动签到 · Loon 脚本  v1.0
 * ---------------------------------------------------------------------------
 * 接口来自淘金币前端包（@ali/pegasus-project-taocoin-home@2.6.55）反查：
 *
 *   查询：mtop.coingame.sign.calendar.pure      v=1.0
 *   签到：mtop.coingame.sign.calendar.refresh   v=6.0  needLogin
 *   补签：mtop.coingame.sign.supply / mtop.coingame.supsigncard.check（本脚本没用到）
 *
 *   公共 data： { bizCode:"taoCoin", subBizCode:"coinTown", asac:"2A21B017LSI0KGN210C6D7" }
 *
 * 鉴权：淘宝 H5 mtop 的老规矩 —— Cookie + _m_h5_tk 令牌 + md5 签名
 *   sign = md5( token + "&" + t + "&" + appKey + "&" + data )
 *   token 取自 Cookie 里 _m_h5_tk 的下划线前半段，失效时响应会带新的 _m_h5_tk
 *
 * 控制台：浏览器打开 https://h5api.m.taobao.com/__loon__  （需 Loon + MITM 已开启）
 * ---------------------------------------------------------------------------
 */

/* ============================ 常量 ============================ */

var K_COOKIE = 'tb_cookie';
var K_TIME   = 'tb_cookie_time';
var K_LAST   = 'tb_last_result';
var K_NOTIFY = 'tb_notified_date';

var PANEL   = '/__loon__';
var APPKEY  = '12574478';                 // 淘宝 H5 通用 appKey
var H5API   = 'https://h5api.m.taobao.com/h5/';
var REFERER = 'https://pages-fast.m.taobao.com/';

var API_PURE    = 'mtop.coingame.sign.calendar.pure';
var API_SIGN    = 'mtop.coingame.sign.calendar.refresh';

/* 淘金币活动标识，前端包里写死的 */
var ASAC = '2A21B017LSI0KGN210C6D7';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AliApp(TB/10.69.0) WindVane/8.7.2 UT4Aplus/0.0.4 1179x2556 Themis/8.8.8 WK Themis/8.8.8';

/* ============================ MD5 ============================ */

/* 纯 JS MD5（Loon 运行时没有内置摘要函数，自己带一份） */
function md5(input) {
  var str = utf8Encode(String(input));
  return binl2hex(coreMD5(str2binl(str), str.length * 8));
}

function utf8Encode(str) {
  var out = '', i, c;
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0x800) {
      out += String.fromCharCode(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var c2 = str.charCodeAt(i + 1);
      var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out += String.fromCharCode(
        0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)
      );
      i++;
    } else {
      out += String.fromCharCode(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function str2binl(str) {
  var bin = [], i;
  for (i = 0; i < str.length * 8; i += 8) {
    bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << (i % 32);
  }
  return bin;
}

function coreMD5(x, len) {
  // 先把补齐后的所有字填成 0：稀疏数组的空洞会让 "undefined + 常量" 变 NaN，
  // 而 NaN & 0xFFFFFFFF = 0，会把那一步的常量也一起吃掉。
  var total = ((len + 64) >>> 9 << 4) + 16, i;
  for (i = 0; i < total; i++) {
    if (typeof x[i] !== 'number') x[i] = 0;
  }

  x[len >> 5] |= 0x80 << (len % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  for (i = 0; i < total; i += 16) {
    var olda = a, oldb = b, oldc = c, oldd = d;

    a = ff(a, b, c, d, x[i], 7, -680876936);
    d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, x[i + 5], 4, -378558);
    d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = hh(d, a, b, c, x[i], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = ii(a, b, c, d, x[i], 6, -198630844);
    d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = add32(a, olda);
    b = add32(b, oldb);
    c = add32(c, oldc);
    d = add32(d, oldd);
  }
  return [a, b, c, d];
}

function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

function cmn(q, a, b, x, s, t) {
  a = add32(add32(a, q), add32(x, t));
  return add32(rol(a, s), b);
}

function rol(n, c) { return (n << c) | (n >>> (32 - c)); }

function add32(a, b) { return (a + b) & 0xFFFFFFFF; }

function binl2hex(bin) {
  var hex = '0123456789abcdef', out = '', i, j;
  for (i = 0; i < bin.length * 4; i++) {
    out += hex.charAt((bin[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) +
           hex.charAt((bin[i >> 2] >> ((i % 4) * 8)) & 0xF);
  }
  return out;
}

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
    console.log('[taojinbi] ' + arr.join(' '));
  } catch (e) { }
}

function safeJSON(s) {
  if (!s) return null;
  if (typeof s === 'object') {
    try { s = String.fromCharCode.apply(null, s); } catch (e) { return null; }
  }
  s = String(s);
  var i = s.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch (e) { return null; }
}

function todayStr() {
  var d = new Date();
  function p(x) { return x < 10 ? '0' + x : '' + x; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ============================ Cookie ============================ */

function normalizeCookie(input) {
  var s = String(input || '').replace(/\r?\n/g, ' ').trim();
  s = s.replace(/^cookie\s*:\s*/i, '');
  return s.replace(/;\s*$/, '');
}

function currentCookie() {
  var fromArg = normalizeCookie(arg('cookie', ''));
  if (fromArg) return { value: fromArg, source: 'arg' };
  var saved = storeGet(K_COOKIE);
  if (saved) return { value: saved, source: 'store' };
  return { value: '', source: 'none' };
}

/* Cookie 里取 _m_h5_tk 的 token 段（下划线前） */
function tokenOf(cookie) {
  var m = String(cookie).match(/_m_h5_tk=([^;]+)/);
  if (!m) return '';
  var v = m[1];
  var i = v.indexOf('_');
  return i > 0 ? v.slice(0, i) : '';
}

/* 用响应里的 Set-Cookie 更新本地 cookie 中的 _m_h5_tk / _m_h5_tk_enc */
function mergeSetCookie(cookie, setCookie) {
  if (!setCookie) return cookie;
  var sc = String(setCookie);
  var out = String(cookie);
  var names = ['_m_h5_tk', '_m_h5_tk_enc'];
  for (var i = 0; i < names.length; i++) {
    var re = new RegExp(names[i] + '=([^;,\\s]+)');
    var m = sc.match(re);
    if (!m) continue;
    var pair = names[i] + '=' + m[1];
    if (new RegExp('(^|;\\s*)' + names[i] + '=').test(out)) {
      out = out.replace(new RegExp('(^|;\\s*)' + names[i] + '=[^;]*'), '$1' + pair);
    } else {
      out += '; ' + pair;
    }
  }
  return out;
}

/* ============================ mtop 调用 ============================ */

function mtopUrl(api, v, dataStr, token, t) {
  var sign = md5(token + '&' + t + '&' + APPKEY + '&' + dataStr);
  return H5API + api + '/' + v + '/'
    + '?jsv=2.7.2'
    + '&appKey=' + APPKEY
    + '&t=' + t
    + '&sign=' + sign
    + '&api=' + api
    + '&v=' + v
    + '&type=originaljson'
    + '&dataType=json'
    + '&H5Request=true'
    + '&AntiCreep=true'
    + '&AntiFlood=true'
    + '&data=' + encodeURIComponent(dataStr);
}

function mtopHeaders(cookie) {
  return {
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Origin': 'https://pages-fast.m.taobao.com',
    'Referer': REFERER,
    'Cookie': cookie,
    'User-Agent': UA
  };
}

function retIsOk(j) {
  var ret = j && j.ret;
  if (!ret || !ret.length) return !!(j && j.data);
  return String(ret[0]).indexOf('SUCCESS') === 0;
}

function retText(j) {
  if (!j) return '';
  if (j.ret && j.ret.length) return String(j.ret[0]);
  return '';
}

/*
 * 调一次 mtop；遇到令牌失效自动用响应里的新 token 重试一次
 * opt: { retried:Boolean, cookie:{value,source} }  —— 重试时把新 Cookie 传回来
 */
function mtopCall(api, v, dataObj, cb, opt) {
  opt = opt || {};
  var ck = opt.cookie || currentCookie();
  if (!ck.value) {
    return cb({ ok: false, reason: '还没有拿到淘宝 Cookie', needCookie: true });
  }

  var dataStr = JSON.stringify(dataObj);
  var token = tokenOf(ck.value);
  var t = String(Date.now());
  var url = mtopUrl(api, v, dataStr, token, t);

  $httpClient.get({
    url: url,
    headers: mtopHeaders(ck.value),
    timeout: 20000,
    'auto-redirect': false
  }, function (err, resp, data) {
    if (err) return cb({ ok: false, reason: '网络请求失败：' + err });

    var body = data;
    var j = safeJSON(body);

    /* 令牌失效 / 为空：响应会带新的 _m_h5_tk，换一个再试一次 */
    var rt = retText(j);
    if (!opt.retried && /TOKEN_EMPTY|TOKEN_EXOIRED|TOKEN_EXPIRED|TOKEN_ILLEGAL|令牌/i.test(rt)) {
      var sc = (resp && resp.headers) ? (resp.headers['Set-Cookie'] || resp.headers['set-cookie'] || '') : '';
      var merged = mergeSetCookie(ck.value, sc);
      if (tokenOf(merged) && tokenOf(merged) !== token) {
        if (ck.source === 'store') {
          storeSet(K_COOKIE, merged);
          storeSet(K_TIME, String(Date.now()));
        }
        log('token refreshed, retry');
        return mtopCall(api, v, dataObj, cb, { retried: true, cookie: { value: merged, source: ck.source } });
      }
    }

    if (!j) {
      return cb({ ok: false, reason: '返回不是 JSON（可能是登录页/风控页）', raw: String(body || '').slice(0, 200) });
    }
    if (!retIsOk(j)) {
      return cb({
        ok: false,
        reason: '接口返回：' + (rt || '未知'),
        ret: rt,
        needCookie: /TOKEN|SESSION|LOGIN|NOT_LOGIN|USER_VALIDATE|ILLEGAL/i.test(rt)
      });
    }
    cb({ ok: true, json: j, model: (j.data && j.data.model) || null });
  });
}

/* ============================ 签到 ============================ */

/* 查签到状态：mtop.coingame.sign.calendar.pure */
function queryState(cb) {
  mtopCall(API_PURE, '1.0', {
    bizCode: 'taoCoin',
    subBizCode: 'coinTown',
    asac: ASAC
  }, function (r) {
    if (!r.ok) return cb(r);
    var m = r.model || {};
    cb({
      ok: true,
      signed: !!(m.isTodaySigned || m.isUserSigned),
      days: m.consecutiveSignCount || m.continuousSignDay || null,
      model: m
    });
  });
}

/* 签到：mtop.coingame.sign.calendar.refresh */
function doSign(cb) {
  mtopCall(API_SIGN, '6.0', {
    bizCode: 'taoCoin',
    subBizCode: 'coinTown',
    asac: ASAC,
    params: '{}'
  }, function (r) {
    if (!r.ok) return cb(r);
    var m = r.model || {};
    var code = m.resultCode || '';
    if (code && code !== 'SUCCESS' && code !== 0) {
      return cb({ ok: false, reason: '签到未成功：' + (m.resultMsg || code), model: m });
    }
    cb({ ok: true, model: m });
  });
}

/* 完整流程：查 → 没签则签 → 再查一次确认 */
function runSignin(cb) {
  var ck = currentCookie();
  if (!ck.value) return cb({ ok: false, reason: '还没有拿到淘宝 Cookie', needCookie: true });

  queryState(function (st) {
    if (!st.ok) return cb(st);

    if (st.signed) {
      return cb({ ok: true, already: true, days: st.days, model: st.model });
    }

    doSign(function (sr) {
      if (!sr.ok) return cb(sr);

      // 签完再查一次，用服务端状态确认真的签上了
      queryState(function (after) {
        if (after.ok && after.signed) {
          return cb({ ok: true, already: false, days: after.days, model: after.model });
        }
        return cb({
          ok: false,
          reason: '签到请求已发出，但复查仍是未签状态',
          model: sr.model
        });
      });
    });
  });
}

function resultText(r) {
  if (!r) return '没有结果';
  if (!r.ok) return r.reason || '未知错误';
  var d = (r.days ? '连签 ' + r.days + ' 天' : '');
  if (r.already) return '今天已经签过了' + (d ? '，' + d : '');
  return '签到成功' + (d ? '，' + d : '');
}

function saveLast(r) {
  storeSet(K_LAST, JSON.stringify({
    t: Date.now(),
    ok: !!r.ok,
    already: !!r.already,
    days: r.days,
    reason: r.reason || '',
    text: resultText(r)
  }));
}

function notify(title, sub, body, openUrl) {
  try {
    if (openUrl) $notification.post(title, sub, body, { openUrl: openUrl });
    else $notification.post(title, sub, body);
  } catch (e) { }
}

/* ============================ 定时任务 ============================ */

function runCron() {
  var today = todayStr();

  runSignin(function (r) {
    saveLast(r);

    if (arg('notify', true)) {
      if (r.ok && r.already) {
        if (storeGet(K_NOTIFY) !== today) {
          notify('淘金币 · 签到', '今天已签到', resultText(r));
          storeSet(K_NOTIFY, today);
        }
      } else if (r.ok) {
        notify('淘金币 · 签到成功', r.days ? '连签 ' + r.days + ' 天' : '打卡完成', resultText(r));
        storeSet(K_NOTIFY, today);
      } else {
        notify('淘金币 · 签到失败', r.reason || '未知错误',
          r.needCookie ? '点此打开控制台更新淘宝 Cookie' : '稍后 Loon 会再试一次',
          r.needCookie ? 'https://h5api.m.taobao.com' + PANEL : null);
      }
    }

    log('cron done:', resultText(r));
    $done();
  });
}

/* ============================ 请求阶段 ============================ */

function captureCookie(headers) {
  var raw = '';
  if (headers) {
    for (var k in headers) {
      if (String(k).toLowerCase() === 'cookie') { raw = headers[k]; break; }
    }
  }
  if (!raw) return;
  // 只要带 _m_h5_tk 的才是有登录态的请求
  if (String(raw).indexOf('_m_h5_tk=') < 0 && String(raw).indexOf('cookie2=') < 0) return;

  var ck = normalizeCookie(raw);
  if (storeGet(K_COOKIE) === ck) return;

  storeSet(K_COOKIE, ck);
  storeSet(K_TIME, String(Date.now()));
  log('cookie captured, len=' + ck.length);
}

function onRequest() {
  var url = $request.url || '';

  if (url.indexOf(PANEL) >= 0) {
    return handlePanel(url);
  }

  captureCookie($request.headers);
  $done({});
}

/* ============================ 控制台 ============================ */

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
    } catch (e) { out[k] = v; }
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
  var s = String(ck);
  return s.length <= 40 ? s : (s.slice(0, 24) + '…' + s.slice(-8) + '（' + s.length + ' 字符）');
}

function sourceLabel(src) {
  if (src === 'arg') return '插件参数';
  if (src === 'store') return '本地保存';
  return '未设置';
}

function respond(htmlStr) {
  $done({
    response: {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: htmlStr
    }
  });
}

function page(msg) {
  var ck = currentCookie();
  var timeout = tokenOf(ck.value) ? esc(tokenOf(ck.value)) : '<span style="color:#dc2626">缺失（Cookie 不完整）</span>';

  var lastRaw = storeGet(K_LAST);
  var last = null;
  if (lastRaw) { try { last = JSON.parse(lastRaw); } catch (e) { last = null; } }

  var argCookie = normalizeCookie(arg('cookie', ''));
  var warn = argCookie
    ? '<div class="banner warn">插件参数里填了 Cookie，优先级高于本页面保存的值。想用这里的按钮管理，先把参数清空。</div>'
    : '';

  var banner = '';
  if (msg && msg.text) {
    banner = '<div class="banner ' + (msg.type === 'err' ? 'err' : (msg.type === 'warn' ? 'warn' : 'ok')) + '">'
      + esc(msg.text) + '</div>';
  }
  var detail = (msg && msg.detail) ? '<div class="banner info">' + esc(msg.detail) + '</div>' : '';

  var lastLine = last
    ? esc(last.text || '') + '<span class="muted"> · ' + esc(fmtTime(last.t)) + '</span>'
    : '暂无记录';

  var html = ''
    + '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>淘金币 · Loon 控制台</title><style>'
    + ':root{color-scheme:light dark}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}'
    + 'body{margin:0;padding:22px 16px 48px;font:15px/1.55 -apple-system,"PingFang SC",sans-serif;background:#f2f3f5;color:#15171a}'
    + '@media (prefers-color-scheme:dark){body{background:#0d0e11;color:#f2f3f5}'
    + '.card{background:#191b20!important;border-color:#2a2d34!important}.k{color:#8b909a!important}'
    + '.muted{color:#7c818b!important}textarea{background:#0f1114!important;color:#f2f3f5!important;border-color:#2a2d34!important}'
    + '.btn.ghost{background:#232730!important;color:#f2f3f5!important}}'
    + 'h1{font-size:20px;margin:0 0 2px;font-weight:700}h1 span{font-size:12px;font-weight:500;color:#8b909a;margin-left:6px}'
    + '.sub{font-size:12px;color:#8b909a;margin:0 0 18px}'
    + '.card{background:#fff;border:1px solid #e6e8ec;border-radius:16px;padding:16px;margin-bottom:14px}'
    + '.row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:14px;border-bottom:1px dashed rgba(128,128,128,.18)}'
    + '.row:last-child{border-bottom:0}.k{color:#6b7280;flex:none}'
    + '.v{text-align:right;word-break:break-all;font-variant-numeric:tabular-nums}'
    + '.btn{display:block;text-align:center;padding:13px;border-radius:13px;background:#ff5000;color:#fff;'
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

    + '<h1>淘金币<span>Loon 控制台</span></h1>'
    + '<p class="sub">自动签到 · 登录态管理</p>'

    + banner + detail + warn

    + '<div class="card">'
    + '<div class="row"><span class="k">Cookie 来源</span><span class="v">' + esc(sourceLabel(ck.source)) + '</span></div>'
    + '<div class="row"><span class="k">Cookie</span><span class="v">' + esc(maskCookie(ck.value)) + '</span></div>'
    + '<div class="row"><span class="k">令牌 _m_h5_tk</span><span class="v">' + timeout + '</span></div>'
    + '<div class="row"><span class="k">保存时间</span><span class="v">' + esc(fmtTime(storeGet(K_TIME))) + '</span></div>'
    + '<div class="row"><span class="k">上次签到</span><span class="v">' + lastLine + '</span></div>'
    + '</div>'

    + '<div class="card">'
    + '<a class="btn" href="?do=signin">立即签到</a>'
    + '<a class="btn ghost" href="?do=check">检测登录态 / 今日状态</a>'
    + '<a class="btn ghost" href="?do=clear">清除已保存的 Cookie</a>'
    + '</div>'

    + '<div class="card">'
    + '<label class="t">更新淘宝 Cookie</label>'
    + '<form method="get" action="">'
    + '<input type="hidden" name="do" value="save">'
    + '<textarea name="ck" placeholder="粘贴任意一条 h5api.m.taobao.com 请求的 Cookie 整行&#10;必须包含 _m_h5_tk= 与 cookie2="></textarea>'
    + '<button class="btn" type="submit">保存 Cookie</button>'
    + '</form>'
    + '<p class="muted" style="margin:12px 0 0">开着 Loon 用一次淘宝 H5 页面就会自动抓到，一般不用手动填。</p>'
    + '</div>'

    + '<p class="foot">本页面由 Loon 脚本本地生成，不经过淘宝服务器</p>'
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
    if (!ck) return respond(page({ type: 'err', text: '没识别到内容，请把整行 Cookie 粘进来。' }));
    storeSet(K_COOKIE, ck);
    storeSet(K_TIME, String(Date.now()));
    var hasToken = tokenOf(ck) ? '' : '（警告：里面没有 _m_h5_tk，可能不是完整 Cookie）';
    return respond(page({ type: 'ok', text: 'Cookie 已保存（' + ck.length + ' 字符）' + hasToken + '，可以点「检测登录态」验证。' }));
  }

  if (act === 'clear') {
    storeDel(K_COOKIE);
    storeDel(K_TIME);
    return respond(page({ type: 'ok', text: '已清除本地保存的 Cookie。' }));
  }

  if (act === 'check') {
    var c = currentCookie();
    if (!c.value) return respond(page({ type: 'err', text: '本地还没有 Cookie：先用淘宝 H5 页面走一次（Loon 开启），或手动粘贴。' }));
    return queryState(function (st) {
      if (!st.ok) {
        return respond(page({
          type: 'err',
          text: '登录态无效：' + (st.reason || '未知原因'),
          detail: st.raw ? ('返回片段：' + st.raw) : ''
        }));
      }
      return respond(page({
        type: st.signed ? 'ok' : 'warn',
        text: st.signed
          ? ('登录态正常；今天已签到' + (st.days ? '，连签 ' + st.days + ' 天' : '') + '。')
          : ('登录态正常；今天还没签' + (st.days ? '，连签 ' + st.days + ' 天' : '') + '。')
      }));
    });
  }

  if (act === 'signin') {
    return runSignin(function (r) {
      saveLast(r);
      return respond(page({
        type: r.ok ? (r.already ? 'warn' : 'ok') : 'err',
        text: resultText(r)
      }));
    });
  }

  return respond(page(null));
}

/* ============================ 入口 ============================ */

(function main() {
  if (typeof $response !== 'undefined' && $response) {
    // 本脚本不改任何响应，直接放行
    return $done({});
  }
  if (typeof $request !== 'undefined' && $request) {
    return onRequest();
  }
  return runCron();
})();
