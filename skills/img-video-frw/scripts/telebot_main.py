"""pyTelegramBotAPI 版本入口：支持按钮定制和登录状态切换。"""
import json
import re
import threading
import time
from io import BytesIO
from pathlib import Path

import requests
from telebot import TeleBot, apihelper, types

from api_client import ApiClient
from config import BOT_TOKEN, PROXY_URL, setup_logging


logger = setup_logging()
# 注册密码：正好 8 位，仅数字与英文字母，且同时包含数字和字母
REGISTER_PASSWORD_PATTERN = re.compile(r"^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9]{8}$")


def validate_register_password(password: str) -> tuple[bool, str]:
    if REGISTER_PASSWORD_PATTERN.fullmatch(password or ""):
        return True, ""
    return (
        False,
        "密码须为 8 位，仅可使用数字与英文字母，且必须同时包含数字和英文字母。",
    )


bot = TeleBot(BOT_TOKEN, parse_mode=None)
if PROXY_URL:
    apihelper.proxy = {"http": PROXY_URL, "https": PROXY_URL}
apihelper.CONNECT_TIMEOUT = 20
apihelper.READ_TIMEOUT = 40


def _with_retry(func, action_name: str, *args, **kwargs):
    last_exc = None
    for attempt in range(3):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            logger.warning(f"{action_name} 失败，第 {attempt + 1}/3 次：{exc}")
            time.sleep(1.5 * (attempt + 1))
    logger.error(f"{action_name} 最终失败：{last_exc}")
    return None


_origin_send_message = bot.send_message
_origin_edit_message_text = bot.edit_message_text
_origin_send_photo = bot.send_photo
_origin_send_video = bot.send_video
_origin_send_document = bot.send_document


def _safe_send_message(*args, **kwargs):
    return _with_retry(_origin_send_message, "send_message", *args, **kwargs)


def _safe_edit_message_text(*args, **kwargs):
    return _with_retry(_origin_edit_message_text, "edit_message_text", *args, **kwargs)


def _safe_send_photo(*args, **kwargs):
    return _with_retry(_origin_send_photo, "send_photo", *args, **kwargs)


def _safe_send_video(*args, **kwargs):
    return _with_retry(_origin_send_video, "send_video", *args, **kwargs)


def _safe_send_document(*args, **kwargs):
    return _with_retry(_origin_send_document, "send_document", *args, **kwargs)


bot.send_message = _safe_send_message
bot.edit_message_text = _safe_edit_message_text
bot.send_photo = _safe_send_photo
bot.send_video = _safe_send_video
bot.send_document = _safe_send_document

# 用户会话缓存
user_data_store = {}
# 登录流程状态: chat_id -> "waiting_login_payload"
chat_state = {}
TOKEN_STORE_FILE = Path(__file__).resolve().parent / "token_store.json"
task_polling_registry = {}
ai_app_item_cache = {}
EFFECT_PREVIEW_MAX_SIZE = (320, 320)


def load_token_store():
    if not TOKEN_STORE_FILE.exists():
        return
    try:
        raw = json.loads(TOKEN_STORE_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            for key, value in raw.items():
                chat_id = int(key)
                # 兼容旧格式: {"chat_id": "token"}
                if isinstance(value, str) and value:
                    user_data_store.setdefault(chat_id, {})
                    user_data_store[chat_id]["token"] = value
                    continue

                # 新格式: {"chat_id": {"token": "...", "user_info": {...}}}
                if isinstance(value, dict) and value.get("token"):
                    user_data_store.setdefault(chat_id, {})
                    user_data_store[chat_id]["token"] = value.get("token")
                    if isinstance(value.get("user_info"), dict):
                        user_data_store[chat_id]["user_info"] = value.get("user_info")
    except Exception as exc:
        logger.error(f"加载 token_store 失败: {exc}")


def save_token_store():
    try:
        payload = {
            str(chat_id): {
                "token": data.get("token"),
                "user_info": data.get("user_info"),
            }
            for chat_id, data in user_data_store.items()
            if data.get("token")
        }
        TOKEN_STORE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.error(f"保存 token_store 失败: {exc}")


def is_logged_in(chat_id: int) -> bool:
    user_info = user_data_store.get(chat_id, {})
    return bool(user_info.get("token"))


def build_init_keyboard(chat_id: int) -> types.ReplyKeyboardMarkup:
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    if is_logged_in(chat_id):
        keyboard.add(types.KeyboardButton("ai应用"), types.KeyboardButton("ai创作"))
        keyboard.add(types.KeyboardButton("动作控制"), types.KeyboardButton("lora列表"))
    else:
        keyboard.add(types.KeyboardButton("登陆"), types.KeyboardButton("注册"))
    return keyboard


def build_login_keyboard() -> types.ReplyKeyboardMarkup:
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    keyboard.add(types.KeyboardButton("🚫 取消登录"), types.KeyboardButton("🔄 重新获取验证码"))
    return keyboard


def build_ai_create_keyboard() -> types.ReplyKeyboardMarkup:
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    keyboard.add(types.KeyboardButton("文生图"), types.KeyboardButton("图生图"))
    keyboard.add(types.KeyboardButton("文生视频"), types.KeyboardButton("图生视频"))
    keyboard.add(types.KeyboardButton("返回首页"))
    return keyboard


def build_ai_create_inline_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        types.InlineKeyboardButton("文生图", callback_data="ai_create:text2image"),
        types.InlineKeyboardButton("图生图", callback_data="ai_create:image2image"),
    )
    keyboard.add(
        types.InlineKeyboardButton("文生视频", callback_data="ai_create:text2video"),
        types.InlineKeyboardButton("图生视频", callback_data="ai_create:image2video"),
    )
    return keyboard


def build_login_success_inline_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        types.InlineKeyboardButton("ai应用", callback_data="main:ai_apps"),
        types.InlineKeyboardButton("ai创作", callback_data="main:ai_create"),
    )
    keyboard.add(
        types.InlineKeyboardButton("动作控制", callback_data="main:action_control"),
        types.InlineKeyboardButton("lora列表", callback_data="main:lora_list"),
    )
    return keyboard


