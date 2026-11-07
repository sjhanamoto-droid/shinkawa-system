import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("navitime: 応答の読み取り", () => {
  it("route_car の料金から車種別の ETC 料金（無ければ現金）を取り出す", async () => {
    const { parseTollFares } = await import("./navitime");
    const json = { items: [{ summary: { move: { fare: { unit_1025_1: 1540, unit_1025_2: 1920, unit_1024_3: 2300, unit_1025_4: 3170, unit_0: 10 } } } }] };
    expect(parseTollFares(json)).toEqual({ KEI: 1540, NORMAL: 1920, MEDIUM: 2300, LARGE: 3170 });
    expect(parseTollFares({})).toEqual({ KEI: null, NORMAL: null, MEDIUM: null, LARGE: null });
  });
  it("IC 検索の結果を ID・名前・道路名にする", async () => {
    const { parseIcItems } = await import("./navitime");
    expect(
      parseIcItems({ items: [{ id: "5010", name: "三郷", road_name: "常磐自動車道" }, { id: "5501350", name: "三郷", road_name: "常磐自動車道" }, { name: "IDなし" }] }),
    ).toEqual([{ id: "5010", name: "三郷", roadName: "常磐自動車道" }]);
  });
});

describe("navitime: 接続先", () => {
  it("RapidAPI のキーがあれば RapidAPI のホストにキーをヘッダーで送る", async () => {
    vi.stubEnv("NAVITIME_RAPIDAPI_KEY", "k123");
    const { buildNavitimeRequest, isNavitimeConfigured } = await import("./navitime");
    const r = buildNavitimeRequest("route_car", { condition: "toll_time" });
    expect(isNavitimeConfigured()).toBe(true);
    expect(r.url).toBe("https://navitime-route-car.p.rapidapi.com/route_car?condition=toll_time");
    expect(r.headers).toEqual({ "x-rapidapi-key": "k123", "x-rapidapi-host": "navitime-route-car.p.rapidapi.com" });
    vi.unstubAllEnvs();
  });
  it("直接契約は ホスト/CID/v1/パス", async () => {
    vi.stubEnv("NAVITIME_RAPIDAPI_KEY", "");
    vi.stubEnv("NAVITIME_HOST", "example.navitime.biz");
    vi.stubEnv("NAVITIME_CID", "cid1");
    const { buildNavitimeRequest } = await import("./navitime");
    expect(buildNavitimeRequest("ic", { word: "三郷" }).url).toBe("https://example.navitime.biz/cid1/v1/ic?word=%E4%B8%89%E9%83%B7");
    vi.unstubAllEnvs();
  });
});

describe("navitime: 料金の種類（割引）", () => {
  it("区間ごとの料金を足して、種類ごと・車種別の片道料金にする（割引の無い区間は ETC 料金で足す）", async () => {
    const { parseTollOptions } = await import("./navitime");
    const json = {
      items: [
        {
          fares: [
            { type: "point", name: "三郷" },
            { type: "move", detail: { fare: { unit_1024_2: 1000, unit_1025_2: 900, unit_1096_2: 700, unit_1098_4: 2000, unit_1025_4: 1800, unit_1024_4: 1900 } } },
            { type: "move", detail: { fare: { unit_1024_2: 500, unit_1025_2: 400, unit_1025_4: 800, unit_1024_4: 900 } } },
          ],
        },
      ],
    };
    const opts = parseTollOptions(json);
    expect(opts.map((o) => o.code)).toEqual(["1025", "1024", "1096", "1098"]);
    expect(opts[0].fares).toMatchObject({ NORMAL: 1300, LARGE: 2600 });
    expect(opts[1].fares).toMatchObject({ NORMAL: 1500, LARGE: 2800 });
    // 深夜割引は1つ目の区間だけ → 2つ目は ETC 料金で足す
    expect(opts[2].fares).toMatchObject({ NORMAL: 1100, LARGE: null });
    // 大型だけの割引は、普通車には出さない
    expect(opts[3].fares).toMatchObject({ NORMAL: null, LARGE: 2800 });
  });
  it("料金の種類の表示名", async () => {
    const { fareOptionLabel } = await import("./navitime");
    expect(fareOptionLabel("1025", null)).toBe("ETC料金");
    expect(fareOptionLabel("1024", null)).toBe("現金");
    expect(fareOptionLabel("1096", { caption: "深夜割引", roadGroup: "首都高速道路", applyTimes: "0:00-4:00" })).toBe("深夜割引（首都高速道路・0:00-4:00）");
    expect(fareOptionLabel("1039", { caption: "深夜割引(0-4時/30%)", roadGroup: "NEXCO共通", applyTimes: "0:00-4:00" })).toBe("深夜割引(0-4時/30%)");
  });
});
