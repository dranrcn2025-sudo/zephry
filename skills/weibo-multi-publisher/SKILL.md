---
name: weibo-multi-publisher
description: >
  用于搭建和维护微博多账号自动发布能力。当用户要求做微博一键三账号发布、
  微博多号同步发文、复用微博登录态自动发微博、根据给定文案/图片/视频代发微博、
  或要把微博发布流程做成可重复执行的 skill 时，使用此技能。
---

# 微博多账号发布

这个技能用于把“给我文案或视频，我一键发到 3 个微博号”落成可维护的 OpenClaw skill。

## 当前已验证能力

已经实测打通：
- 微博扫码登录并保存 Playwright `storageState`
- 使用登录态进入微博首页
- 自动填写纯文案
- 自动点击“发送”并回读页面确认发布结果

## 第一版目标

- 接收文案、图片、视频素材
- 读取 3 个微博账号登录态
- 逐号打开微博发布页
- 纯文案稳定发布
- 输出每个账号的成功/失败结果

## 当前范围

当前默认承诺：
- 纯文案微博：可做
- 扫码登录存状态：可做

仍需后续补齐：
- 图文发布
- 视频微博
- 三账号串行/并发策略
- 风控退避与失败重试

## 目录约定

```text
skills/weibo-multi-publisher/
├── SKILL.md
├── references/
│   ├── rollout-plan.md
│   └── selectors-and-status.md
└── scripts/
    ├── publish_weibo.py
    ├── weibo_login.py
    ├── post_text_weibo.py
    ├── config.example.json
    └── prepare_storage_state.md
```

真实运行配置：
- `skills/weibo-multi-publisher/.config.json`
- `skills/weibo-multi-publisher/storage-state/*.json`

不要把真实 cookie、storage state、账号信息提交进 git。

## 推荐工作流

### 1. 先确认素材类型

分为：
- 纯文案
- 图文
- 视频

第一版优先支持：
- 纯文案
- 单视频 + 文案
- 多图 + 文案

### 2. 明确账号集合

建议在配置里固定 3 个账号键，例如：
- `main`
- `alt1`
- `alt2`

由配置映射到各自的 storage state 文件。

### 3. 登录态准备

优先使用 Playwright `storageState`。

如果用户要扫码登录，直接运行：

```bash
python3 scripts/weibo_login.py --state-out skills/weibo-multi-publisher/storage-state/main.json --screenshot /tmp/weibo-qr.png
```

如果用户给的是已登录浏览器 profile 或 cookie，先转换/整理，再落到：

```text
skills/weibo-multi-publisher/storage-state/<account>.json
```

### 4. 执行策略

发布动作属于外部动作。除非用户明确要求自动发，否则默认流程：
1. 先检查素材
2. 先做 dry-run / 预检查
3. 再执行正式发布
4. 返回逐账号结果

### 5. 失败处理

常见失败点：
- 登录态失效
- 页面结构变化
- 视频上传卡住
- 风控/验证码
- 同文案多号发送触发限制

遇到这些情况时：
- 保留失败账号列表
- 不假装发布成功
- 返回哪个账号失败、卡在哪一步

## 运行建议

脚本默认支持：
- `--config`
- `--account`
- `--all-accounts`
- `--text-file`
- `--media`
- `--dry-run`

### 典型调用

```bash
python3 scripts/publish_weibo.py --config .config.json --all-accounts --text-file /path/post.txt --media /path/a.jpg /path/b.jpg --dry-run
python3 scripts/post_text_weibo.py --state skills/weibo-multi-publisher/storage-state/main.json --text "测试一下自动发微博功能，别理我。"
```

## 何时读 references

当需要明确交付边界、接登录态方案、给用户解释 rollout 顺序，或页面结构变动时，读取：
- `references/rollout-plan.md`
- `references/selectors-and-status.md`

## 默认交付口径

如果用户说“先搭骨架”，默认交付：
- skill 目录
- 发布脚本占位
- 配置模板
- 登录态准备说明
- rollout 计划

如果用户说“现在就接上发微博”，再进入真实登录态与选择器调试阶段。
