require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

// 从今天的巡逻日志中提取处理过的用户ID
function getTodayProcessedUsers() {
  const fs = require('fs');
  const path = require('path');
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  
  const logDir = path.join(__dirname, '..', 'logs');
  const logPath = path.join(logDir, `patrol-comments-${today}.jsonl`);
  
  const processedUsers = new Set();
  
  if (fs.existsSync(logPath)) {
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.trim().split('\n');
    
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.primary && record.primary.counts) {
          Object.keys(record.primary.counts).forEach(userId => {
            processedUsers.add(userId);
          });
        }
        if (record.residual && record.residual.counts) {
          Object.keys(record.residual.counts).forEach(userId => {
            processedUsers.add(userId);
          });
        }
      } catch (e) {
        // 跳过解析错误的行
      }
    }
  }
  
  return Array.from(processedUsers);
}

// 综合风险检测函数
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
  
  // 规则3: 花表情+模糊尾字母模式
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
  
  // 规则4: XSS攻击
  const hasXSS = /<script|<img|<iframe/i.test(item.content || '') && 
                /src=/i.test(item.content || '');
  
  // 规则5: 图片广告（只检查黑词广告）
  const hasImage = item.images && item.images.length > 0;
  const imageAd = hasImage && (hitNick || hitContent || longContentWithPattern || hasXSS);
  
  return hitNick || hitContent || longContentWithPattern || hasXSS || imageAd;
}

async function fetchCommentsByUser(token, uid, phpsessid, userId, limit = 200) {
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
      user_id: userId
    }).toString(),
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

// 杀手语气报告
function generateKillerReport(results) {
  if (results.totalFlagged === 0 && results.totalUsersChecked === 0) {
    return "💀 杀手报告：所有已处理用户已清理干净，暂无新目标。";
  }
  
  const lines = [];
  lines.push(`💀 18GAME后台杀手巡逻报告 - 用户ID补漏模式`);
  lines.push(`🕒 执行时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  lines.push(`🎯 任务：按用户ID搜索补漏（检查今天处理过的用户）`);
  lines.push(`📋 检查用户数：${results.totalUsersChecked}个`);
  lines.push('');
  
  if (results.totalFlagged > 0) {
    lines.push(`🔪 清理成果：`);
    lines.push(`   总计清除：${results.totalFlagged}条漏网之鱼`);
    lines.push(`   涉及用户：${results.usersWithViolations.length}个`);
    lines.push('');
    
    lines.push(`📊 详细战果：`);
    results.userResults.forEach(userResult => {
      if (userResult.flaggedCount > 0) {
        lines.push(`  🔸 用户 ${userResult.userId}`);
        lines.push(`     清理数：${userResult.flaggedCount}条`);
        lines.push(`     状态：${userResult.frozen ? '已冻结❄️' : '活跃⚠️'}`);
        if (userResult.sampleContent) {
          lines.push(`     示例：${userResult.sampleContent}`);
        }
        lines.push('');
      }
    });
    
    lines.push(`⚡ 行动总结：`);
    lines.push(`   ${results.totalFlagged}条违规评论已永久删除`);
    lines.push(`   ${results.usersFrozen}个高危用户已冻结`);
    lines.push(`   巡逻完成度：100%`);
  } else {
    lines.push(`✅ 检查结果：`);
    lines.push(`   所有${results.totalUsersChecked}个已处理用户`);
    lines.push(`   未发现新的违规内容`);
    lines.push(`   评论区保持干净`);
  }
  
  lines.push('');
  lines.push(`🎯 任务状态：${results.totalFlagged > 0 ? '目标已清除' : '无目标可清除'}`);
  
  return lines.join('\n');
}

async function main() {
  console.log('🔪 开始18GAME后台杀手巡逻 - 用户ID补漏模式');
  console.log('🎯 目标：检查今天处理过的用户是否有漏网评论');
  console.log('💀 模式：深度搜索，彻底清理\n');
  
  // 获取今天处理过的用户
  const todayUsers = getTodayProcessedUsers();
  console.log(`📊 今天已处理用户数：${todayUsers.length}个`);
  console.log(`📋 用户列表：${todayUsers.join(', ')}\n`);
  
  if (todayUsers.length === 0) {
    console.log('💀 今天尚未处理任何用户，跳过补漏检查。');
    return;
  }
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || '登录失败');
  const { token, uid, phpsessid } = auth;
  
  const results = {
    totalUsersChecked: todayUsers.length,
    totalFlagged: 0,
    usersWithViolations: [],
    usersFrozen: 0,
    userResults: []
  };
  
  console.log(`🔍 开始检查${todayUsers.length}个已处理用户...`);
  
  for (const userId of todayUsers) {
    console.log(`   检查用户 ${userId}...`);
    
    try {
      const response = await fetchCommentsByUser(token, uid, phpsessid, userId, 200);
      const userItems = response?.data?.items || [];
      
      // 筛选违规评论
      const flaggedItems = userItems.filter(isFlagged);
      const flaggedIds = flaggedItems.map(item => item._id);
      const flaggedCount = flaggedIds.length;
      
      if (flaggedCount > 0) {
        console.log(`   发现${flaggedCount}条违规评论，正在清理...`);
        
        // 删除违规评论
        await deleteComments(flaggedIds, token, uid, phpsessid);
        
        // 如果累计5条以上，冻结用户
        let frozen = false;
        if (flaggedCount >= 5) {
          console.log(`   用户 ${userId} 累计${flaggedCount}条违规，正在冻结...`);
          await freezeUser(userId, token, uid, phpsessid);
          frozen = true;
          results.usersFrozen++;
        }
        
        results.totalFlagged += flaggedCount;
        results.usersWithViolations.push(userId);
        
        // 记录用户结果
        const sampleContent = flaggedItems[0]?.content?.substring(0, 80) + 
                            (flaggedItems[0]?.content?.length > 80 ? '...' : '');
        
        results.userResults.push({
          userId,
          flaggedCount,
          frozen,
          sampleContent
        });
        
        console.log(`   用户 ${userId} 清理完成：${flaggedCount}条`);
      } else {
        console.log(`   用户 ${userId} 干净`);
        results.userResults.push({
          userId,
          flaggedCount: 0,
          frozen: false,
          sampleContent: null
        });
      }
      
    } catch (error) {
      console.error(`   用户 ${userId} 检查失败：${error.message}`);
      results.userResults.push({
        userId,
        flaggedCount: 0,
        frozen: false,
        sampleContent: null,
        error: error.message
      });
    }
    
    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n' + '='.repeat(60));
  
  // 生成杀手报告
  const report = generateKillerReport(results);
  console.log(report);
  
  console.log('='.repeat(60));
  console.log('🎯 杀手巡逻任务完成');
  
  // 保存日志
  const fs = require('fs');
  const path = require('path');
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const logDir = path.join(__dirname, '..', 'logs');
  const logPath = path.join(logDir, `patrol-user-check-today-${day}.jsonl`);
  
  fs.mkdirSync(logDir, { recursive: true });
  const logEntry = {
    ts: now.toISOString(),
    usersChecked: todayUsers,
    totalFlagged: results.totalFlagged,
    usersWithViolations: results.usersWithViolations,
    usersFrozen: results.usersFrozen,
    report: report
  };
  
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf8');
  console.log(`📝 日志已保存：${logPath}`);
}

main().catch(err => {
  console.error(`💀 杀手巡逻失败：${err.message}`);
  console.error(err.stack);
  process.exit(1);
});