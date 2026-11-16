const SESSION_COOKIE = ($argument.session || "").trim();
const NOTIFY = ($argument.notify || "true").toLowerCase() !== "false";
const BASE_URL = "https://app.meruki.cn";

function notify(title, subtitle) {
  if (typeof $notification !== "undefined") {
    $notification.post(title, subtitle, "");
  }
}

function finish(message) {
  if (NOTIFY) notify("挖煤姬签到", message);
  $done();
}

function request(path, method, callback) {
  $httpClient[method]({
    url: BASE_URL + path,
    headers: {
      "accept": "*/*",
      "content-type": "application/x-www-form-urlencoded",
      "origin": "https://h5.meruki.cn",
      "referer": "https://h5.meruki.cn/",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 isNew(1)/version(2.1.6)/appFrom(IOS)/sigSource(IOSMC)",
      "cookie": SESSION_COOKIE,
    },
  }, callback);
}

function normalizeError(error, body) {
  if (error) return error;
  try {
    const payload = JSON.parse(body);
    const message = payload.msg || payload.message;
    if (payload.code && payload.code !== 200) return message || "接口返回异常";
  } catch (_) {}
  return null;
}

if (!SESSION_COOKIE || SESSION_COOKIE === "kmgSessionNO03HxWh=") {
  finish("缺少 kmgSessionNO03HxWh Cookie，请先在 App 签到页登录后更新插件参数");
} else {
  request("/api/user/signin/signin?from=SIG-H5&language=zh-CN&isNew=1", "post", function (error, response, body) {
    const failure = normalizeError(error, body);
    if (failure) {
      finish("失败：" + failure);
      return;
    }

    const payload = JSON.parse(body);
    const data = payload.data || {};
    const point = typeof data.point === "number" ? data.point : data.point || 0;
    const reward = data.reward_point ? `，今日 +${data.reward_point}` : "";
    finish(`成功：现有 ${point} 煤球${reward}${data.msg ? "；" + data.msg : ""}`);
  });
}
