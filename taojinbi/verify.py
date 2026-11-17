#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
淘金币签到 · 本地验证工具
=============================================================
用来在装 Loon 之前，先在电脑上确认两件事：
  1) 这份 Cookie 到底能不能用（登录态是否有效）
  2) 今天签没签、连签几天
  3) （加 --sign）签到接口 mtop.coingame.sign.calendar.refresh 是不是真的能签上

只用 Python 标准库，不需要 pip install 任何东西。

用法
-------------------------------------------------------------
  # 1. 查询状态（安全，不会产生任何签到动作）
  python3 verify.py --cookie "cookie2=xxxx; unb=2200xxxx; sgcookie=xxxx"

  # 2. Cookie 太长，存文件里（推荐）
  python3 verify.py --file cookie.txt

  # 3. 真的执行一次签到，并复查是否签上
  python3 verify.py --file cookie.txt --sign

Cookie 怎么拿（电脑上，30 秒）
-------------------------------------------------------------
  1. Chrome/Safari 打开 https://www.taobao.com 并登录
  2. F12 → Network（网络）→ 刷新页面 → 点任意一条 taobao.com 的请求
  3. 右侧 Headers → Request Headers → 复制 Cookie 那一整行的值
  4. 粘到 cookie.txt 里（整行粘贴即可，脚本会自己清理）

验证通过的标准
-------------------------------------------------------------
  · 第一步显示「登录态有效」，并且能看到今天是否已签、连签几天
  · 加了 --sign 后显示「复查：已签到」→ 说明 Loon 那边照这个跑就行
  · 如果 --sign 报「签到请求成功但复查仍未签」→ 签到走的是别的接口，
    把这里的完整输出发我，我照着改
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

APPKEY = "12574478"
H5API = "https://h5api.m.taobao.com/h5/"
REFERER = "https://pages-fast.m.taobao.com/"
ASAC = "2A21B017LSI0KGN210C6D7"

API_PURE = "mtop.coingame.sign.calendar.pure"
API_SIGN = "mtop.coingame.sign.calendar.refresh"

UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "AliApp(TB/10.69.0) WindVane/8.7.2 UT4Aplus/0.0.4 1179x2556 "
    "Themis/8.8.8 WK Themis/8.8.8"
)

C_OK = "\033[32m"
C_ERR = "\033[31m"
C_WARN = "\033[33m"
C_DIM = "\033[2m"
C_END = "\033[0m"


def colorize(s, c):
    if sys.stdout.isatty():
        return c + s + C_END
    return s


def clean_cookie(raw):
    """整行 Cookie 粘进来也能用：去前缀、去换行、去尾部多余符号"""
    s = (raw or "").replace("\r", " ").replace("\n", " ").strip()
    if s.lower().startswith("cookie:"):
        s = s[7:]
    return s.strip().strip(";").strip()


def token_of(cookie):
    """_m_h5_tk 下划线前半段就是 token"""
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("_m_h5_tk="):
            v = part[len("_m_h5_tk="):]
            return v.split("_")[0]
    return ""


def merge_set_cookie(cookie, set_cookie):
    """把响应头里新的 _m_h5_tk / _m_h5_tk_enc 合并回 cookie"""
    if not set_cookie:
        return cookie, False
    out = cookie
    changed = False
    for name in ("_m_h5_tk", "_m_h5_tk_enc"):
        idx = set_cookie.find(name + "=")
        if idx < 0:
            continue
        val = set_cookie[idx + len(name) + 1:]
        for sep in (";", ","):
            if sep in val:
                val = val.split(sep)[0]
        val = val.strip()
        if not val:
            continue
        pair = "%s=%s" % (name, val)
        if name + "=" in out:
            # 替换旧值
            pieces = []
            for p in out.split(";"):
                p = p.strip()
                if p.startswith(name + "="):
                    pieces.append(pair)
                elif p:
                    pieces.append(p)
            out = "; ".join(pieces)
        else:
            out = (out + "; " + pair).strip("; ")
        changed = True
    return out, changed


