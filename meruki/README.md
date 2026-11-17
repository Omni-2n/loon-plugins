# 挖煤姬（meruki）· Loon 自动签到 & 去广告

从抓包（`1023_1794815655206.har`）里扒出接口后做的，适配 **Loon 3.5.3**。

```
仓库：https://github.com/Omni-2n/loon-plugins
脚本：https://raw.githubusercontent.com/Omni-2n/loon-plugins/main/meruki/meruki.js
```

## 功能

| 功能 | 实现方式 |
|---|---|
| 每日自动签到 | 定时 `POST /api/user/signin/signin`，先查 `signin/config` 判断今天签没签，签过就不重复请求 |
| 去开屏广告 | **请求阶段**就把 `GetOpenAd` 这类请求拦下、直接返回 `Open=false` 的包（不依赖响应体/解压，少一层环节），响应阶段再兜一层 |
| 去首页广告 | 改写 `Sig.Front.SubSite.AppMercari.GetHomeInfoV2`，清空 `data.ads`（轮播图可选清） |
| 登录态自动抓取 | 开着 Loon 正常用一次 App，请求头里的 `kmgSession…` 就被存下来 |
| **Cookie 控制台** | 网页控制台 `https://app.meruki.cn/__loon__`：看登录态、立即签到、粘贴新 Cookie 保存、清空 |
| 埋点拦截 | `sensorsdata.cn`（神策）、`oceanengine.com`（巨量）走 REJECT |

接口不需要任何签名，Cookie 就够了 —— HAR 里那两个 `signin` 请求除了 `kmgSession…` 之外只有 UA/Referer，没有 token、没有 sign 参数。

## 安装

### 方式一：URL 导入（推荐）

Loon → 配置 → 插件 → 右上 `+` → 从 URL 添加：

```
https://raw.githubusercontent.com/Omni-2n/loon-plugins/main/meruki/meruki.plugin
```

> 国内 `raw.githubusercontent.com` 不通时换 jsDelivr：
> `https://cdn.jsdelivr.net/gh/Omni-2n/loon-plugins@main/meruki/meruki.plugin`
> （换了之后，插件里 4 处 `script-path` 也要一起换成 jsDelivr 的 `meruki.js` 地址）

### 方式二：本地文件导入

把 `meruki.plugin` 传到手机，Loon → 插件 → 从文件导入。

首次启用后确认两件事：

1. **MITM 证书**已安装并在系统里信任（Loon 会引导）；
2. **MITM 开关**是开的，且 `app.meruki.cn` / `h5.meruki.cn` 在 MITM 主机名列表里（插件已用 `%APPEND%` 自动加）。

## 更新登录 Cookie（三种方式）

### A. 什么都不做

开着 Loon 打开一次挖煤姬 App，随便点两下。请求头里的 `kmgSession…` 会被自动抓下来存好，同时弹一条「已自动获取登录态」。

### B. 网页控制台（插件详情页右上角「打开」直接跳过去）

Safari 打开，或在本插件详情页点右上角打开：

```
https://app.meruki.cn/__loon__
```

页面里有：

- 登录态来源 / Cookie 摘要 / 保存时间 / 上次签到结果
- **立即签到**、**检测登录态**、**清除已保存的 Cookie**
- 输入框 + **保存 Cookie**：抓包拿到的 Cookie 整行粘进去点保存，脚本会自动挑出 `kmgSession=` 那一段

> 这个页面是 Loon 脚本在本地生成的，请求被 MITM 拦下后直接返回 HTML，不会真的发到挖煤姬服务器。

### C. 插件参数

Loon → 插件 → 本插件 → 参数 → 「登录Cookie」里粘贴。

**优先级：插件参数 > 控制台保存 > 自动抓取**。参数里填了值，控制台保存的会被忽略（控制台会显示黄色提醒）。想改用控制台管理，先把参数清空。

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| 登录Cookie | 空 | 留空则自动抓取，一般不用填 |
| 屏蔽开屏广告 | 开 | 关掉后恢复 5 秒开屏 |
| 屏蔽首页广告位 | 开 | 清 `ads`（插屏/浮层位） |
| 屏蔽首页轮播图 | 关 | 开了会把 `banners0~3` 也清空，首页顶部会空一块 |
| 签到结果通知 | 开 | 签到后推一条，失败时点通知跳控制台 |

签到时间改插件里两条 cron（五段：分 时 日 月 周）：`30 8 * * *` 主跑，`0 21 * * *` 兜底。兜底那次发现今天已签会自动跳过，当天只推一条通知。

