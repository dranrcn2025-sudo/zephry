require('dotenv').config();
const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

async function deleteComment(commentId, token, uid, phpsessid) {
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
    body: new URLSearchParams({ act: 'del', id: commentId, table: 'comment' }).toString(),
  });
  const text = await res.text();
  return JSON.parse(text);
}

async function main() {
  const commentId = process.argv[2];
  if (!commentId) {
    console.error('请提供评论ID作为参数');
    console.error('用法: node delete-specific-comment.js <评论ID>');
    process.exit(1);
  }
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;
  
  console.log(`正在删除评论ID ${commentId}...`);
  const result = await deleteComment(commentId, token, uid, phpsessid);
  
  if (result?.status === 'y') {
    console.log(`成功删除评论ID ${commentId}`);
  } else {
    console.log(`删除失败: ${JSON.stringify(result)}`);
  }
}

main().catch(err => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});