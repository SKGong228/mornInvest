#!/usr/bin/env python3
import json
import os
import re
import textwrap
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1080
HEIGHT = 1440
OUT_DIR = Path("social-output")

COLORS = {
    "paper": "#f6f3ee",
    "surface": "#ffffff",
    "ink": "#111827",
    "muted": "#5d6678",
    "line": "#d9dee8",
    "green": "#0f766e",
    "mint": "#e6f6f3",
    "blue": "#2754c9",
    "amber": "#b56b18",
    "red": "#b42318",
}


def font_path(name):
    candidates = {
        "regular": [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Arial Unicode.ttf",
        ],
        "bold": [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Arial Unicode.ttf",
        ],
    }
    for path in candidates[name]:
        if Path(path).exists():
            return path
    return None


def font(size, weight="regular"):
    path = font_path("bold" if weight == "bold" else "regular")
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default(size=size)


FONTS = {
    "brand": font(30, "bold"),
    "title": font(58, "bold"),
    "h1": font(46, "bold"),
    "h2": font(34, "bold"),
    "body": font(28),
    "body_bold": font(28, "bold"),
    "body_small": font(25),
    "body_small_bold": font(25, "bold"),
    "small": font(22),
    "tiny": font(19),
}


def supabase_get(path):
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    request = urllib.request.Request(
        f"{base_url}/rest/v1/{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_daily_report():
    rows = supabase_get(
        "reports?"
        + urllib.parse.urlencode(
            {
                "select": "id,title,report_date,markdown_body,created_at",
                "report_type": "eq.daily",
                "status": "eq.ready",
                "order": "report_date.desc,created_at.desc",
                "limit": "20",
            }
        )
    )
    for row in rows:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", row.get("report_date", "")):
            return row
    raise RuntimeError("No public daily report found.")


def clean(text):
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text or "")
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = text.replace("---", "")
    return text.strip()


def section(markdown, number):
    pattern = rf"##\s+{number}\.\s+.+?(?=\n##\s+\d+\.|\Z)"
    match = re.search(pattern, markdown, re.S)
    return match.group(0).strip() if match else ""


def field_value(block, label):
    lines = [line.strip() for line in block.splitlines()]
    for index, line in enumerate(lines):
        if line == f"{label}：" or line == f"{label}:":
            values = []
            for next_line in lines[index + 1 :]:
                if not next_line:
                    if values:
                        break
                    continue
                if re.match(r"^[^：:]{2,32}[：:]$", next_line):
                    break
                if next_line.startswith("#"):
                    break
                values.append(next_line)
            return clean(" ".join(values))
        if line.startswith(f"{label}：") or line.startswith(f"{label}:"):
            return clean(line.split("：", 1)[-1] if "：" in line else line.split(":", 1)[-1])
    return ""


def parse_table(block):
    rows = []
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|") or "---" in line:
            continue
        cells = [clean(cell.strip()) for cell in line.strip("|").split("|")]
        if cells:
            rows.append(cells)
    return rows


def parse_signals(markdown):
    block = section(markdown, 2)
    chunks = re.split(r"\n###\s+", block)
    signals = []
    for chunk in chunks[1:]:
        title = clean(chunk.splitlines()[0].replace("信号 ", "信号 "))
        signals.append(
            {
                "title": title,
                "conclusion": field_value(chunk, "结论"),
                "facts": field_value(chunk, "关键事实"),
                "impact": field_value(chunk, "影响方向"),
                "assets": field_value(chunk, "重点影响"),
            }
        )
    return signals[:3]


def parse_news(markdown):
    block = section(markdown, 3)
    chunks = re.split(r"\n###\s+", block)
    news = []
    for chunk in chunks[1:]:
        title = clean(chunk.splitlines()[0])
        news.append(
            {
                "title": title,
                "assets": field_value(chunk, "相关资产"),
                "facts": field_value(chunk, "事实摘要"),
                "why": field_value(chunk, "意义") or field_value(chunk, "为什么重要"),
                "judgement": field_value(chunk, "我的判断"),
            }
        )
    return news[:4]


def parse_report(report):
    markdown = report["markdown_body"]
    sec0 = section(markdown, 0)
    sec1 = section(markdown, 1)
    sec5 = section(markdown, 5)
    sec6 = section(markdown, 6)
    return {
        "date": report["report_date"],
        "title": report["title"],
        "core": {
            "conclusion": field_value(sec0, "一句话结论"),
            "mainline": field_value(sec0, "今日主线"),
            "risk": field_value(sec0, "风险等级"),
            "keywords": re.findall(r"【([^】]+)】", sec0),
        },
        "dashboard": parse_table(sec1),
        "market_state": field_value(sec1, "市场状态"),
        "signals": parse_signals(markdown),
        "news": parse_news(markdown),
        "focus": {
            "variable": field_value(sec5, "最重要变量"),
            "companies": field_value(sec5, "重点公司"),
            "etfs": field_value(sec5, "重点 ETF"),
        },
        "plain": {
            "wrong": field_value(sec6, "今天的行情不能简单理解为"),
            "better": field_value(sec6, "更准确的理解是"),
            "watch": field_value(sec6, "所以接下来最重要的不是看某一家公司单季业绩好不好，而是看"),
        },
    }