def mtop(api, version, data_obj, cookie, timeout=20, _retried=False):
    """调一次 mtop：算 sign → 发请求 → 令牌失效自动换 token 重试一次"""
    data_str = json.dumps(data_obj, separators=(",", ":"), ensure_ascii=False)
    token = token_of(cookie)
    ts = str(int(time.time() * 1000))
    sign = hashlib.md5(("%s&%s&%s&%s" % (token, ts, APPKEY, data_str)).encode("utf-8")).hexdigest()

    url = (
        H5API + api + "/" + version + "/"
        "?jsv=2.7.2"
        "&appKey=" + APPKEY +
        "&t=" + ts +
        "&sign=" + sign +
        "&api=" + api +
        "&v=" + version +
        "&type=originaljson"
        "&dataType=json"
        "&H5Request=true"
        "&AntiCreep=true"
        "&AntiFlood=true"
        "&data=" + urllib.parse.quote(data_str, safe="")
    )

    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Origin": "https://pages-fast.m.taobao.com",
        "Referer": REFERER,
        "Cookie": cookie,
    })

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            headers = resp.headers
    except urllib.error.HTTPError as e:
        return {"ok": False, "reason": "HTTP %s" % e.code, "raw": str(e)[:200], "cookie": cookie}
    except Exception as e:
        return {"ok": False, "reason": "请求失败：%s" % e, "cookie": cookie}

    try:
        j = json.loads(body)
    except Exception:
        return {"ok": False, "reason": "返回不是 JSON（大概率被风控页拦截）",
                "raw": body[:300], "cookie": cookie}

    ret0 = (j.get("ret") or [""])[0]

    # 令牌为空 / 过期 → 服务器会用 Set-Cookie 下发新的
    if (not _retried) and any(k in ret0 for k in ("TOKEN_EMPTY", "TOKEN_EXOIRED", "TOKEN_EXPIRED", "TOKEN_ILLEGAL")):
        sc = headers.get("Set-Cookie", "") or ""
        merged, changed = merge_set_cookie(cookie, sc)
        if changed and token_of(merged) and token_of(merged) != token:
            print(colorize("  [令牌已刷新，自动重试]", C_DIM))
            return mtop(api, version, data_obj, merged, timeout, _retried=True)

    if not ret0.startswith("SUCCESS"):
        return {"ok": False, "reason": ret0 or "接口未返回 ret", "ret": ret0,
                "json": j, "cookie": cookie}

    return {"ok": True, "json": j, "cookie": cookie, "ret": ret0}


def state_of(j):
    """从 pure 的返回里挑出状态字段"""
    d = (j or {}).get("data") or {}
    m = d.get("model") or d
    return {
        "signed": bool(m.get("isTodaySigned") or m.get("isUserSigned")),
        "days": m.get("consecutiveSignCount") or m.get("continuousSignDay"),
        "coin": m.get("coinNum") or m.get("coin") or m.get("totalCoin"),
        "raw_keys": sorted(m.keys())[:20] if isinstance(m, dict) else [],
    }


