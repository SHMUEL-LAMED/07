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
ENDPOINT=None
RESHET_ITEMS={}
YOUTUBE_CHANNELS={"UCvQmPpU20hw1Trss_CVwaew":"reshet"}
YOUTUBE_ITEMS={}
PUBLICATION_DATES={}
MAX_AGE_DAYS=7

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

def direct_fetch(url,headers=None,data=None,timeout=30):
    public_url(url)
    req=urllib.request.Request(url,data=data,headers={'User-Agent':UA,**(headers or {})})
    try:response=OPENER.open(req,timeout=timeout)
    except urllib.error.HTTPError as error:
        if error.code!=403 or data is not None or not source(url):raise
        error.close()
        response=OPENER.open(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0',**(headers or {})}),timeout=timeout)
    with response as r:
        b=r.read(8*1024*1024+1)
        if len(b)>8*1024*1024: raise ValueError('response_too_large')
        return b

def source_failure(body):
    sample=body[:10000].decode('utf-8',errors='ignore').lower()
    return any(x in sample for x in ['access denied','we are sorry','request rejected','verify you are human','incapsula incident'])

def fetch(url,headers=None,data=None,timeout=30):
    try:
        body=direct_fetch(url,headers,data,timeout)
        if data is None and source(url) and source_failure(body):raise ValueError('source_access_error')
        return body
    except (urllib.error.URLError,TimeoutError,ValueError):
        if not ENDPOINT or data is not None or not source(url):raise
        # A second network location reads only the allowlisted official source.
        return direct_fetch(ENDPOINT+'/collector/source?'+urllib.parse.urlencode({'url':url}),
                            {'Authorization':'Bearer '+authorization(ENDPOINT)},timeout=timeout)

def error_code(error):
    if isinstance(error,urllib.error.HTTPError):return 'http_'+str(error.code)
    if isinstance(error,subprocess.CalledProcessError):
        # Classify known failures without exposing signed media URLs or raw stderr.
        detail=error.stderr or b''
        if isinstance(detail,bytes):detail=detail.decode('utf-8','replace')
        detail=detail.lower()
        for marker,code in [
            ('sign in to confirm','publisher_login_required'),
            ('requested format is not available','media_format_unavailable'),
            ('http error 403','media_http_403'),
            ('403 forbidden','media_http_403'),
            ('http error 404','media_http_404'),
            ('server returned 404','media_http_404'),
            ('protocol not on whitelist','media_protocol_rejected'),
            ('invalid data found','media_invalid_data'),
            ('does not contain any stream','media_no_audio'),
        ]:
            if marker in detail:return code
        return 'media_process_failed' 
    if isinstance(error,ValueError):return str(error)[:100]
    return type(error).__name__

def get_json(url,headers=None): return json.loads(fetch(url,headers))
def clean(s): return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s or ''))).strip()
def source(url):
    u=urllib.parse.urlsplit(url);host=u.hostname or ''
    if host=='www.youtube.com' and u.path=='/watch' and re.fullmatch(r'[A-Za-z0-9_-]{11}',urllib.parse.parse_qs(u.query).get('v',[''])[0]):
        return YOUTUBE_CHANNELS.get(urllib.parse.parse_qs(u.query).get('channel_id',[''])[0])
    return next((v for k,v in HOSTS.items() if host==k or host.endswith('.'+k)),None)
def canonical(url):
    u=urllib.parse.urlsplit(url)
    if not source(url): raise ValueError('unknown_source')
    host=u.hostname
    if host=='www.youtube.com':
        q=urllib.parse.parse_qs(u.query)
        return 'https://www.youtube.com/watch?'+urllib.parse.urlencode({'v':q['v'][0],'channel_id':q['channel_id'][0]})
    if source(url)=='n12': host='www.mako.co.il'
    if source(url)=='c14': host='www.c14.co.il'
    return urllib.parse.urlunsplit(('https',host,u.path,'',''))