def build_ai_apps_pagination_keyboard(page: int, has_prev: bool, has_next: bool) -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    buttons = []
    if has_prev:
        buttons.append(types.InlineKeyboardButton("⬅️ 上一页", callback_data=f"ai_apps:page:{page - 1}"))
    if has_next:
        buttons.append(types.InlineKeyboardButton("下一页 ➡️", callback_data=f"ai_apps:page:{page + 1}"))
    if buttons:
        keyboard.add(*buttons)
    return keyboard


def format_ai_apps_list_message(result: dict, page: int) -> str:
    items = result.get("data") or []
    meta = result.get("meta") or {}
    pagination = meta.get("pagination") or {}
    total = pagination.get("total", len(items))
    pages = pagination.get("pages", 1)

    lines = [f"🧩 AI应用列表（第 {page}/{pages} 页，共 {total} 条）", "────────────"]
    if not items:
        lines.append("暂无数据")
        return "\n".join(lines)

    for idx, item in enumerate(items[:8], start=1):
        name = item.get("name") or "-"
        output_type = item.get("outputMimeType") or "-"
        cost = item.get("costPoints", "-")
        lines.append(f"{idx}. {name}")
        lines.append(f"   类型：{output_type} | 积分：{cost}")
    return "\n".join(lines)


def build_ai_app_item_keyboard(app_id: str) -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(types.InlineKeyboardButton("使用", callback_data=f"ai_app:use:{app_id}"))
    return keyboard


def build_open_original_keyboard(url: str) -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(types.InlineKeyboardButton("打开原图", url=url))
    return keyboard


def send_small_image_preview(chat_id: int, image_url: str, caption: str):
    """发送缩略图预览，失败则回退为原图 URL 发送。"""
    try:
        resp = requests.get(image_url, timeout=15, proxies=apihelper.proxy or None)
        resp.raise_for_status()
        try:
            from PIL import Image
        except Exception:
            Image = None
        if Image is None:
            bot.send_photo(chat_id, image_url, caption=caption)
            return

        image = Image.open(BytesIO(resp.content))
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        image.thumbnail(EFFECT_PREVIEW_MAX_SIZE)

        out = BytesIO()
        fmt = "PNG" if image.mode == "RGBA" else "JPEG"
        image.save(out, format=fmt, quality=85)
        out.seek(0)
        out.name = f"preview.{fmt.lower()}"
        bot.send_photo(chat_id, out, caption=caption, reply_markup=build_open_original_keyboard(image_url))
    except Exception:
        bot.send_photo(chat_id, image_url, caption=caption, reply_markup=build_open_original_keyboard(image_url))


def send_ai_apps_list(chat_id: int, page: int = 1):
    result, success = ApiClient.list_ai_apps(page=page, size=8)
    # 兼容后端对 size=8 的限制：遇到 555 时回退到 size=20，再本地截取 8 条展示
    if not success:
        error_msg = str((result.get("error") or {}).get("message", ""))
        if "555" in error_msg:
            result, success = ApiClient.list_ai_apps(page=page, size=20)
    if not success:
        error_msg = result.get("error", {}).get("message", "获取失败")
        bot.send_message(chat_id, f"❌ 获取 AI 应用列表失败：{error_msg}", reply_markup=build_init_keyboard(chat_id))
        return

    meta = result.get("meta") or {}
    pagination = meta.get("pagination") or {}
    has_prev = bool(pagination.get("has_prev"))
    has_next = bool(pagination.get("has_next"))
    items = (result.get("data") or [])[:8]
    if not items:
        bot.send_message(chat_id, "🧩 AI应用列表\n────────────\n暂无数据")
        return

    # 纯文本列表：每条记录发送一条文本消息 + 操作按钮
    for idx, item in enumerate(items, start=1):
        app_id = str(item.get("id") or "-")
        raw_name = item.get("name") or "-"
        name = " ".join(str(raw_name).split())
        ai_app_item_cache[app_id] = item

        covers = item.get("covers") or []
        doc_url = covers[0] if isinstance(covers, list) and covers else None
        caption = f"{idx}. {name}"

        if doc_url:
            bot.send_document(
                chat_id,
                document=doc_url,
                caption=caption,
                reply_markup=build_ai_app_item_keyboard(app_id),
            )
        else:
            bot.send_message(chat_id, caption, reply_markup=build_ai_app_item_keyboard(app_id))

    meta_line = format_ai_apps_list_message(result, page).splitlines()[0]
    bot.send_message(
        chat_id,
        f"{meta_line}\n点击下方按钮翻页",
        reply_markup=build_ai_apps_pagination_keyboard(page, has_prev, has_next),
    )


@bot.callback_query_handler(func=lambda call: call.data.startswith("ai_app:"))
def ai_app_action_callback_handler(call):
    chat_id = call.message.chat.id
    if not is_logged_in(chat_id):
        bot.answer_callback_query(call.id, "请先登录")
        bot.send_message(chat_id, "❌ 请先登录。", reply_markup=build_init_keyboard(chat_id))
        return

    parts = call.data.split(":", 2)
    if len(parts) != 3:
        bot.answer_callback_query(call.id, "参数错误")
        return
    action, app_id = parts[1], parts[2]
    app_item = ai_app_item_cache.get(app_id) or {}
    app_name = app_item.get("name") or app_id

    bot.answer_callback_query(call.id)
    if action == "effect":
        covers = app_item.get("covers") or []
        output_type = (app_item.get("outputMimeType") or "").strip().lower()
        effect_url = None
        if isinstance(covers, list) and covers:
            effect_url = covers[0]

        if effect_url:
            bot.send_message(chat_id, f"🔗 {app_name} 效果图链接：{effect_url}")
        else:
            bot.send_message(chat_id, f"🖼 {app_name} 暂无效果图")
        return

    if action == "use":
        chat_state[chat_id] = f"waiting_ai_app_image:{app_id}"
        bot.send_message(
            chat_id,
            f"🚀 使用应用：{app_name}\n请直接发送一张图片，我将基于该图片提交任务。",
        )
        return


def reply_login_panel(message):
    force_reply = types.ForceReply(input_field_placeholder="例如：alice/123456/8a9k", selective=True)
    bot.send_message(
        message.chat.id,
        "DreamaI 登录面板\n请回复本条消息：账号/密码/验证码",
        reply_markup=force_reply,
    )


