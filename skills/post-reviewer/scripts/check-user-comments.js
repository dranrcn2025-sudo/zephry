require('dotenv').config();

const { login } = require('./login');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER || '') + ':' + (process.env.OUTER_PASS || ''))).toString('base64'));
const BASE = process.env.ADMIN_URL;

const RISKY_NICK = [
  '22wu.cc', '操妹', '粉逼', '免费', '不要钱', '刚成年', '妹妹', '约炮', '成人视频', '偷拍自拍'
];

const RISKY_CONTENT = [
  'cc.com', '浏览器搜', 'jvfy', '免费看淫片', '刚破处', '自拍小视频', '发情的小母狗',
  '在线等你玩', '骚逼特别粉', '下面好多水', '萝莉', '女大', '嫩逼', '闺蜜寝室'
];

function isFlagged(item) {
  const nick = String(item.user?.nickname || '');
  const content = String(item.content || '');
  const hitNick = RISKY_NICK.some(k => nick.includes(k));
  const hitContent = RISKY_CONTENT.some(k => content.includes(k));
  return hitNick || hitContent;
}

async function fetchUserComments(token, uid, phpsessid, userId, limit = 100) {
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
    body: new URLSearchParams({ page: 1, pageSize: limit, object_type: 'post' }).toString(),
  });
  const text = await res.text();
  const data = JSON.parse(text);
  // 过滤出指定用户的评论
  const userComments = (data?.data?.items || []).filter(item => item.user_id == userId);
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

async function main() {
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;

  // 获取最近1000条评论中的所有用户ID
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
    body: new URLSearchParams({ page: 1, pageSize: 1000, object_type: 'post' }).toString(),
  });
  const text = await res.text();
  const data = JSON.parse(text);
  const allComments = data?.data?.items || [];
  
  // 收集所有用户ID
  const userIds = [...new Set(allComments.map(item => item.user_id))];
  
  console.log(`扫描到${allComments.length}条评论，涉及${userIds.length}个用户`);
  
  let totalFlagged = 0;
  const flaggedByUser = {};
  
  // 检查每个用户的评论
  for (const userId of userIds) {
    const userComments = allComments.filter(item => item.user_id == userId);
    const flaggedComments = userComments.filter(isFlagged);
    
    if (flaggedComments.length > 0) {
      flaggedByUser[userId] = flaggedComments.length;
      totalFlagged += flaggedComments.length;
      
      console.log(`用户id${userId}: ${flaggedComments.length}条可疑评论`);
      
      // 删除可疑评论
      const ids = flaggedComments.map(c => c._id);
      if (ids.length > 0) {
        await deleteComments(ids, token, uid, phpsessid);
        console.log(`  已删除${ids.length}条评论`);
      }
    }
  }
  
  // 输出总结
  console.log(`\n=== 巡逻总结 ===`);
  console.log(`扫描评论数: ${allComments.length}`);
  console.log(`涉及用户数: ${userIds.length}`);
  console.log(`发现可疑评论: ${totalFlagged}条`);
  
  if (totalFlagged > 0) {
    console.log(`\n按用户分布:`);
    for (const [userId, count] of Object.entries(flaggedByUser)) {
      console.log(`  用户id${userId}: ${count}条`);
    }
  } else {
    console.log(`\n干净，无漏网之鱼。`);
  }
}

main().catch(err => {
  console.error(`用户评论检查失败：${err.message}`);
  process.exit(1);
});