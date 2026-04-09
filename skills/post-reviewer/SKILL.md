---
name: post-reviewer
description: Review pending community posts from an admin backend and moderate them as spam/ad, meaningless filler, or normal discussion. Use when processing forum/community moderation queues, auditing pending posts, classifying junk ads or water posts, and then calling bundled scripts to approve, reject, or delete posts through the admin API.
---

# Post Reviewer

Use this skill to clear pending post/comment queues with consistent moderation decisions.

## Resources
- `scripts/index.js` — list, approve, reject, or delete posts via the admin backend
- `scripts/login.js` — log in and cache an auth token for the admin backend

## Required environment
Create a local `.env` next to the scripts before running anything. Do **not** package credentials in the skill.

Required keys:
- `ADMIN_URL`
- `LOGIN_USER`
- `LOGIN_PASS`

Optional keys:
- `TOTP_SECRET`
- `TOKEN_TTL` (default `3600`)
- `IMAGE_BASE_URL`
- `POSTS_COUNT` (default `20`)

If `LOGIN_USER` or `LOGIN_PASS` is missing, ask the user for them and save them to the local `.env` file before proceeding.

## Workflow

### 1. Fetch the target queue
For pending posts, run:

```bash
node scripts/index.js --action=list
```

For existing comments, use the comment list endpoint via the bundled scripts or a direct AJAX-style POST if needed. Sort comments by `created_at` descending when the user asks for the latest comments.

Expect JSON with `results[].post_data` for posts or comment `items[]` for comments.

If the response is HTML or login fails, clear `.token_cache.json`, refresh login, and retry.

If `images` are present and only contain relative paths, prepend `IMAGE_BASE_URL` before reviewing them.
For this workflow, when the operator asks to "扒图" or wants image links, default to the CDN-style CloudFront URL rather than the origin/admin host. Convert paths like `/uploads/2026-04-09/example.jpg` to `https://d391me9s8n5j5s.cloudfront.net/uploads/2026-04-09/example.jpg`.

If there are no matching items, report that the queue is empty and stop.

### 2. Classify each post
Review `title`, `content`, and any attached images.

Use these labels:

- **Spam / ad** — product promotion, referral bait, off-platform contact info, domain names / external contact bait, explicit commercial solicitation, templated ad copy, abusive/extreme illegal content
- **Meaningless filler** — emoji-only, single-character noise, “mark”, “沙发”, random gibberish, empty-topic filler, obvious point-farming junk
- **Normal** — real discussion, bug report, question, feedback, or any post with community value

Hard rules:
- If a comment contains `cc.com`, treat it as spam / off-platform引流 and delete it immediately without asking for extra confirmation.
- If a comment author's nickname contains `22wu.cc`, treat the comment as spam / 导流刷屏 and delete it immediately without asking for extra confirmation.
- If the same user is found mass-posting 5 or more spam comments in one sweep, freeze that user immediately after deleting the comments.
- After freezing a spam user, run one more comment sweep immediately to catch follow-up spam from newly registered accounts.

When uncertain between spam and filler, prefer **spam**.
When uncertain between spam and normal, ask for review only if the false positive cost is high; otherwise prefer the safer moderation path defined by the operator.

## 3. Execute moderation

Approve normal posts:

```bash
node scripts/index.js --action=update --ids=123,456 --status=1
```

Reject spam/ad posts:

```bash
node scripts/index.js --action=update --ids=123,456 --status=2
```

Delete filler posts:

```bash
node scripts/index.js --action=delete --id=123
```

Batch approve/reject where possible. Delete filler posts one by one if the backend only supports a single id.

## 4. Report results
For comment 巡查 tasks, default to returning a cleaned table of **effective feedback only**.

Default reporting rules:
- Exclude official-account replies from the table.
- Exclude filler / water comments from the table, including items like `1`, `6`, `666`, `顶`, `打卡`, `哦`, emoji-only replies, and similar low-value chatter.
- Exclude gift-code / exchange-code / 积分任务 style comments from the table unless the operator explicitly asks for them.
- Keep `运营整理描述` to one short sentence; prefer short, direct wording.
- Always set `记录人` to `Dra`.
- Default output columns: `帖子ID 用户ID 反馈内容 是否有图片 运营整理描述 记录人 反馈时间`.
- For patrol totals returned in chat, prefer the newer copy-friendly single-line format instead of TSV. Each row should use `、` as the separator, so the operator can copy it into Excel and split columns manually.
- When the operator asks for a full-day 巡查总表, group output by game first, for example:
  - `性界大战(285)相关：`
  - `青楼大掌柜(147)相关：`
  Then place copy-friendly single-line rows for each game under that heading.
- For post-patrol tasks, keep the same columns: `帖子ID 用户ID 反馈内容 是否有图片 运营整理描述 记录人 反馈时间`.
- For post `反馈内容`, combine title and body as: `标题 - 正文内容`.
- If a post has images, keep `是否有图片` as `是`, and append image links below that row using CloudFront URLs in this style:
  - `图片• https://d391me9s8n5j5s.cloudfront.net/uploads/...jpg`
  - one bullet line per image
- When the operator asks to整理官方回复, first identify the exact official reply text, then map it back to the original target item it is replying to.
- The final output format for 官方回复整理 is: `帖子ID 用户ID 反馈内容 是否有图片 运营整理描述 记录人 反馈时间 回复详情`.
- `回复详情` should contain the matched official-reply text.
- If the official reply is attached to a user comment, trace it back to that exact comment row.
- If the official reply is attached to a post main floor instead of a child comment, map it back to that post row.

For deletion summaries, use this compact format by default:
- `杀掉了X条：`
- Then list the deleted IDs
- Then summarize grouped by user, for example:
  - `X条来自用户id123456`
  - `Y条来自用户id789012`

Also report approved/rejected/deleted counts and any failures when that context matters.

Never echo credentials, tokens, session cookies, or TOTP codes back to the user.
