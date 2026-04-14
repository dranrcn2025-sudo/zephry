require('dotenv').config();
const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 高风险关键词
const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室'
];

// 新增的高风险模式
const FLOWER_EMOJIS = ['🌺', '🌹', '🌸', '💐'];
const AMBIGUOUS_TAILS = [
  'nvgu', 'jjggk', 'ynbgt', 'unnf', 'jnbfr', 'hncr', 'yyhbg', 'kn vg', 'jjnbbjj', 'lnnv',
  'mbvy', 'jnvf', 'ukngy', 'imnh', 'kmnh', 'nbg', 'unbg', 'jnbgt', 'jbgt', 'jbvg',
  'kngg', 'knh', 'jmbfu', 'jbbg', 'kmnbh', 'ilmnh', 'iknh', 'hbvf'
];

const SEXUAL_SOLICITATION = [
  '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来', '给您看', '视频看',
  '喷水', '操妹妹', '操女儿', '骚逼', '自慰', '学生妹', '宿舍', '爸爸来', '爸爸们', '搜下面图片'
];

function isHighRiskSpam(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  
  // 1. 昵称或内容包含高风险关键词（黑词广告）
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  if (hitNick || hitContent) return true;
  
  // 2. 内容包含性引诱短语（黑词广告）
  if (SEXUAL_SOLICITATION.some(phrase => content.includes(phrase))) return true;
  
  // 3. 花表情+模糊尾字符串模式（黑词广告）
  if (content.length > 40) {
    const hasFlower = FLOWER_EMOJIS.some(emoji => content.includes(emoji));
    const hasAmbiguousTail = AMBIGUOUS_TAILS.some(tail => content.toLowerCase().includes(tail));
    if (hasFlower && hasAmbiguousTail) return true;
  }
  
  // 4. 无意义文本+图片（图片广告）
  const hasImage = item.images && item.images.length > 0;
  if (hasImage) {
    const isMeaningless = MEANINGLESS_TEXT.some(text => content.trim() === text) ||
                         content.length < 5 ||
                         /^[\s\p{Emoji}]+$/u.test(content);
    if (isMeaningless) return true;
  }
  
  // 5. XSS攻击
  if (/<script|<img|<iframe/i.test(content) && /src=.*\.(xyz|com|net)/i.test(content)) {
    return true;
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
  console.log('🔪 深度巡逻开始 - 杀手模式启动');
  console.log('==============================\n');
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;

  // 扫描1000条评论
  const data = await fetchAllComments(token, uid, phpsessid, 1000);
  const allItems = data?.data?.items || [];
  console.log(`📊 扫描了 ${allItems.length} 条评论`);
  
  // 检测高风险评论
  const highRiskItems = allItems.filter(isHighRiskSpam);
  console.log(`🎯 发现 ${highRiskItems.length} 条高风险评论`);
  
  if (highRiskItems.length === 0) {
    console.log('✅ 评论区干净，没有发现脏东西');
    return;
  }
  
  // 按用户分组
  const userGroups = {};
  highRiskItems.forEach(item => {
    const userId = item.user_id;
    if (!userGroups[userId]) userGroups[userId] = [];
    userGroups[userId].push(item);
  });
  
  console.log('\n🔍 高风险用户分析：');
  console.log('-----------------');
  
  const killList = [];
  const freezeList = [];
  
  Object.entries(userGroups).forEach(([userId, items]) => {
    console.log(`用户ID: ${userId} - ${items.length} 条评论`);
    
    // 显示前3条评论内容
    items.slice(0, 3).forEach((item, idx) => {
      const preview = item.content.length > 50 ? item.content.substring(0, 50) + '...' : item.content;
      console.log(`  ${idx + 1}. ID:${item._id} "${preview}"`);
    });
    
    if (items.length > 3) {
      console.log(`  ... 还有 ${items.length - 3} 条`);
    }
    
    // 添加到击杀列表
    items.forEach(item => killList.push(item._id));
    
    // 如果用户发布5条以上高风险评论，添加到冻结列表
    if (items.length >= 5) {
      freezeList.push(Number(userId));
      console.log(`  ⚠️  标记为批量垃圾用户，需要冻结`);
    }
    
    console.log('');
  });
  
  // 执行删除
  if (killList.length > 0) {
    console.log('💀 执行清理操作...');
    await deleteComments(killList, token, uid, phpsessid);
    console.log(`✅ 已删除 ${killList.length} 条高风险评论`);
  }
  
  // 执行冻结
  if (freezeList.length > 0) {
    console.log('❄️  执行冻结操作...');
    for (const userId of freezeList) {
      await freezeUser(userId, token, uid, phpsessid);
      console.log(`✅ 已冻结用户ID: ${userId}`);
    }
  }
  
  console.log('\n🎯 巡逻完成总结：');
  console.log('================');
  console.log(`总计击杀: ${killList.length} 条评论`);
  console.log(`总计冻结: ${freezeList.length} 个用户`);
  
  if (killList.length > 0) {
    console.log('\n📋 击杀列表：');
    console.log(killList.join('、'));
  }
  
  if (freezeList.length > 0) {
    console.log('\n🧊 冻结用户：');
    freezeList.forEach(userId => console.log(`用户ID: ${userId}`));
  }
}

main().catch(err => {
  console.error(`💥 巡逻失败：${err.message}`);
  process.exit(1);
});