def relevant(title):
    return bool(re.search('סקר|מנדטים|בחירות|אחוז החסימה|קמפיין|פריימריז',title)) and not re.search(r'בחירות (בארה[״"]ב|בארצות הברית|בצרפת|בבריטניה|לרשות הפלסטינית)',title)
def collectible(title):
    return isinstance(title,str) and len(clean(title))>=4

def collection_failed(count,reports):
    ignored={'stale_or_missing_publication_date','not_election_article','not_public_or_old'}
    return count==0 and any(x.get('status')=='blocked' and x.get('error') not in ignored for x in reports)

def publication_time(date):
    if not date:return None
    try:
        from zoneinfo import ZoneInfo
        date=re.sub(r'([+-]\d\d)(\d\d)$',r'\1:\2',date)
        value=dt.datetime.fromisoformat(date.replace('Z','+00:00'))
        if value.tzinfo is None:value=value.replace(tzinfo=ZoneInfo('Asia/Jerusalem'))
        return value
    except (ValueError,TypeError):return None

def recent(date):
    value=publication_time(date)
    if value is None:return False
    age=(dt.datetime.now(dt.timezone.utc)-value).total_seconds()
    return -600<=age<=MAX_AGE_DAYS*86400

def remember_date(url,date):
    value=publication_time(date)
    if not recent(date):raise ValueError('stale_or_missing_publication_date')
    PUBLICATION_DATES[canonical(url)]=value.isoformat()


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
    path=urllib.parse.urlsplit(url).path
    last=None
    for candidate in ['https://13tv.co.il/qdata'+path+'?qdata=json','https://www.13tv.co.il/qdata'+path+'?qdata=json','https://13tv.co.il'+path]:
        try:
            body=fetch(candidate).decode()
            try:value=json.loads(body)
            except ValueError:value=next_data(body).get('props',{}).get('pageProps',{}).get('page',{})
            if not value.get('PageMeta') or not value.get('Content'):raise ValueError('invalid_reshet_data')
            return value
        except (urllib.error.URLError,ValueError,TimeoutError) as error:last=error
    raise last
def official_youtube(channel):
    ns={'atom':'http://www.w3.org/2005/Atom','yt':'http://www.youtube.com/xml/schemas/2015'}
    root=ET.fromstring(fetch('https://www.youtube.com/feeds/videos.xml?channel_id='+channel))
    if root.findtext('yt:channelId',namespaces=ns) not in [channel,channel.removeprefix('UC')]:raise ValueError('publisher_mismatch')
    results={}
    for entry in root.findall('atom:entry',ns):
        if entry.findtext('yt:channelId',namespaces=ns)!=channel:continue
        title=clean(entry.findtext('atom:title',default='',namespaces=ns));vid=entry.findtext('yt:videoId',default='',namespaces=ns)
        if not collectible(title) or not recent(entry.findtext('atom:published',namespaces=ns)) or not re.fullmatch(r'[A-Za-z0-9_-]{11}',vid):continue
        url='https://www.youtube.com/watch?'+urllib.parse.urlencode({'v':vid,'channel_id':channel})
        YOUTUBE_ITEMS[url]=title;PUBLICATION_DATES[url]=entry.findtext('atom:published',namespaces=ns);results[url]=title
    return results

