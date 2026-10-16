#!/usr/bin/env python3
"""Collect public original election broadcasts; secrets stay in the IVR Worker."""
import argparse, base64, concurrent.futures, datetime as dt, html, ipaddress, json
import os, re, socket, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
HOSTS={'mako.co.il':'n12','13tv.co.il':'reshet','kan.org.il':'kan','c14.co.il':'c14','i24news.tv':'i24'}
PUBLIC_CACHE={}

def public_url(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password: raise ValueError('invalid_url')
    host=u.hostname
    if host not in PUBLIC_CACHE:
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses): raise ValueError('private_address')
        PUBLIC_CACHE[host]=True
    return url

class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        public_url(newurl)
        redirected=super().redirect_request(req,fp,code,msg,headers,newurl)
        if redirected and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected
OPENER=urllib.request.build_opener(Redirect)

def fetch(url,headers=None,data=None,timeout=30):
    public_url(url)
    req=urllib.request.Request(url,data=data,headers={'User-Agent':UA,**(headers or {})})
    with OPENER.open(req,timeout=timeout) as r:
        b=r.read(8*1024*1024+1)
        if len(b)>8*1024*1024: raise ValueError('response_too_large')
        return b

def get_json(url,headers=None): return json.loads(fetch(url,headers))
def clean(s): return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s or ''))).strip()
def source(url):
    host=urllib.parse.urlsplit(url).hostname or ''
    return next((v for k,v in HOSTS.items() if host==k or host.endswith('.'+k)),None)
def canonical(url):
    u=urllib.parse.urlsplit(url)
    if not source(url): raise ValueError('unknown_source')
    host=u.hostname
    if source(url)=='n12': host='www.mako.co.il'
    return urllib.parse.urlunsplit(('https',host,u.path,'',''))
def relevant(title):
    return bool(re.search('סקר|מנדטים|בחירות|אחוז החסימה|קמפיין|פריימריז',title)) and not re.search(r'בחירות (בארה[״"]ב|בארצות הברית|בצרפת|בבריטניה|לרשות הפלסטינית)',title)
def recent(date):
    if not date:return True
    try:
        date=re.sub(r'([+-]\d\d)(\d\d)$',r'\1:\2',date)
        value=dt.datetime.fromisoformat(date.replace('Z','+00:00'))
        if value.tzinfo is None:value=value.replace(tzinfo=dt.timezone.utc)
        return (dt.datetime.now(dt.timezone.utc)-value).days<=30
    except (ValueError,TypeError):return True

def walk(value):
    if isinstance(value,dict):
        yield value
        for x in value.values():yield from walk(x)
    elif isinstance(value,list):
        for x in value:yield from walk(x)
def ld(page):
    for raw in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',page,re.I):
        try:yield from walk(json.loads(raw))
        except (ValueError,TypeError):pass

def next_data(page):
    match=re.search(r'<script\b[^>]*id=["\']__NEXT_DATA__["\'][^>]*>([\s\S]*?)</script>',page,re.I)
    return json.loads(match[1]) if match else {}

class Links(HTMLParser):
    def __init__(self,base):super().__init__();self.base=base;self.current=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':self.current=[urllib.parse.urljoin(self.base,dict(attrs).get('href','')),dict(attrs).get('title','')]
    def handle_data(self,data):
        if self.current:self.current[1]+=data
    def handle_endtag(self,tag):
        if tag=='a' and self.current:self.links.append(self.current);self.current=None

def reshet_data(url):
    return get_json('https://13tv.co.il/qdata'+urllib.parse.urlsplit(url).path+'?qdata=json')
