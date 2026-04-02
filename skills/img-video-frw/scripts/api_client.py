# 专门负责第三方 API 调用，与业务逻辑解耦
import requests
import base64
from io import BytesIO
from config import API_CONFIG, GENERATION_CONFIG, setup_logging

logger = setup_logging()

class ApiClient:
    """API 调用客户端，封装所有第三方接口请求"""
    
    @staticmethod
    def get_captcha():
        """调用验证码接口，返回验证码ID和Base64图片字节流"""
        try:
            response = requests.get(
                API_CONFIG["captcha_url"],
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"]
            )
            response.raise_for_status()
            result = response.json()
            
            if not result.get("success"):
                logger.error(f"验证码接口返回失败：{result}")
                return None, None
            
            data = result.get("data", {})
            captcha_id = data.get("id")
            image_base64 = data.get("image_base64", "")
            
            # 处理 Base64 图片
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]
            image_bytes = base64.b64decode(image_base64)
            image_io = BytesIO(image_bytes)
            image_io.name = "captcha.png"
            
            logger.info(f"获取验证码成功，ID：{captcha_id}")
            return captcha_id, image_io
        
        except Exception as e:
            logger.error(f"获取验证码异常：{str(e)}", exc_info=True)
            return None, None
    
    @staticmethod
    def login(login_params):
        """
        调用登录接口
        :param login_params: 登录参数字典 {"username": "", "password": "", "captchaId": "", "captchaCode": "", "remember": False}
        :return: 登录结果（dict）、是否成功（bool）
        """
        try:
            response = requests.post(
                API_CONFIG["login_url"],
                json=login_params,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"]
            )
            response.raise_for_status()
            result = response.json()
            
            if result.get("success"):
                logger.info(f"登录成功，用户名：{login_params['username']}")
                return result, True
            else:
                error_msg = result.get("error", {}).get("message", "登录失败")
                logger.error(f"登录失败：{error_msg}，参数：{login_params}")
                return result, False
        
        except Exception as e:
            logger.error(f"登录接口调用异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False

    @staticmethod
    def register(register_body: dict):
        """
        用户注册
        :param register_body: username, nickname, email, password, captchaId, captchaCode, nsfw
        :return: (result_dict, success_bool)
        """
        try:
            headers = {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "apikey": GENERATION_CONFIG["apikey"],
            }
            params = {"apikey": GENERATION_CONFIG["apikey"]}
            response = requests.post(
                API_CONFIG["register_url"],
                params=params,
                json=register_body,
                headers=headers,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"],
            )
            try:
                result = response.json()
            except ValueError:
                snippet = (response.text or "")[:500]
                logger.error(
                    "注册接口返回非 JSON，HTTP %s：%s",
                    response.status_code,
                    snippet,
                )
                return {
                    "success": False,
                    "error": {"message": f"HTTP {response.status_code}：{snippet or '无响应体'}"},
                }, False

            if not isinstance(result, dict):
                return {"success": False, "error": {"message": "注册接口返回格式异常"}}, False

            safe_log = {k: v for k, v in register_body.items() if k != "password"}

            if response.ok and result.get("success"):
                logger.info(f"注册成功：{register_body.get('username')}")
                return result, True

            err_obj = result.get("error")
            if isinstance(err_obj, dict):
                error_msg = err_obj.get("message", "注册失败")
            elif err_obj is not None:
                error_msg = str(err_obj)
            else:
                error_msg = result.get("message") or f"HTTP {response.status_code}"

            if not response.ok:
                logger.warning(
                    "注册接口 HTTP %s：%s，请求字段：%s",
                    response.status_code,
                    error_msg,
                    safe_log,
                )
            else:
                logger.error(f"注册失败：{error_msg}，请求字段：{safe_log}")

            result.setdefault("success", False)
            if not isinstance(result.get("error"), dict):
                result["error"] = {"message": str(error_msg)}
            return result, False
        except Exception as e:
            logger.error(f"注册接口调用异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False

    @staticmethod
    def submit_generation(mode: str, text: str, token: str, user_id: str, img_url: str = None):
        """
        提交 AI 生成任务（文生图/文生视频/图生图/图生视频）
        :param mode: 模式 (text2image, text2video, img2img, img2video)
        :param text: 描述文本
        :param token: 认证 token
        :param user_id: 用户ID
        :param img_url: 参考图片URL (用于 img2img/img2video)
        :return: (result_dict, success_bool)
        """
        try:
            mode_config = GENERATION_CONFIG.get(mode)
            if not mode_config:
                return {"success": False, "error": {"message": f"不支持的模式: {mode}"}}, False

            gen_params = {
                "text": text,
                "extra_params": mode_config["extra_params"],
                "model_name": mode_config["model_name"],
                "model_show_name": mode_config["model_show_name"],
                "title": mode_config["title"],
                "negative_prompt": "",
                "model": mode_config["model"],
            }

            # 图生图/图生视频模式：添加参考图URL
            if img_url and mode in ("img2img", "img2video"):
                # gen_params["source_urls"] = {"load image from url (cached)": img_url}
                gen_params["source_path"] = img_url

            payload = {
                "templateID": mode_config["template_id"],
                "toolID": mode_config["tool_id"],
                "generationParameters": gen_params,
                "userID": user_id,
            }

            headers = {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "apikey": GENERATION_CONFIG["apikey"],
            }
            params = {"apikey": GENERATION_CONFIG["apikey"]}

            response = requests.post(
                GENERATION_CONFIG["submit_url"],
                params=params,
                json=payload,
                headers=headers,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"],
            )
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                return result, True
            return result, False
        except Exception as e:
            logger.error(f"提交生成任务异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False

    @staticmethod
    def query_generation(task_id: str, token: str):
        """查询 AI 生成任务进度/状态"""
        try:
            headers = {
                "Accept": "application/json, text/plain, */*",
                "Authorization": f"Bearer {token}",
                "apikey": GENERATION_CONFIG["apikey"],
            }
            params = {
                "task_ids": task_id,
                "apikey": GENERATION_CONFIG["apikey"],
            }
            response = requests.get(
                GENERATION_CONFIG["query_url"],
                params=params,
                headers=headers,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"],
            )
            response.raise_for_status()
            result = response.json()
            return result, bool(result.get("success"))
        except Exception as e:
            logger.error(f"查询生成任务异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False

    @staticmethod
    def list_ai_apps(page: int = 1, size: int = 20):
        """获取 AI 应用列表"""
        try:
            params = {
                "page": page,
                "size": size,
                "sortBy": "createdAt",
                "sortOrder": "ASC",
                "isActive": "true",
                "source": "ai_app",
            }
            headers = {
                "Accept": "application/json, text/plain, */*",
            }
            response = requests.get(
                API_CONFIG["ai_records_url"],
                params=params,
                headers=headers,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"],
            )
            response.raise_for_status()
            result = response.json()
            return result, bool(result.get("success"))
        except Exception as e:
            logger.error(f"获取 AI 应用列表异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False

    @staticmethod
    def submit_ai_app_generation(token: str, user_id: str, app_item: dict, source_image_url: str):
        """
        提交 AI 应用生成任务（来自 ai_app 列表项）
        templateID: templates[0].id
        toolID: templates[0].toolsId
        source_urls key: templates[0].defaultParameters.source_urls 的第一个 key
        """
        try:
            templates = app_item.get("templates") or []
            if not templates:
                return {"success": False, "error": {"message": "应用模板不存在"}}, False

            template = templates[0] or {}
            default_params = template.get("defaultParameters") or {}
            source_urls_cfg = default_params.get("source_urls") or {}
            source_key = "load image from url (cached)"
            if isinstance(source_urls_cfg, dict) and source_urls_cfg:
                source_key = next(iter(source_urls_cfg.keys()))

            latent_config = default_params.get("latent_config") or {"width": 768, "height": 1024}
            if not isinstance(latent_config, dict):
                latent_config = {"width": 768, "height": 1024}

            payload = {
                "templateID": template.get("id"),
                "toolID": template.get("toolsId"),
                "generationParameters": {
                    "title": app_item.get("name", ""),
                    "source_urls": {source_key: source_image_url},
                    "prompt_config": {},
                    "latent_config": latent_config,
                    "extra_config": {},
                },
                "userID": user_id,
            }

            headers = {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "apikey": GENERATION_CONFIG["apikey"],
            }
            params = {"apikey": GENERATION_CONFIG["apikey"]}

            logger.info(f"AI应用提交参数: {payload}")
            response = requests.post(
                GENERATION_CONFIG["submit_url"],
                params=params,
                json=payload,
                headers=headers,
                proxies=API_CONFIG["proxies"],
                timeout=API_CONFIG["timeout"],
            )
            response.raise_for_status()
            result = response.json()
            return result, bool(result.get("success"))
        except Exception as e:
            logger.error(f"提交 AI 应用任务异常：{str(e)}", exc_info=True)
            return {"success": False, "error": {"message": str(e)}}, False