def main():
    ap = argparse.ArgumentParser(add_help=True, description="淘金币签到本地验证")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--cookie", help="Cookie 整行")
    src.add_argument("--file", help="存放 Cookie 的文本文件")
    ap.add_argument("--sign", action="store_true", help="真的执行一次签到（默认只查询）")
    args = ap.parse_args()

    raw = args.cookie if args.cookie else open(args.file, encoding="utf-8").read()
    cookie = clean_cookie(raw)

    print("=" * 62)
    print("淘金币签到 · 本地验证")
    print("=" * 62)

    # ---- Cookie 自检 ----
    keys = [p.split("=")[0].strip() for p in cookie.split(";") if "=" in p]
    need = ["cookie2", "unb", "sgcookie", "_m_h5_tk", "_tb_token_"]
    print("Cookie 长度   : %d 字符，%d 个字段" % (len(cookie), len(keys)))
    for k in need:
        mark = colorize("✓", C_OK) if k in keys else colorize("✗ 缺失", C_ERR if k in ("cookie2", "unb") else C_WARN)
        print("  %-12s %s" % (k, mark))

    if "cookie2" not in keys and "unb" not in keys:
        print(colorize("\n[!] 既没有 cookie2 也没有 unb，这份 Cookie 基本不可能有效。", C_ERR))
        print("    确认你复制的是 taobao.com 域名下、已登录状态的 Cookie。")
        return 2

    if not token_of(cookie):
        print(colorize("\n[i] 没有 _m_h5_tk，第一次请求会自动问服务器要，正常现象。", C_DIM))

    common = {"bizCode": "taoCoin", "subBizCode": "coinTown", "asac": ASAC}

    # ---- 1. 查状态 ----
    print("\n[1/2] 查询签到状态  %s v1.0" % API_PURE)
    r = mtop(API_PURE, "1.0", common, cookie)
    if not r["ok"]:
        reason = r.get("reason") or ""

        if "UNAUTHORIZED_ENTRANCE" in reason:
            print(colorize("  结论：这个接口对 H5 网关不开放，跟 Cookie 无关。", C_ERR))
            print("")
            print("  返回原文：%s" % reason)
            print(colorize("  含义：mtop.coingame.sign.* 这一组接口只对「App 原生入口」开放，", C_WARN))
            print(colorize("        调用方必须带 SecurityGuard 生成的 x-sgext / x-sign / x-umt 安全头，", C_WARN))
            print(colorize("        那些头是 App 里的 native SDK 用设备密钥算的，脚本侧造不出来。", C_WARN))
            print("")
            print("  对照实验（同一套签名，换个接口就能通）：")
            print("    mtop.user.getUserSimple            → FAIL_SYS_SESSION_EXPIRED（入口放行，只是没登录）")
            print("    mtop.coingame.task.award.query     → FAIL_SYS_SESSION_EXPIRED（入口放行）")
            print("    mtop.coingame.sign.calendar.pure   → FAIL_SYS_UNAUTHORIZED_ENTRANCE（入口封死）")
            print("")
            print(colorize("  所以淘金币签到没法用脚本/Loon 做，换 cookie 也没用。", C_WARN))
            return 3

        print(colorize("  失败：%s" % reason, C_ERR))
        if r.get("raw"):
            print("  返回片段：%s" % r["raw"])
        if r.get("json"):
            print("  完整返回：%s" % json.dumps(r["json"], ensure_ascii=False)[:600])
        print("\n常见原因：")
        print("  · Cookie 复制不全或已过期 → 重新登录淘宝再复制一次")
        print("  · 复制的是 App 里的 Cookie，和网页版登录态不是一套")
        print("  · 该账号被风控（换网络/等一会儿再试）")
        return 1

    st = state_of(r["json"])
    print(colorize("  登录态有效 ✓", C_OK))
    print("  今日已签    : %s" % (colorize("是", C_OK) if st["signed"] else colorize("否", C_WARN)))
    print("  连续签到    : %s 天" % (st["days"] if st["days"] is not None else "—"))
    if st["coin"] is not None:
        print("  金币        : %s" % st["coin"])
    print("  %smodel 字段: %s%s" % (C_DIM, ", ".join(st["raw_keys"]), C_END))

    if not args.sign:
        print("\n" + colorize("查询成功。要真的签一次，加 --sign 再跑：", C_DIM))
        print(colorize("  python3 verify.py --file cookie.txt --sign", C_DIM))
        return 0

    if st["signed"]:
        print(colorize("\n今天已经签过了，不用再签。", C_OK))
        return 0

    # ---- 2. 签到 ----
    print("\n[2/2] 执行签到  %s v6.0" % API_SIGN)
    payload = dict(common)
    payload["params"] = "{}"
    r2 = mtop(API_SIGN, "6.0", payload, cookie)
    if not r2["ok"]:
        print(colorize("  签到请求失败：%s" % r2["reason"], C_ERR))
        if r2.get("json"):
            print("  完整返回：%s" % json.dumps(r2["json"], ensure_ascii=False)[:800])
        print(colorize("\n  这个接口可能不是真正的签到入口，把上面的返回发我。", C_WARN))
        return 1

    d = (r2["json"].get("data") or {})
    m = d.get("model") or {}
    if m.get("resultCode") not in (None, "", "SUCCESS", 0):
        print(colorize("  业务失败：%s %s" % (m.get("resultCode"), m.get("resultMsg") or ""), C_ERR))
        return 1

    print("  签到请求已返回：%s" % json.dumps(m, ensure_ascii=False)[:300])

    # ---- 3. 复查 ----
    print("\n[*] 复查是否真的签上…")
    time.sleep(1.2)
    r3 = mtop(API_PURE, "1.0", common, cookie)
    if r3["ok"]:
        st2 = state_of(r3["json"])
        if st2["signed"]:
            print(colorize("  复查：已签到 ✓ 连签 %s 天" % (st2["days"] if st2["days"] is not None else "—"), C_OK))
            print("\n" + colorize("全部通过，Loon 那边照这个跑就行。", C_OK))
            return 0
        print(colorize("  复查：仍是未签 ✗", C_ERR))
        print(colorize("  说明 calendar.refresh 不是真正的签到入口，把这次的完整输出发我。", C_WARN))
        return 1

    print(colorize("  复查失败：%s" % r3["reason"], C_ERR))
    return 1


if __name__ == "__main__":
    sys.exit(main())
