require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室'
];

// 计算符号比例（使用全局匹配正确处理emoji）
function getSymbolRatio(text) {
  if (!text || text.length === 0) return 0;
  
  // 匹配emoji、符号、标点、空白字符
  const symbolRegex = /[\p{Emoji}\p{Symbol}\p{Punctuation}\s]/gu;
  const matches = text.match(symbolRegex);
  const symbolCount = matches ? matches.length : 0;
  
  return symbolCount / text.length;
}

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  const hasImage = item.images && item.images.length > 0;
  
  // 原有规则：高风险昵称或内容
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  
  // 规则1：带图片且包含emoji符号的一律按广告处理
  let isImageAd = false;
  if (hasImage && content.length > 0) {
    // 检测是否包含emoji或符号（无论比例多少）
    const hasEmojiOrSymbol = /[\p{Emoji}\p{Symbol}]/u.test(content);
    if (hasEmojiOrSymbol) {
      isImageAd = true;
    }
  }
  
  // 规则2：短emoji组合（如💗🐯🈶）即使不带图片也是广告
  let isShortEmojiAd = false;
  if (content.length > 0 && content.length <= 10) { // 短内容
    // 检测是否主要为emoji/符号
    const emojiRegex = /[\p{Emoji}\p{Symbol}]/gu;
    const matches = content.match(emojiRegex);
    if (matches && matches.length >= content.length * 0.7) { // 70%以上是符号
      isShortEmojiAd = true;
    }
  }
  
  // 规则3：无意义字母组合（如ffdrvfd, bbcf, hgcd等）
  let isNonsenseAd = false;
  if (content.length > 0 && content.length <= 15) { // 短内容
    // 检测是否为无意义字母组合（无空格、无标点、无中文）
    const isLettersOnly = /^[a-zA-Z]+$/.test(content);
    const isMeaningless = content.length >= 3 && content.length <= 8; // 3-8个字母的无意义组合
    if (isLettersOnly && isMeaningless) {
      isNonsenseAd = true;
    }
  }
  
  return hitNick || hitContent || isImageAd || isShortEmojiAd || isNonsenseAd;
}

async function fetchComments(token, uid, phpsessid, pageSize = 2000) {
  const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/comment/list; uid=${uid}; token=${token}; `;
  const res = await fetch(`${BASE}/admin1866/comment/list?object_type=post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': BASIC_AUTH_HEADER,
      'Cookie': cookie,
    },
    body: new URLSearchParams({ page: 1, pageSize, object_type: 'post' }).toString(),
  });
  const text = await res.text();
  return JSON.parse(text);
}

async function deleteComments(ids, token, uid, phpsessid) {
  if (!ids.length) return;
  const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/comment/list; uid=${uid}; token=${token}; `;
  const res = await fetch(`${BASE}/admin1866/comment/do`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': BASIC_AUTH_HEADER,
      'Cookie': cookie,
    },
    body: new URLSearchParams({ act: 'del', id: ids.join(','), table: 'comment' }).toString(),
  });
  const text = await res.text();
  return JSON.parse(text);
}

async function freezeUser(userId, token, uid, phpsessid) {
  const cookie = `PHPSESSID=${phpsessid}; uid=${uid}; token=${token}; _menu=/admin1866/user/list;`;
  const res = await fetch(`${BASE}/admin1866/user/do`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': BASIC_AUTH_HEADER,
      'Cookie': cookie,
    },
    body: new URLSearchParams({ act: 'down', id: String(userId) }).toString(),
  });
  const text = await res.text();
  return JSON.parse(text);
}

function summarizeBatch(items) {
  const ids = items.map(x => x._id);
  const counts = {};
  for (const item of items) counts[item.user_id] = (counts[item.user_id] || 0) + 1;
  return { ids, counts };
}

const fs = require('fs');
const path = require('path');

function formatSummary(primary, adUsers, residual) {
  if (!primary.ids.length && !residual.ids.length) {
    return '杀掉了0条。';
  }
  const lines = [];
  if (primary.ids.length) {
    lines.push(`杀掉了${primary.ids.length}条：`);
    for (const [userId, count] of Object.entries(primary.counts)) {
      lines.push(`${count}条来自用户id${userId}`);
    }
    if (adUsers.length) {
      for (const userId of adUsers) lines.push(`广告账号id${userId}`);
    }
  }
  if (residual.ids.length) {
    if (lines.length) lines.push('');
    lines.push(`补巡又杀掉了${residual.ids.length}条：`);
    for (const [userId, count] of Object.entries(residual.counts)) {
      lines.push(`${count}条来自用户id${userId}`);
    }
  }
  return lines.join('\n');
}

function writeRunLog(primary, frozenUsers, residual, summary) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const logDir = path.join(__dirname, '..', 'logs');
  const logPath = path.join(logDir, `patrol-comments-${day}.jsonl`);
  fs.mkdirSync(logDir, { recursive: true });
  const record = {
    ts: now.toISOString(),
    primary,
    residual,
    frozenUsers,
    totalKilled: primary.ids.length + residual.ids.length,
    summary,
  };
  fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
}

async function main() {
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;

  // 扫描1000条评论
  const pageSize = 1000;
  const first = await fetchComments(token, uid, phpsessid, pageSize);
  const firstItems = (first?.data?.items || []).filter(isFlagged);
  const primary = summarizeBatch(firstItems);
  
  // 识别广告账号（发布≥5条广告评论）
  const adUsers = Object.entries(primary.counts).filter(([, c]) => c >= 5).map(([userId]) => Number(userId));
  
  // 只删除评论，不冻结用户
  let deletedCount = 0;
  if (primary.ids.length) {
    const deleteResult = await deleteComments(primary.ids, token, uid, phpsessid);
    if (deleteResult && deleteResult.success) {
      deletedCount += primary.ids.length;
    }
  }

  // 当次巡逻成果汇报
  if (adUsers.length > 0) {
    // 有广告账号
    console.log(`删除${deletedCount}条评论，发现广告账号: ${adUsers.join(', ')}`);
  } else if (deletedCount > 0) {
    // 有删除但无广告账号（单用户<5条）
    console.log(`删除${deletedCount}条评论，无广告账号`);
  } else {
    // 无任何发现
    console.log('巡逻完成，无发现');
  }
  
  // 记录完整日志（用于后续分析）
  writeRunLog(primary, adUsers, { ids: [], counts: {} }, '');
}

main().catch(err => {
  console.error(`巡查失败：${err.message}`);
  process.exit(1);
});