@bot.message_handler(commands=["start"])
def start_handler(message):
    chat_id = message.chat.id
    bot.send_message(
        chat_id,
        "🎉 欢迎使用 DreamaI 机器人！",
        reply_markup=build_init_keyboard(chat_id),
    )


@bot.message_handler(commands=["cancel"])
def cancel_handler(message):
    chat_id = message.chat.id
    chat_state.pop(chat_id, None)
    user_data_store.pop(chat_id, None)
    save_token_store()
    bot.send_message(chat_id, "🚫 操作已取消", reply_markup=build_init_keyboard(chat_id))

@bot.message_handler(commands=["logout"])
def logout_handler(message):
    chat_id = message.chat.id
    chat_state.pop(chat_id, None)
    user_data_store.pop(chat_id, None)
    save_token_store()
    bot.send_message(chat_id, "已退出登陆", reply_markup=build_init_keyboard(chat_id))


@bot.message_handler(commands=["login"])
def login_handler(message):
    chat_id = message.chat.id
    if is_logged_in(chat_id):
        bot.send_message(chat_id, "你已登录，如需切换账号请先点击「取消登陆」。", reply_markup=build_init_keyboard(chat_id))
        return
    chat_state[chat_id] = "waiting_login_payload"
    user_data_store.pop(chat_id, None)
    send_captcha_with_prompt(chat_id)


@bot.message_handler(commands=["register"])
def register_handler(message):
    chat_id = message.chat.id
    if is_logged_in(chat_id):
        bot.send_message(
            chat_id,
            "你已登录，如需注册新账号请先点击「取消登陆」。",
            reply_markup=build_init_keyboard(chat_id),
        )
        return
    chat_state[chat_id] = "waiting_register_payload"
    user_data_store.pop(chat_id, None)
    send_register_captcha_with_prompt(chat_id)


@bot.message_handler(commands=["person"])
def person_handler(message):
    chat_id = message.chat.id
    if not is_logged_in(chat_id):
        bot.send_message(chat_id, "❌ 请先登录", reply_markup=build_init_keyboard(chat_id))
        return

    user = user_data_store[chat_id].get("user_info", {})
    content = (
        "👤 个人中心\n"
        "────────────\n"
        f"用户名：{user.get('username', '-')}\n"
        f"邮箱：{user.get('email', '-')}\n"
        f"国家：{user.get('preferredCountry', '-')}"
    )
    bot.send_message(chat_id, content, reply_markup=build_init_keyboard(chat_id))


@bot.message_handler(commands=["ai_create"])
def ai_create_handler(message):
    chat_id = message.chat.id
    if not is_logged_in(chat_id):
        bot.send_message(
            chat_id,
            "❌ 请先登录后再使用 AI 创作（文生图 / 图生图 / 文生视频 / 图生视频）。",
            reply_markup=build_init_keyboard(chat_id),
        )
        return
    bot.send_message(
        chat_id,
        "🧠 AI创作\n请选择创作模式：",
        reply_markup=build_ai_create_inline_keyboard(),
    )


@bot.callback_query_handler(func=lambda call: call.data.startswith("ai_create:"))
def ai_create_callback_handler(call):
    chat_id = call.message.chat.id
    action = call.data.split(":", 1)[1]

    if action == "back_home":
        bot.answer_callback_query(call.id, "已返回首页")
        bot.send_message(chat_id, "已返回首页", reply_markup=build_init_keyboard(chat_id))
        return

    if not is_logged_in(chat_id):
        bot.answer_callback_query(call.id, "请先登录")
        bot.send_message(
            chat_id,
            "❌ 请先登录后再使用创作功能。",
            reply_markup=build_init_keyboard(chat_id),
        )
        return

    if action in {"text2image", "text2video"}:
        chat_state[chat_id] = f"waiting_prompt_{action}"
        prompt_title = "文生图" if action == "text2image" else "文生视频"
        bot.answer_callback_query(call.id)
        bot.send_message(
            chat_id,
            f"你选择了：{prompt_title}\n请输入描述词：",
            reply_markup=types.ForceReply(input_field_placeholder="请输入创作描述", selective=True),
        )
        return

    action_text_map = {
        "image2image": "你选择了：图生图（功能开发中）",
        "image2video": "你选择了：图生视频（功能开发中）",
    }
    text = action_text_map.get(action, "暂不支持该操作")
    bot.answer_callback_query(call.id)
    bot.send_message(chat_id, text, reply_markup=build_ai_create_inline_keyboard())


@bot.callback_query_handler(func=lambda call: call.data.startswith("main:"))
def main_menu_callback_handler(call):
    chat_id = call.message.chat.id
    action = call.data.split(":", 1)[1]

    if not is_logged_in(chat_id):
        bot.answer_callback_query(call.id, "请先登录")
        bot.send_message(chat_id, "❌ 请先登录。", reply_markup=build_init_keyboard(chat_id))
        return

    bot.answer_callback_query(call.id)
    if action == "ai_apps":
        ai_apps_handler(call.message)
    elif action == "ai_create":
        ai_create_handler(call.message)
    elif action == "action_control":
        action_control_handler(call.message)
    elif action == "lora_list":
        lora_list_handler(call.message)


@bot.callback_query_handler(func=lambda call: call.data.startswith("ai_apps:page:"))
def ai_apps_pagination_callback_handler(call):
    chat_id = call.message.chat.id
    if not is_logged_in(chat_id):
        bot.answer_callback_query(call.id, "请先登录")
        bot.send_message(chat_id, "❌ 请先登录。", reply_markup=build_init_keyboard(chat_id))
        return

    try:
        page = int(call.data.split(":")[-1])
    except ValueError:
        bot.answer_callback_query(call.id, "页码错误")
        return
    bot.answer_callback_query(call.id)
    send_ai_apps_list(chat_id, page=page)


@bot.message_handler(commands=["ai_apps"])
def ai_apps_handler(message):
    chat_id = message.chat.id
    if not is_logged_in(chat_id):
        bot.send_message(chat_id, "❌ 请先登录后再使用 AI 应用。", reply_markup=build_init_keyboard(chat_id))
        return
    send_ai_apps_list(chat_id, page=1)