def text_width(draw, text, fnt):
    return draw.textbbox((0, 0), text, font=fnt)[2]


def wrap_cjk(draw, text, fnt, max_width, max_lines=None):
    text = clean(text)
    lines = []
    for paragraph in re.split(r"\n+", text):
        current = ""
        for char in paragraph:
            trial = current + char
            if text_width(draw, trial, fnt) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = char
                if max_lines and len(lines) >= max_lines:
                    lines[-1] = lines[-1].rstrip("，。；、 ") + "..."
                    return lines
        if current:
            lines.append(current)
            if max_lines and len(lines) >= max_lines:
                return lines
    return lines


def draw_wrapped(draw, xy, text, fnt, fill, max_width, line_gap=10, max_lines=None):
    x, y = xy
    lines = wrap_cjk(draw, text, fnt, max_width, max_lines=max_lines)
    line_height = fnt.size + line_gap
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_height
    return y


def rounded(draw, xy, fill, outline=None, radius=26, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def base_card(page, date, kicker):
    img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["paper"])
    draw = ImageDraw.Draw(img)
    rounded(draw, (52, 42, WIDTH - 52, HEIGHT - 42), COLORS["surface"], COLORS["line"], 28)
    draw.rounded_rectangle((52, 42, WIDTH - 52, 56), radius=7, fill=COLORS["green"])
    draw.text((86, 86), "MornInvest", font=FONTS["brand"], fill=COLORS["green"])
    draw.text((86, 125), kicker, font=FONTS["small"], fill=COLORS["muted"])
    draw.text((WIDTH - 225, 90), date, font=FONTS["small"], fill=COLORS["muted"])
    draw.text((WIDTH - 145, HEIGHT - 92), f"{page:02d}/06", font=FONTS["tiny"], fill=COLORS["muted"])
    return img, draw


def pill(draw, x, y, text, fill=COLORS["mint"], color=COLORS["green"]):
    w = text_width(draw, text, FONTS["small"]) + 30
    rounded(draw, (x, y, x + w, y + 42), fill, None, 20)
    draw.text((x + 15, y + 9), text, font=FONTS["small"], fill=color)
    return x + w + 12


def bullet(draw, x, y, title, body, max_width, max_body_lines=3):
    draw.ellipse((x, y + 10, x + 12, y + 22), fill=COLORS["green"])
    draw_wrapped(draw, (x + 24, y), title, FONTS["body_bold"], COLORS["ink"], max_width, 8, max_lines=2)
    y += 48
    return draw_wrapped(draw, (x + 24, y), body, FONTS["body"], COLORS["ink"], max_width, 9, max_lines=max_body_lines) + 20


def card_cover(data):
    img, draw = base_card(1, data["date"], "美股科技晨报")
    y = 235
    y = draw_wrapped(draw, (86, y), "今日美股科技主线", FONTS["title"], COLORS["ink"], 860, 14, 2)
    y += 26
    y = draw_wrapped(draw, (86, y), data["core"]["conclusion"], FONTS["h2"], COLORS["ink"], 860, 14, 5)
    y += 42
    x = 86
    for keyword in data["core"]["keywords"][:4]:
        x = pill(draw, x, y, keyword)
        if x > 760:
            x = 86
            y += 56
    y += 88
    rounded(draw, (86, y, WIDTH - 86, y + 220), "#f8fafc", "#e2e8f0", 22)
    draw.text((116, y + 32), "风险等级", font=FONTS["small"], fill=COLORS["muted"])
    draw.text((116, y + 78), data["core"]["risk"] or "中", font=FONTS["h1"], fill=COLORS["amber"])
    draw.text((330, y + 32), "市场状态", font=FONTS["small"], fill=COLORS["muted"])
    draw_wrapped(draw, (330, y + 76), data["market_state"] or "板块分化", FONTS["h2"], COLORS["ink"], 530, 8, 2)
    draw.text((86, HEIGHT - 150), "基于公开信息整理，不构成投资建议", font=FONTS["tiny"], fill=COLORS["muted"])
    return img


def card_core(data):
    img, draw = base_card(2, data["date"], "0. 今日核心判断")
    y = 230
    y = bullet(draw, 86, y, "一句话结论", data["core"]["conclusion"], 850, 4)
    y = bullet(draw, 86, y, "今日主线", data["core"]["mainline"], 850, 8)
    y += 8
    draw.text((86, y), "今日关键词", font=FONTS["h2"], fill=COLORS["ink"])
    y += 55
    x = 86
    for keyword in data["core"]["keywords"][:6]:
        x = pill(draw, x, y, keyword)
        if x > 760:
            x = 86
            y += 58
    return img


