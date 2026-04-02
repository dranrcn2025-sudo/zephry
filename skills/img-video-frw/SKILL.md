---
name: img-video-frw
description: FRW AI 图像/视频生成任务管理。用于提交 AI 生成任务（文生图、图生图、文生视频、图生视频），查询和管理任务状态。通过自然语言触发，如"生成一张图片"、"创建视频"、"查询任务状态"。
---

# Img-Video-FRW (OpenClaw Native)

FRW AI 图像/视频生成任务管理，直接通过 OpenClaw 对话提交和管理 AI 生成任务。

## 功能

- **文生图** (text2image)：根据文本描述生成图片
- **图生图** (img2img)：基于参考图生成新图片
- **文生视频** (text2video)：根据文本描述生成视频
- **图生视频** (img2video)：基于参考图生成视频
- **任务查询**：查询任务状态、获取结果
- **任务管理**：列出任务、清理历史任务

## 使用方式

通过自然语言或命令式语句触发，OpenClaw 会自动识别并路由到本 skill。

### 图像生成

```
生成一张图片：[描述]
创建一张 [主题] 的图片
用 [参考图URL] 生成一张 [描述] 的图
图生图：[描述]，参考图：[URL]
/img_task_create --prompt "..." [--img_url "..."]
```

### 视频生成

```
生成一段视频：[描述]
创建视频：[描述]，参考图：[URL]
把 [图片URL] 变成视频：[描述]
/vid_task_create --prompt "..." --vid_url "..."
```

### 任务管理

## 🎯 Core Features

### 1. Telegram 消息解析
- 支持命令：`/img_task_create`, `/vid_task_create`, `/img_status`, `/vid_status`, `/img_list`, `/vid_list`, `/img_clear`, `/vid_clear`, `/img_key`, `/vid_key`
- 自动提取任务参数 (prompt, img_url, vid_url, task_id)
- 解析命令参数，自动匹配功能
- ✅ 支持图生图（img2img）和图生视频（img2video），通过 `--img_url` 参数

### 2. API KEY 管理
- 存储位置：`logs/api_keys.txt`
- 有效期：永久有效
- 激活方式：发送 `/img_key <API_KEY>` 或 `/vid_key <API_KEY>`
- 自动刷新机制

### 3. 任务提交流程
- 图像任务 ID 自动生成：`img_task{60001}` + 递增编号
- 视频任务 ID 自动生成：`vid_task{60001}` + 递增编号
- 任务参数验证与错误处理
- 支持图像/视频 URL 输入

### 4. 任务状态轮询
- 图像任务轮询间隔：默认 10 秒
- 视频任务轮询间隔：默认 20 秒
- 超时自动终止
- 结果自动保存 (URL/文件存储)

### 5. 任务管理
- 查看所有图像任务 (`/img_list`)
- 查看所有视频任务 (`/vid_list`)
- 清理过期任务 (`/img_clear`, `/vid_clear`)

### 6. 健康检查
- 图像 API 可用性检测
- 视频 API 可用性检测
- 定时检测任务状态
- 错误报告生成

```
查询任务状态：[任务ID]
/img_status --task_id [ID]
/vid_status --task_id [ID]
查看我的图片任务
查看我的视频任务
/img_list
/vid_list
清理图片任务
清理视频任务
/img_clear
/vid_clear
```

### API KEY 配置

```
/img_key [KEY]     — 设置图像 API KEY
/vid_key [KEY]     — 设置视频 API KEY
```


## API 配置

SKILL.md 同级的 `scripts/config.py` 包含以下配置：

- `API_CONFIG` — API 端点配置
- `GENERATION_CONFIG` — 各生成模式的默认参数（模板、模型、尺寸等）

### 必需配置项

| 配置项 | 说明 |
|--------|------|
| `apikey` | FRW API KEY（从平台获取） |
| `submit_url` | 任务提交接口 |
| `query_url` | 任务查询接口 |

## 任务状态

| Status | 含义 |
|--------|------|
| `0` | 等待处理 |
| `1` | 生成中 |
| `2` | 完成 |
| `-1` | 失败 |
| `4` | 超时 |

## 内部接口

底层 API 调用通过 `scripts/api_client.py` 中的 `ApiClient` 类实现：

```python
from scripts.api_client import ApiClient

# 提交生成任务
result, success = ApiClient.submit_generation(
    mode="text2image",       # text2image | text2video | img2img | img2video
    text="A beautiful sunset over the ocean",
    token="Bearer TOKEN",
    user_id="user123",
    img_url=None             # 图生图/视频时传入参考图URL
)

# 查询任务状态
result, success = ApiClient.query_generation(task_id="task123", token="Bearer TOKEN")
```

## Scripts

| Script | 说明 |
|--------|------|
| `scripts/api_client.py` | FRW API 调用封装（核心，与协议无关） |
| `scripts/config.py` | 全局配置项 |
| `scripts/main.py` | 独立运行入口（备用） |

## 依赖

```
requests
python-dotenv
```

## 注意

- Telegram Bot 相关代码（`telebot_main.py`、`bot_commands.py`、`tg_login_bot.py`）已废弃，仅保留 `api_client.py` 供 OpenClaw 调用
- 获取API KEY后 ，设置进SKILL.md 同级的 `scripts/config.py`中的 `GENERATION_CONFIG["apikey"]`
- API KEY 管理通过 `config.py` 中的 `GENERATION_CONFIG["apikey"]` 配置


