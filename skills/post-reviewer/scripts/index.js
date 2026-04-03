require('dotenv').config();

const { login } = require('./login');

const CONFIG = {
    PostListApi: process.env.ADMIN_URL + '/post/list',
    PostUpdateApi: process.env.ADMIN_URL + '/post/updateStatus',
    PostDelApi: process.env.ADMIN_URL + '/post/do',
    CommentListApi: process.env.ADMIN_URL + '/comment/list?object_type=post',
    PostCount: process.env.POSTS_COUNT || 20,
    CommentCount: process.env.COMMENTS_COUNT || process.env.POSTS_COUNT || 20,
};

async function getPostList(token, uid, phpsessid) {
    const params = new URLSearchParams({ page: 1, pageSize: CONFIG.PostCount, status: 0 });
    const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/post/list; uid=${uid}; token=${token}; `;

    const res = await fetch(CONFIG.PostListApi, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
        },
        body: params.toString(),
    });
    const data = await res.json();
    return data;
}

async function updatePost(ids, status, token, uid, phpsessid) {
    const params = new URLSearchParams({ ids, status });
    const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/post/list; uid=${uid}; token=${token}; `;

    const res = await fetch(CONFIG.PostUpdateApi, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
        },
        body: params.toString(),
    });
    const data = await res.json();
    return data;
}

async function delPost(id, token, uid, phpsessid) {
    const params = new URLSearchParams({ id, act: 'del' });
    const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/post/list; uid=${uid}; token=${token}; `;

    const res = await fetch(CONFIG.PostDelApi, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
        },
        body: params.toString(),
    });
    const data = await res.json();
    return data;
}

async function getCommentList(token, uid, phpsessid) {
    const params = new URLSearchParams({ page: 1, pageSize: CONFIG.CommentCount, object_type: 'post' });
    const cookie = `PHPSESSID=${phpsessid}; _menu=/admin1866/comment/list; uid=${uid}; token=${token}; `;

    const res = await fetch(CONFIG.CommentListApi, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
        },
    });

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        return {
            success: false,
            message: 'comment list did not return JSON',
            preview: text.slice(0, 500)
        };
    }
}

function extractShortComments(payload, maxLen = 5) {
    const items = payload?.data?.items || payload?.items || payload?.data?.list || payload?.list || [];
    const results = [];
    for (const item of items) {
        const content = String(item.content || item.comment || item.comment_content || item.reply_content || '').trim();
        if (!content) continue;
        if ([...content].length <= maxLen) {
            results.push({
                id: item.id ?? item.comment_id ?? item._id ?? null,
                postId: item.post_id ?? item.object_id ?? item.topic_id ?? null,
                userId: item.user_id ?? item.uid ?? null,
                gameId: item.game_id ?? item.app_id ?? null,
                status: item.status ?? null,
                content,
                raw: item,
            });
        }
    }
    return results;
}

// ✅ 主流程
module.exports = async function (ctx) {
    try {
        const action = ctx.input?.action || 'list';
        const googleCode = ctx.input?.code || '';
        const loginResult = await login(googleCode);
        if (!loginResult.success) {
            return { success: false, message: loginResult.message };
        }
        //console.log('登录成功:', loginResult);
        //console.log('开始执行操作:', action);

        const { token, uid, phpsessid } = loginResult;

        const results = [];

        try {
            let res;
            if (action === 'update') {
                const ids = ctx.input?.ids || '';
                const status = ctx.input?.status || '1';
                res = await updatePost(ids, status, token, uid, phpsessid);
                results.push({ update_res: res.data, success: true, response: res });
            } else if (action === 'delete') {
                const id = ctx.input?.id || '';
                res = await delPost(id, token, uid, phpsessid);
                results.push({ del_res: res.data, success: true, response: res });
            } else if (action === 'list-comments') {
                res = await getCommentList(token, uid, phpsessid);
                results.push({ comment_data: res.data || null, success: res.success !== false, response: res });
            } else if (action === 'find-short-comments') {
                res = await getCommentList(token, uid, phpsessid);
                const maxLen = Number(ctx.input?.maxLen || 5);
                const shortComments = extractShortComments(res, maxLen);
                results.push({ short_comments: shortComments, total_short_comments: shortComments.length, success: res.success !== false, response: res });
            } else {
                res = await getPostList(token, uid, phpsessid);
                results.push({ post_data: res.data, success: true, response: res });
            }
        } catch (err) {
            results.push({ success: false, error: err.message });
        }

        return {
            success: true,
            total: results.length,
            results
        };

    } catch (err) {
        return {
            success: false,
            message: err.message
        };
    }
};


// ✅ CLI 入口（方便你本地跑）
if (require.main === module) {
    const args = process.argv.slice(2);
    const params = {};

    args.forEach(arg => {
        const [key, value] = arg.replace('--', '').split('=');
        params[key] = value;
    });

    module.exports({ input: params })
        .then(res => {
            console.log(JSON.stringify(res, null, 2));
        })
        .catch(err => {
            console.error(err);
        });
}
