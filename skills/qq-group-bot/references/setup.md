# QQ 群管机器人部署参考

## 架构

```text
NapCat（本地/VPS）
  ├── HTTP API（端口 3000）  ← 主动发消息用
  └── WebSocket（端口 3001） ← 事件监听用（群消息、入群申请）
        │
        ▼
    scripts/bot.py（常驻后台）
        ├── 匹配关键词 → send_group_msg
        └── 入群申请事件 → set_group_add_request
```

## 第一步：部署 NapCat

### Docker 一键部署（VPS 推荐）

```bash
docker run -d \
  --name napcat \
  --network host \
  -e ACCOUNT=你的QQ号 \
  -v /opt/napcat/data:/app/napcat/data \
  mlikiowa/napcat-docker:latest

# 查看扫码登录二维码
docker logs -f napcat
```

扫码登录后，在 NapCat WebUI（通常是 `http://服务器IP:6099`）配置网络服务。

### WebUI 网络配置

添加两个服务：

1. HTTP 服务器
- 端口：`3000`
- Token：自定义，例如 `your_secret_token`

2. WebSocket 服务器
- 端口：`3001`
- Token：与 HTTP 相同

保存后重启 NapCat。

## 第二步：验证

### 测试登录信息

```bash
curl -X POST http://localhost:3000/get_login_info \
  -H "Authorization: Bearer your_secret_token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 获取群列表

```bash
curl -X POST http://localhost:3000/get_group_list \
  -H "Authorization: Bearer your_secret_token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 第三步：安装 bot 依赖

```bash
pip install websocket-client requests
```

## 第四步：准备配置

复制模板：

```bash
cp skills/qq-group-bot/scripts/config.example.json skills/qq-group-bot/.config.json
chmod 600 skills/qq-group-bot/.config.json
```

然后把：
- URL
- token
- 目标群号
- 关键词规则

改成真实值。

## 第五步：测试与运行

### 测试连接

```bash
python3 skills/qq-group-bot/scripts/bot.py --test
```

### 前台运行

```bash
python3 skills/qq-group-bot/scripts/bot.py
```

### 后台运行

```bash
nohup python3 skills/qq-group-bot/scripts/bot.py > /var/log/qq-bot.log 2>&1 &
echo $! > /tmp/qq-bot.pid
```

### 查看日志

```bash
tail -f /var/log/qq-bot.log
```

### 停止

```bash
kill $(cat /tmp/qq-bot.pid)
```

## 注意事项

- 新 QQ 号容易风控，尽量用老号
- `groups: []` 代表监听所有群，生产环境慎用
- NapCat 必须持续在线
- `bot.py` 有自动重连，但 NapCat 挂了照样没法收事件
- 真实 `.config.json` 不要进 git
