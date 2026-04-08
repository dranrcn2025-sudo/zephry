# B站运营工具包

## 一、包含内容

1. **bilibili-mcp/** - B站API工具
   - 登录脚本
   - MCP服务器
   - 凭证文件

2. **scripts/** - 运营脚本
   - daily_task.py - 每日任务

## 二、安装步骤

### 1. 安装依赖
```bash
pip3 install bilibili-api requests
```

### 2. 配置B站登录

#### 方法A：扫码登录（推荐）
```bash
cd bilibili-mcp
python3 bili_login.py
```
- 打开显示的二维码
- 用B站App扫码授权
- 凭证自动保存到 bili_credential.json

#### 方法B：手动配置
获取你的B站cookie信息，保存为：
```json
{
  "sessdata": "你的sessdata",
  "bili_jct": "你的bili_jct",
  "buvid3": "你的buvid3",
  "dedeuserid": "你的UID"
}
```

## 三、使用方法

### 基本操作

```python
from bilibili_api import user, video, dynamic

# 初始化（自动读取凭证）
user = user.User(UID)

# 发视频
v = video.Video()
v.upload_video(title="标题", desc="描述", video_path="文件路径")

# 发动态
d = dynamic.Dynamic()
d.send_dynamic(text="内容", image_path="图片路径")

# 回复评论
video.reply_comment(cid, message)
```

### 运营脚本示例

```python
# 每日任务
python3 scripts/daily_task.py
```

## 四、功能列表

| 功能 | 状态 | 说明 |
|------|------|------|
| 发布视频 | ✅ | 需要上传视频文件 |
| 发布动态 | ✅ | 支持文字+图片 |
| 回复评论 | ✅ | 自动/手动回复 |
| 查看数据 | ✅ | 粉丝、播放量等 |
| AI辅助 | ✅ | 生成标题、简介、文案 |

## 五、常见问题

**Q: 凭证过期怎么办？**
A: 重新运行 `python3 bili_login.py` 扫码授权

**Q: 上传视频失败？**
A: 检查网络，或尝试先发布动态测试

**Q: 如何获取UID？**
A: 打开B站个人主页，URL最后的数字就是UID

## 六、示例命令

```bash
# 测试登录
python3 -c "from bilibili_api import user; print('OK')"

# 发测试动态
python3 -c "
from bilibili_api import dynamic
d = dynamic.Dynamic()
d.send_dynamic(text='测试动态')
"

# 查看帮助
python3 bilibili-mcp/mcp_server.py --help
```

---
有问题联系孟德