def discover():
    candidates={}
    def add(url,title):
        if source(url) and relevant(clean(title)):
            try:candidates[canonical(url)]=clean(title)
            except ValueError:pass
    for url in ['https://www.mako.co.il/news-israel-elections','https://www.kan.org.il/content/kan-news/politic/','https://www.c14.co.il/']:
        try:
            parser=Links(url);parser.feed(fetch(url).decode())
            for link,title in parser.links:
                if re.search(r'Article-[a-f0-9]+|/article/\d+|/content/kan-news/[^/]+/\d+',link):add(link,title)
        except Exception as e:print('source_failed',source(url),type(e).__name__,flush=True)
    try:
        for path in ['/tags/survey/','/news/politics/politics/']:
            for item in walk(reshet_data('https://13tv.co.il'+path).get('Content',{})):
                if item.get('link') and item.get('title') and recent(item.get('publishDate')):add(urllib.parse.urljoin('https://13tv.co.il',item['link']),item['title']+' '+item.get('secondaryTitle',''))
    except Exception as e:print('source_failed','reshet',type(e).__name__,flush=True)
    try:
        for cat in [483,487]:
            for item in get_json('https://api.i24news.tv/v2/he/contents?'+urllib.parse.urlencode({'category':cat,'page':1,'limit':12,'countable':1,'inSlider':0,'sort':'-sortDate'})):
                if recent(item.get('publishedAt')):add(item['frontendUrl'],item.get('title','')+' בחירות')
    except Exception as e:print('source_failed','i24',type(e).__name__,flush=True)
    return candidates