@bot.message_handler(commands=["action_control"])
def action_control_handler(message):
    bot.send_message(message.chat.id, "🎮 动作控制功能开发中...", reply_markup=build_init_keyboard(message.chat.id))

@bot.message_handler(commands=["lora_list"])
def lora_list_handler(message):
    bot.send_message(message.chat.id, "🧾 lora列表功能开发中...", reply_markup=build_init_keyboard(message.chat.id))


@bot.message_handler(content_types=["photo"])
def photo_router(message):
    chat_id = message.chat.id
    current_state = chat_state.get(chat_id, "")
    if not str(current_state).startswith("waiting_ai_app_image:"):
        return
    _handle_ai_app_image_submit(message, message.photo[-1].file_id)


@bot.message_handler(content_types=["document"])
def document_router(message):
    chat_id = message.chat.id
    current_state = chat_state.get(chat_id, "")
    if not str(current_state).startswith("waiting_ai_app_image:"):
        return
    mime_type = (message.document.mime_type or "").lower()
    if not mime_type.startswith("image/"):
        bot.send_message(chat_id, "❌ 请发送图片文件（jpg/png/webp 等）。")
        return
    _handle_ai_app_image_submit(message, message.document.file_id)


def _handle_ai_app_image_submit(message, file_id: str):
    chat_id = message.chat.id
    current_state = chat_state.get(chat_id, "")
    try:
        if not str(current_state).startswith("waiting_ai_app_image:"):
            return

        if not is_logged_in(chat_id):
            chat_state.pop(chat_id, None)
            bot.send_message(chat_id, "❌ 登录状态已失效，请先重新登录。", reply_markup=build_init_keyboard(chat_id))
            return

        app_id = str(current_state).split(":", 1)[1]
        app_item = ai_app_item_cache.get(app_id) or {}
        if not app_item:
            chat_state.pop(chat_id, None)
            bot.send_message(chat_id, "❌ 应用信息不存在，请重新打开 ai应用 列表。")
            return

        user = user_data_store.get(chat_id, {})
        token = user.get("token")
        user_id = (user.get("user_info") or {}).get("id")
        if not token or not user_id:
            chat_state.pop(chat_id, None)
            bot.send_message(chat_id, "❌ 缺少用户凭证，请先重新登录。", reply_markup=build_init_keyboard(chat_id))
            return

        bot.send_message(chat_id, "✅ 已收到图片，正在提交任务…")
        file_info = bot.get_file(file_id)
        image_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info.file_path}"

        bot.send_message(chat_id, "⏳ 正在提交 AI 应用任务，请稍候...")
        result, success = ApiClient.submit_ai_app_generation(
            token=token,
            user_id=user_id,
            app_item=app_item,
            source_image_url=image_url,
        )
        if success:
            data = result.get("data", {})
            task_id = data.get("taskID")
            status = str(data.get("status", "")).lower()
            bot.send_message(
                chat_id,
                "✅ 提交成功\n"
                f"任务ID：{data.get('id', '-')}\n"
                f"TaskID：{task_id or '-'}\n"
                f"状态：{data.get('status', '-')}",
            )
            if status == "processing" and task_id:
                progress_message = bot.send_message(chat_id, "⏳ 任务进度：0%\n状态：processing")
                start_task_progress_polling(chat_id, task_id, token, progress_message.message_id)
        else:
            error_msg = result.get("error", {}).get("message", "提交失败")
            bot.send_message(chat_id, f"❌ 提交失败：{error_msg}")

        chat_state.pop(chat_id, None)
    except Exception as exc:
        chat_state.pop(chat_id, None)
        bot.send_message(chat_id, f"❌ 图片处理失败：{exc}")


