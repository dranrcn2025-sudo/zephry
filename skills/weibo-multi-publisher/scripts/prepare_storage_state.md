# 登录态准备说明

推荐交付格式：Playwright storage state JSON。

## 目录

```text
skills/weibo-multi-publisher/storage-state/
```

## 建议文件名
- `main.json`
- `alt1.json`
- `alt2.json`

## 获取方式
1. 直接运行 `scripts/weibo_login.py`
2. 输出二维码截图给用户扫码
3. 检测到微博登录 cookie 后自动保存 storage state
4. 放到上述目录，并在 `.config.json` 中映射文件名

示例：

```bash
python3 scripts/weibo_login.py \
  --state-out skills/weibo-multi-publisher/storage-state/main.json \
  --screenshot /tmp/weibo-main-qr.png
```

## 注意
- 真实登录态不要提交进 git
- 登录态失效后需要重新导出
- 若启用二次验证，首次接入可能需要人工配合
