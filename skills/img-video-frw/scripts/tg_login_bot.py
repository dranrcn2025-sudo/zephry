import logging
import requests
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, BotCommand
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
    ConversationHandler
)

# ====================== 核心配置 ======================
BOT_TOKEN = "7747120610:AAESBj7pDlVJvMdYQgPadgKMqvOVsdNvPX4"
PROXY_URL = "http://127.0.0.1:13625"
# 第三方API配置（后续替换为真实地址）
THIRD_PARTY_CONFIG = {
    "captcha_url": "",
    "login_url": "",
    "request_type": "json",
    "timeout": 10
}
# ==============================================================================

# 日志配置
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# 对话状态常量
LOGIN_USERNAME, LOGIN_PASSWORD, LOGIN_CAPTCHA, PERSON_CENTER = range(4)
user_data = {}

# -------------------------- 面板按钮配置 --------------------------
# 1. 登录面板按钮（登录时显示）
LOGIN_PANEL_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("🚫 取消登录")],
        [KeyboardButton("🔄 重新获取验证码")]
    ],
    resize_keyboard=True,
    one_time_keyboard=False
)

# 2. 个人面板按钮（登录成功后显示）
PERSON_PANEL_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("📝 查看个人信息"), KeyboardButton("🔧 修改密码")],
        [KeyboardButton("📊 我的订单"), KeyboardButton("🚪 退出登录")]
    ],
    resize_keyboard=True,
    one_time_keyboard=False
)

# 3. 初始面板（无状态时显示）
INIT_PANEL_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("/login 登录"), KeyboardButton("/person 个人中心")]
    ],
    resize_keyboard=True,
    one_time_keyboard=False
)

# -------------------------- 快捷指令菜单配置 --------------------------
async def set_bot_commands(application: Application):
    """设置输入框右侧的快捷指令菜单"""
    commands = [
        BotCommand("start", "初始化机器人"),
        BotCommand("login", "打开登录面板"),
        BotCommand("person", "打开个人面板（需先登录）"),
        BotCommand("cancel", "取消当前操作")
    ]
    await application.bot.set_my_commands(commands)

# -------------------------- 核心功能函数 --------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/start 初始化，显示初始面板"""
    user_id = update.effective_user.id
    logger.info(f"用户 {user_id} 执行 /start 命令")
    user_data.pop(user_id, None)  # 清空状态
    await update.message.reply_text(
        "🎉 欢迎使用第三方产品机器人！\n点击右侧「菜单」选择快捷指令，或直接点击下方按钮：",
        reply_markup=INIT_PANEL_KEYBOARD
    )

