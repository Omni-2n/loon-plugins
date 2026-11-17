# 淘金币签到 · 结论：脚本做不了（接口侧封死）

> 2026-11-17 更新。这个目录原来放的是 Loon 自动签到插件，**现在已经删掉了** ——
> 不是脚本写错了，是淘金币的签到接口根本不允许 App 以外的调用方访问。
> 下面是对照着实测数据写的结论，`verify.py` 你可以自己跑一遍复现。

## 一句话

`mtop.coingame.sign.*` 这组接口只对「App 原生入口」开放，走 H5 网关一律返回
`FAIL_SYS_UNAUTHORIZED_ENTRANCE`。换 Cookie、换 appKey 都没用，
因为缺的是 App 里 SecurityGuard 用设备密钥算出来的 `x-sgext / x-sign / x-umt` 安全头。

**所以：拿不到 Cookie 不是你的问题，拿到也没用。**

## 证据

同一套签名算法、同一个 Cookie、同一个网关，只换 api 名，结果分成两类：

| 接口 | 返回 | 说明 |
|---|---|---|
| `mtop.user.getUserSimple` | `FAIL_SYS_SESSION_EXPIRED` | 入口**放行**，只是 Cookie 是假的 |
| `mtop.coingame.task.award.query` | `FAIL_SYS_SESSION_EXPIRED` | 入口**放行** |
| `mtop.coingame.town.task.allinfo.query` | `FAIL_SYS_SESSION_EXPIRED` | 入口**放行** |
| `mtop.taobao.taocoin.redpacket.query` | `FAIL_SYS_SESSION_EXPIRED` | 入口**放行** |
| `mtop.coingame.sign.calendar.pure` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死**（查签到状态） |
| `mtop.coingame.sign.calendar.refresh` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死**（签到动作） |
| `mtop.coingame.sign.supply` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死**（补签） |
| `mtop.coingame.supsigncard.check` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死** |
| `mtop.coingame.coin.account` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死** |
| `mtop.coingame.task.panel.award.send` | `FAIL_SYS_UNAUTHORIZED_ENTRANCE` | 入口**封死**（领奖） |

规律很清楚：**查询类放行，一切能"加金币"的操作全部封死**。这是淘系反刷的常规设计，不是配置问题。

> 注意第一行：`SESSION_EXPIRED` 而不是 `UNAUTHORIZED`，说明我们的
> `sign = md5(token & t & appKey & data)` 这套签名是**对的**，服务器认。
> 错的只有"这个 api 你有资格调吗"。

## 为什么 Cookie 抓不到

顺带解释你遇到的两个现象：

**① 控制台 404**
`https://h5api.m.taobao.com/__loon__` 打到了真实服务器（Tengine 404），说明这个域名没被 MITM 覆盖。
可能是 Loon 的 `%APPEND%` 没生效、或者你在 Loon 内置浏览器里打开的（内置浏览器有可能绕过规则引擎）。
想让 MITM 生效，用 **Safari** 打开同一个地址试试，能出页面才算覆盖成功。

**② 抓不到 App 的 Cookie**
淘宝 App 的数据请求走的是**原生 MTOP**（`acs.m.taobao.com` + 设备安全头），
不是 H5 的 `h5api.m.taobao.com`。淘金币 H5 页面在 App 里也只是个壳，
数据由 WindVane 桥接给原生去拿 —— 所以你那份 HAR 里 12 条全是埋点和静态资源，
一条 `mtop` 都没有，不是你抓的方法不对，是它真的没走 H5。

## 还能做什么

**如果只是想验证我说的对不对**，跑 `verify.py`（只用标准库，不需要装东西）：

```bash
# 1. 电脑 Chrome 打开 taobao.com 登录
# 2. F12 → Network → 刷新 → 点任意 taobao.com 请求 → 复制 Request Headers 里 Cookie 整行
python3 verify.py --cookie "cookie2=...; unb=...; sgcookie=...; _m_h5_tk=..."
```

它会在第一次请求就返回 `UNAUTHORIZED_ENTRANCE` 并告诉你是接口问题。
**这一步和 Cookie 有没有效无关**，用假的也能复现。

**如果还想做淘宝系的其他签到**（签到金、芭芭农场、淘宝人生之类），流程应该是这样，别再倒过来：

1. 先把目标活动的前端包扒下来，拿到 `mtop.xxx` 接口名
2. **先用 `verify.py` 的 `mtop()` 测一次入口**（拿假 Cookie 就行）：
   - 返回 `SESSION_EXPIRED` → 入口放行，有戏，再往下做
   - 返回 `UNAUTHORIZED_ENTRANCE` → 直接放弃，省下写脚本的时间
3. 入口通过了，才值得去抓真实请求、对参数、写插件

这次就是顺序反了：先写了插件，最后才发现接口根本调不通。

## 文件

- `verify.py` —— 诊断工具。验 Cookie + 测接口入口 + （能通的话）试签到，加 `--sign` 才真的签
- `README.md` —— 本文件

## 附：接口是怎么找出来的

你给的 HAR 里没有签到请求，所以是从淘金币 H5 的前端包反查的：

```
页面：https://pages-fast.m.taobao.com/wow/z/tmtjb/town/home
包体：https://g.alicdn.com/code/npm/@ali/pegasus-project-taocoin-home/2.6.55/js/p_index.js
```

```bash
grep -ohE 'mtop\.[a-zA-Z0-9._]+' p_index.js | sort -u
```

就能列出全部接口。这套方法本身有效（接口名、参数、`asac` 活动码都挖出来了），
只是挖出来之后没先验证入口权限，白做了一轮。
