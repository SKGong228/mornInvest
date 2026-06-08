const { json } = require("./_lib/http");
const { getSupabaseConfig } = require("./_lib/supabase");

module.exports = async function status(req, res) {
  return json(res, 200, {
    ok: true,
    supabase: Boolean(getSupabaseConfig()),
    resend: Boolean(process.env.RESEND_API_KEY),
    report_model: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    cron_secret: Boolean(process.env.CRON_SECRET),
  });
};