def discover():
    candidates={}
    def add(url,title):
        if source(url) and collectible(clean(title)):
            try:candidates[canonical(url)]=clean(title)
            except ValueError:pass
    for url in ['https://mobile.mako.co.il/news','https://mobile.mako.co.il/news-israel-elections','https://www.kan.org.il/content/kan-news/','https://www.c14.co.il/']:
        try:
            parser=Links(url);parser.feed(fetch(url).decode())
            for link,title in parser.links:
                if re.search(r'Article-[a-f0-9]+|/article/\d+|/content/kan-news/[^/]+/\d+',link):add(link,title)
        except Exception as e:print('source_failed',source(url),error_code(e),flush=True)
    reshet_ok=False
    for path in ['/news/','/news/politics/politics/','/tags/survey/']:
        try:
            data=reshet_data('https://13tv.co.il'+path);reshet_ok=True
            for item in walk(data.get('Content',{})):
                if item.get('link') and item.get('title') and recent(item.get('publishDate')):
                    link=urllib.parse.urljoin('https://13tv.co.il',item['link']);add(link,item['title']+' '+item.get('secondaryTitle',''))
                    if source(link)=='reshet' and canonical(link) in candidates:RESHET_ITEMS[canonical(link)]=item
        except Exception as e:print('source_failed','reshet',error_code(e),flush=True)
    if not reshet_ok:
        catalog=Path(__file__).with_name('reshet-seed.json')
        if catalog.exists():
            for item in json.loads(catalog.read_text())['items']:
                if source(item['url'])!='reshet' or not re.fullmatch(r'[A-Za-z0-9_]+',item['kalturaId']) or not recent(item['publishDate']):continue
                url=canonical(item['url']);add(url,item['title']+' בחירות')
                RESHET_ITEMS.setdefault(url,{'title':item['title'],'secondaryTitle':'בחירות','publishDate':item['publishDate'],'video':{'kalturaId':item['kalturaId']}})
        for channel in YOUTUBE_CHANNELS:
            try:candidates.update(official_youtube(channel))
            except Exception as error:print('source_failed','reshet_youtube',error_code(error),flush=True)
    try:
        for cat in [None,483,487]:
            for item in get_json('https://api.i24news.tv/v2/he/contents?'+urllib.parse.urlencode({**({'category':cat} if cat is not None else {}),'page':1,'limit':12,'countable':1,'inSlider':0,'sort':'-sortDate'})):
                if recent(item.get('publishedAt')):add(item['frontendUrl'],item.get('title','')+' בחירות')
    except Exception as e:print('source_failed','i24',error_code(e),flush=True)
    return candidates

def select_playback(context):
    actions=context.get('actions',[])
    if context.get('objectType')=='KalturaAPIException' or context.get('messages') or any(a.get('objectType')!='KalturaAccessControlLimitDeliveryProfilesAction' for a in actions):raise ValueError('playback_restricted')
    sources=[s for s in context.get('sources',[]) if s.get('format') in ['url','mpegdash','applehttp'] and not s.get('drm')]
    for action in actions:
        ids=set(str(action.get('deliveryProfileIds','')).split(','));blocked=action.get('isBlockedList') in [True,1,'1']
        sources=[s for s in sources if (str(s.get('deliveryProfileId')) in ids)!=blocked]
    sources.sort(key=lambda s:{'url':0,'mpegdash':1,'applehttp':2}[s['format']])
    if not sources:return []
    source=sources[0]
    if source['format'] in ['applehttp','mpegdash']:return [source['url']]
    allowed=set(source.get('flavorIds','').split(','))
    flavors=sorted([f for f in context.get('flavorAssets',[]) if f.get('id') in allowed and f.get('status')==2 and f.get('fileExt')=='mp4'],key=lambda f:int(f.get('sizeInBytes') or f.get('size',0)*1024))
    return [re.sub(r'/flavorIds/[^/]+','/flavorIds/'+flavors[0]['id'],source['url'])] if flavors else []

