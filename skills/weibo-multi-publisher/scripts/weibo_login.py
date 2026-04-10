#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""微博扫码登录并保存 Playwright storage state。"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

LOGIN_URL = "https://passport.weibo.com/sso/signin?entry=miniblog&source=miniblog&url=https%3A%2F%2Fweibo.com"
COOKIE_NAMES = {"SUB", "SUBP", "SCF", "ALF"}


async def main() -> None:
    parser = argparse.ArgumentParser(description="微博扫码登录")
    parser.add_argument("--state-out", required=True, help="保存 storage state 的路径")
    parser.add_argument("--screenshot", help="保存二维码截图路径")
    parser.add_argument("--timeout-seconds", type=int, default=600)
    args = parser.parse_args()

    state_out = Path(args.state_out)
    state_out.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 2200})
        page = await context.new_page()
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120000)
        await page.wait_for_timeout(5000)
        if args.screenshot:
            await page.screenshot(path=args.screenshot, full_page=True)
            print(f"QR_SCREENSHOT={args.screenshot}")
        print("STATUS=WAITING_FOR_SCAN")

        deadline = asyncio.get_running_loop().time() + args.timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            cookies = await context.cookies()
            names = {c['name'] for c in cookies}
            if names & COOKIE_NAMES:
                await context.storage_state(path=str(state_out))
                print(f"STATUS=LOGGED_IN\nSTATE_OUT={state_out}")
                await browser.close()
                return
            await page.wait_for_timeout(3000)

        await browser.close()
        raise SystemExit("登录超时，未检测到微博登录 cookie")


if __name__ == "__main__":
    asyncio.run(main())
