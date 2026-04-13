---
name: post-reviewer
description: Review pending community posts from an admin backend and moderate them as spam/ad, meaningless filler, or normal discussion. Use when processing forum/community moderation queues, auditing pending posts, classifying junk ads or water posts, and then calling bundled scripts to approve, reject, or delete posts through the admin API.
---

# Post Reviewer

Use this skill to clear pending post/comment queues with consistent moderation decisions.

## Resources
- `scripts/index.js` — list, approve, reject, or delete posts via the admin backend
- `scripts/login.js` — log in and cache an auth token for the admin backend
- `scripts/patrol-comments.js` — script-first comment patrol: scan, delete spam comments, freeze spam users, output the exact patrol summary text for chat, and append each run to `logs/patrol-comments-YYYY-MM-DD.jsonl`

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
- If a comment contains explicit porn-bait / 淫秽导流 copy such as long 发骚招嫖文案, `浏览器搜` + 网页/图片站引导, `jvfy`, or similar explicit lure phrases, treat it as spam / 广告号 and delete it immediately without asking for extra confirmation.
- If a comment author's nickname contains `22wu.cc`, treat the comment as spam / 导流刷屏 and delete it immediately without asking for extra confirmation.
- If a comment author's nickname contains obvious 黄赌导流词, treat it as spam / 导流刷屏 and delete it immediately without asking for extra confirmation. High-risk examples include: `操妹`, `粉逼`, `免费`, `不要钱`, `刚成年`, `妹妹`, `约炮`, `成人视频`, `偷拍自拍`, and similar explicit bait combinations.
- If both the comment author's nickname and the comment content independently hit blacklisted / high-risk spam patterns, treat it as direct-kill spam with no extra review. In practice: 昵称命中黑词 + 内容命中黑词/黄赌导流模式 = 直接删除；if the same user shows this pattern at scale in the same sweep, freeze immediately.
- If the same user is found mass-posting 5 or more spam comments in one sweep, freeze that user immediately after deleting the comments.
- After freezing a spam user, run one more comment sweep immediately to catch follow-up spam from newly registered accounts.
- **New rule (2026-04-13)**: If a comment is longer than 40 characters and contains both flower/emoji decorations (🌺🌹🌸💐) and ambiguous letter strings at the end (e.g., `nvgu`, `jjggk`, `ynbgt`, `unnf`, `jnbfr`, `hncr`, `yyhbg`, `kn vg`, `jjnbbjj`, `lnnv`, `mbvy`, `jnvf`, `ukngy`, `imnh`, `kmnh`, `nbg`, `unbg`, `jnbgt`, `jbgt`, `jbvg`, `kngg`, `knh`, `jmbfu`, `jbbg`, `kmnbh`, `ilmnh`, `iknh`, `hbvf`), treat it as porn‑bait / 黄赌导流 spam. Delete all matching comments from that user and freeze the account immediately.
- **Extended rule (2026-04-13)**: Also treat as porn‑bait spam if the comment contains explicit sexual solicitation phrases even without flower emojis or ambiguous tails. High‑risk patterns include: `自拍视频`, `无偿给您`, `哥哥要看吗`, `同成闺蜜`, `妹妹本人`, `要的来`, `给您看`, `视频看`, `喷水`, `操妹妹`, `操女儿`, `骚逼`, `自慰`, `学生妹`, `宿舍`, `爸爸来`, `爸爸们`, `搜下面图片`. Delete immediately and freeze the account.
- **Image‑ad rule (2026-04-13)**: If a comment contains an image and its text is meaningless, treat it as likely image‑based advertisement / 图片广告 spam. Meaningless text includes:
  - Single emoji or random characters
  - Length shorter than 5 characters
  - Exact matches: `1`, `。。。`, `沙发`, `mark`, `😎与`, `与`, `、`, `，`, `.`, `..`, `...`, `!!!!`, `？？`, `？？？`
  - Multiple unrelated emojis + repeated characters (e.g., `🧠🎸👝与与`, `😎😎与`, `🌺🌹与`)
  - Any text that consists primarily of emojis and has no discernible topic
Delete immediately and freeze the account.
- **Patrol scope rule (2026-04-13)**: Default patrol must scan at least **1000 recent comments** per run, not just the latest 120. This ensures newly registered spam accounts that post in bursts are caught even if they are not in the very latest slice. Adjust `pageSize` in patrol scripts accordingly.
- **XSS attack rule (2026-04-13)**: If a post or comment contains HTML tags (`<script`, `<img`, `<iframe`, etc.) with `src=` or similar attributes pointing to external domains (e.g., `jjgg.xyz`, `jjgg.xyz/j`, `jjgg.xyz/y`), treat it as XSS / malicious script injection. Delete immediately and freeze the account.
- **Post lookup method (2026-04-13)**: To find a specific post by its ID (e.g., 4804):
  1. If you know the user ID, filter by `user_id` in the post list API.
  2. Otherwise, paginate through the post list (pageSize=50–100) until you find the target `_id`. The backend may limit pageSize, so pagination is required.
  3. If the post is not in recent pages, it may have been deleted or is outside the default sort range.
- **Export format for feedback records (2026-04-13)**: When exporting post/comment feedback for运营整理, use this CSV‑style format:
  ```
  帖子ID,用户ID,反馈内容,是否有图片,运营整理描述,记录人,反馈时间,回复详情
  4805,4186848,"手上拿着一堆光4星 合成不了, 也是服了",否,"玩家反馈光系合成问题",857,2026-04-11 10:06,
  4804,4475082,"好色<script>...",否,"XSS攻击已处理",857,2026-04-11 09:02,
  ```
  Fields:
  - 帖子ID: post._id
  - 用户ID: post.user_id
  - 反馈内容: post.content (truncate if too long)
  - 是否有图片: "是" if post.images.length > 0 else "否"
  - 运营整理描述: short summary of the issue/feedback
  - 记录人: operator identifier (e.g., 857)
  - 反馈时间: post.created_at
  - 回复详情: any follow‑up response (leave empty if none)
- **How to fill “回复详情”**:
  1. If the comment is from the official account (user_id 275), leave this column empty — it is the reply itself.
  2. If the comment is from a player and there is an official reply within a short time window (e.g., same thread, same day, content‑related), fill this column with the official reply’s content (or a summary).
  3. If the comment is from a player but no official reply is found, leave it empty.
  4. To determine the reply relationship, sort comments by time and look for consecutive entries where a player comment is followed by an official reply that addresses the same topic.

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
For comment 巡查 tasks, prefer running `node scripts/patrol-comments.js` first. Let the script handle detection, deletion, freezing, summary generation, and local run logging; only fall back to manual API calls when the script fails or a one-off exception is needed.

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
- Do **not** include long raw ID dumps unless the operator explicitly asks for details.
- First report the total deleted count, for example: `杀掉了104条`
- Then summarize grouped by user in a colder patrol tone, for example:
  - `用户id4471620，总计83条，已击毙`
  - `用户id4483281，总计21条，已击毙`
- Important wording rule:
  - `已击毙` means the user was frozen / banned.
  - If comments were deleted but the user was **not** frozen, do **not** say `已击毙`; just report the count.
- When the operator asks `今天杀了多少条`, answer with the **natural-day cumulative total** first, not just the latest patrol run.
- When useful, distinguish clearly between:
  - `今天累计杀掉了X条`
  - `这一轮杀掉了Y条`

Also report approved/rejected/deleted counts and any failures when that context matters.

Never echo credentials, tokens, session cookies, or TOTP codes back to the user.
