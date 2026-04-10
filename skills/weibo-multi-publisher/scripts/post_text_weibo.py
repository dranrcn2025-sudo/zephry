#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""使用已保存的 Playwright storage state 发送纯文案微博。"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

HOME_URL = "https://weibo.com"
TEXTAREA_SELECTOR = 'textarea[placeholder="有什么新鲜事想分享给大家？"]'
SEND_BUTTON_SELECTOR = 'button:has-text("发送")'


async def main() -> None:
    parser = argparse.ArgumentParser(description="发送纯文案微博")
    parser.add_argument("--state", required=True, help="storage state 路径")
    parser.add_argument("--text", required=True, help="微博文案")
    parser.add_argument("--report", help="写出结果 JSON 路径")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()

    report = {"ok": False, "step": "start"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=args.state, viewport={"width": 1440, "height": 2200})
        page = await context.new_page()
        try:
            await page.goto(HOME_URL, wait_until="domcontentloaded", timeout=120000)
            await page.wait_for_timeout(5000)
            report["step"] = "loaded_home"

            textarea = page.locator(TEXTAREA_SELECTOR).first
            await textarea.click(timeout=args.timeout_seconds * 1000)
            await textarea.fill(args.text)
            report["step"] = "filled_text"

            send = page.locator(SEND_BUTTON_SELECTOR).first
            await send.click(timeout=args.timeout_seconds * 1000)
            report["step"] = "clicked_send"
            await page.wait_for_timeout(6000)

            body = await page.locator("body").inner_text()
            report["ok"] = args.text in body
            report["url"] = page.url
            report["body_preview"] = body[:2000]
        finally:
            if args.report:
                Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            await browser.close()

    print(json.dumps(report, ensure_ascii=False))
    if not report["ok"]:
        raise SystemExit("未能确认微博已成功出现在页面中")


if __name__ == "__main__":
    asyncio.run(main())