def kaltura(entry):
    data={'apiVersion':'3.3.0','clientTag':'html5:v3.1.0','format':1,'partnerId':2748741,
      '1':{'service':'session','action':'startWidgetSession','widgetId':'_2748741','expiry':3600},
      '2':{'service':'baseentry','action':'getPlaybackContext','entryId':entry,'ks':'{1:result:ks}','contextDataParams':{'objectType':'KalturaPlaybackContextOptions','referrer':'https://13tv.co.il/'}}}
    j=json.loads(fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest',{'Content-Type':'application/json'},json.dumps(data).encode()))[1]
    if j.get('actions') or j.get('messages'):raise ValueError('playback_restricted')
    sources=[s for s in j.get('sources',[]) if s.get('format')=='url' and not s.get('drm')]
    if not sources:return []
    s=sources[0];allowed=set(s.get('flavorIds','').split(','))
    flavors=sorted([f for f in j.get('flavorAssets',[]) if f.get('id') in allowed and f.get('status')==2 and f.get('fileExt')=='mp4'],key=lambda f:int(f.get('sizeInBytes') or f.get('size',0)*1024))
    return [re.sub(r'/flavorIds/[^/]+','/flavorIds/'+flavors[0]['id'],s['url'])] if flavors else []

def immergo(embed):
    u=urllib.parse.urlsplit(embed);query=urllib.parse.parse_qs(u.query)
    settings=json.loads(base64.b64decode(query['data-insight'][0]));guid=query.get('data-guid',[settings['guid']])[0]
    if settings['api'] not in ['https://insight-api-channel14.univtec.com/','https://insight-api-shared.univtec.com/']:raise ValueError('unknown_player')
    if settings['client'] not in ['channel14','i24israel']:raise ValueError('unknown_tenant')
    j=get_json(settings['api']+'cms/interface/vods/play?'+urllib.parse.urlencode({'relations':'true','filter':'guid||$eq||'+guid}),{'x-tenant-id':settings['client']})
    v=j.get('vod',{})
    if v.get('paidType') or v.get('approved') is not True:raise ValueError('playback_restricted')
    files=sorted([f for f in v.get('content',[]) if f.get('type')=='video' and f.get('format')=='mp4'],key=lambda f:int(f.get('resolution','99999x0').split('x')[0]))
    return [files[0]['downloadUrl']] if files else []

def article(url):
    kind=source(url)
    if kind=='i24':
        slug=urllib.parse.urlsplit(url).path.rstrip('/').split('/')[-1];j=get_json('https://api.i24news.tv/v2/he/contents/'+slug)
        if j.get('premium') or not recent(j.get('publishedAt')):raise ValueError('not_public_or_old')
        media=[x['sourceUrl'] for x in walk(j.get('parsedBody',[])) if x.get('type')=='immergoVideo' and not x.get('isLive') and x.get('sourceUrl')]
        return j['title'],list(dict.fromkeys(media))
    if kind=='reshet':
        j=reshet_data(url);x=j.get('Content',{}).get('Item',{});info=j.get('SEO',{}).get('schema',{}).get('newsArticle',{})
        if not recent(info.get('datePublished')):raise ValueError('old_article')
        title=x.get('title') or j['PageMeta']['title']
        if not relevant(title+' '+x.get('secondaryTitle','')):return title,[]
        entry=x.get('video',{}).get('kalturaId');return clean(title),kaltura(entry) if entry else []
    try:page=fetch(url).decode()
    except urllib.error.HTTPError:
        if kind!='n12':raise
        page=fetch(url.replace('www.mako.co.il','mobile.mako.co.il')).decode()
    if kind=='n12' and ('We are sorry' in page or 'Access Denied' in page):page=fetch(url.replace('www.mako.co.il','mobile.mako.co.il')).decode()
    objects=list(ld(page));news=next((x for x in objects if x.get('@type')=='NewsArticle'),{})
    title=clean(news.get('headline') or next(iter(re.findall(r'<h1\b[^>]*>([\s\S]*?)</h1>',page,re.I)),''))
    if not relevant(title+' '+news.get('description','')) or not recent(news.get('datePublished')):return title,[]
    if kind=='n12':
        video=next_data(page).get('props',{}).get('pageProps',{}).get('pageData',{}).get('header',{}).get('mainVideo')
        if not video:return title,[]
        params={'jspName':'playlist12.jsp','vcmid':video['videoVcmId'],'videoChannelId':video['videoChannelId'],'galleryChannelId':video['videoGalleryChannelId'],'consumer':'responsive'}
        raw=fetch('https://www.mako.co.il/AjaxPage?'+urllib.parse.urlencode(params))
        # The same public metadata packaging used by Mako's player; not media DRM.
        key='LTf7r/zM2VndHwP+4So6bw==';iv='theExact16Chars='
        decoded=subprocess.run(['openssl','enc','-d','-aes-192-cbc','-a','-A','-K',key.encode().hex(),'-iv',iv.encode().hex()],input=raw,capture_output=True,check=True).stdout
        j=json.loads(decoded)
        if j.get('videoDetails',{}).get('extraParams',{}).get('protectedContent') or j.get('videoDetails',{}).get('isLive'):raise ValueError('playback_restricted')
        return title,[m['url'] for m in j.get('media',[]) if not m.get('ssai')][:1]
    media=[]
    for embed in re.findall(r'<iframe\b[^>]*src=[\"\']([^\"\']+)[\"\']',page,re.I):
        u=urllib.parse.urlsplit(html.unescape(embed));match=re.match(r'/embed/([A-Za-z0-9_-]{11})$',u.path)
        if kind=='kan' and u.hostname in ['www.youtube.com','www.youtube-nocookie.com','youtube.com'] and match:media.append('https://www.youtube.com/watch?v='+match[1])
    for obj in objects:
        if obj.get('@type') in ['VideoObject','AudioObject']:
            if obj.get('contentUrl'):media.append(obj['contentUrl'])
            elif kind=='c14' and str(obj.get('embedUrl','')).startswith('https://snippet.univtec.com/'):media.extend(immergo(obj['embedUrl']))
    for block in re.findall(r'<(?:audio|video)\b[^>]*>[\s\S]*?</(?:audio|video)>',page,re.I):media.extend(html.unescape(x) for x in re.findall(r'\bsrc=["\']([^"\']+)',block))
    return title,list(dict.fromkeys(media))

def hls_input(url,depth=0):
    public_url(url)
    if depth>4:raise ValueError('nested_playlist')
    if not re.search(r'\.m3u8(?:\?|$)',url,re.I):return url
    text=fetch(url).decode()
    if re.search(r'#EXT-X-KEY:(?![^\r\n]*METHOD=NONE)',text):raise ValueError('encrypted_media')
    lines=[s.strip() for s in text.splitlines() if s.strip()]
    audio=[];variants=[]
    for i,line in enumerate(lines):
        for uri in re.findall(r'URI="([^"]+)"',line):public_url(urllib.parse.urljoin(url,uri))
        if line.startswith('#EXT-X-MEDIA:') and 'TYPE=AUDIO' in line:
            match=re.search(r'URI="([^"]+)"',line)
            if match:audio.append(urllib.parse.urljoin(url,match[1]))
        if line.startswith('#EXT-X-STREAM-INF:') and i+1<len(lines):variants.append((int(re.search(r'BANDWIDTH=(\d+)',line)[1]),urllib.parse.urljoin(url,lines[i+1])))
    if audio:return hls_input(audio[0],depth+1)
    if variants:return hls_input(min(variants)[1],depth+1)
    if '#EXT-X-ENDLIST' not in text:raise ValueError('live_media')
    for line in lines:
        if not line.startswith('#'):public_url(urllib.parse.urljoin(url,line))
    return url

def make_audio(url,destination):
    if urllib.parse.urlsplit(url).hostname=='www.youtube.com':
        original=destination.with_suffix('.input.m4a')
        subprocess.run([os.sys.executable,'-m','yt_dlp','--no-playlist','--no-warnings','--socket-timeout','20','-f','bestaudio/best','-o',str(original),url],check=True,capture_output=True,timeout=180)
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(original),'-vn','-ac','1','-ar','8000','-codec:a','libmp3lame','-b:a','32k','-y',str(destination)],check=True,capture_output=True,timeout=180)
        original.unlink(missing_ok=True)
    else:
        url=hls_input(url)
        subprocess.run(['ffmpeg','-nostdin','-v','error','-user_agent',UA,'-protocol_whitelist','http,https,tcp,tls','-i',url,'-map','0:a:0','-vn','-ac','1','-ar','8000','-codec:a','libmp3lame','-b:a','32k','-y',str(destination)],check=True,capture_output=True,timeout=180)
    if not 0<destination.stat().st_size<=24*1024*1024:raise ValueError('audio_size')
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(destination)]));duration=float(info['format']['duration'])
    if not duration>0:raise ValueError('empty_audio')
    return duration

