const { json, maskEmail, readJsonBody, requirePost } = require("./_lib/http");
const { sendEmail } = require("./_lib/resend");
const { getSupabaseConfig, upsertSubscriber } = require("./_lib/supabase");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_WATCHLIST_LENGTH = 240;

function normalizeWatchlist(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
}

async function notifySubscription(payload) {
  if (!process.env.SUBSCRIBE_EMAIL_TO || !process.env.RESEND_API_KEY) {
    return null;
  }

  return sendEmail({
    to: process.env.SUBSCRIBE_EMAIL_TO,
    subject: "New MornInvest subscription",
    text: [
      `Email: ${payload.email}`,
      `Watchlist: ${payload.watchlist.join(", ") || "(none)"}`,
      `Source: ${payload.source}`,
      `Page: ${payload.page}`,
      `Time: ${payload.created_at}`,
    ].join("\n"),
    html: [
      "<h2>New MornInvest subscription</h2>",
      `<p><strong>Email:</strong> ${payload.email}</p>`,
      `<p><strong>Watchlist:</strong> ${
        payload.watchlist.join(", ") || "(none)"
      }</p>`,
      `<p><strong>Source:</strong> ${payload.source}</p>`,
      `<p><strong>Page:</strong> ${payload.page}</p>`,
      `<p><strong>Time:</strong> ${payload.created_at}</p>`,
    ].join("\n"),
  });
}

module.exports = async function subscribe(req, res) {
  if (!requirePost(req, res)) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const watchlistRaw = String(body.watchlist || "").trim();

    if (body.company) {
      return json(res, 400, { ok: false, message: "提交失败" });
    }

    if (!EMAIL_RE.test(email)) {
      return json(res, 400, { ok: false, message: "请输入有效邮箱。" });
    }

    if (watchlistRaw.length > MAX_WATCHLIST_LENGTH) {
      return json(res, 400, {
        ok: false,
        message: "关注股票太长，请先填写 30 个以内。",
      });
    }

    const payload = {
      email,
      watchlist: normalizeWatchlist(watchlistRaw),
      source: String(body.source || "landing").slice(0, 60),
      page: String(body.page || "").slice(0, 300),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
      created_at: new Date().toISOString(),
    };

    if (!getSupabaseConfig()) {
      console.warn("Subscription received but Supabase is not configured", {
        email: maskEmail(email),
        source: payload.source,
      });

      return json(res, 500, {
        ok: false,
        message: "订阅数据库还没有配置好，请稍后再试。",
      });
    }

    const subscriber = await upsertSubscriber(payload);
    await notifySubscription(payload);

    return json(res, 200, {
      ok: true,
      subscriber_id: subscriber.id,
      message: "订阅成功。第一版晨报会在美股交易日北京时间 9:00 左右发送。",
    });
  } catch (error) {
    console.error("subscribe error", error);
    return json(res, 500, {
      ok: false,
      message: "订阅接口暂时不可用，请稍后再试。",
    });
  }
};

