# 微博视频发布状态

## 已实测打通
- 使用首页发文卡片上传单个 mp4 视频
- 携带文案一起发送
- 后端 `ajax/statuses/update` 返回 `发布成功`

## 当前有效流程
1. 进入微博首页
2. 填写 `textarea[placeholder="有什么新鲜事想分享给大家？"]`
3. 对首页发文卡片内的 `input[type="file"]` 设置视频文件
4. 等待约 20 秒让上传链路完成初始化与上传
5. 点击 `button:has-text("发送")`
6. 以网络响应为最终成功判定

## 关键网络信号
视频发布时已观察到这些请求：
- `ajax/multimedia/mediaGroupInit`
- `ajax/multimedia/dispatch`
- `fileplatform/init.json`
- `upload.json`
- `check.json`
- `ajax/statuses/update` ← 最关键，返回 `发布成功`

## 页面现象
上传时页面可能出现：
- `内容声明`
- 视频时长，如 `0:15`
- 视频按钮变为 disabled

这些都不等于失败。

## 成功判定建议
优先看发帖接口响应，不要只靠首页回读，因为时间线不一定立刻把刚发布内容顶到顶部。

## 风险
- 上传完成时间与视频大小有关，固定等待可能不稳
- 更稳的后续方案：监听 `ajax/statuses/update` 返回成功
- 多账号连续发相同视频可能触发限制
