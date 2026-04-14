require('dotenv').config();
const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

async function fetchCommentsByUser(token, uid, phpsessid, targetUserId, pageSize = 1000) {
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
  
  // 过滤出指定用户的评论
  const items = data?.data?.items || [];
  const userComments = items.filter(item => item.user_id == targetUserId);
  
  return userComments;
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

function isImageSpam(comment) {
  const content = String(comment.content || '').trim();
  const hasImage = comment.images && comment.images.length > 0;
  
  // 检查是否是无意义内容（主要是emoji和短文本）
  if (!hasImage) return false;
  
  // 内容长度很短（小于10个字符）或者主要是emoji
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
  const targetUserId = process.argv[2];
  if (!targetUserId) {
    console.error('请提供用户ID作为参数');
    console.error('用法: node search-by-user.js <用户ID>');
    process.exit(1);
  }
  
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;
  
  console.log(`正在搜索用户ID ${targetUserId} 的评论...`);
  
  // 扫描1000条评论
  const comments = await fetchCommentsByUser(token, uid, phpsessid, targetUserId, 1000);
  console.log(`找到 ${comments.length} 条评论`);
  
  // 筛选出图片广告spam
  const spamComments = comments.filter(isImageSpam);
  console.log(`检测到 ${spamComments.length} 条图片广告spam`);
  
  if (spamComments.length > 0) {
    // 显示前5条作为示例
    console.log('\n示例评论:');
    spamComments.slice(0, 5).forEach(comment => {
      console.log(`  ID: ${comment._id}, 内容: "${comment.content}", 图片: ${comment.images.length}张`);
    });
    
    // 获取评论ID
    const commentIds = spamComments.map(c => c._id);
    
    // 删除评论
    console.log(`\n正在删除 ${commentIds.length} 条评论...`);
    const deleteResult = await deleteComments(commentIds, token, uid, phpsessid);
    if (deleteResult?.status === 'y') {
      console.log(`成功删除 ${commentIds.length} 条评论`);
      
      // 如果spam评论数量超过5条，冻结用户
      if (spamComments.length >= 5) {
        console.log(`\n用户发布了 ${spamComments.length} 条spam评论，正在冻结用户...`);
        const freezeResult = await freezeUser(targetUserId, token, uid, phpsessid);
        if (freezeResult?.status === 'y') {
          console.log(`已冻结用户ID ${targetUserId}`);
        } else {
          console.log(`冻结用户失败: ${JSON.stringify(freezeResult)}`);
        }
      }
    } else {
      console.log(`删除失败: ${JSON.stringify(deleteResult)}`);
    }
  } else {
    console.log('未检测到图片广告spam');
  }
}

main().catch(err => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});