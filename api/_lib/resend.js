async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESEND_FROM_EMAIL ||
        "MornInvest <onboarding@resend.dev>",
      to,
      subject,
      html,
      text,
    }),
  });

  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${body}`);
  }

  return parsed;
}

module.exports = {
  sendEmail,
};

