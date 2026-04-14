require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 综合所有规则的风险检测函数
function isFlagged(item) {
  const nick = String(item.user?.nickname || '').toLowerCase();
  const content = String(item.content || '').toLowerCase();
  const userId = String(item.user_id);
  
  // 规则1: 高风险昵称关键词
  const riskyNickKeywords = [
    '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', 
    '成人视频', '偷拍自拍', '操女儿', '骚逼', '自慰', '学生妹', '宿舍', 
    '爸爸来', '爸爸们'
  ];
  const hitNick = riskyNickKeywords.some(k => nick.includes(k.toLowerCase()));
  
  // 规则2: 高风险内容关键词
  const riskyContentKeywords = [
    'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', 
    '发情的小母狗', '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', 
    '女大', '嫩逼', '闺蜜寝室', '自拍视频', '无偿给您', '哥哥要看吗', 
    '同成闺蜜', '妹妹本人', '要的来', '给您看', '视频看', '喷水', 
    '操妹妹', '搜下面图片'
  ];
  const hitContent = riskyContentKeywords.some(k => content.includes(k.toLowerCase()));
  
  // 规则3: 花表情+模糊尾字母模式（黄赌导流）
  const hasFlowerEmoji = /[🌺🌹🌸💐🌷🥀🌻🌼💮🏵️]/u.test(item.content || '');
  const ambiguousTails = [
    'nvgu', 'jjggk', 'ynbgt', 'unnf', 'jnbfr', 'hncr', 'yyhbg', 'kn vg', 
    'jjnbbjj', 'lnnv', 'mbvy', 'jnvf', 'ukngy', 'imnh', 'kmnh', 'nbg', 
    'unbg', 'jnbgt', 'jbgt', 'jbvg', 'kngg', 'knh', 'jmbfu', 'jbbg', 
    'kmnbh', 'ilmnh', 'iknh', 'hbvf'
  ];
  const hasAmbiguousTail = ambiguousTails.some(tail => 
    new RegExp(`\\b${tail}\\b`, 'i').test(item.content || '')
  );
  const longContentWithPattern = content.length > 40 && hasFlowerEmoji && hasAmbiguousTail;
  
  // 规则4: XSS攻击检测
  const hasXSS = /<script|<img|<iframe/i.test(item.content || '') && 
                /src=/i.test(item.content || '') && 
                /jjgg\.xyz/i.test(item.content || '');
  
  // 规则5: 图片广告模式
  const hasImage = item.images && item.images.length > 0;
  const meaninglessText = content.length < 5 || 
                         /^[1-9]$/.test(content) || 
                         /^(。。。|沙发|mark|😎与|与|、|，|\.|\.\.|\.\.\.|!!!!|？？|？？？)$/.test(content) ||
                         /^[🧠🎸👝🌺🌹与]+$/.test(content);
  const imageAd = hasImage && meaninglessText;
  
  // 规则6: 显式性引诱短语（即使没有花表情）
  const explicitSexualPhrases = [
    '自拍视频', '无偿给您', '哥哥要看吗', '同成闺蜜', '妹妹本人', '要的来',
    '给您看', '视频看', '喷水', '操妹妹', '操女儿', '骚逼', '自慰',
    '学生妹', '宿舍', '爸爸来', '爸爸们', '搜下面图片'
  ];
  const hasExplicitSexual = explicitSexualPhrases.some(phrase => 
    content.includes(phrase.toLowerCase())
  );
  
  // 返回true如果命中任何规则
  return hitNick || hitContent || longContentWithPattern || hasXSS || imageAd || hasExplicitSexual;
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

// 获取用户的所有评论（按用户ID搜索补漏）
async function fetchCommentsByUser(token, uid, phpsessid, userId, limit = 100) {
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
    body: new URLSearchParams({ 
      page: 1, 
      pageSize: limit, 
      object_type: 'post',
      user_id: userId  // 按用户ID筛选
    }).toString(),
  });
  const text = await res.text();
  return JSON.parse(text);
}

function analyzeResults(items) {
  const flagged = items.filter(isFlagged);
  const flaggedIds = flagged.map(x => x._id);
  const userCounts = {};
  const userDetails = {};
  
  for (const item of flagged) {
    const userId = item.user_id;
    userCounts[userId] = (userCounts[userId] || 0) + 1;
    
    if (!userDetails[userId]) {
      userDetails[userId] = {
        nickname: item.user?.nickname || '未知',
        comments: []
      };
    }
    
    userDetails[userId].comments.push({
      id: item._id,
      content: item.content?.substring(0, 100) + (item.content?.length > 100 ? '...' : ''),
      time: item.created_at,
      images: item.images?.length || 0
    });
  }
  
  // 识别需要冻结的用户（5条以上违规）
  const usersToFreeze = Object.entries(userCounts)
    .filter(([, count]) => count >= 5)
    .map(([userId]) => Number(userId));
  
  return {
    flagged,
    flaggedIds,
    userCounts,
    userDetails,
    usersToFreeze,
    totalFlagged: flagged.length,
    totalUsers: Object.keys(userCounts).length
  };
}

