require('dotenv').config();
const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

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
  const data = JSON.parse(text);
  
  return data?.data?.items || [];
}

function isImageSpam(comment) {
  const content = String(comment.content || '').trim();
  const hasImage = comment.images && comment.images.length > 0;
  
  if (!hasImage) return false;
  
  // 内容长度很短（小于10个字符）
  if (content.length <= 10) return true;
  
  // 检查是否主要是emoji
  const emojiRegex = /[\p{Emoji}]/gu;
  const emojiMatches = [...content.matchAll(emojiRegex)];
  const emojiCount = emojiMatches.length;
  const totalChars = [...content].length;
  
  // 如果超过70%的字符是emoji，认为是无意义内容
  if (emojiCount > 0 && emojiCount / totalChars > 0.7) return true;
  
  // 检查是否包含常见的无意义模式
  const meaninglessPatterns = ['1', '。。。', '沙发', 'mark', '😎与', '与', '、', '，', '.', '..', '...', '!!!!', '？？', '？？？'];
  if (meaninglessPatterns.includes(content)) return true;
  
  return false;
}

async function main() {
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;
  
  console.log('正在扫描所有评论...');
  
  // 扫描1000条评论
  const comments = await fetchAllComments(token, uid, phpsessid, 1000);
  console.log(`共扫描到 ${comments.length} 条评论`);
  
  // 按用户分组
  const userComments = {};
  comments.forEach(comment => {
    const userId = comment.user_id;
    if (!userComments[userId]) {
      userComments[userId] = [];
    }
    userComments[userId].push(comment);
  });
  
  console.log(`共发现 ${Object.keys(userComments).length} 个用户`);
  
  // 检测每个用户的spam评论
  const spamUsers = [];
  for (const [userId, userCommentsList] of Object.entries(userComments)) {
    const spamComments = userCommentsList.filter(isImageSpam);
    if (spamComments.length > 0) {
      spamUsers.push({
        userId,
        totalComments: userCommentsList.length,
        spamCount: spamComments.length,
        nickname: userCommentsList[0]?.user?.nickname || '未知',
        sampleContent: spamComments[0]?.content || ''
      });
    }
  }
  
  if (spamUsers.length > 0) {
    console.log('\n检测到以下spam用户:');
    spamUsers.forEach(user => {
      console.log(`  用户ID: ${user.userId}, 昵称: "${user.nickname}", 总评论: ${user.totalComments}, spam评论: ${user.spamCount}, 示例: "${user.sampleContent}"`);
    });
    
    // 总结
    const totalSpamComments = spamUsers.reduce((sum, user) => sum + user.spamCount, 0);
    console.log(`\n总计: ${spamUsers.length} 个spam用户, ${totalSpamComments} 条spam评论`);
    
    // 检查是否有需要冻结的用户（spam评论数量 >= 5）
    const usersToFreeze = spamUsers.filter(user => user.spamCount >= 5);
    if (usersToFreeze.length > 0) {
      console.log(`\n以下用户需要冻结 (spam评论 >= 5条):`);
      usersToFreeze.forEach(user => {
        console.log(`  用户ID: ${user.userId}, spam评论: ${user.spamCount}条`);
      });
    }
  } else {
    console.log('未检测到spam用户');
  }
}

main().catch(err => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});