require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 高风险昵称关键词
const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍',
  '学生妹', '宿舍', '爸爸来', '爸爸们'
];

// 高风险内容关键词（基础）
const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室'
];

// 新规则：明确的性引诱短语
const EXPLICIT_SEXUAL_PHRASES = [
  '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来', '给您看', '视频看',
  '喷水', '操妹妹', '操女儿', '骚逼', '自慰', '学生妹', '宿舍', '爸爸来', '爸爸们', '搜下面图片',
  '进图片送视频', '让你射', '我是小梅', '同层约', '进网页截图', '截图送视频', '小梅20岁'
];

// 新规则：模糊字母字符串（通常出现在色情引流文本末尾）
const AMBIGUOUS_TAILS = [
  'nvgu', 'jjggk', 'ynbgt', 'unnf', 'jnbfr', 'hncr', 'yyhbg', 'kn vg', 'jjnbbjj', 'lnnv',
  'mbvy', 'jnvf', 'ukngy', 'imnh', 'kmnh', 'nbg', 'unbg', 'jnbgt', 'jbgt', 'jbvg', 'kngg',
  'knh', 'jmbfu', 'jbbg', 'kmnbh', 'ilmnh', 'iknh', 'hbvf', 'jngt', 'nvf', 'bbi'
];

// 花/表情符号
const FLOWER_EMOJIS = ['🌺', '🌹', '🌸', '💐'];

// 无意义文本（用于图片广告检测）
const MEANINGLESS_TEXT = [
  '1', '。。。', '沙发', 'mark', '😎与', '与', '、', '，', '.', '..', '...', '!!!!', '？？', '？？？',
  '6', '666', '顶', '打卡', '哦', '签到'
];

function containsFlowerEmojis(text) {
  return FLOWER_EMOJIS.some(emoji => text.includes(emoji));
}

function containsAmbiguousTail(text) {
  const lowerText = text.toLowerCase();
  return AMBIGUOUS_TAILS.some(tail => lowerText.includes(tail));
}

function containsExplicitSexualPhrase(text) {
  return EXPLICIT_SEXUAL_PHRASES.some(phrase => text.includes(phrase));
}

function isMeaninglessText(text) {
  const trimmed = text.trim();
  if (trimmed.length < 5) return true;
  return MEANINGLESS_TEXT.some(pattern => trimmed === pattern || trimmed.includes(pattern));
}

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  
  // 规则1: 高风险昵称或内容关键词
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  
  // 规则2: 明确的性引诱短语
  const hasExplicitSexual = containsExplicitSexualPhrase(content);
  
  // 规则3: 长度>40字符且包含花表情和模糊字母字符串
  const hasFlowerAndTail = content.length > 40 && containsFlowerEmojis(content) && containsAmbiguousTail(content);
  
  // 规则4: 图片广告检测（有图片且文本无意义）
  const hasImages = item.images && item.images.length > 0;
  const isMeaningless = isMeaninglessText(content);
  const isImageAd = hasImages && isMeaningless;
  
  // 规则5: XSS攻击检测
  const hasXSS = /<script|<img|<iframe/i.test(content) && /src=.*(jjgg\.xyz|jjgg\.xyz\/[jy])/i.test(content);
  
  // 规则6: 昵称和内容都命中高风险模式
  const bothHighRisk = hitNick && (hitContent || hasExplicitSexual);
  
  return hitNick || hitContent || hasExplicitSexual || hasFlowerAndTail || isImageAd || hasXSS || bothHighRisk;
}

async function fetchComments(token, uid, phpsessid, pageSize = 1000) {
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

function formatSummary(primary, frozenUsers, residual) {
  if (!primary.ids.length && !residual.ids.length) {
    return '杀掉了0条。';
  }
  
  const lines = [];
  const totalKilled = primary.ids.length + residual.ids.length;
  
  // 使用杀手语气
  lines.push(`【巡逻报告】本轮清扫完成，总计击毙${totalKilled}条垃圾评论。`);
  
  if (primary.ids.length) {
    lines.push(`首轮扫描击毙${primary.ids.length}条：`);
    for (const [userId, count] of Object.entries(primary.counts)) {
      lines.push(`  • 用户id${userId}，${count}条，已清理`);
    }
    if (frozenUsers.length) {
      lines.push(`已冻结${frozenUsers.length}个高危账号：`);
      for (const userId of frozenUsers) lines.push(`  • 用户id${userId}，账号已封禁`);
    }
  }
  
  if (residual.ids.length) {
    lines.push(`补漏扫描又击毙${residual.ids.length}条：`);
    for (const [userId, count] of Object.entries(residual.counts)) {
      lines.push(`  • 用户id${userId}，${count}条漏网之鱼，已补杀`);
    }
  }
  
  // 添加总结
  if (totalKilled > 0) {
    lines.push(`\n战场已清扫干净，随时待命下一轮巡逻。`);
  } else {
    lines.push(`\n战场干净，未发现敌情。`);
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
  console.log('【18game后台巡逻】开始执行...');
  console.log('扫描最近1000条评论，按用户ID搜索补漏...\n');
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;

  // 扫描1000条评论
  const pageSize = 1000;
  const first = await fetchComments(token, uid, phpsessid, pageSize);
  const firstItems = (first?.data?.items || []);
  const flaggedItems = firstItems.filter(isFlagged);
  
  console.log(`扫描完成，共检查${firstItems.length}条评论，发现${flaggedItems.length}条可疑评论。`);
  
  // 显示检测到的评论详情
  if (flaggedItems.length > 0) {
    console.log('\n检测到的可疑评论：');
    flaggedItems.forEach((item, i) => {
      console.log(`${i+1}. 用户ID: ${item.user_id}, 昵称: "${item.user?.nickname || ''}"`);
      console.log(`   内容: "${item.content?.substring(0, 80) || ''}${item.content?.length > 80 ? '...' : ''}"`);
    });
  }
  
  const primary = summarizeBatch(flaggedItems);
  const frozenUsers = Object.entries(primary.counts).filter(([, c]) => c >= 5).map(([userId]) => Number(userId));

  if (primary.ids.length) {
    console.log(`\n开始清理${primary.ids.length}条垃圾评论...`);
    await deleteComments(primary.ids, token, uid, phpsessid);
    console.log(`评论清理完成。`);
    
    if (frozenUsers.length) {
      console.log(`开始冻结${frozenUsers.length}个高危账号...`);
      for (const userId of frozenUsers) {
        await freezeUser(userId, token, uid, phpsessid);
        console.log(`  已冻结用户id${userId}`);
      }
    }
  }

  let residual = { ids: [], counts: {} };
  if (frozenUsers.length) {
    // 冻结用户后再次扫描1000条评论进行补漏
    console.log('\n执行补漏扫描...');
    const second = await fetchComments(token, uid, phpsessid, pageSize);
    const secondItems = (second?.data?.items || []);
    const residualFlagged = secondItems.filter(isFlagged);
    residual = summarizeBatch(residualFlagged);
    
    if (residual.ids.length) {
      console.log(`补漏扫描发现${residual.ids.length}条漏网之鱼，开始清理...`);
      await deleteComments(residual.ids, token, uid, phpsessid);
    }
  }

  const summary = formatSummary(primary, frozenUsers, residual);
  writeRunLog(primary, frozenUsers, residual, summary);
  
  console.log('\n' + '='.repeat(50));
  console.log(summary);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error(`【巡逻失败】${err.message}`);
  process.exit(1);
});