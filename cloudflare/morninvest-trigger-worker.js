const DEFAULT_REF = "main";
const WORKFLOWS = {
  generate: "morninvest-generate.yml",
  send: "morninvest-send.yml",
  materials: "morninvest-materials.yml",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function beijingDate(input = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(input);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function minuteOfDayInBeijing(input = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(input);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function requestedJobsForSchedule(scheduledTime) {
  const minute = minuteOfDayInBeijing(new Date(scheduledTime));
  if (minute === 7 * 60 + 30) return ["generate"];
  if (minute === 8 * 60) return ["send"];
  if (minute === 8 * 60 + 15) return ["materials"];
  if (minute === 8 * 60 + 35) return ["send", "materials"];
  return [];
}

function workflowInputs(job, reportDate) {
  if (job === "generate") {
    return {
      report_date: reportDate,
      force_regenerate: "false",
    };
  }
  if (job === "send") {
    return {
      report_date: reportDate,
      force_regenerate: "false",
      force_send: "false",
    };
  }
  if (job === "materials") {
    return {
      report_date: reportDate,
    };
  }
  throw new Error(`Unknown job: ${job}`);
}

async function dispatchWorkflow(env, workflowFile, inputs) {
  const owner = env.GITHUB_OWNER || "SKGong228";
  const repo = env.GITHUB_REPO || "mornInvest";
  const ref = env.GITHUB_REF || DEFAULT_REF;
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required.");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "morninvest-cloudflare-trigger",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  if (response.status === 204) {
    return { workflow: workflowFile, status: "queued" };
  }

  const text = await response.text();
  throw new Error(`GitHub dispatch failed for ${workflowFile}: ${response.status} ${text}`);
}

async function runJobs(env, jobs, reportDate) {
  const results = [];
  for (const job of jobs) {
    const workflowFile = WORKFLOWS[job];
    if (!workflowFile) throw new Error(`Unsupported job: ${job}`);
    const result = await dispatchWorkflow(env, workflowFile, workflowInputs(job, reportDate));
    results.push({ job, ...result });
  }
  return results;
}

function parseJobs(value) {
  if (!value || value === "all") return ["generate", "send", "materials"];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertManualAuth(request, env) {
  if (!env.TRIGGER_SECRET) {
    throw new Error("TRIGGER_SECRET is required for manual HTTP trigger.");
  }
  const expected = `Bearer ${env.TRIGGER_SECRET}`;
  if (request.headers.get("authorization") !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export default {
  async scheduled(event, env, ctx) {
    const reportDate = beijingDate(new Date(event.scheduledTime));
    const jobs = requestedJobsForSchedule(event.scheduledTime);
    if (!jobs.length) {
      console.log(`No jobs mapped for scheduledTime=${event.scheduledTime}`);
      return;
    }
    ctx.waitUntil(
      runJobs(env, jobs, reportDate)
        .then((results) => console.log(JSON.stringify({ reportDate, results })))
        .catch((error) => {
          console.error(error);
          throw error;
        })
    );
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        return json({
          ok: true,
          service: "morninvest-trigger",
          usage: "POST /trigger?job=generate|send|materials|all&date=YYYY-MM-DD",
        });
      }
      if (request.method !== "POST" || url.pathname !== "/trigger") {
        return json({ ok: false, error: "Not found" }, 404);
      }
      assertManualAuth(request, env);

      const reportDate = url.searchParams.get("date") || beijingDate();
      const jobs = parseJobs(url.searchParams.get("job"));
      const results = await runJobs(env, jobs, reportDate);
      return json({ ok: true, reportDate, results });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ ok: false, error: error.message }, 500);
    }
  },
};
