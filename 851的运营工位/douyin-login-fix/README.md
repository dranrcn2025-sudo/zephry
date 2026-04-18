# 抖音扫码登录修复交接

目标：让抖音创作者中心扫码登录不再只靠页面文案判断，而是直接抓 `check_qrconnect` 返回，并在出现成功信号时保存登录态。

## 本次实改内容
- 文件来源：`skills/social-media-publish/engines/social-auto-upload/uploader/douyin_uploader/main.py`
- 交接副本：`851的运营工位/douyin-login-fix/main.py`

## 修复点
1. 监听 `page.on("response")`，抓取 `check_qrconnect` 返回。
2. 记录关键字段：HTTP 状态、JSON、login_status、redirect_url、message。
3. 轮询时输出最近几次 `qrconnect` 事件，不再靠“扫码登录”几个字瞎猜。
4. 在检测到成功信号后，尝试 `context.storage_state(path=account_file)` 保存登录态。
5. 保存后额外检查 `storage_state` 里的 cookie 数量，并打日志。
6. 新开二维码前执行 `context.clear_cookies()`，并 reload 页面，减少旧 session/旧码复用。

## 当前验证到的状态
- 已能稳定生成新二维码。
- 已能稳定抓到 `check_qrconnect` 返回。
- 轮询状态可见：`status: "new"`（表示码活着但尚未扫码）。
- 当前仍需用户真实扫码，才能继续观察是否成功落登录态。
