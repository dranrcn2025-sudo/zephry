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
1. 用 Playwright/浏览器登录微博账号
2. 导出 storage state
3. 放到上述目录
4. 在 `.config.json` 中映射文件名

## 注意
- 真实登录态不要提交进 git
- 登录态失效后需要重新导出
- 若启用二次验证，首次接入可能需要人工配合
