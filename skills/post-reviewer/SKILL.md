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
Return a concise summary:
- approved count
- rejected count
- deleted count
- any failures with reason

Never echo credentials, tokens, session cookies, or TOTP codes back to the user.