@bot.message_handler(func=lambda m: True, content_types=["text"])
def text_router(message):
    chat_id = message.chat.id
    text = (message.text or "").strip()

    # 全局文本按钮
    if text == "登陆":
        login_handler(message)
        return
    if text == "注册":
        register_handler(message)
        return
    if text == "取消登陆":
        user_data_store.pop(chat_id, None)
        chat_state.pop(chat_id, None)
        save_token_store()
        bot.send_message(chat_id, "已取消登陆", reply_markup=build_init_keyboard(chat_id))
        return
    if text == "个人中心":
        person_handler(message)
        return
    if text == "ai创作":
        ai_create_handler(message)
        return
    if text == "ai应用":
        ai_apps_handler(message)
        return
    if text == "动作控制":
        action_control_handler(message)
        return
    if text == "lora列表":
        lora_list_handler(message)
        return
    if text == "退出登陆":
        logout_handler(message)
        return
    if text == "返回首页":
        bot.send_message(chat_id, "已返回首页", reply_markup=build_init_keyboard(chat_id))
        return
    if text == "🚫 取消登录":
        chat_state.pop(chat_id, None)
        user_data_store.pop(chat_id, None)
        save_token_store()
        bot.send_message(chat_id, "已取消登录", reply_markup=build_init_keyboard(chat_id))
        return
    if text == "🔄 重新获取验证码":
        st = chat_state.get(chat_id)
        if st == "waiting_login_payload":
            send_captcha_with_prompt(chat_id)
        elif st == "waiting_register_payload":
            send_register_captcha_with_prompt(chat_id)
        else:
            bot.send_message(chat_id, "请先点击「登陆」或「注册」开始流程。")
        return

    current_state = chat_state.get(chat_id)

    if str(current_state).startswith("waiting_ai_app_image:"):
        bot.send_message(chat_id, "请直接发送图片，不要发送文本。")
        return

    if current_state == "waiting_login_payload":
        parts = [part.strip() for part in text.split("/", 2)]
        if len(parts) != 3:
            bot.send_message(chat_id, "❌ 格式错误，请输入：账号/密码/验证码")
            reply_login_panel(message)
            return

        username, password, captcha_code = parts
        if not username or not password or not captcha_code:
            bot.send_message(chat_id, "❌ 账号、密码、验证码都不能为空")
            reply_login_panel(message)
            return

        user_data_store.setdefault(chat_id, {})
        user_data_store[chat_id]["username"] = username
        user_data_store[chat_id]["password"] = password
        do_login(chat_id, captcha_code)
        return

    if current_state == "waiting_register_payload":
        parts = [part.strip() for part in text.split("/")]
        if len(parts) == 3:
            username, password, captcha_code = parts
            email = username
        elif len(parts) == 4:
            username, email, password, captcha_code = parts
        else:
            bot.send_message(chat_id, "❌ 格式错误，请输入：用户名/密码/验证码")
            reply_register_panel(message)
            return
        if not username or not password or not captcha_code or not email:
            bot.send_message(chat_id, "❌ 用户名、密码、验证码均不能为空")
            reply_register_panel(message)
            return
        ok_pwd, pwd_err = validate_register_password(password)
        if not ok_pwd:
            bot.send_message(chat_id, f"❌ {pwd_err}")
            reply_register_panel(message)
            return
        user_data_store.setdefault(chat_id, {})
        user_data_store[chat_id]["reg_username"] = username
        user_data_store[chat_id]["reg_email"] = email
        user_data_store[chat_id]["reg_password"] = password
        do_register(chat_id, captcha_code)
        return

    if current_state in {"waiting_prompt_text2image", "waiting_prompt_text2video"}:
        if not text:
            bot.send_message(chat_id, "❌ 描述不能为空，请重新输入。")
            return
        if not is_logged_in(chat_id):
            chat_state.pop(chat_id, None)
            bot.send_message(chat_id, "❌ 登录状态已失效，请先重新登录。", reply_markup=build_init_keyboard(chat_id))
            return

        mode = "text2image" if current_state == "waiting_prompt_text2image" else "text2video"
        user = user_data_store.get(chat_id, {})
        token = user.get("token")
        user_id = (user.get("user_info") or {}).get("id")
        if not token or not user_id:
            chat_state.pop(chat_id, None)
            bot.send_message(chat_id, "❌ 缺少用户凭证，请先重新登录。", reply_markup=build_init_keyboard(chat_id))
            return

        bot.send_message(chat_id, "⏳ 正在提交任务，请稍候...")
        result, success = ApiClient.submit_generation(mode=mode, text=text, token=token, user_id=user_id)
        if success:
            task_data = result.get("data", {})
            task_status = str(task_data.get("status", "")).lower()
            task_id = task_data.get("taskID")
            bot.send_message(
                chat_id,
                "✅ 提交成功\n"
                f"任务ID：{task_data.get('id', '-')}\n"
                f"TaskID：{task_id or '-'}\n"
                f"状态：{task_data.get('status', '-')}",
                reply_markup=build_ai_create_inline_keyboard(),
            )
            if task_status == "processing" and task_id:
                progress_message = bot.send_message(chat_id, "⏳ 任务进度：0%\n状态：processing")
                start_task_progress_polling(chat_id, task_id, token, progress_message.message_id)
        else:
            error_msg = result.get("error", {}).get("message", "提交失败")
            bot.send_message(chat_id, f"❌ 提交失败：{error_msg}", reply_markup=build_ai_create_inline_keyboard())
        chat_state.pop(chat_id, None)
        return


def send_captcha(chat_id: int):
    captcha_id, image_io = ApiClient.get_captcha()
    if not captcha_id or not image_io:
        bot.send_message(chat_id, "❌ 获取验证码失败，请稍后重试", reply_markup=build_login_keyboard())
        return
    user_data_store.setdefault(chat_id, {})
    user_data_store[chat_id]["captcha_id"] = captcha_id
    bot.send_photo(chat_id, image_io, caption="验证码图片", reply_markup=build_login_keyboard())


def send_captcha_with_prompt(chat_id: int):
    bot.send_message(
        chat_id,
        "DreamaI 登录面板\n请回复本条消息：账号/密码/验证码\n────────────",
        reply_markup=types.ForceReply(input_field_placeholder="例如：alice/123456/8a9k", selective=True),
    )
    send_captcha(chat_id)


def send_register_captcha_with_prompt(chat_id: int):
    bot.send_message(
        chat_id,
        "DreamaI 注册面板\n"
        "密码要求：8 位，仅数字与英文字母，且须同时含数字和字母。\n"
        "请回复本条消息：用户名/密码/验证码\n"
        "────────────",
        reply_markup=types.ForceReply(
            input_field_placeholder="例如：alice/Abc12345/1234",
            selective=True,
        ),
    )
    send_captcha(chat_id)


def reply_register_panel(message):
    bot.send_message(
        message.chat.id,
        "DreamaI 注册面板\n"
        "密码要求：8 位，仅数字与英文字母，且须同时含数字和字母。\n"
        "请回复本条消息：用户名/密码/验证码\n"
        "────────────",
        reply_markup=types.ForceReply(
            input_field_placeholder="例如：alice/Abc12345/1234",
            selective=True,
        ),
    )


def do_register(chat_id: int, captcha_code: str):
    user = user_data_store.get(chat_id, {})
    body = {
        "username": user.get("reg_username"),
        "nickname": "",
        "email": user.get("reg_email"),
        "password": user.get("reg_password"),
        "captchaId": user.get("captcha_id"),
        "captchaCode": captcha_code,
        "nsfw": True,
    }
    result, success = ApiClient.register(body)
    if success:
        data = result.get("data", {})
        user_data_store[chat_id]["token"] = data["accessToken"]
        user_data_store[chat_id]["user_info"] = {
            "id": data.get("userID"),
            "username": user.get("reg_username"),
            "email": data.get("email", user.get("reg_email")),
            "preferredCountry": "-",
        }
        for key in ("reg_username", "reg_email", "reg_password"):
            user_data_store[chat_id].pop(key, None)
        save_token_store()
        chat_state.pop(chat_id, None)
        msg = data.get("message", "注册成功")
        bot.send_message(chat_id, f"🎉 {msg}，已自动登录。", reply_markup=build_init_keyboard(chat_id))
        return

    error_msg = result.get("error", {}).get("message", "注册失败")
    bot.send_message(
        chat_id,
        f"❌ 注册失败：{error_msg}\n"
        "请按格式重新输入：用户名/密码/验证码（密码：8 位数字+英文字母）",
        reply_markup=build_login_keyboard(),
    )


