function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" style="color:#0f766e;text-decoration:underline;">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;border-radius:4px;padding:1px 5px;font-family:Menlo,Consolas,monospace;font-size:13px;color:#374151;">$1</code>');
}

function paragraphHtml(lines) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#18212f;">${renderInline(
    lines.join("\n")
  ).replace(/\n/g, "<br>")}</p>`;
}

function listHtml(items, ordered) {
  const tag = ordered ? "ol" : "ul";
  const marginLeft = ordered ? "22px" : "20px";
  return `<${tag} style="margin:0 0 16px ${marginLeft};padding:0;font-size:15px;line-height:1.75;color:#18212f;">${items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;padding-left:4px;">${renderInline(item)}</li>`
    )
    .join("")}</${tag}>`;
}

function tableHtml(rows) {
  const parsedRows = rows.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
  );
  const header = parsedRows[0] || [];
  const bodyRows = parsedRows.slice(2);

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:14px;color:#18212f;">
    <thead>
      <tr>${header
        .map(
          (cell) =>
            `<th style="border:1px solid #d9dee8;background:#f1f5f9;padding:9px 10px;text-align:left;font-weight:700;color:#0f172a;">${renderInline(cell)}</th>`
        )
        .join("")}</tr>
    </thead>
    <tbody>
      ${bodyRows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell) =>
                  `<td style="border:1px solid #d9dee8;padding:9px 10px;vertical-align:top;background:#ffffff;">${renderInline(cell)}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function markdownToBasicHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let tableRows = [];

  function flushParagraph() {
    if (paragraph.length) {
      html.push(paragraphHtml(paragraph));
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length) {
      html.push(listHtml(listItems, listType === "ol"));
      listItems = [];
      listType = null;
    }
  }

  function flushTable() {
    if (tableRows.length) {
      html.push(tableHtml(tableRows));
      tableRows = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line);
      continue;
    }

    flushTable();

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      html.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />');
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const styles = {
        1: "font-size:24px;line-height:1.25;margin:0 0 18px;color:#0f172a;",
        2: "font-size:18px;line-height:1.35;margin:28px 0 12px;color:#0f172a;border-top:1px solid #e5e7eb;padding-top:18px;",
        3: "font-size:16px;line-height:1.4;margin:20px 0 10px;color:#0f766e;",
      };
      html.push(`<h${level} style="${styles[level]}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushTable();

  return html.join("\n");
}

function markdownToPlainText(markdown) {
  return String(markdown || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "- ")
    .replace(/^\d+\.\s+/gm, "- ")
    .replace(/^-{3,}$/gm, "")
    .trim();
}

function wrapEmailHtml(title, bodyHtml) {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#eef2f7;color:#18212f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;line-height:1.7;">
    <div style="display:none;max-height:0;overflow:hidden;color:#eef2f7;">MornInvest 美股科技晨报，基于公开信息整理，不构成投资建议。</div>
    <main style="max-width:760px;margin:0 auto;padding:28px 14px;">
      <section style="background:#0f172a;border-radius:8px 8px 0 0;padding:22px 26px;color:#ffffff;">
        <div style="font-size:13px;letter-spacing:0;text-transform:uppercase;color:#99f6e4;font-weight:800;margin-bottom:8px;">MornInvest</div>
        <h1 style="font-size:26px;line-height:1.25;margin:0;color:#ffffff;">${escapeHtml(title)}</h1>
        <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#cbd5e1;">每天早上 5 分钟看懂美股科技主线</p>
      </section>
      <section style="background:#fff;border:1px solid #d9dee8;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
        ${bodyHtml}
      </section>
      <p style="font-size:12px;color:#64748b;margin:16px 4px 0;line-height:1.6;">本简报仅用于信息整理和研究参考，不构成投资建议、买卖建议或任何收益承诺。你收到这封邮件是因为订阅了 MornInvest 测试版。</p>
    </main>
  </body>
</html>`;
}

module.exports = {
  markdownToBasicHtml,
  markdownToPlainText,
  wrapEmailHtml,
};
