# 淘金币（淘宝）· Loon 自动签到

帮你把「淘金币」的每日签到搬到 Loon 里，每天定时签，签完推一条通知。

```
插件：https://raw.githubusercontent.com/Omni-2n/loon-plugins/main/taojinbi/taojinbi.plugin
脚本：https://raw.githubusercontent.com/Omni-2n/loon-plugins/main/taojinbi/taojinbi.js
```

## 接口是从哪来的

你给的 HAR（`1025_1794886402408.har`）里**没有**签到请求 —— 12 条全是页面壳和埋点，`mtop` / `h5api` / `sign` 出现次数是 0。所以我没有靠抓包，而是把淘金币 H5 的前端包扒下来反查：

```
页面：pages-fast.m.taobao.com/wow/z/tmtjb/town/home
包体：g.alicdn.com/code/npm/@ali/pegasus-project-taocoin-home/2.6.55/js/p_index.js
```

从里面挖出三个接口和它们的调用参数：

| 接口 | 版本 | 用途 |
|---|---|---|
| `mtop.coingame.sign.calendar.pure` | 1.0 | 查签到日历（今日是否已签、连签天数） |
| `mtop.coingame.sign.calendar.refresh` | 6.0 | **签到动作**（`needLogin`，带 `params`） |
| `mtop.coingame.sign.supply` / `supsigncard.check` | — | 补签卡（本脚本没用到） |

公共参数（前端里写死的）：

```json
{"bizCode":"taoCoin","subBizCode":"coinTown","asac":"2A21B017LSI0KGN210C6D7"}
```

返回结构里能拿到状态的字段：`isTodaySigned` / `isUserSigned` / `consecutiveSignCount` / `continuousSignDay`。

## 鉴权：mtop 老规矩

淘宝 H5 的 mtop 接口需要三样东西，缺一不可：

1. **Cookie**（含 `_m_h5_tk`、`cookie2`、`sgcookie`、`unb` 等）
2. **令牌**：`_m_h5_tk` 下划线前半段
3. **签名**：`sign = md5(token + "&" + t + "&" + appKey + "&" + data)`，appKey 固定 `12574478`

Loon 的运行时没有内置 md5，所以脚本里自带了一份纯 JS 实现（已用 5 组标准向量 + 200 组随机串对照 node 的 `crypto` 校验过）。

令牌失效时淘宝会在响应头 `Set-Cookie` 里下发新的 `_m_h5_tk`，脚本会自动取出来换掉再重试一次，不用你管。

## 安装

Loon → 配置 → 插件 → `+` → 从 URL 添加：

```
https://raw.githubusercontent.com/Omni-2n/loon-plugins/main/taojinbi/taojinbi.plugin
```

装好后确认：MITM 证书已信任、MITM 开关打开、`h5api.m.taobao.com` 在主机名列表里（插件已用 `%APPEND%` 自动加）。

> ⚠️ 如果开 MITM 之后淘宝 H5 页面白屏或报错（个别版本会做证书校验），把 MITM 里的 `h5api.m.taobao.com` 去掉，
> 改用下面的「方式 C」手动填 Cookie，脚本照样能用。

## Cookie 怎么来

### A. 自动抓（推荐）

开着 Loon，在淘宝里打开一次**淘金币**页面，随便点两下。请求头里的 Cookie 会被自动存下来。

### B. 网页控制台

Safari 打开，或插件详情页右上角「打开」：

```
https://h5api.m.taobao.com/__loon__
```

能看到 Cookie 来源、`_m_h5_tk` 令牌是否存在、上次签到结果，还有「立即签到 / 检测登录态 / 清除 Cookie」三个按钮和一个粘贴框。

> 页面是 Loon 脚本本地生成的，请求被 MITM 拦下后直接返回 HTML，不会发到淘宝服务器。

### C. 插件参数

Loon → 插件 → 本插件 → 参数 → 「淘宝Cookie」粘贴。**优先级：参数 > 控制台保存 > 自动抓取。**

## 签到逻辑

不是无脑打一发就完事，走三步：

```
① 调 pure 查状态 ──已签──> 直接通知「今天已签」，不发签到请求
        │未签
        ▼
② 调 refresh 签到
        │
        ▼
③ 再调 pure 复查 ──已签──> 通知「签到成功，连签 N 天」
                └─未签──> 通知失败并带上服务端原话（避免"假成功"）
```

这样即使 `refresh` 不是真正的签到入口（见下面「已知不确定点」），你也会立刻看到「签到请求已发出，但复查仍是未签状态」，而不是被骗过去。

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| 淘宝Cookie | 空 | 留空自动抓取 |
| 签到结果通知 | 开 | 每天最多推一条 |

时间改插件里两条 cron（五段）：`10 8 * * *` 主跑，`10 21 * * *` 兜底。

## 已知不确定点

`mtop.coingame.sign.calendar.refresh` 是我从包里的命名和调用位置推断的「签到动作」—— 它带 `needLogin`、带 `params`、返回 `resultCode`，符合签到接口的特征，但**我没法用你的账号实测**。

如果控制台点「立即签到」后提示「复查仍是未签状态」，说明签到走的是另一个接口。这时候麻烦按下面抓一次包，把 HAR 发我，我照着改：

1. 淘宝杀掉，开抓包
2. 重进 → 进淘金币 → 点一次「签到」→ 看到金币到账
3. 停止抓包，导出 HAR

有了那一次的真实请求，接口名和参数就都是确定的，不用再猜。

## 文件

- `taojinbi.plugin` —— 插件本体
- `taojinbi.js` —— 全部逻辑（md5 / mtop 签名 / 令牌重试 / 控制台 / 签到）
- `panel-preview.html` —— 控制台页面静态预览（仅本地）
- `test.js` —— 本地模拟 Loon 运行时的测试，含 md5 向量校验（`node test.js`，仅本地）
