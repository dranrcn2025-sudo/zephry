require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 扩展的风险关键词列表
const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍',
  '操女儿', '骚逼', '自慰', '学生妹', '宿舍', '爸爸来', '爸爸们'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室',
  '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来', '给您看',
  '视频看', '喷水', '操妹妹', '搜下面图片', 'jjgg.xyz', 'jjgg.xyz/j', 'jjgg.xyz/y'
];

// 高风险用户ID列表（从历史记录中收集）
const HIGH_RISK_USERS = [
  '4526495'  // 之前发现过违规的用户
];

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  
  // 检查高风险用户ID
  if (HIGH_RISK_USERS.includes(String(item.user_id))) {
    return true;
  }
  
  // 检查昵称关键词
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  
  // 检查内容关键词
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  
  // 检查花表情+模糊尾字母模式（黄赌导流）
  const hasFlowerEmoji = /[🌺🌹🌸💐🌷🥀🌻🌼💮🏵️]/u.test(content);
  const hasAmbiguousTail = /\b(nvgu|jjggk|ynbgt|unnf|jnbfr|hncr|yyhbg|kn vg|jjnbbjj|lnnv|mbvy|jnvf|ukngy|imnh|kmnh|nbg|unbg|jnbgt|jbgt|jbvg|kngg|knh|jmbfu|jbbg|kmnbh|ilmnh|iknh|hbvf)\b/i.test(content);
  
  // 检查长内容中的花表情+模糊尾字母
  const longContentWithPattern = content.length > 40 && hasFlowerEmoji && hasAmbiguousTail;
  
  // 检查HTML/XSS攻击
  const hasXSS = /<script|<img|<iframe/i.test(content) && /src=/i.test(content);
  
  // 检查图片广告模式
  const hasImage = item.images && item.images.length > 0;
  const meaninglessText = content.length < 5 || 
                         /^[1-9]$/.test(content) || 
                         /^(。。。|沙发|mark|😎与|与|、|，|\.|\.\.|\.\.\.|!!!!|？？|？？？)$/.test(content) ||
                         /^[🧠🎸👝🌺🌹与]+$/.test(content);
  const imageAd = hasImage && meaninglessText;
  
  return hitNick || hitContent || longContentWithPattern || hasXSS || imageAd;
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
  const details = {};
  
  for (const item of items) {
    const userId = item.user_id;
    counts[userId] = (counts[userId] || 0) + 1;
    
    if (!details[userId]) {
      details[userId] = {
        nickname: item.user?.nickname || '未知',
        comments: []
      };
    }
    
    details[userId].comments.push({
      id: item._id,
      content: item.content?.substring(0, 50) + (item.content?.length > 50 ? '...' : ''),
      time: item.created_at
    });
  }
  
  return { ids, counts, details };
}

const fs = require('fs');
const path = require('path');

