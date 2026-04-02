# 专门负责登录相关业务逻辑，调用 API 客户端，处理交互
from telegram import ForceReply, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes
from config import ConversationState, KeyboardConfig, setup_logging
from api_client import ApiClient

logger = setup_logging()
# 全局用户数据存储（实际生产可替换为数据库）
user_data_store = {}

class LoginService:
    """登录业务服务，处理登录全流程交互"""

    @staticmethod
    def _is_logged_in(user_id: int) -> bool:
        """判断用户是否已登录（存在 token 视为已登录）"""
        return user_id in user_data_store and "token" in user_data_store[user_id]

    @staticmethod
    def _build_init_keyboard(user_id: int) -> ReplyKeyboardMarkup:
        """根据登录状态动态构建初始面板"""
        if LoginService._is_logged_in(user_id):
            keyboard = [[{"text": "取消登陆"}], [{"text": "/person 个人中心"}]]
        else:
            keyboard = [[{"text": "登陆"}, {"text": "注册"}]]
        return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True, one_time_keyboard=False)
    
    @staticmethod
    async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理 /start 指令，初始化机器人"""
        user_id = update.effective_user.id
        logger.info(f"用户 {user_id} 执行 /start 指令")
        
        await update.message.reply_text(
            "🎉 欢迎使用 DreamaI 机器人！\n点击右侧「菜单」选择快捷指令，或直接点击下方按钮：",
            reply_markup=LoginService._build_init_keyboard(user_id)
        )
    
    @staticmethod
    async def login_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理 /login 指令，打开登录面板"""
        user_id = update.effective_user.id
        if LoginService._is_logged_in(user_id):
            await update.message.reply_text(
                "你已登录，如需切换账号请先点击「取消登陆」。",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            return -1

        user_data_store.pop(user_id, None)
        logger.info(f"用户 {user_id} 打开登录面板")
        
        await update.message.reply_text(
            "DreamaI 登录面板\n请回复本条消息：账号/密码",
            reply_markup=ForceReply(input_field_placeholder="例如：alice/123456")
        )
        return ConversationState.LOGIN_USERNAME
    
    @staticmethod
    async def handle_username(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理账号/密码一次性输入"""
        user_id = update.effective_user.id
        text = update.message.text.strip()
        
        # 处理取消操作
        if text == "🚫 取消登录":
            await update.message.reply_text(
                "已取消登录",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            user_data_store.pop(user_id, None)
            return -1  # 结束对话
        elif text == "🔄 重新获取验证码":
            await update.message.reply_text(
                "请先输入账号/密码，格式：账号/密码",
                reply_markup=ForceReply(input_field_placeholder="例如：alice/123456")
            )
            return ConversationState.LOGIN_USERNAME
        
        # 校验账号/密码格式
        if not text:
            await update.message.reply_text(
                "❌ 输入不能为空，请按格式输入：账号/密码",
                reply_markup=ForceReply(input_field_placeholder="例如：alice/123456")
            )
            return ConversationState.LOGIN_USERNAME

        if "/" not in text:
            await update.message.reply_text(
                "❌ 格式错误，请按格式输入：账号/密码",
                reply_markup=ForceReply(input_field_placeholder="例如：alice/123456")
            )
            return ConversationState.LOGIN_USERNAME

        username, password = [part.strip() for part in text.split("/", 1)]
        if not username or not password:
            await update.message.reply_text(
                "❌ 账号或密码不能为空，请按格式输入：账号/密码",
                reply_markup=ForceReply(input_field_placeholder="例如：alice/123456")
            )
            return ConversationState.LOGIN_USERNAME
        
        # 存储账号和密码，直接进入验证码步骤
        user_data_store[user_id] = {"username": username, "password": password}
        logger.info(f"用户 {user_id} 输入账号：{username}，密码：***")

        await update.message.reply_text("🔍 正在获取验证码图片...")
        await LoginService._send_captcha_image(update, user_id)
        return ConversationState.LOGIN_CAPTCHA
    
    @staticmethod
    async def handle_password(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理登录密码输入，获取验证码"""
        user_id = update.effective_user.id
        password = update.message.text.strip()
        
        # 处理快捷按钮
        if password == "🚫 取消登录":
            await update.message.reply_text(
                "已取消登录",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            user_data_store.pop(user_id, None)
            return -1
        elif password == "🔄 重新获取验证码":
            # 重新获取验证码
            await LoginService._send_captcha_image(update, user_id)
            return ConversationState.LOGIN_CAPTCHA
        
        # 校验密码
        if not password:
            await update.message.reply_text(
                "❌ 密码不能为空，请重新输入：",
                reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.LOGIN_PANEL)
            )
            return ConversationState.LOGIN_PASSWORD
        
        # 存储密码，获取验证码
        user_data_store[user_id]["password"] = password
        logger.info(f"用户 {user_id} 输入密码：***")
        
        await update.message.reply_text("🔍 正在获取验证码图片...")
        await LoginService._send_captcha_image(update, user_id)
        
        return ConversationState.LOGIN_CAPTCHA
    
    @staticmethod
    async def handle_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理验证码输入，调用登录接口"""
        user_id = update.effective_user.id
        captcha_code = update.message.text.strip()
        
        # 处理快捷按钮
        if captcha_code == "🚫 取消登录":
            await update.message.reply_text(
                "已取消登录",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            user_data_store.pop(user_id, None)
            return -1
        elif captcha_code == "🔄 重新获取验证码":
            await LoginService._send_captcha_image(update, user_id)
            return ConversationState.LOGIN_CAPTCHA
        
        # 校验验证码
        if not captcha_code:
            await update.message.reply_text(
                "❌ 验证码不能为空，请重新输入：",
                reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.LOGIN_PANEL)
            )
            return ConversationState.LOGIN_CAPTCHA
        
        # 组装登录参数
        user_info = user_data_store.get(user_id, {})
        login_params = {
            "username": user_info.get("username"),
            "password": user_info.get("password"),
            "captchaId": user_info.get("captcha_id"),
            "captchaCode": captcha_code,
            "remember": False
        }
        
        # 调用登录接口
        login_result, is_success = ApiClient.login(login_params)
        
        if is_success:
            # 登录成功，存储 Token 和用户信息
            user_data_store[user_id]["token"] = login_result["data"]["accessToken"]
            user_data_store[user_id]["user_info"] = login_result["data"]["user"]
            
            await update.message.reply_text(
                f"🎉 登录成功！\n用户名：{login_result['data']['user']['username']}\n点击 /person 进入个人中心",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            return -1
        else:
            # 登录失败，提示错误信息
            error_msg = login_result.get("error", {}).get("message", "登录失败")
            await update.message.reply_text(
                f"❌ 登录失败：{error_msg}\n请重新输入验证码（或点击「重新获取验证码」）",
                reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.LOGIN_PANEL)
            )
            return ConversationState.LOGIN_CAPTCHA
    
    @staticmethod
    async def person_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理 /person 指令，打开个人面板"""
        user_id = update.effective_user.id
        logger.info(f"用户 {user_id} 尝试打开个人面板")
        
        # 校验登录状态
        if user_id not in user_data_store or "token" not in user_data_store[user_id]:
            await update.message.reply_text(
                "❌ 请先登录！\n发送 /login 打开登录面板",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            return
        
        # 登录成功，显示个人面板
        user_info = user_data_store[user_id]["user_info"]
        await update.message.reply_text(
            "👤 个人中心\n"
            "────────────\n"
            f"用户名：{user_info.get('username', '-')}\n"
            f"邮箱：{user_info.get('email', '-')}\n"
            f"国家：{user_info.get('preferredCountry', '-')}",
            reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.PERSON_PANEL)
        )
    
    @staticmethod
    async def cancel_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """全局取消操作"""
        user_id = update.effective_user.id
        user_data_store.pop(user_id, None)
        await update.message.reply_text(
            "🚫 操作已取消",
            reply_markup=LoginService._build_init_keyboard(user_id)
        )
        return -1

    @staticmethod
    async def menu_text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """处理首页按钮文本：登陆/注册/取消登陆"""
        user_id = update.effective_user.id
        text = (update.message.text or "").strip()

        if text == "登陆":
            return await LoginService.login_handler(update, context)

        if text == "注册":
            await update.message.reply_text(
                "注册功能暂未开放，请先使用「登陆」。",
                reply_markup=LoginService._build_init_keyboard(user_id)
            )
            return

        if text == "取消登陆":
            if LoginService._is_logged_in(user_id):
                user_data_store.pop(user_id, None)
                await update.message.reply_text(
                    "已取消登陆",
                    reply_markup=LoginService._build_init_keyboard(user_id)
                )
            else:
                await update.message.reply_text(
                    "当前未登录",
                    reply_markup=LoginService._build_init_keyboard(user_id)
                )
    
    @staticmethod
    async def _send_captcha_image(update: Update, user_id: int):
        """内部方法：获取并发送验证码图片"""
        captcha_id, image_io = ApiClient.get_captcha()
        
        if not captcha_id or not image_io:
            await update.message.reply_text(
                "❌ 获取验证码失败，请稍后重试",
                reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.LOGIN_PANEL)
            )
            return
        
        # 存储验证码ID
        user_data_store[user_id]["captcha_id"] = captcha_id
        
        # 发送验证码图片
        await update.message.reply_photo(
            photo=image_io,
            caption="🔍 请输入下方验证码：",
            reply_markup=ReplyKeyboardMarkup(**KeyboardConfig.LOGIN_PANEL)
        )