def do_login(chat_id: int, captcha_code: str):
    user = user_data_store.get(chat_id, {})
    params = {
        "username": user.get("username"),
        "password": user.get("password"),
        "captchaId": user.get("captcha_id"),
        "captchaCode": captcha_code,
        "remember": False,
    }
    result, success = ApiClient.login(params)
    if success:
        user_data_store[chat_id]["token"] = result["data"]["accessToken"]
        user_data_store[chat_id]["user_info"] = result["data"]["user"]
        save_token_store()
        chat_state.pop(chat_id, None)
        bot.send_message(
            chat_id,
            "🎉 登录成功",
            reply_markup=build_login_success_inline_keyboard(),
        )
        return

    error_msg = result.get("error", {}).get("message", "登录失败")
    bot.send_message(chat_id, f"❌ 登录失败：{error_msg}\n请按格式重新输入：账号/密码/验证码", reply_markup=build_login_keyboard())


def _extract_query_item(result: dict):
    data = result.get("data")
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        # 兼容 data: {"items":[...]} 结构
        items = data.get("items")
        if isinstance(items, list) and items:
            return items[0]
        return data
    return {}


def _extract_progress_percent(item: dict):
    for key in ("progress", "progressPercent", "percentage", "percent"):
        value = item.get(key)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str) and value.replace(".", "", 1).isdigit():
            return int(float(value))
    return None


def _normalize_generation_item(item: dict):
    """
    轮询接口返回结构可能为:
    - data[0].generation.{status,progress,...}
    - 或扁平结构 data[0].{status,progress,...}
    统一归一到真正包含状态的对象。
    """
    if isinstance(item, dict) and isinstance(item.get("generation"), dict):
        return item["generation"]
    return item


def start_task_progress_polling(chat_id: int, task_id: str, token: str, progress_message_id: int):
    if not task_id or not token:
        return
    if task_polling_registry.get(task_id):
        return

    task_polling_registry[task_id] = True

    def _worker():
        last_percent = -1
        try:
            for _ in range(120):  # 最多轮询约 10 分钟
                result, success = ApiClient.query_generation(task_id=task_id, token=token)
                if not success:
                    time.sleep(5)
                    continue

                raw_item = _extract_query_item(result)
                item = _normalize_generation_item(raw_item)
                status = str(item.get("status", "")).lower()
                progress = _extract_progress_percent(item)

                if progress is not None and progress != last_percent:
                    last_percent = progress
                    try:
                        bot.edit_message_text(
                            f"⏳ 任务进度：{progress}%\n状态：{status or 'processing'}",
                            chat_id=chat_id,
                            message_id=progress_message_id,
                        )
                    except Exception:
                        pass

                if status in {"completed", "success", "succeeded", "done", "finished"}:
                    try:
                        bot.edit_message_text(
                            "✅ 任务进度：100%\n状态：completed",
                            chat_id=chat_id,
                            message_id=progress_message_id,
                        )
                    except Exception:
                        pass
                    result_urls = item.get("resultUrls")
                    mime_type = (item.get("mimeType") or "").strip().lower()
                    if isinstance(result_urls, list) and result_urls:
                        first_result = result_urls[0]
                        if mime_type == "video/mp4":
                            try:
                                bot.send_video(chat_id, first_result, caption="✅ 生成完成（视频）")
                            except Exception:
                                bot.send_message(chat_id, f"✅ 生成完成（视频）：{first_result}")
                        elif mime_type == "image/png" or mime_type.startswith("image/"):
                            try:
                                bot.send_photo(chat_id, first_result, caption="✅ 生成完成（图片）")
                            except Exception:
                                bot.send_message(chat_id, f"✅ 生成完成（图片）：{first_result}")
                        else:
                            try:
                                bot.send_photo(chat_id, first_result, caption="✅ 生成完成（结果）")
                            except Exception:
                                try:
                                    bot.send_video(chat_id, first_result, caption="✅ 生成完成（结果）")
                                except Exception:
                                    bot.send_message(chat_id, f"✅ 生成完成，结果地址：{first_result}")
                    return

                if status in {"failed", "error", "cancelled", "canceled"}:
                    try:
                        bot.edit_message_text(
                            f"❌ 任务进度：{progress if progress is not None else 0}%\n状态：{status}",
                            chat_id=chat_id,
                            message_id=progress_message_id,
                        )
                    except Exception:
                        pass
                    return

                time.sleep(5)
            try:
                bot.edit_message_text(
                    "ℹ️ 进度轮询已结束（超时），请稍后在结果页查看最终状态。",
                    chat_id=chat_id,
                    message_id=progress_message_id,
                )
            except Exception:
                pass
        finally:
            task_polling_registry.pop(task_id, None)

    threading.Thread(target=_worker, daemon=True).start()


# ============================================================
# img-video task commands (SKILL.md 标准指令)
# ============================================================

API_KEY_STORE = {}  # chat_id -> {'img_key': ..., 'vid_key': ...}
TASK_STORE = {}     # chat_id -> {'img_tasks': [], 'vid_tasks': []}

def _parse_task_args(text: str) -> dict:
    """解析 img_task_create --prompt "xxx" --img_url "xxx" 格式的参数"""
    args = {}
    parts = text.split()
    i = 0
    while i < len(parts):
        if parts[i] == '--prompt' and i+1 < len(parts):
            args['prompt'] = parts[i+1].strip('"\'')
            i += 2
        elif parts[i] == '--img_url' and i+1 < len(parts):
            args['img_url'] = parts[i+1].strip('"\'')
            i += 2
        elif parts[i] == '--vid_url' and i+1 < len(parts):
            args['vid_url'] = parts[i+1].strip('"\'')
            i += 2
        elif parts[i] == '--task_id' and i+1 < len(parts):
            args['task_id'] = parts[i+1].strip('"\'')
            i += 2
        else:
            i += 1
    return args


def _get_token(chat_id: int) -> str:
    """获取当前用户的 token"""
    token = API_KEY_STORE.get(chat_id, {}).get('img_key') or API_KEY_STORE.get(chat_id, {}).get('vid_key')
    if not token:
        data = user_data_store.get(chat_id, {})
        token = data.get('token')
    if not token:
        from config import GENERATION_CONFIG
        token = GENERATION_CONFIG.get('apikey', '')
    return token


def _ensure_task_store(chat_id: int):
    if chat_id not in TASK_STORE:
        TASK_STORE[chat_id] = {'img_tasks': [], 'vid_tasks': []}