def authorization(endpoint):
    if os.environ.get('COLLECTOR_ADMIN_TOKEN'):return os.environ['COLLECTOR_ADMIN_TOKEN']
    request_url=os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']+'&audience='+urllib.parse.quote(endpoint,safe='')
    return get_json(request_url,{'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})['value']
def worker(endpoint,path,body=None,headers=None):
    auth=authorization(endpoint)
    return json.loads(fetch(endpoint+path,{'Authorization':'Bearer '+auth,**(headers or {})},body,timeout=100))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--endpoint',required=True);parser.add_argument('--max-files',type=int,default=16);parser.add_argument('--deadline-seconds',type=int,default=540);parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    endpoint=args.endpoint.rstrip('/');start=time.monotonic();state=worker(endpoint,'/collector/state');uploaded=set(state['uploaded']);seen=set(state['seen']);candidates=discover()
    for url in state['todo']:
        try:candidates.setdefault(canonical(url),'')
        except ValueError:pass
    count=0;reports=[]
    with tempfile.TemporaryDirectory() as folder:
        for url in candidates:
            if time.monotonic()-start>args.deadline_seconds or count>=args.max_files:break
            if url in seen:continue
            try:
                title,media=article(url)
                if not media:reports.append({'url':url,'status':'no_media'});continue
                for index,clip in enumerate(media):
                    key=url+('#media='+str(index) if index else '')
                    if key in uploaded:continue
                    if count>=args.max_files or time.monotonic()-start>args.deadline_seconds:break
                    if args.dry_run:print('discovered',source(url),title,index,flush=True);continue
                    dest=Path(folder)/'audio.mp3';duration=make_audio(clip,dest)
                    meta=base64.b64encode(json.dumps({'url':key,'title':title+(' — קטע '+str(index+1) if index else ''),'duration':duration},ensure_ascii=False).encode()).decode()
                    for attempt in range(4):
                        try:result=worker(endpoint,'/collector/ingest',dest.read_bytes(),{'X-Article-Meta':meta,'Content-Type':'audio/mpeg'});break
                        except urllib.error.HTTPError as e:
                            if e.code!=409 or attempt==3:raise
                            time.sleep(5)
                    uploaded.add(key);count+=1;print('uploaded',source(url),result.get('file'),round(duration),flush=True)
            except Exception as e:
                reports.append({'url':url,'status':'blocked','error':type(e).__name__});print('article_failed',source(url),type(e).__name__,flush=True)
    if reports and not args.dry_run:worker(endpoint,'/collector/report',json.dumps({'items':reports[:100]}).encode(),{'Content-Type':'application/json'})
    print('complete',count,'uploads',len(reports),'reports',flush=True)
if __name__=='__main__':main()
