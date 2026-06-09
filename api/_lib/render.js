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
      '<a href="$2" style="color:#0d9488;text-decoration:underline;">$1</a>'
    )
    .replace(
      /【([^】]+)】/g,
      '<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border-radius:999px;background:#ecfdf5;border:1px solid #99f6e4;color:#0f766e;font-size:13px;line-height:1.4;font-weight:700;">$1</span>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;border-radius:4px;padding:1px 5px;font-family:Menlo,Consolas,monospace;font-size:13px;color:#374151;">$1</code>');
}

function fieldMatch(line) {
  return String(line || "").match(/^([^：:]{2,32}[：:])\s*(.*)$/);
}

function fieldHtml(label, valueLines) {
  const value = valueLines.filter(Boolean).join("\n");
  return `<div class="mi-field" style="margin:0 0 10px;font-size:15px;line-height:1.62;color:#18212f;"><span class="mi-field-label" style="display:block;margin:0 0 3px;color:#64748b;font-size:13px;line-height:1.35;font-weight:800;">${escapeHtml(
    label
  )}</span>${
    value
      ? `<span class="mi-field-value">${renderInline(value).replace(/\n/g, "<br>")}</span>`
      : ""
  }</div>`;
}

function plainParagraphHtml(lines) {
  return `<p style="margin:0 0 18px;font-size:15px;line-height:1.72;color:#18212f;">${lines
    .map(renderInline)
    .join("<br>")}</p>`;
}

function paragraphHtml(lines) {
  const hasField = lines.some((line) => fieldMatch(line));

  if (!hasField) {
    return plainParagraphHtml(lines);
  }

  const blocks = [];
  let paragraph = [];

  function flushParagraphBlock() {
    if (paragraph.length) {
      blocks.push(plainParagraphHtml(paragraph));
      paragraph = [];
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = fieldMatch(lines[index]);

    if (!match) {
      paragraph.push(lines[index]);
      continue;
    }

    flushParagraphBlock();

    const valueLines = [];
    if (match[2]) {
      valueLines.push(match[2]);
    }

    while (index + 1 < lines.length && !fieldMatch(lines[index + 1])) {
      valueLines.push(lines[index + 1]);
      index += 1;
    }

    blocks.push(fieldHtml(match[1], valueLines));
  }

  flushParagraphBlock();
  return blocks.join("\n");
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

  function cellStyle(cell, isHeader) {
    if (isHeader) {
      return "border:1px solid #dbe3ee;background:#f8fafc;padding:10px 11px;text-align:left;font-weight:800;color:#0f172a;";
    }

    const text = String(cell || "");
    let color = "#18212f";
    if (/利多|偏强|风险偏好上升|\+|^[0-9]+(\.[0-9]+)?%/.test(text)) {
      color = "#047857";
    }
    if (/利空|偏弱|风险偏好下降|-/.test(text)) {
      color = "#b91c1c";
    }
    return `border:1px solid #e2e8f0;padding:10px 11px;vertical-align:top;background:#ffffff;color:${color};`;
  }

  return `<div style="overflow-x:auto;margin:10px 0 20px;border:1px solid #e2e8f0;border-radius:6px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#18212f;">
    <thead>
      <tr>${header
        .map(
          (cell) =>
            `<th style="${cellStyle(cell, true)}">${renderInline(cell)}</th>`
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
                  `<td style="${cellStyle(cell, false)}">${renderInline(cell)}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}
    </tbody>
  </table>
  </div>`;
}

function markdownToBasicHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let tableRows = [];
  let skippedFirstH1 = false;

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
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      if (level === 1 && !skippedFirstH1) {
        skippedFirstH1 = true;
        continue;
      }
      const styles = {
        1: "font-size:24px;line-height:1.25;margin:0 0 18px;color:#0f172a;",
        2: "font-size:18px;line-height:1.35;margin:30px 0 14px;color:#0f172a;border-top:1px solid #e2e8f0;padding-top:20px;font-weight:900;",
        3: "font-size:16px;line-height:1.45;margin:22px 0 10px;color:#0f172a;background:#f8fafc;border-left:4px solid #14b8a6;padding:10px 12px;border-radius:0 6px 6px 0;",
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
  <body style="margin:0;background:#f3f6f9;color:#18212f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;line-height:1.7;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f3f6f9;">MornInvest 美股科技晨报，基于公开信息整理，不构成投资建议。</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f6f9;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="height:5px;background:#14b8a6;border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-left:1px solid #dbe3ee;border-right:1px solid #dbe3ee;padding:24px 28px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-size:12px;letter-spacing:0;color:#0f766e;font-weight:900;text-transform:uppercase;margin-bottom:8px;">MornInvest</div>
                      <h1 style="font-size:26px;line-height:1.25;margin:0;color:#0f172a;font-weight:900;">${escapeHtml(title)}</h1>
                      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#64748b;">每天早上 5 分钟看懂美股科技主线</p>
                    </td>
                    <td align="right" style="vertical-align:top;width:120px;">
                      <span style="display:inline-block;border:1px solid #99f6e4;background:#ecfdf5;color:#0f766e;border-radius:999px;padding:5px 10px;font-size:12px;line-height:1.2;font-weight:800;">Daily Brief</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #dbe3ee;border-top:none;border-radius:0 0 8px 8px;padding:4px 28px 28px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px;">
            <tr>
              <td style="font-size:12px;color:#64748b;padding:14px 4px 0;line-height:1.65;">本简报仅用于信息整理和研究参考，不构成投资建议、买卖建议或任何收益承诺。你收到这封邮件是因为订阅了 MornInvest 测试版。</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  markdownToBasicHtml,
  markdownToPlainText,
  wrapEmailHtml,
};