## 验证

1. **签到**：Loon → 脚本 → `挖煤姬-每日签到` → 手动运行；或控制台点「立即签到」看结果。
2. **去广告**：杀掉 App 重进。开屏不再等 5 秒；首页顶部广告位不再出现推广图。
3. **Cookie**：控制台顶部 Cookie 若显示 `未设置`，说明一次都没抓到 —— 检查 MITM 是否开着、App 是否走了 Loon。

## 排错

| 现象 | 处理 |
|---|---|
| 通知「还没有拿到登录 Cookie」 | MITM 没开 / 插件没启用 / `script-path` 拉取失败（看 Loon 日志） |
| 通知「接口错误 code=401」 | Cookie 过期，去控制台重新粘一份 |
| 控制台打不开（404 或 JSON） | `script-path` 没填对，或 MITM 没覆盖 `app.meruki.cn` |
| 脚本完全不跑 | 换 `meruki-compat.plugin`（无 `[Argument]` 版本，功能一样，只是不能调参数） |
| 签到成功但 App 积分没变 | 等几秒刷新，积分异步发放 |
| 开屏偶尔还出现 | 见下面「开屏没拦住怎么查」 |

## 开屏没拦住怎么查

先分清三种情况，再决定要不要抓包：

**① 脚本压根没执行**（最常见）
Loon 是从 `raw.githubusercontent.com` 现拉 `meruki.js` 的，弱网或冷启动那一瞬间没拉到，这条规则就等同于不存在，广告自然照放。
判断方法：同一次启动如果连 Cookie 都没抓到（控制台「保存时间」没变），基本就是这个原因。
处理：换 jsDelivr 地址（更稳），或者干脆重新从 URL 导入一次插件让 Loon 重新缓存脚本。

**② 请求走了别的域名 / 别的接口名**
插件原本只匹配 `app.meruki.cn` 的 `GetOpenAd`。v1.1 已经把匹配放宽到 `meruki.cn` 全站 + `*.meruki.cn`，
并同时认 `OpenAd / SplashAd / StartAd / OpenScreen / LaunchAd` 这几种命名，MITM 也扩到了 `meruki.cn, *.meruki.cn`。
如果放宽后还漏，说明接口名是全新的，需要抓包看。

**③ App 本地缓存了广告物料**
开屏广告有 `StartAt / EndAt` 有效期，App 很可能把上次拿到的图连有效期一起存本地，有效期内冷启动**不发请求**直接展示。
这种情况下任何抓包工具/插件都拦不到（没请求可拦），只能等缓存过期或者清 App 数据。

### 真要抓包的话，这样抓才有用

必须是**冷启动抓包**，不是随便浏览几下：

1. App 完全杀掉（上滑划掉，不是切后台）
2. 开抓包（Stream / Charles / Thor，或 Loon 的日志）
3. **冷启动 App**，等开屏广告真的出现在屏幕上，别急着点跳过
4. 停止抓包，导出 HAR

我要看的是：广告出现的那一次启动里，**到底有没有 `GetOpenAd` 这条请求**。
- 有 → 看它的完整 URL（域名、`n=` 参数名、是否有额外 header），照着补规则
- 没有 → 基本就是情况 ③ 的本地缓存，抓包也解决不了


## 文件

- `meruki.plugin` —— 主插件（带参数开关）
- `meruki-compat.plugin` —— 兼容版（无参数，功能相同）
- `meruki.js` —— 全部逻辑：抓 Cookie / 控制台 / 去广告 / 签到，一个文件搞定
- `panel-preview.html` —— 控制台页面静态预览，浏览器直接打开看效果（仅本地，未上传）
- `test.js` —— 本地模拟 Loon 运行时的分支测试（`node test.js`，仅本地）

## 接口备忘

```
GET  /api/user/signin/config?from=SIG-H5&language=zh-CN&isNew=1&time_zone=Asia%2FShanghai&open_push=true
     → data.is_signin（今天签没签）、data.point（积分）、data.calendar[]

POST /api/user/signin/signin?from=SIG-H5&language=zh-CN&isNew=1
     → data.point（当前积分）、data.reward_point（本次获得）、data.title/content（运势文案）
     鉴权：Cookie kmgSession…；无 body；无签名参数

GET  /?n=Sig.Front.AppFront.GetOpenAd                 → 开屏广告
GET  /?n=Sig.Front.SubSite.AppMercari.GetHomeInfoV2   → 首页 ads / banners0~3
```
