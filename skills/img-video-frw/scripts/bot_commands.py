# 专门负责 TG 机器人快捷指令菜单的配置和管理
from telegram import BotCommand
from telegram.ext import Application

# 定义所有快捷指令
BOT_COMMANDS = [
    BotCommand("start", "初始化机器人"),
    BotCommand("login", "打开登录面板"),
    BotCommand("person", "打开个人面板（需先登录）"),
    BotCommand("cancel", "取消当前操作")
]

# 设置快捷指令菜单（主程序初始化时调用）
async def set_bot_commands(application: Application):
    """将自定义指令注册到 TG 机器人菜单"""
    await application.bot.set_my_commands(BOT_COMMANDS)
    print("✅ 快捷指令菜单配置完成")