def kaltura(entry):
    data={'apiVersion':'3.3.0','clientTag':'html5:v3.1.0','format':1,'partnerId':2748741,
      '1':{'service':'session','action':'startWidgetSession','widgetId':'_2748741','expiry':3600},
      '2':{'service':'baseentry','action':'getPlaybackContext','entryId':entry,'ks':'{1:result:ks}','contextDataParams':{'objectType':'KalturaPlaybackContextOptions','referrer':'https://13tv.co.il/'}}}
    j=json.loads(fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest',{'Content-Type':'application/json'},json.dumps(data).encode()))[1]
    return select_playback(j)

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
    if urllib.parse.urlsplit(url).hostname=='www.youtube.com':
        if not kind:raise ValueError('untrusted_publisher')
        title=YOUTUBE_ITEMS.get(canonical(url))
        if not title:raise ValueError('publisher_item_not_in_feed')
        remember_date(url,PUBLICATION_DATES.get(canonical(url)))
        return title,[url]
    if kind=='i24':
        slug=urllib.parse.urlsplit(url).path.rstrip('/').split('/')[-1];j=get_json('https://api.i24news.tv/v2/he/contents/'+slug)
        if j.get('premium') or not recent(j.get('publishedAt')):raise ValueError('not_public_or_old')
        remember_date(url,j.get('publishedAt'))
        media=[x['sourceUrl'] for x in walk(j.get('parsedBody',[])) if x.get('type')=='immergoVideo' and not x.get('isLive') and x.get('sourceUrl')]
        return j['title'],list(dict.fromkeys(media))
    if kind=='reshet':
        item=RESHET_ITEMS.get(canonical(url))
        if item and item.get('video',{}).get('kalturaId'):j={'Content':{'Item':item},'PageMeta':{'title':item['title']}}
        else:j=reshet_data(url)
        x=j.get('Content',{}).get('Item',{});info=j.get('SEO',{}).get('schema',{}).get('newsArticle',{})
        remember_date(url,info.get('datePublished') or x.get('publishDate'))
        title=x.get('title') or j['PageMeta']['title']
        if not collectible(title):return title,[]
        entry=x.get('video',{}).get('kalturaId');return clean(title),kaltura(entry) if entry else []
    page=fetch(url.replace('www.mako.co.il','mobile.mako.co.il') if kind=='n12' else url).decode()
    objects=list(ld(page))
    news=next((x for x in objects if any(t in ['NewsArticle','OpinionNewsArticle','Article'] for t in ([x.get('@type')] if isinstance(x.get('@type'),str) else x.get('@type',[])))),{})
    title=clean(news.get('headline') or next(iter(re.findall(r'<h1\b[^>]*>([\s\S]*?)</h1>',page,re.I)),''))
    if not title or source_failure(page.encode()):raise ValueError('invalid_source_page')
    remember_date(url,news.get('datePublished'))
    # The official election section is an editorial relevance signal too.
    if not collectible(title):raise ValueError('missing_article_title')
    if kind=='n12':
        video=next_data(page).get('props',{}).get('pageProps',{}).get('pageData',{}).get('header',{}).get('mainVideo')
        if not video:
            embed=next((x.get('embedUrl','') for x in objects if x.get('@type')=='VideoObject' and 'mako.co.il/player-embed/' in x.get('embedUrl','')),'')
            q=urllib.parse.parse_qs(urllib.parse.urlsplit(embed).query)
            if all(q.get(k) for k in ['vid','cid','galleryCid']):video={'videoVcmId':q['vid'][0],'videoChannelId':q['cid'][0],'videoGalleryChannelId':q['galleryCid'][0]}
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
        if any(t in ['VideoObject','AudioObject'] for t in ([obj.get('@type')] if isinstance(obj.get('@type'),str) else obj.get('@type',[]))):
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

def dash_input(url):
    public_url(url)
    root=ET.fromstring(fetch(url))
    if root.attrib.get('type','static')!='static':raise ValueError('live_media')
    for element in root.iter():
        name=element.tag.rsplit('}',1)[-1]
        if name=='ContentProtection':raise ValueError('encrypted_media')
        if name in ['BaseURL','Location'] and element.text:public_url(urllib.parse.urljoin(url,element.text.strip()))
        for key,value in element.attrib.items():
            if key.rsplit('}',1)[-1] in ['href','media','initialization','sourceURL']:
                public_url(urllib.parse.urljoin(url,value))
    return url

def make_audio(url,destination):
    if urllib.parse.urlsplit(url).hostname=='www.youtube.com':
        original=destination.with_suffix('.input.m4a')
        params=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query);channel=params.get('channel_id',[''])[0]
        if channel and channel not in YOUTUBE_CHANNELS:raise ValueError('untrusted_publisher')
        video_url='https://www.youtube.com/watch?'+urllib.parse.urlencode({'v':params['v'][0]})
        filters='!is_live & !is_upcoming'+(' & channel_id = '+channel if channel else '')
        subprocess.run([os.sys.executable,'-m','yt_dlp','--no-playlist','--no-warnings','--socket-timeout','20','--match-filter',filters,'-f','bestaudio/best','-o',str(original),video_url],check=True,capture_output=True,timeout=180)
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(original),'-vn','-ac','1','-ar','8000','-codec:a','libmp3lame','-b:a','32k','-y',str(destination)],check=True,capture_output=True,timeout=180)
        original.unlink(missing_ok=True)
    else:
        url=dash_input(url) if re.search(r"\.mpd(?:\?|$)",url,re.I) else hls_input(url)
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
    global ENDPOINT
    endpoint=args.endpoint.rstrip('/');ENDPOINT=endpoint;start=time.monotonic();state=worker(endpoint,'/collector/state');uploaded=set(state['uploaded']);seen=set(state['seen']);RESHET_ITEMS.update(state.get('reshet_items',{}));candidates=discover();candidates={**{url:item['title'] for url,item in state.get('reshet_items',{}).items()},**candidates}
    for url in state['todo']:
        try:candidates.setdefault(canonical(url),'')
        except ValueError:pass
    count=0;reports=[]
    with tempfile.TemporaryDirectory() as folder:
        for url in candidates:
            if time.monotonic()-start>args.deadline_seconds or count>=args.max_files:break
            if url in seen or (source(url)=='reshet' and url in uploaded):continue
            try:
                title,media=article(url)
                if not media:reports.append({'url':url,'status':'no_media'});continue
                for index,clip in enumerate(media):
                    key=url+('#media='+str(index) if index else '')
                    if key in uploaded:continue
                    if count>=args.max_files or time.monotonic()-start>args.deadline_seconds:break
                    if args.dry_run:print('discovered',source(url),title,index,flush=True);continue
                    dest=Path(folder)/'audio.mp3';duration=make_audio(clip,dest)
                    meta=base64.b64encode(json.dumps({'url':key,'title':'פורסם ב־'+publication_time(PUBLICATION_DATES[canonical(url)]).strftime('%d.%m.%Y')+' — '+title+(' — קטע '+str(index+1) if index else ''),'duration':duration,'publishedAt':PUBLICATION_DATES[canonical(url)]},ensure_ascii=False).encode()).decode()
                    for attempt in range(4):
                        try:result=worker(endpoint,'/collector/ingest',dest.read_bytes(),{'X-Article-Meta':meta,'Content-Type':'audio/mpeg'});break
                        except urllib.error.HTTPError as e:
                            if e.code!=409 or attempt==3:raise
                            time.sleep(5)
                    uploaded.add(key)
                    if result.get('existing'):print('existing',source(url),result.get('file'),round(duration),flush=True)
                    else:count+=1;print('uploaded',source(url),result.get('file'),round(duration),flush=True)
            except Exception as e:
                reports.append({'url':url,'status':'blocked','error':error_code(e)});print('article_failed',source(url),error_code(e),canonical(url),flush=True)
    if reports and not args.dry_run:worker(endpoint,'/collector/report',json.dumps({'items':reports[:100]}).encode(),{'Content-Type':'application/json'})
    print('complete',count,'uploads',len(reports),'reports',flush=True)
    if collection_failed(count,reports):raise SystemExit('collection_failed: no uploads and unresolved media/source errors; see article_failed records')
if __name__=='__main__':main()