function formatSummary(primary, frozenUsers, residual) {
  if (!primary.ids.length && !residual.ids.length) {
    return '这轮巡了，暂时没脏东西，评论区干净。';
  }
  
  // 杀手语气汇报
  const lines = [];
  
  if (primary.ids.length) {
    lines.push(`🔪 杀掉了${primary.ids.length}条垃圾评论：`);
    
    // 按用户分组显示
    for (const [userId, count] of Object.entries(primary.counts)) {
      const userDetails = primary.details[userId];
      const nickname = userDetails?.nickname || '未知';
      lines.push(`  用户 ${userId} (${nickname})：${count}条`);
      
      // 显示前几条评论内容
      if (userDetails?.comments) {
        const sampleComments = userDetails.comments.slice(0, 3);
        sampleComments.forEach(comment => {
          lines.push(`    - ${comment.id}: ${comment.content}`);
        });
        if (userDetails.comments.length > 3) {
          lines.push(`    - ...还有${userDetails.comments.length - 3}条`);
        }
      }
    }
    
    if (frozenUsers.length) {
      lines.push('');
      lines.push('❄️ 已冻结高危用户：');
      frozenUsers.forEach(userId => {
        lines.push(`  - 用户 ${userId} (累计${primary.counts[userId] || 0}条违规)`);
      });
    }
  }
  
  if (residual.ids.length) {
    if (lines.length) lines.push('');
    lines.push(`🔍 补漏扫描又发现${residual.ids.length}条：`);
    
    for (const [userId, count] of Object.entries(residual.counts)) {
      lines.push(`  用户 ${userId}：${count}条`);
    }
  }
  
  // 添加总结行
  if (primary.ids.length > 0 || residual.ids.length > 0) {
    lines.push('');
    const total = primary.ids.length + residual.ids.length;
    lines.push(`📊 总计清理：${total}条评论`);
    lines.push(`👥 涉及用户：${Object.keys(primary.counts).length + Object.keys(residual.counts).length}个`);
    lines.push(`🕒 巡逻时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  }
  
  return lines.join('\n');
}

function writeRunLog(primary, frozenUsers, residual, summary) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const logDir = path.join(__dirname, '..', 'logs');
  const logPath = path.join(logDir, `patrol-enhanced-${day}.jsonl`);
  fs.mkdirSync(logDir, { recursive: true });
  const record = {
    ts: now.toISOString(),
    primary: {
      ids: primary.ids,
      counts: primary.counts,
      total: primary.ids.length
    },
    residual: {
      ids: residual.ids,
      counts: residual.counts,
      total: residual.ids.length
    },
    frozenUsers,
    totalKilled: primary.ids.length + residual.ids.length,
    summary,
  };
  fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
}

async function main() {
  console.log('🚀 开始18game后台深度巡逻...');
  console.log('📋 扫描最近1000条评论，按用户ID搜索补漏');
  console.log('🔪 使用杀手语气汇报结果\n');
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;

  // 第一轮扫描：1000条评论
  console.log('🔄 第一轮扫描中...');
  const first = await fetchComments(token, uid, phpsessid, 1000);
  const firstItems = (first?.data?.items || []);
  const flaggedItems = firstItems.filter(isFlagged);
  const primary = summarizeBatch(flaggedItems);
  
  // 识别需要冻结的用户（累计5条以上违规）
  const frozenUsers = Object.entries(primary.counts).filter(([, c]) => c >= 5).map(([userId]) => Number(userId));

  if (primary.ids.length) {
    console.log(`🗑️ 删除${primary.ids.length}条违规评论...`);
    await deleteComments(primary.ids, token, uid, phpsessid);
    
    if (frozenUsers.length) {
      console.log(`❄️ 冻结${frozenUsers.length}个高危用户...`);
      for (const userId of frozenUsers) {
        await freezeUser(userId, token, uid, phpsessid);
      }
    }
  }

  // 第二轮扫描：补漏（如果冻结了用户）
  let residual = { ids: [], counts: {}, details: {} };
  if (frozenUsers.length) {
    console.log('🔍 第二轮补漏扫描中...');
    const second = await fetchComments(token, uid, phpsessid, 1000);
    const secondItems = (second?.data?.items || []);
    const secondFlagged = secondItems.filter(isFlagged);
    residual = summarizeBatch(secondFlagged);
    
    if (residual.ids.length) {
      console.log(`🗑️ 补漏删除${residual.ids.length}条评论...`);
      await deleteComments(residual.ids, token, uid, phpsessid);
    }
  }

  const summary = formatSummary(primary, frozenUsers, residual);
  writeRunLog(primary, frozenUsers, residual, summary);
  
  console.log('\n' + '='.repeat(50));
  console.log(summary);
  console.log('='.repeat(50));
  console.log('✅ 巡逻完成');
}

main().catch(err => {
  console.error(`❌ 巡逻失败：${err.message}`);
  console.error(err.stack);
  process.exit(1);
});