@bot.message_handler(commands=["img_key"])
def img_key_cmd(message):
    """设置图像 API KEY"""
    chat_id = message.chat.id
    parts = message.text.split(maxsplit=1)
    if len(parts) < 2:
        bot.reply_to(message, "📋 用法：\n`/img_key <API_KEY>`")
        return
    key = parts[1].strip()
    if chat_id not in API_KEY_STORE:
        API_KEY_STORE[chat_id] = {}
    API_KEY_STORE[chat_id]['img_key'] = key
    bot.reply_to(message, f"✅ 图像 API KEY 已设置")


@bot.message_handler(commands=["vid_key"])
def vid_key_cmd(message):
    """设置视频 API KEY"""
    chat_id = message.chat.id
    parts = message.text.split(maxsplit=1)
    if len(parts) < 2:
        bot.reply_to(message, "📋 用法：\n`/vid_key <API_KEY>`")
        return
    key = parts[1].strip()
    if chat_id not in API_KEY_STORE:
        API_KEY_STORE[chat_id] = {}
    API_KEY_STORE[chat_id]['vid_key'] = key
    bot.reply_to(message, f"✅ 视频 API KEY 已设置")


@bot.message_handler(commands=["img_task_create"])
def img_task_create_cmd(message):
    """提交图像生成任务"""
    chat_id = message.chat.id
    text = message.text or ''
    args = _parse_task_args(text)
    
    prompt = args.get('prompt', '').strip('"\'')
    img_url = args.get('img_url')
    
    if not prompt:
        bot.reply_to(message, "📋 用法：\n`/img_task_create --prompt \"描述\" [--img_url \"参考图URL\"]`")
        return
    
    user_id = str(chat_id)
    token = _get_token(chat_id)
    
    mode = 'img2img' if img_url else 'text2image'
    result, success = ApiClient.submit_generation(
        mode=mode,
        text=prompt,
        token=token,
        user_id=user_id,
        img_url=img_url
    )
    
    if not success or not result.get('success'):
        bot.reply_to(message, f"❌ 提交失败：{result.get('error', {}).get('message', result)}")
        return
    
    data = result.get('data', {})
    task_id = data.get('taskID')
    
    _ensure_task_store(chat_id)
    TASK_STORE[chat_id]['img_tasks'].append({'task_id': task_id, 'prompt': prompt, 'status': 'processing'})
    
    msg = f"✅ 图像任务已提交\n🆔 {task_id}\n📝 {prompt[:50]}\n⏳ 等待生成..."
    if img_url:
        msg += f"\n🖼️ 参考图：{img_url[:50]}..."
    bot.reply_to(message, msg)
    
    threading.Thread(target=_poll_img_task, args=(chat_id, task_id, message.message_id), daemon=True).start()


def _poll_img_task(chat_id: int, task_id: str, orig_msg_id: int):
    """轮询图像任务状态"""
    import time
    token = _get_token(chat_id)
    
    for _ in range(60):
        time.sleep(5)
        result, ok = ApiClient.query_generation(task_id, token)
        if not ok:
            continue
        data = result.get('data', [{}])[0] if isinstance(result.get('data'), list) else {}
        gen = data.get('generation', {})
        status = gen.get('status')
        
        if status == 'completed':
            urls = gen.get('resultUrls', [])
            if urls:
                try:
                    bot.send_photo(chat_id, urls[0], caption=f"✅ 图像生成完成\n🆔 {task_id}")
                except Exception:
                    bot.send_message(chat_id, f"✅ 图像生成完成\n🆔 {task_id}\n🔗 {urls[0]}")
            return
        elif status in ('failed', 'error'):
            bot.send_message(chat_id, f"❌ 图像任务失败\n🆔 {task_id}")
            return
    bot.send_message(chat_id, f"⏰ 图像任务轮询超时\n🆔 {task_id}")


@bot.message_handler(commands=["vid_task_create"])
def vid_task_create_cmd(message):
    """提交视频生成任务"""
    chat_id = message.chat.id
    text = message.text or ''
    args = _parse_task_args(text)
    
    prompt = args.get('prompt', '').strip('"\'')
    img_url = args.get('img_url')
    
    if not prompt:
        bot.reply_to(message, "📋 用法：\n`/vid_task_create --prompt \"描述\" [--img_url \"参考图URL\"]`")
        return
    
    user_id = str(chat_id)
    token = _get_token(chat_id)
    
    mode = 'img2video' if img_url else 'text2video'
    result, success = ApiClient.submit_generation(
        mode=mode,
        text=prompt,
        token=token,
        user_id=user_id,
        img_url=img_url
    )
    
    if not success or not result.get('success'):
        bot.reply_to(message, f"❌ 提交失败：{result.get('error', {}).get('message', result)}")
        return
    
    data = result.get('data', {})
    task_id = data.get('taskID')
    
    _ensure_task_store(chat_id)
    TASK_STORE[chat_id]['vid_tasks'].append({'task_id': task_id, 'prompt': prompt, 'status': 'processing'})
    
    msg = f"✅ 视频任务已提交\n🆔 {task_id}\n📝 {prompt[:50]}\n⏳ 等待生成(约2分钟)..."
    if img_url:
        msg += f"\n🖼️ 参考图：{img_url[:50]}..."
    bot.reply_to(message, msg)
    
    threading.Thread(target=_poll_vid_task, args=(chat_id, task_id, message.message_id), daemon=True).start()


def _poll_vid_task(chat_id: int, task_id: str, orig_msg_id: int):
    """轮询视频任务状态"""
    import time
    token = _get_token(chat_id)
    
    for _ in range(90):
        time.sleep(5)
        result, ok = ApiClient.query_generation(task_id, token)
        if not ok:
            continue
        data = result.get('data', [{}])[0] if isinstance(result.get('data'), list) else {}
        gen = data.get('generation', {})
        status = gen.get('status')
        
        if status == 'completed':
            urls = gen.get('resultUrls', [])
            if urls:
                try:
                    bot.send_video(chat_id, urls[0], caption=f"✅ 视频生成完成\n🆔 {task_id}")
                except Exception:
                    bot.send_message(chat_id, f"✅ 视频生成完成\n🆔 {task_id}\n🔗 {urls[0]}")
            return
        elif status in ('failed', 'error'):
            bot.send_message(chat_id, f"❌ 视频任务失败\n🆔 {task_id}")
            return
    bot.send_message(chat_id, f"⏰ 视频任务轮询超时\n🆔 {task_id}")


