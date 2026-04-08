#!/usr/bin/env python3
"""B站每日任务自动脚本"""
import sys
sys.path.insert(0, '/root/.openclaw/workspace/bilibili-mcp')

from bilibili_api import Credential, video
import json
import asyncio
import requests
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging

def load_credential(path):
    with open(path) as f:
        d = json.load(f)
    return Credential(sessdata=d['sessdata'], bili_jct=d['bili_jct'], buvid3=d['buvid3'], dedeuserid=d['dedeuserid'])

async def run_tasks(cred_path, account_name):
    logger.info(f"=== {account_name} 每日任务 ===")
    
    cred = load_credential(cred_path)
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    # 获取热门视频
    r = requests.get("https://api.bilibili.com/x/web-interface/popular?pn=1&ps=5", headers=headers)
    videos = r.json()['data']['list']
    
    total_exp = 0
    
    for v in videos[:5]:
        aid = v['aid']
        title = v['title'][:25]
        
        vid = video.Video(aid=aid, credential=cred)
        
        try:
            await vid.like()
            logger.info(f"  ✓ {title} - 点赞 +1")
            total_exp += 1
        except: pass
        
        try:
            await vid.pay_coin(1)
            logger.info(f"  ✓ {title} - 投币 +2")
            total_exp += 2
        except: pass
        
        try:
            await vid.triple()
            logger.info(f"  ✓ {title} - 三连 +5")
            total_exp += 5
        except: pass
        
        try:
            await vid.set_favorite(add_media_ids=[2])
            logger.info(f"  ✓ {title} - 收藏 +5")
            total_exp += 5
        except: pass
        
        await asyncio.sleep(1)
    
    logger.info(f"✅ {account_name} 今日获得约 {total_exp} 经验\n")
    return total_exp

# 主账号
asyncio.run(run_tasks('/root/.openclaw/workspace/bili/credentials.json', 'AC娘超有Fan'))
