# 全局配置项，集中管理所有可配置参数
import logging

# TG 机器人配置
BOT_TOKEN = "8062457333:AAGhcEs91m_Xwm-2L3kc-ZOhfYbrMfm12zY"
PROXY_URL = ""  # 代理已禁用

# 第三方 API 配置
API_CONFIG = {
    "captcha_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/auth/captcha/image",  # 替换为真实验证码接口
    "login_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/auth/login",
    "register_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/auth/register",
    "ai_records_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/ai-records",
    "timeout": 15,
    "proxies": {
        "http": None,
        "https": None
    }
}

# AI 生成任务提交配置
GENERATION_CONFIG = {
    "submit_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/ai-generations/submit",
    "query_url": "https://frw-dreamaiai-api2.aiaiartist.com/api/ai-generations/query",
    "apikey": "",
    # 文生图默认配置
    "text2image": {
        "template_id": "3469316249878233419",
        "tool_id": "3469326281949057024",
        "title": "文生图",
        "model_name": "aicomic_generate_images",
        "model_show_name": "基础算法",
        "model": "qwen",
        "extra_params": {
            "model_style_type": "qwen",
            "cfg_scale": 3.5,
            "sampling_steps": 30,
            "sampler_method": "simple",
            "width": 768,
            "height": 1024,
            "batch_size": 1,
            "noise_seed": 0,
            "loras": [],
        },
    },
    # 文生视频暂按同模板提交，后续可替换为视频专用模板
    "text2video": {
        "template_id": "3469316249878532099",
        "tool_id": "3469326281949057024",
        "title": "文生视频",
        "model_name": "text_to_video",
        "model_show_name": "文生视频",
        "model": "wan2.1",
        "extra_params": {
            "width": 704,
            "height": 960,
            "loras": [],
        },
    },

    # 图生图 默认配置
    "img2img":  {
        # 模板与工具（与前端创建页 template/tool 一致）
        "template_id": "3469316249878233419",
        "tool_id": "3469326281949057024",
        "title": "图生图",
        "model_name": "generate_image_style_transfer",
        "model_show_name": "基础算法XL + IPAdapter",
        "model": "qwen",
        # 采样与画幅等（对应 generationParameters.extra_params）
        "extra_params": {
            "loras": [],
            "width": 768,
            "height": 1024,
            "batch_size": 1,
        },
    },

    # 图生视频 默认配置
   "img2video":  {
        "template_id": "3469316249878532099",
        "tool_id": "3469326281949057024",
        "title": "图生视频",
        "model_name": "image_to_video",
        "model_show_name": "图生视频",
        "model": "wan2.2",
        # 采样与画幅等（对应 generationParameters.extra_params）
        "extra_params": {
            "width": 704,
            "height": 960,
        },
    },
}

# 日志配置
def setup_logging():
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        level=logging.INFO
    )
    return logging.getLogger(__name__)

# 对话状态常量（全局复用）
class ConversationState:
    LOGIN_USERNAME = 1
    LOGIN_PASSWORD = 2
    LOGIN_CAPTCHA = 3
    PERSON_CENTER = 4

# 面板按钮配置
class KeyboardConfig:
    # 登录面板按钮
    LOGIN_PANEL = {
        "keyboard": [
            [{"text": "🚫 取消登录"}],
            [{"text": "🔄 重新获取验证码"}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False
    }
    
    # 个人面板按钮
    PERSON_PANEL = {
        "keyboard": [
            [{"text": "📝 查看个人信息"}, {"text": "🔧 修改密码"}],
            [{"text": "📊 我的订单"}, {"text": "🚪 退出登录"}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False
    }
    
    # 初始面板按钮
    INIT_PANEL = {
        "keyboard": [
            [{"text": "/login 登录"}, {"text": "/person 个人中心"}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False
    }