async def login(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """/login 打开登录面板，引导输入账号"""
    user_id = update.effective_user.id
    logger.info(f"用户 {user_id} 打开登录面板")
    user_data.pop(user_id, None)  # 清空历史登录数据
    await update.message.reply_text(
        "📱 登录面板\n请输入你的账号：",
        reply_markup=LOGIN_PANEL_KEYBOARD
    )
    return LOGIN_USERNAME

async def person(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/person 打开个人面板（需先登录）"""
    user_id = update.effective_user.id
    logger.info(f"用户 {user_id} 尝试打开个人面板")
    
    # 校验登录状态（判断是否有登录Token）
    if user_id not in user_data or "token" not in user_data[user_id]:
        await update.message.reply_text(
            "❌ 请先登录！\n发送 /login 打开登录面板",
            reply_markup=INIT_PANEL_KEYBOARD
        )
        return
    
    # 登录成功，显示个人面板
    await update.message.reply_text(
        "👤 个人中心面板\n你可以：",
        reply_markup=PERSON_PANEL_KEYBOARD
    )

# -------------------------- 登录流程函数 --------------------------
async def receive_login_username(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """接收登录账号，引导输入密码"""
    user_id = update.effective_user.id
    username = update.message.text.strip()
    
    # 处理取消操作
    if username == "🚫 取消登录":
        await update.message.reply_text("已取消登录", reply_markup=INIT_PANEL_KEYBOARD)
        user_data.pop(user_id, None)
        return ConversationHandler.END
    
    # 校验账号
    if not username:
        await update.message.reply_text("❌ 账号不能为空，请重新输入：", reply_markup=LOGIN_PANEL_KEYBOARD)
        return LOGIN_USERNAME
    
    user_data[user_id] = {"username": username}
    await update.message.reply_text(
        f"✅ 账号：{username}\n请输入你的密码：",
        reply_markup=LOGIN_PANEL_KEYBOARD
    )
    return LOGIN_PASSWORD

async def receive_login_password(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """接收登录密码，模拟获取验证码"""
    user_id = update.effective_user.id
    password = update.message.text.strip()
    
    # 处理取消/重新获取验证码
    if password == "🚫 取消登录":
        await update.message.reply_text("已取消登录", reply_markup=INIT_PANEL_KEYBOARD)
        user_data.pop(user_id, None)
        return ConversationHandler.END
    elif password == "🔄 重新获取验证码":
        await update.message.reply_text("🔍 重新获取验证码...\n✅ 模拟验证码：123456", reply_markup=LOGIN_PANEL_KEYBOARD)
        return LOGIN_CAPTCHA
    
    # 校验密码
    if not password:
        await update.message.reply_text("❌ 密码不能为空，请重新输入：", reply_markup=LOGIN_PANEL_KEYBOARD)
        return LOGIN_PASSWORD
    
    user_data[user_id]["password"] = password
    await update.message.reply_text(
        "🔍 正在获取验证码...\n✅ 模拟验证码：123456\n请输入验证码完成登录：",
        reply_markup=LOGIN_PANEL_KEYBOARD
    )
    return LOGIN_CAPTCHA

async def receive_login_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """接收验证码，完成登录"""
    user_id = update.effective_user.id
    captcha = update.message.text.strip()
    
    # 处理快捷按钮
    if captcha == "🚫 取消登录":
        await update.message.reply_text("已取消登录", reply_markup=INIT_PANEL_KEYBOARD)
        user_data.pop(user_id, None)
        return ConversationHandler.END
    elif captcha == "🔄 重新获取验证码":
        await update.message.reply_text("🔍 重新获取验证码...\n✅ 新验证码：654321", reply_markup=LOGIN_PANEL_KEYBOARD)
        return LOGIN_CAPTCHA
    
    # 校验验证码
    if not captcha:
        await update.message.reply_text("❌ 验证码不能为空，请重新输入：", reply_markup=LOGIN_PANEL_KEYBOARD)
        return LOGIN_CAPTCHA
    
    # 模拟登录成功，存储Token
    if captcha in ["123456", "654321"]:
        user_data[user_id]["token"] = "mock_token_123456"  # 模拟第三方返回的Token
        await update.message.reply_text(
            "🎉 登录成功！\n点击 /person 进入个人中心",
            reply_markup=INIT_PANEL_KEYBOARD
        )
        return ConversationHandler.END
    else:
        await update.message.reply_text(
            "❌ 验证码错误！\n✅ 正确验证码：123456\n请重新输入：",
            reply_markup=LOGIN_PANEL_KEYBOARD
        )
        return LOGIN_CAPTCHA

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """全局取消操作"""
    user_id = update.effective_user.id
    user_data.pop(user_id, None)
    await update.message.reply_text("🚫 操作已取消", reply_markup=INIT_PANEL_KEYBOARD)
    return ConversationHandler.END

# -------------------------- 启动机器人 --------------------------
def main():
    logger.info("🤖 机器人开始启动...")
    try:
        # 初始化应用，配置代理
        application = Application.builder() \
            .token(BOT_TOKEN) \
            .proxy_url(PROXY_URL) \
            .get_updates_proxy_url(PROXY_URL) \
            .build()
        
        # 设置快捷指令菜单
        application.post_init = set_bot_commands
        
        # 清除历史消息
        application.drop_pending_updates = True
        
        # 注册普通命令处理器（/start /login /person /cancel）
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("person", person))
        
        # 注册登录流程的对话处理器
        login_conv_handler = ConversationHandler(
            entry_points=[CommandHandler("login", login)],
            states={
                LOGIN_USERNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_login_username)],
                LOGIN_PASSWORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_login_password)],
                LOGIN_CAPTCHA: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_login_captcha)]
            },
            fallbacks=[CommandHandler("cancel", cancel)],
            allow_reentry=True
        )
        application.add_handler(login_conv_handler)
        
        # 启动机器人
        logger.info("✅ 机器人启动成功！快捷指令菜单已配置")
        application.run_polling(
            allowed_updates=Update.ALL_TYPES,
            poll_interval=1,
            timeout=10
        )
    
    except Exception as e:
        logger.error(f"❌ 机器人启动失败：{str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()