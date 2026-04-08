#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bot.py — QQ 群管机器人
功能：关键词自动回复 + 自动通过入群申请

依赖:
  pip install websocket-client requests

用法:
  python3 scripts/bot.py
  python3 scripts/bot.py --test
  python3 scripts/bot.py --config /path/to/.config.json
"""

import argparse
import json
import logging
import threading
import time
from pathlib import Path

import requests
import websocket

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = SKILL_DIR / ".config.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("qq-group-bot")


def load_config(path=DEFAULT_CONFIG):
    if not path.exists():
        raise FileNotFoundError(f"配置文件不存在: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def api_call(cfg, endpoint, payload):
    url = cfg["napcat_http_url"].rstrip("/") + "/" + endpoint.lstrip("/")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg.get('token', '')}",
    }
    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


def send_group_msg(cfg, group_id, text):
    result = api_call(
        cfg,
        "/send_group_msg",
        {
            "group_id": group_id,
            "message": [{"type": "text", "data": {"text": text}}],
        },
    )
    if result.get("retcode") == 0:
        log.info("✅ 发送成功 → 群%s", group_id)
    else:
        log.warning("❌ 发送失败 群%s: %s", group_id, result)
    return result


def approve_join_request(cfg, flag, sub_type):
    result = api_call(
        cfg,
        "/set_group_add_request",
        {"flag": flag, "sub_type": sub_type, "approve": True},
    )
    if result.get("retcode") == 0:
        log.info("✅ 已自动同意入群申请 flag=%s", flag)
    else:
        log.warning("❌ 同意申请失败: %s", result)


class QQBot:
    def __init__(self, cfg):
        self.cfg = cfg
        self.groups = set(cfg.get("groups", []))
        self.keywords = cfg.get("keywords", [])
        self.auto_approve = cfg.get("auto_approve_join", True)
        self.cooldown = cfg.get("reply_cooldown_seconds", 30)
        self._cooldown_map = {}
        self._lock = threading.Lock()

    def match_keywords(self, text):
        for index, rule in enumerate(self.keywords):
            for keyword in rule.get("match", []):
                if keyword in text:
                    return index, rule["reply"]
        return None, None

    def is_cooled_down(self, group_id, keyword_index):
        key = (group_id, keyword_index)
        with self._lock:
            last = self._cooldown_map.get(key, 0)
            now = time.time()
            if now - last < self.cooldown:
                return True
            self._cooldown_map[key] = now
            return False

    def handle_group_message(self, data):
        group_id = data.get("group_id")
        if self.groups and group_id not in self.groups:
            return

        raw = data.get("message", "")
        if isinstance(raw, list):
            text = "".join(
                seg.get("data", {}).get("text", "")
                for seg in raw
                if seg.get("type") == "text"
            )
        else:
            text = str(raw)

        if not text.strip():
            return

        keyword_index, reply = self.match_keywords(text)
        if not reply:
            return

        if self.is_cooled_down(group_id, keyword_index):
            log.debug("冷却中，跳过回复 群%s", group_id)
            return

        log.info("触发关键词 群%s 消息: %s", group_id, text[:50])
        send_group_msg(self.cfg, group_id, reply)

    def handle_group_request(self, data):
        group_id = data.get("group_id")
        if self.groups and group_id not in self.groups:
            return

        if not self.auto_approve:
            return

        flag = data.get("flag", "")
        sub_type = data.get("sub_type", "add")
        user_id = data.get("user_id")

        if flag:
            log.info("入群申请 群%s 用户%s，自动同意", group_id, user_id)
            approve_join_request(self.cfg, flag, sub_type)

    def handle_event(self, data):
        post_type = data.get("post_type")
        if post_type == "message" and data.get("message_type") == "group":
            self.handle_group_message(data)
        elif post_type == "request" and data.get("request_type") == "group":
            self.handle_group_request(data)

    def run(self):
        ws_url = self.cfg["napcat_ws_url"]
        token = self.cfg.get("token", "")
        if token:
            ws_url = ws_url.rstrip("/") + f"?access_token={token}"

        log.info("连接 WebSocket: %s", ws_url.split("?")[0])

        def on_message(_ws, message):
            try:
                data = json.loads(message)
                self.handle_event(data)
            except Exception as exc:
                log.error("处理事件失败: %s", exc)

        def on_open(_ws):
            log.info("✅ WebSocket 已连接，机器人运行中...")

        def on_error(_ws, error):
            log.error("WebSocket 错误: %s", error)

        def on_close(_ws, code, msg):
            log.warning("WebSocket 断开 (%s, %s)，5秒后重连...", code, msg)
            time.sleep(5)
            self.run()

        ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        ws.run_forever(ping_interval=30, ping_timeout=10)


def cmd_test(cfg):
    log.info("测试 HTTP 连接...")
    try:
        result = api_call(cfg, "/get_login_info", {})
        if result.get("retcode") == 0:
            data = result.get("data", {})
            log.info("✅ 连接成功 QQ: %s 昵称: %s", data.get("user_id"), data.get("nickname"))
        else:
            log.error("❌ 响应异常: %s", result)
    except Exception as exc:
        log.error("❌ HTTP 连接失败: %s", exc)
        return

    log.info("获取群列表...")
    try:
        result = api_call(cfg, "/get_group_list", {})
        groups = result.get("data", [])
        log.info("已加入 %s 个群:", len(groups))
        for group in groups[:15]:
            log.info("  %s %s", group.get("group_id"), group.get("group_name"))
    except Exception as exc:
        log.error("获取群列表失败: %s", exc)


def main():
    parser = argparse.ArgumentParser(description="QQ 群管机器人")
    parser.add_argument("--config", default=None, help="配置文件路径，默认使用技能目录下 .config.json")
    parser.add_argument("--test", action="store_true", help="测试 NapCat HTTP 连接")
    args = parser.parse_args()

    cfg_path = Path(args.config) if args.config else DEFAULT_CONFIG
    cfg = load_config(cfg_path)

    if args.test:
        cmd_test(cfg)
        return

    bot = QQBot(cfg)
    try:
        bot.run()
    except KeyboardInterrupt:
        log.info("机器人已停止")


if __name__ == "__main__":
    main()
