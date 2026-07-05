# 腾讯云函数 SCF — B站 API 代理
# 部署后获得 URL，填入 app.js 的 BILI_FALLBACK 即可

import json, urllib.request, urllib.error

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

def main_handler(event, context):
    params = event.get('queryString', {}) or {}
    bvid = params.get('bvid', '')

    if not bvid:
        return cors_resp({'error': 'missing bvid'}, 400)

    try:
        url = f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}'
        req = urllib.request.Request(url, headers={
            'User-Agent': UA,
            'Referer': 'https://www.bilibili.com/',
        })
        resp = urllib.request.urlopen(req, timeout=8)
        data = json.loads(resp.read().decode('utf-8'))
        return cors_resp(data)
    except Exception as e:
        return cors_resp({'error': str(e)}, 502)

def cors_resp(data, status=200):
    return {
        'isBase64Encoded': False,
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(data, ensure_ascii=False),
    }
