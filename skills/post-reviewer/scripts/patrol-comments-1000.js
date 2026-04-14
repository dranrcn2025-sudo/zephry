require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 扩展风险词库
const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍',
  '操女儿', '骚逼', '自慰', '学生妹', '宿舍', '爸爸来', '爸爸们'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室',
  '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来', '给您看', '视频看', '喷水',
  '搜下面图片', 'jjgg.xyz', 'jjgg.xyz/j', 'jjgg.xyz/y'
];

// 检查花表情+模糊尾字母模式
function hasFlowerEmojiAmbiguousTail(content) {
  const flowerEmojis = ['🌺', '🌹', '🌸', '💐', '🌷', '🌼', '🌻'];
  const hasFlower = flowerEmojis.some(emoji => content.includes(emoji));
  
  if (!hasFlower || content.length < 40) return false;
  
  // 检查末尾模糊字母组合
  const tailPatterns = [
    'nvgu', 'jjggk', 'ynbgt', 'unnf', 'jnbfr', 'hncr', 'yyhbg', 'kn vg', 'jjnbbjj',
    'lnnv', 'mbvy', 'jnvf', 'ukngy', 'imnh', 'kmnh', 'nbg', 'unbg', 'jnbgt', 'jbgt',
    'jbvg', 'kngg', 'knh', 'jmbfu', 'jbbg', 'kmnbh', 'ilmnh', 'iknh', 'hbvf'
  ];
  
  const lastPart = content.slice(-20).toLowerCase().replace(/[^a-z]/g, '');
  return tailPatterns.some(pattern => lastPart.includes(pattern));
}

// 检查无意义文本+图片广告
function isMeaninglessWithImage(content, images) {
  if (!images || images.length === 0) return false;
  
  const meaningless = [
    '1', '。。。', '沙发', 'mark', '😎与', '与', '、', '，', '.', '..', '...', '!!!!', '？？', '？？？',
    '6', '666', '顶', '打卡', '哦', '嗯', '好', '行', '可以', '收到', '谢谢', '感谢'
  ];
  
  const trimmed = content.trim();
  if (meaningless.includes(trimmed)) return true;
  
  // 检查主要是表情符号
  const emojiOnly = trimmed.replace(/[\p{Emoji}\s]/gu, '').length === 0;
  if (emojiOnly && trimmed.length > 0) return true;
  
  // 检查长度过短
  if (trimmed.length < 5 && trimmed.length > 0) return true;
  
  return false;
}

// 检查HTML/XSS攻击
function hasXSS(content) {
  const xssPatterns = [
    /<script[^>]*>/i,
    /<img[^>]*src=/i,
    /<iframe[^>]*src=/i,
    /jjgg\.xyz/i,
    /onclick=/i,
    /onerror=/i,
    /javascript:/i
  ];
  
  return xssPatterns.some(pattern => pattern.test(content));
}

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  const images = item.images || [];
  
  // 基础风险词检查
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  
  // 花表情+模糊尾字母模式
  const flowerTail = hasFlowerEmojiAmbiguousTail(content);
  
  // 无意义文本+图片广告
  const meaninglessAd = isMeaninglessWithImage(content, images);
  
  // XSS攻击检查
  const xssAttack = hasXSS(content);
  
  return hitNick || hitContent || flowerTail || meaninglessAd || xssAttack;
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

// 杀手语气格式化总结
function formatSummary(primary, frozenUsers, residual) {
  if (!primary.ids.length && !residual.ids.length) {
    return '🩸 18game后台十分钟一巡完成。\n\n这轮扫了1000条，评论区干净，没发现脏东西。';
  }
  
  const lines = [];
  lines.push('🩸 18game后台十分钟一巡完成。\n');
  
  const totalKilled = primary.ids.length + residual.ids.length;
  lines.push(`🔪 本轮总计击杀：${totalKilled}条垃圾评论\n`);
  
  if (primary.ids.length) {
    lines.push(`📊 第一轮扫描（1000条）：击杀${primary.ids.length}条`);
    
    // 按用户ID分组显示
    const userGroups = Object.entries(primary.counts);
    if (userGroups.length > 0) {
      lines.push('👥 用户分布：');
      for (const [userId, count] of userGroups) {
        lines.push(`  • 用户ID ${userId}：${count}条`);
      }
    }
    
    lines.push('');
  }
  
  if (frozenUsers.length) {
    lines.push('❄️ 已冻结用户：');
    for (const userId of frozenUsers) {
      lines.push(`  • 用户ID ${userId}（批量垃圾评论，已封禁）`);
    }
    lines.push('');
  }
  
  if (residual.ids.length) {
    lines.push(`📊 补漏扫描：击杀${residual.ids.length}条`);
    
    const residualGroups = Object.entries(residual.counts);
    if (residualGroups.length > 0) {
      lines.push('👥 补漏用户分布：');
      for (const [userId, count] of residualGroups) {
        lines.push(`  • 用户ID ${userId}：${count}条`);
      }
    }
    
    lines.push('');
  }
  
  lines.push('✅ 巡逻完成，评论区已清理。');
  
  return lines.join('\n');
}

function writeRunLog(primary, frozenUsers, residual, summary) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const logDir = path.join(__dirname, '..', 'logs');
  const logPath = path.join(logDir, `patrol-comments-1000-${day}.jsonl`);
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
  console.log('🩸 开始18game后台巡逻，扫描最近1000条评论...\n');
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;

  // 第一轮扫描：1000条评论
  console.log('📡 正在扫描最近1000条评论...');
  const first = await fetchComments(token, uid, phpsessid, 1000);
  const firstItems = first?.data?.items || [];
  console.log(`📊 共获取${firstItems.length}条评论`);
  
  const flaggedItems = firstItems.filter(isFlagged);
  console.log(`🔍 发现${flaggedItems.length}条可疑评论`);
  
  const primary = summarizeBatch(flaggedItems);
  
  // 冻结条件：同一用户发布5条或以上垃圾评论
  const frozenUsers = Object.entries(primary.counts)
    .filter(([, c]) => c >= 5)
    .map(([userId]) => Number(userId));

  if (primary.ids.length) {
    console.log(`🔪 正在删除${primary.ids.length}条垃圾评论...`);
    await deleteComments(primary.ids, token, uid, phpsessid);
    
    if (frozenUsers.length) {
      console.log(`❄️ 正在冻结${frozenUsers.length}个垃圾用户...`);
      for (const userId of frozenUsers) {
        await freezeUser(userId, token, uid, phpsessid);
      }
    }
  }

  // 补漏扫描：如果有用户被冻结，再扫一次看是否有新注册的垃圾账号
  let residual = { ids: [], counts: {} };
  if (frozenUsers.length) {
    console.log('📡 正在进行补漏扫描...');
    const second = await fetchComments(token, uid, phpsessid, 200); // 补漏扫200条
    const secondItems = second?.data?.items || [];
    const secondFlagged = secondItems.filter(isFlagged);
    residual = summarizeBatch(secondFlagged);
    
    if (residual.ids.length) {
      console.log(`🔪 补漏发现${residual.ids.length}条，正在删除...`);
      await deleteComments(residual.ids, token, uid, phpsessid);
    }
  }

  const summary = formatSummary(primary, frozenUsers, residual);
  writeRunLog(primary, frozenUsers, residual, summary);
  
  console.log('\n' + summary);
}

main().catch(err => {
  console.error(`❌ 巡逻失败：${err.message}`);
  process.exit(1);
});