@bot.message_handler(commands=["img_status"])
def img_status_cmd(message):
    """查询图像任务状态"""
    chat_id = message.chat.id
    text = message.text or ''
    args = _parse_task_args(text)
    task_id = args.get('task_id', '').strip('"\'')
    
    if not task_id:
        bot.reply_to(message, "📋 用法：\n`/img_status --task_id <任务ID>`")
        return
    
    token = _get_token(chat_id)
    result, ok = ApiClient.query_generation(task_id, token)
    
    if not ok:
        bot.reply_to(message, f"❌ 查询失败：{result}")
        return
    
    data = result.get('data', [{}])[0] if isinstance(result.get('data'), list) else {}
    gen = data.get('generation', {})
    status = gen.get('status')
    
    if status == 'completed':
        urls = gen.get('resultUrls', [])
        if urls:
            try:
                bot.send_photo(chat_id, urls[0], caption=f"✅ 图像完成\n🆔 {task_id}")
            except Exception:
                bot.send_message(chat_id, f"✅ 图像完成\n🆔 {task_id}\n🔗 {urls[0]}")
    elif status in ('failed', 'error'):
        bot.reply_to(message, f"❌ 任务失败\n🆔 {task_id}")
    else:
        progress = gen.get('progress', 0)
        bot.reply_to(message, f"⏳ 进度：{progress}%\n🆔 {task_id}")


@bot.message_handler(commands=["vid_status"])
def vid_status_cmd(message):
    """查询视频任务状态"""
    chat_id = message.chat.id
    text = message.text or ''
    args = _parse_task_args(text)
    task_id = args.get('task_id', '').strip('"\'')
    
    if not task_id:
        bot.reply_to(message, "📋 用法：\n`/vid_status --task_id <任务ID>`")
        return
    
    token = _get_token(chat_id)
    result, ok = ApiClient.query_generation(task_id, token)
    
    if not ok:
        bot.reply_to(message, f"❌ 查询失败：{result}")
        return
    
    data = result.get('data', [{}])[0] if isinstance(result.get('data'), list) else {}
    gen = data.get('generation', {})
    status = gen.get('status')
    
    if status == 'completed':
        urls = gen.get('resultUrls', [])
        if urls:
            try:
                bot.send_video(chat_id, urls[0], caption=f"✅ 视频完成\n🆔 {task_id}")
            except Exception:
                bot.send_message(chat_id, f"✅ 视频完成\n🆔 {task_id}\n🔗 {urls[0]}")
    elif status in ('failed', 'error'):
        bot.reply_to(message, f"❌ 任务失败\n🆔 {task_id}")
    else:
        progress = gen.get('progress', 0)
        bot.reply_to(message, f"⏳ 进度：{progress}%\n🆔 {task_id}")


@bot.message_handler(commands=["img_list"])
def img_list_cmd(message):
    """列出图像任务"""
    chat_id = message.chat.id
    _ensure_task_store(chat_id)
    tasks = TASK_STORE[chat_id]['img_tasks']
    if not tasks:
        bot.reply_to(message, "📭 暂无图像任务记录")
        return
    lines = ["📸 图像任务列表:"]
    for t in tasks[-10:]:
        lines.append(f"🆔 {t['task_id']} | {t['status']} | {t['prompt'][:30]}...")
    bot.reply_to(message, "\n".join(lines))


@bot.message_handler(commands=["vid_list"])
def vid_list_cmd(message):
    """列出视频任务"""
    chat_id = message.chat.id
    _ensure_task_store(chat_id)
    tasks = TASK_STORE[chat_id]['vid_tasks']
    if not tasks:
        bot.reply_to(message, "📭 暂无视频任务记录")
        return
    lines = ["🎬 视频任务列表:"]
    for t in tasks[-10:]:
        lines.append(f"🆔 {t['task_id']} | {t['status']} | {t['prompt'][:30]}...")
    bot.reply_to(message, "\n".join(lines))


@bot.message_handler(commands=["img_clear"])
def img_clear_cmd(message):
    """清理图像任务"""
    chat_id = message.chat.id
    _ensure_task_store(chat_id)
    count = len(TASK_STORE[chat_id]['img_tasks'])
    TASK_STORE[chat_id]['img_tasks'] = []
    bot.reply_to(message, f"🗑️ 已清理 {count} 条图像任务记录")


@bot.message_handler(commands=["vid_clear"])
def vid_clear_cmd(message):
    """清理视频任务"""
    chat_id = message.chat.id
    _ensure_task_store(chat_id)
    count = len(TASK_STORE[chat_id]['vid_tasks'])
    TASK_STORE[chat_id]['vid_tasks'] = []
    bot.reply_to(message, f"🗑️ 已清理 {count} 条视频任务记录")


def main():
    load_token_store()
    try:
        bot.set_my_commands(
            [
                types.BotCommand("img_task_create", "图像生成"),
                types.BotCommand("vid_task_create", "视频生成"),
                types.BotCommand("img_status", "图像状态"),
                types.BotCommand("vid_status", "视频状态"),
                types.BotCommand("img_list", "图像列表"),
                types.BotCommand("vid_list", "视频列表"),
                types.BotCommand("img_clear", "清图像"),
                types.BotCommand("vid_clear", "清视频"),
                types.BotCommand("img_key", "设图像KEY"),
                types.BotCommand("vid_key", "设视频KEY"),
                types.BotCommand("ai_apps", "ai应用"),
                types.BotCommand("ai_create", "ai创作"),
                types.BotCommand("logout", "退出登陆"),
            ]
        )
    except Exception as exc:
        # 网络抖动或代理 SSL 问题时，跳过菜单设置但继续启动机器人
        logger.warning(f"设置机器人菜单失败，已跳过：{exc}")
    logger.info("🤖 pyTelegramBotAPI 机器人启动中...")
    bot.infinity_polling(timeout=10, long_polling_timeout=10)


if __name__ == "__main__":
    main()
