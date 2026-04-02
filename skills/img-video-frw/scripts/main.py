# 机器人主入口，负责初始化、注册处理器、启动服务
from telegram import Update  # 新增：导入Update类
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ConversationHandler
)
from config import BOT_TOKEN, PROXY_URL, setup_logging, ConversationState
from bot_commands import set_bot_commands
from login_service import LoginService

# 初始化日志
logger = setup_logging()

def main():
    """机器人主启动函数"""
    logger.info("🤖 DreamaI 机器人开始启动...")
    
    try:
        # 初始化 TG 应用（适配 20.7+ 版本的代理配置）
        builder = Application.builder().token(BOT_TOKEN)
        if PROXY_URL:
            builder = builder.proxy(PROXY_URL).get_updates_proxy(PROXY_URL)
        application = builder.build()
        
        # 设置快捷指令菜单
        application.post_init = set_bot_commands
        
        # 清除历史消息
        application.drop_pending_updates = True
        
        # 注册普通指令处理器
        application.add_handler(CommandHandler("start", LoginService.start_handler))
        application.add_handler(CommandHandler("person", LoginService.person_handler))
        application.add_handler(CommandHandler("cancel", LoginService.cancel_handler))
        
        # 注册登录流程对话处理器
        login_conversation = ConversationHandler(
            entry_points=[CommandHandler("login", LoginService.login_handler)],
            states={
                ConversationState.LOGIN_USERNAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, LoginService.handle_username)
                ],
                ConversationState.LOGIN_PASSWORD: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, LoginService.handle_password)
                ],
                ConversationState.LOGIN_CAPTCHA: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, LoginService.handle_captcha)
                ]
            },
            fallbacks=[CommandHandler("cancel", LoginService.cancel_handler)],
            allow_reentry=True,
            name="login_conversation"
        )
        application.add_handler(login_conversation)

        # 注册首页文本按钮处理器（登陆/注册/取消登陆）
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, LoginService.menu_text_handler))
        
        # 启动机器人
        logger.info("✅ 机器人启动成功！")
        application.run_polling(
            allowed_updates=Update.ALL_TYPES,
            poll_interval=1,
            timeout=10
        )
    
    except Exception as e:
        logger.error(f"❌ 机器人启动失败：{str(e)}", exc_info=True)

if __name__ == "__main__":
    main()