// 杀手语气汇报
function generateKillerReport(analysis, deleted = true) {
  const { flaggedIds, userCounts, userDetails, usersToFreeze, totalFlagged, totalUsers } = analysis;
  
  if (totalFlagged === 0) {
    return "🔪 巡逻报告：评论区干净，暂无目标可清除。";
  }
  
  const lines = [];
  lines.push(`🔪 18GAME后台巡逻报告 - 杀手模式`);
  lines.push(`⏰ 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  lines.push(`📊 扫描范围：最近1000条评论`);
  lines.push('');
  
  if (deleted) {
    lines.push(`✅ 已清除${totalFlagged}条违规评论`);
  } else {
    lines.push(`🎯 发现${totalFlagged}条待清除目标`);
  }
  
  lines.push(`👥 涉及${totalUsers}个可疑用户`);
  lines.push('');
  
  // 按用户分组显示
  lines.push(`📋 目标详情：`);
  for (const [userId, count] of Object.entries(userCounts)) {
    const details = userDetails[userId];
    const nickname = details?.nickname || '未知';
    const freezeMark = usersToFreeze.includes(Number(userId)) ? '❄️' : '';
    
    lines.push(`  🔸 用户 ${userId} (${nickname}) ${freezeMark}`);
    lines.push(`     违规数：${count}条`);
    
    // 显示违规原因摘要
    if (details?.comments && details.comments.length > 0) {
      const sample = details.comments[0];
      lines.push(`     示例：${sample.content}`);
      if (sample.images > 0) {
        lines.push(`     包含图片：${sample.images}张`);
      }
    }
    
    if (usersToFreeze.includes(Number(userId))) {
      lines.push(`     ⚠️ 高危用户，建议冻结`);
    }
    lines.push('');
  }
  
  if (usersToFreeze.length > 0) {
    lines.push(`❄️ 高危用户冻结名单：`);
    usersToFreeze.forEach(userId => {
      const details = userDetails[userId];
      const nickname = details?.nickname || '未知';
      lines.push(`  - 用户 ${userId} (${nickname})：${userCounts[userId]}条违规`);
    });
    lines.push('');
  }
  
  lines.push(`💀 清理总结：`);
  lines.push(`   总计清除：${totalFlagged}条`);
  lines.push(`   涉及用户：${totalUsers}个`);
  lines.push(`   冻结用户：${usersToFreeze.length}个`);
  lines.push(`   巡逻状态：${deleted ? '已完成' : '待执行'}`);
  
  return lines.join('\n');
}

async function main() {
  console.log('🦅 开始18GAME后台深度巡逻 - 杀手模式');
  console.log('🎯 任务：扫描最近1000条评论，按用户ID搜索补漏');
  console.log('💀 汇报：使用杀手语气\n');
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;

  // 第一步：扫描最近1000条评论
  console.log('🔍 第一步：扫描最近1000条评论...');
  const response = await fetchComments(token, uid, phpsessid, 1000);
  const allItems = response?.data?.items || [];
  console.log(`📈 获取到${allItems.length}条评论`);
  
  const analysis = analyzeResults(allItems);
  console.log(`🎯 发现${analysis.totalFlagged}条违规评论，涉及${analysis.totalUsers}个用户`);
  
  // 第二步：删除违规评论
  if (analysis.flaggedIds.length > 0) {
    console.log(`🗑️ 删除${analysis.flaggedIds.length}条违规评论...`);
    await deleteComments(analysis.flaggedIds, token, uid, phpsessid);
    
    // 第三步：冻结高危用户
    if (analysis.usersToFreeze.length > 0) {
      console.log(`❄️ 冻结${analysis.usersToFreeze.length}个高危用户...`);
      for (const userId of analysis.usersToFreeze) {
        await freezeUser(userId, token, uid, phpsessid);
      }
    }
  }
  
  // 第四步：按用户ID搜索补漏（针对高危用户）
  let supplementalAnalysis = { totalFlagged: 0, totalUsers: 0 };
  if (analysis.usersToFreeze.length > 0) {
    console.log('\n🔍 第四步：按用户ID搜索补漏...');
    for (const userId of analysis.usersToFreeze) {
      console.log(`   搜索用户 ${userId} 的更多评论...`);
      const userResponse = await fetchCommentsByUser(token, uid, phpsessid, userId, 200);
      const userItems = userResponse?.data?.items || [];
      const userAnalysis = analyzeResults(userItems);
      
      if (userAnalysis.flaggedIds.length > 0) {
        console.log(`   发现用户 ${userId} 还有${userAnalysis.flaggedIds.length}条违规评论`);
        await deleteComments(userAnalysis.flaggedIds, token, uid, phpsessid);
        supplementalAnalysis.totalFlagged += userAnalysis.flaggedIds.length;
        supplementalAnalysis.totalUsers += userAnalysis.totalUsers > 0 ? 1 : 0;
      }
    }
  }
  
  // 生成最终报告
  const totalCleaned = analysis.totalFlagged + supplementalAnalysis.totalFlagged;
  const totalUsersCleaned = analysis.totalUsers + supplementalAnalysis.totalUsers;
  
  console.log('\n' + '='.repeat(60));
  
  if (totalCleaned === 0) {
    console.log('✅ 巡逻完成：评论区干净，无需清理。');
  } else {
    const report = generateKillerReport(analysis);
    console.log(report);
    
    if (supplementalAnalysis.totalFlagged > 0) {
      console.log(`\n🔍 补漏结果：`);
      console.log(`   额外清除：${supplementalAnalysis.totalFlagged}条`);
      console.log(`   额外用户：${supplementalAnalysis.totalUsers}个`);
    }
    
    console.log(`\n📈 最终统计：`);
    console.log(`   总计清除：${totalCleaned}条违规评论`);
    console.log(`   涉及用户：${totalUsersCleaned}个`);
    console.log(`   冻结用户：${analysis.usersToFreeze.length}个`);
    console.log(`   🕒 完成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  }
  
  console.log('='.repeat(60));
  console.log('🎯 18GAME后台巡逻任务完成');
}

main().catch(err => {
  console.error(`💀 巡逻失败：${err.message}`);
  console.error(err.stack);
  process.exit(1);
});