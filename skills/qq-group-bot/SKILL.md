---
name: qq-group-bot
description: >
  基于 NapCat + OneBot11 的 QQ 群管机器人部署与维护技能。
  当用户要求搭建 QQ 群管、QQ 自动回复、QQ群关键词回复、自动同意入群申请、
  QQ 群发公告、NapCat、OneBot11、群消息监听、群管 bot、QQ 机器人脚本、
  或希望把现有 QQ 群管方案整理成 skill / 落地成可运行目录时，使用此技能。
---

# QQ 群管机器人

用于把基于 NapCat + OneBot11 的 QQ 群管方案落成可运行 skill，覆盖：
- 关键词自动回复
- 自动同意入群申请
- 主动发群消息
- 配置模板生成
- 连通性测试

## 适用场景

当用户要做这些事时触发：
- “做个 QQ 群管机器人”
- “NapCat 接群消息自动回复”
- “自动同意入群申请”
- “把这个 QQ bot 文档做成 skill”
- “给群里做关键词回复/公告机器人”

## 目录约定

技能目录：

```text
skills/qq-group-bot/
├── SKILL.md
├── references/
│   └── setup.md
└── scripts/
    ├── bot.py
    └── config.example.json
```

运行时实际凭据文件：
- 使用技能目录同级 `.config.json`
- **不要**把真实 token / 群号 / URL 提交进 git
- 复制 `scripts/config.example.json` 为 `.config.json` 后再改真实值

## 工作流

### 1. 先确认环境

优先确认：
- NapCat 是否已部署
- HTTP / WS 地址与 token 是否可用
- 目标群号是否明确
- 是否需要自动同意入群申请
- 关键词回复规则是否已提供

如果用户还没部署 NapCat：读取 `references/setup.md` 按部署步骤引导。

### 2. 落地 skill 文件

通常需要：
- 写入 `scripts/bot.py`
- 写入 `scripts/config.example.json`
- 必要时生成 `.config.json`（仅在用户明确提供真实配置时）

### 3. 安装依赖

Python 依赖：

```bash
pip install websocket-client requests
```

### 4. 连通性测试

先测 HTTP：

```bash
python3 scripts/bot.py --test
```

如果失败，优先检查：
- NapCat 容器是否在线
- 3000/3001 端口是否打开
- token 是否一致
- HTTP URL / WS URL 是否写错

### 5. 运行方式

前台测试：

```bash
python3 scripts/bot.py
```

后台运行：

```bash
nohup python3 scripts/bot.py > /var/log/qq-bot.log 2>&1 &
echo $! > /tmp/qq-bot.pid
```

停止：

```bash
kill $(cat /tmp/qq-bot.pid)
```

## 处理规则

### 关键词回复
- 只匹配配置里的群
- 命中任一关键词即回复对应文案
- 同一群 + 同一规则走冷却，避免刷屏

### 入群申请
- 仅在 `auto_approve_join=true` 时自动同意
- 只处理配置范围内的群

### 主动发消息
如需外部脚本发群消息，可直接调用 NapCat HTTP API，或复用 `send_group_msg()`。

## 注意事项

- 新 QQ 号风控高，尽量用老号
- `groups: []` 代表监听所有群，默认不建议
- 生产环境优先 Docker 跑 NapCat
- `bot.py` 内置断线重连，但 NapCat 自身也必须稳定在线
- 日志里可能带群号、用户号，注意别对外泄露

## 何时读取 references

遇到这些情况时读取 `references/setup.md`：
- 还没装 NapCat
- 需要从零部署
- 忘了 WebUI / HTTP / WS 怎么配
- 需要 curl 验证接口

## 默认交付口径

如果用户说“直接做成 skill”，默认交付：
- 完整 skill 目录
- 可运行 `bot.py`
- 示例配置模板
- 基础部署参考文档

如果用户说“直接上线”，再进一步处理真实 `.config.json`、测试、后台运行。 
