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

async function fetchComments(token, uid, phpsessid, pageSize = 120) {
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
  for (const item of items) counts[item.user_id] = (counts[item.user_id] || 0) + 1;
  return { ids, counts };
}

function formatSummary(primary, frozenUsers, residual) {
  if (!primary.ids.length && !residual.ids.length) {
    return '这轮巡了，暂时没脏东西，评论区干净。';
  }
  const lines = [];
  if (primary.ids.length) {
    lines.push(`杀掉了${primary.ids.length}条：`);
    lines.push(primary.ids.join('、'));
    lines.push('');
    for (const [userId, count] of Object.entries(primary.counts)) {
      lines.push(`${count}条来自用户id${userId}`);
    }
    if (frozenUsers.length) {
      lines.push('');
      for (const userId of frozenUsers) lines.push(`已冻结用户id${userId}`);
    }
  }
  if (residual.ids.length) {
    if (lines.length) lines.push('');
    lines.push(`补巡又杀掉了${residual.ids.length}条：`);
    lines.push(residual.ids.join('、'));
    lines.push('');
    for (const [userId, count] of Object.entries(residual.counts)) {
      lines.push(`${count}条来自用户id${userId}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const auth = await login();
  if (!auth.success) throw new Error(auth.message || 'login failed');
  const { token, uid, phpsessid } = auth;

  const first = await fetchComments(token, uid, phpsessid, 120);
  const firstItems = (first?.data?.items || []).filter(isFlagged);
  const primary = summarizeBatch(firstItems);
  const frozenUsers = Object.entries(primary.counts).filter(([, c]) => c >= 5).map(([userId]) => Number(userId));

  if (primary.ids.length) {
    await deleteComments(primary.ids, token, uid, phpsessid);
    for (const userId of frozenUsers) await freezeUser(userId, token, uid, phpsessid);
  }

  let residual = { ids: [], counts: {} };
  if (frozenUsers.length) {
    const second = await fetchComments(token, uid, phpsessid, 120);
    const secondItems = (second?.data?.items || []).filter(isFlagged);
    residual = summarizeBatch(secondItems);
    if (residual.ids.length) {
      await deleteComments(residual.ids, token, uid, phpsessid);
    }
  }

  console.log(formatSummary(primary, frozenUsers, residual));
}

main().catch(err => {
  console.error(`巡查失败：${err.message}`);
  process.exit(1);
});
