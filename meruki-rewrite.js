const AD_FIELDS = [
  "ads",
  "announcement",
  "banners0",
  "banners1",
  "banners2",
  "banners3",
  "experiences",
  "guides",
  "newbie",
];

function emptyAd() {
  return {
    code: 200,
    data: {
      Open: false,
      WaitSecond: 0,
      Img: "",
      ImgEn: "",
      ImgEnUrl: "",
      ImgJa: "",
      ImgJaUrl: "",
      ImgZhTW: "",
      ImgZhTWUrl: "",
      Url: "",
      StartAt: "1970-01-01T00:00:00+08:00",
      EndAt: "1970-01-01T00:00:00+08:00",
    },
    msg: "",
  };
}

function clearHomeAds(body) {
  const payload = JSON.parse(body);
  if (payload && payload.data) {
    for (const field of AD_FIELDS) {
      if (field === "announcement") {
        payload.data[field] = null;
      } else {
        payload.data[field] = [];
      }
    }
  }
  return JSON.stringify(payload);
}

const url = $request.url;
const body = $response.body;
const isHomeInfo = url.includes("GetHomeInfoV2");
$done({
  body: isHomeInfo ? clearHomeAds(body) : JSON.stringify(emptyAd()),
  headers: $response.headers,
});
