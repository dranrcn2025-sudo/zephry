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

async function main() {
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;
  
  console.log('正在获取评论...');
  
  const comments = await fetchAllComments(token, uid, phpsessid, 1000);
  
  // 检查特定的用户ID
  const targetUserIds = [939504, 4329851, 4339963, 4398952, 4526404];
  
  console.log('\n检查特定用户的评论:');
  targetUserIds.forEach(userId => {
    const userComments = comments.filter(c => c.user_id == userId);
    console.log(`\n用户ID ${userId}:`);
    userComments.forEach(comment => {
      console.log(`  ID: ${comment._id}, 内容: "${comment.content}", 图片: ${comment.images?.length || 0}张, 状态: ${comment.status}`);
    });
  });
}

main().catch(err => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});