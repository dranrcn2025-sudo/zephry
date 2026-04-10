#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微博多账号发布脚本骨架。

当前目标：
- 读取配置
- 校验账号与素材
- 输出 dry-run 结果
- 为后续接 Playwright 真发布预留结构
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_accounts(cfg: dict[str, Any], account: str | None, all_accounts: bool) -> list[tuple[str, dict[str, Any]]]:
    accounts = cfg.get("accounts", {})
    if all_accounts:
        return list(accounts.items())
    if account:
        if account not in accounts:
            raise SystemExit(f"未知账号键: {account}")
        return [(account, accounts[account])]
    raise SystemExit("请提供 --account 或 --all-accounts")


def validate_inputs(text_file: Path | None, media: list[str]) -> tuple[str | None, list[Path]]:
    text = None
    if text_file:
        if not text_file.exists():
            raise SystemExit(f"文案文件不存在: {text_file}")
        text = text_file.read_text(encoding="utf-8").strip()
    media_paths = [Path(m) for m in media]
    for path in media_paths:
        if not path.exists():
            raise SystemExit(f"素材文件不存在: {path}")
    if not text and not media_paths:
        raise SystemExit("至少提供文案或媒体素材之一")
    return text, media_paths


def dry_run(accounts: list[tuple[str, dict[str, Any]]], text: str | None, media_paths: list[Path]) -> list[dict[str, Any]]:
    results = []
    for key, meta in accounts:
        storage = meta.get("storage_state")
        results.append(
            {
                "account": key,
                "label": meta.get("label", key),
                "storage_state": storage,
                "text_preview": (text[:80] + "...") if text and len(text) > 80 else text,
                "media_count": len(media_paths),
                "status": "ready",
                "detail": "已完成输入校验；当前已实测支持扫码登录与纯文案微博，图文/视频发布仍待接入",
            }
        )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="微博多账号发布脚本骨架")
    parser.add_argument("--config", default=".config.json", help="配置文件路径")
    parser.add_argument("--account", help="指定单账号键，如 main")
    parser.add_argument("--all-accounts", action="store_true", help="对所有账号执行")
    parser.add_argument("--text-file", type=Path, help="文案文件路径")
    parser.add_argument("--media", nargs="*", default=[], help="媒体文件路径列表")
    parser.add_argument("--dry-run", action="store_true", help="仅做预检查")
    args = parser.parse_args()

    cfg = load_json(Path(args.config))
    accounts = resolve_accounts(cfg, args.account, args.all_accounts)
    text, media_paths = validate_inputs(args.text_file, args.media)

    results = dry_run(accounts, text, media_paths)
    print(json.dumps({"mode": "dry-run" if args.dry_run or True else "publish", "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
