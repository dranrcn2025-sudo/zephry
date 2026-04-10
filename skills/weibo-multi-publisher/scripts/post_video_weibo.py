#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""使用已保存的 Playwright storage state 发送单视频微博。"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

HOME_URL = "https://weibo.com"
TEXTAREA_SELECTOR = 'textarea[placeholder="有什么新鲜事想分享给大家？"]'
FILE_INPUT_SELECTOR = 'input[type="file"]'
SEND_BUTTON_SELECTOR = 'button:has-text("发送")'


async def main() -> None:
    parser = argparse.ArgumentParser(description="发送单视频微博")
    parser.add_argument("--state", required=True, help="storage state 路径")
    parser.add_argument("--text", required=True, help="微博文案")
    parser.add_argument("--video", required=True, help="视频文件路径")
    parser.add_argument("--report", help="写出结果 JSON 路径")
    parser.add_argument("--wait-upload-ms", type=int, default=20000, help="上传后首次等待毫秒数")
    args = parser.parse_args()

    report = {"ok": False, "step": "start"}
    video_path = str(Path(args.video).resolve())

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=args.state, viewport={"width": 1440, "height": 2200})
        page = await context.new_page()
        try:
            await page.goto(HOME_URL, wait_until="domcontentloaded", timeout=120000)
            await page.wait_for_timeout(5000)
            report["step"] = "loaded_home"

            textarea = page.locator(TEXTAREA_SELECTOR).first
            await textarea.click(timeout=10000)
            await textarea.fill(args.text)
            report["step"] = "filled_text"

            file_input = page.locator(FILE_INPUT_SELECTOR).first
            await file_input.set_input_files(video_path)
            report["step"] = "set_video_file"
            await page.wait_for_timeout(args.wait_upload_ms)

            send = page.locator(SEND_BUTTON_SELECTOR).first
            await send.click(timeout=10000, force=True)
            report["step"] = "clicked_send"
            await page.wait_for_timeout(15000)

            body = await page.locator("body").inner_text()
            report["url"] = page.url
            report["body_preview"] = body[:2500]
            report["ok"] = True
        finally:
            if args.report:
                Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            await browser.close()

    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
