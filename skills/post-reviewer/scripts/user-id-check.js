require('dotenv').config();
const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 今天已经处理过的用户ID（从日志中提取）
const TODAY_USERS = [
  '4528216', '4529186', '4527962', '4529450', 
  '4530389', '4530492', '4530546', '4531248'
];

// 高风险关键词
const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室'
];

// 新增规则：花+字母组合
const FLOWER_EMOJI = ['🌺', '🌹', '🌸', '💐'];
const SUSPICIOUS_TAILS = [
  'nvgu', 'jjggk', 'ynbgt', 'unnf', 'jnbfr', 'hncr', 'yyhbg', 'kn vg', 
  'jjnbbjj', 'lnnv', 'mbvy', 'jnvf', 'ukngy', 'imnh', 'kmnh', 'nbg', 
  'unbg', 'jnbgt', 'jbgt', 'jbvg', 'kngg', 'knh', 'jmbfu', 'jbbg', 
  'kmnbh', 'ilmnh', 'iknh', 'hbvf'
];

// 新增规则：性暗示短语
const SEXUAL_PHRASES = [
  '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来', 
  '给您看', '视频看', '喷水', '操妹妹', '操女儿', '骚逼', '自慰', 
  '学生妹', '宿舍', '爸爸来', '爸爸们', '搜下面图片'
];

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  
  // 检查昵称黑名单
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  if (hitNick) return true;
  
  // 检查内容黑名单
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  if (hitContent) return true;
  
  // 检查花+字母组合规则
  const hasFlower = FLOWER_EMOJI.some(flower => content.includes(flower));
  const hasSuspiciousTail = SUSPICIOUS_TAILS.some(tail => content.toLowerCase().includes(tail));
  if (hasFlower && hasSuspiciousTail && content.length > 40) return true;
  
  // 检查性暗示短语
  const hasSexualPhrase = SEXUAL_PHRASES.some(phrase => content.includes(phrase));
  if (hasSexualPhrase) return true;
  
  // 检查图片广告规则
  const hasImage = item.images && item.images.length > 0;
  if (hasImage) {
    const trimmed = content.trim();
    const meaningless = ['1', '。。。', '沙发', 'mark', '😎与', '与', '、', '，', '.', '..', '...', '!!!!', '？？', '？？？'];
    if (meaningless.includes(trimmed) || trimmed.length < 5) return true;
    
    // 检查是否主要是emoji
    const emojiRegex = /[\p{Emoji}]/gu;
    const emojiMatches = [...content.matchAll(emojiRegex)];
    const emojiCount = emojiMatches.length;
    const totalChars = [...content].length;
    if (emojiCount > 0 && emojiCount / totalChars > 0.7) return true;
  }
  
  // 检查XSS攻击
  if (content.includes('<script') || content.includes('<img') || content.includes('<iframe')) {
    if (content.includes('src=') && (content.includes('jjgg.xyz') || content.includes('jjgg.xyz/j') || content.includes('jjgg.xyz/y'))) {
      return true;
    }
  }
  
  return false;
}

async function fetchAllComments(token, uid, phpsessid, pageSize = 1000) {
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

async function main() {
  console.log('=== 18game后台用户ID补漏检查 ===');
  console.log(`检查目标用户ID: ${TODAY_USERS.join(', ')}`);
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;
  
  // 获取所有评论
  console.log('正在扫描最近1000条评论...');
  const data = await fetchAllComments(token, uid, phpsessid, 1000);
  const allItems = data?.data?.items || [];
  console.log(`共获取 ${allItems.length} 条评论`);
  
  // 按用户ID分组
  const userComments = {};
  TODAY_USERS.forEach(userId => {
    userComments[userId] = allItems.filter(item => item.user_id == userId);
  });
  
  // 检查每个用户的评论
  let totalFlagged = 0;
  const flaggedByUser = {};
  const flaggedIds = [];
  
  for (const userId of TODAY_USERS) {
    const comments = userComments[userId];
    if (comments.length === 0) continue;
    
    const flagged = comments.filter(isFlagged);
    if (flagged.length > 0) {
      flaggedByUser[userId] = flagged;
      totalFlagged += flagged.length;
      flaggedIds.push(...flagged.map(c => c._id));
      
      console.log(`\n用户ID ${userId}:`);
      console.log(`  总评论数: ${comments.length}`);
      console.log(`  高风险评论: ${flagged.length}`);
      
      // 显示前3条高风险评论作为示例
      flagged.slice(0, 3).forEach(comment => {
        const preview = comment.content.length > 50 ? comment.content.substring(0, 50) + '...' : comment.content;
        console.log(`    ID: ${comment._id}, 内容: "${preview}"`);
      });
    }
  }
  
  // 执行清理操作
  if (totalFlagged > 0) {
    console.log(`\n=== 执行清理 ===`);
    console.log(`发现 ${totalFlagged} 条高风险评论需要清理`);
    
    // 删除评论
    console.log(`正在删除 ${flaggedIds.length} 条评论...`);
    const deleteResult = await deleteComments(flaggedIds, token, uid, phpsessid);
    if (deleteResult?.status === 'y') {
      console.log(`成功删除 ${flaggedIds.length} 条评论`);
      
      // 检查是否需要冻结用户（如果某个用户有5条以上高风险评论）
      const usersToFreeze = [];
      for (const [userId, comments] of Object.entries(flaggedByUser)) {
        if (comments.length >= 5) {
          usersToFreeze.push(userId);
        }
      }
      
      if (usersToFreeze.length > 0) {
        console.log(`\n需要冻结 ${usersToFreeze.length} 个用户:`);
        for (const userId of usersToFreeze) {
          console.log(`  正在冻结用户ID ${userId}...`);
          const freezeResult = await freezeUser(userId, token, uid, phpsessid);
          if (freezeResult?.status === 'y') {
            console.log(`  已冻结用户ID ${userId}`);
          } else {
            console.log(`  冻结用户失败: ${JSON.stringify(freezeResult)}`);
          }
        }
      }
    } else {
      console.log(`删除失败: ${JSON.stringify(deleteResult)}`);
    }
    
    // 生成杀手语气报告
    console.log('\n=== 巡逻报告 ===');
    console.log(`【补漏完成】本轮按用户ID搜索补漏，总计击毙 ${totalFlagged} 条漏网之鱼。`);
    
    for (const [userId, comments] of Object.entries(flaggedByUser)) {
      const freezeStatus = comments.length >= 5 ? '，账号已封禁' : '';
      console.log(`  • 用户id${userId}，${comments.length}条${freezeStatus}`);
    }
    
    if (Object.keys(flaggedByUser).length === 0) {
      console.log('  所有目标用户ID下均未发现新的高风险评论，战场干净。');
    }
    
    console.log('\n战场已二次清扫，随时待命下一轮巡逻。');
  } else {
    console.log('\n=== 检查结果 ===');
    console.log('所有目标用户ID下均未发现新的高风险评论。');
    console.log('战场干净，无需补漏。');
  }
}

main().catch(err => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});