def card_dashboard(data):
    img, draw = base_card(3, data["date"], "1. 市场仪表盘")
    y = 215
    rows = data["dashboard"][1:10] if len(data["dashboard"]) > 1 else []
    for row in rows[:9]:
        asset = row[0] if len(row) > 0 else ""
        value = row[1] if len(row) > 1 else ""
        note = row[2] if len(row) > 2 else ""
        rounded(draw, (86, y, WIDTH - 86, y + 96), "#fbfcff", "#e2e8f0", 18)
        draw.text((116, y + 17), asset, font=FONTS["body_bold"], fill=COLORS["ink"])
        value_color = COLORS["green"] if "-" not in value else COLORS["red"]
        draw.text((520, y + 17), value, font=FONTS["body_bold"], fill=value_color)
        draw_wrapped(draw, (116, y + 56), note, FONTS["tiny"], COLORS["muted"], 820, 3, 1)
        y += 112
    y += 8
    draw.text((86, y), f"市场状态：{data['market_state']}", font=FONTS["body_bold"], fill=COLORS["green"])
    return img


def card_signals(data):
    img, draw = base_card(4, data["date"], "2. 今天最重要的 3 个信号")
    y = 214
    for signal in data["signals"]:
        title = re.sub(r"^信号\s*\d+[：:]", "", signal["title"]).strip()
        rounded(draw, (86, y, WIDTH - 86, y + 315), "#fbfcff", "#e2e8f0", 22)
        draw.text((116, y + 25), title, font=FONTS["h2"], fill=COLORS["ink"])
        pill(draw, WIDTH - 255, y + 24, signal["impact"] or "中性")
        yy = y + 86
        yy = draw_wrapped(draw, (116, yy), signal["conclusion"], FONTS["body"], COLORS["ink"], 820, 8, 3)
        yy += 8
        draw.text((116, yy), "重点影响", font=FONTS["small"], fill=COLORS["muted"])
        draw_wrapped(draw, (116, yy + 34), signal["assets"], FONTS["body_bold"], COLORS["green"], 820, 8, 2)
        y += 340
    return img


def card_news(data):
    img, draw = base_card(5, data["date"], "3. 重点新闻拆解")
    y = 210
    for item in data["news"][:2]:
        rounded(draw, (86, y, WIDTH - 86, y + 430), "#fbfcff", "#e2e8f0", 22)
        yy = draw_wrapped(draw, (116, y + 24), item["title"], FONTS["body_bold"], COLORS["ink"], 820, 8, 2)
        yy += 12
        draw.text((116, yy), "相关资产", font=FONTS["small"], fill=COLORS["muted"])
        yy = draw_wrapped(draw, (116, yy + 32), item["assets"], FONTS["body_small_bold"], COLORS["green"], 820, 7, 1)
        yy += 10
        draw.text((116, yy), "事实摘要", font=FONTS["small"], fill=COLORS["muted"])
        yy = draw_wrapped(draw, (116, yy + 32), item["facts"], FONTS["body_small"], COLORS["ink"], 820, 7, 3)
        yy += 10
        draw.text((116, yy), "意义", font=FONTS["small"], fill=COLORS["muted"])
        draw_wrapped(draw, (116, yy + 32), item["why"], FONTS["body_small"], COLORS["ink"], 820, 7, 2)
        y += 462
    return img


def card_focus(data):
    img, draw = base_card(6, data["date"], "5-6. 关注清单与普通投资者理解")
    y = 215
    y = bullet(draw, 86, y, "最重要变量", data["focus"]["variable"], 850, 4)
    y = bullet(draw, 86, y, "重点公司", data["focus"]["companies"], 850, 3)
    y = bullet(draw, 86, y, "更准确的理解", data["plain"]["better"], 850, 7)
    y += 10
    rounded(draw, (86, HEIGHT - 260, WIDTH - 86, HEIGHT - 125), COLORS["green"], None, 24)
    draw.text((116, HEIGHT - 228), "完整日报与邮件订阅", font=FONTS["small"], fill="#d1fae5")
    draw.text((116, HEIGHT - 184), "morninvest.com", font=FONTS["h1"], fill="#ffffff")
    draw.text((116, HEIGHT - 92), "仅用于信息整理和研究参考，不构成投资建议", font=FONTS["tiny"], fill=COLORS["muted"])
    return img


def main():
    report = latest_daily_report()
    data = parse_report(report)
    OUT_DIR.mkdir(exist_ok=True)
    cards = [
        card_cover(data),
        card_core(data),
        card_dashboard(data),
        card_signals(data),
        card_news(data),
        card_focus(data),
    ]
    paths = []
    for index, img in enumerate(cards, start=1):
        path = OUT_DIR / f"morninvest-{data['date']}-{index:02d}.png"
        img.save(path, quality=95)
        paths.append(str(path))
    print(json.dumps({"date": data["date"], "paths": paths}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
