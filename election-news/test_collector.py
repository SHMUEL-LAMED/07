import unittest
from unittest.mock import patch
import collector

class CollectorTests(unittest.TestCase):
    def test_original_dates_and_source_canonicalization(self):
        self.assertFalse(collector.recent('2020-01-01T00:00:00Z'))
        self.assertEqual(collector.canonical('https://mobile.mako.co.il/news-israel-elections/2026/Article-a.htm?tracking=1#media=1'),'https://www.mako.co.il/news-israel-elections/2026/Article-a.htm')
        self.assertIsNone(collector.source('https://mako.co.il.attacker.example/item'))

    def test_hls_selects_public_audio_and_rejects_live_encrypted_and_private_resources(self):
        master='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=900\nvideo.m3u8'
        audio='#EXTM3U\n#EXTINF:5,\na.ts\n#EXT-X-ENDLIST'
        with patch.object(collector,'public_url',side_effect=lambda u:u),patch.object(collector,'fetch',side_effect=[master.encode(),audio.encode()]):
            self.assertEqual(collector.hls_input('https://cdn.example/master.m3u8'),'https://cdn.example/audio.m3u8')
        with patch.object(collector,'public_url',side_effect=lambda u:u),patch.object(collector,'fetch',return_value=b'#EXTM3U\na.ts'):
            self.assertRaisesRegex(ValueError,'live',collector.hls_input,'https://cdn.example/master.m3u8')
        with patch.object(collector,'public_url',side_effect=lambda u:u),patch.object(collector,'fetch',return_value=b'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts\n#EXT-X-ENDLIST'):
            self.assertRaisesRegex(ValueError,'encrypted',collector.hls_input,'https://cdn.example/master.m3u8')
        with patch.object(collector.socket,'getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            self.assertRaisesRegex(ValueError,'private',collector.public_url,'https://untrusted.example/file')

if __name__=='__main__':unittest.main()

class RecoveryTests(unittest.TestCase):
    def tearDown(self):collector.ENDPOINT=None

    def test_soft_block_uses_authenticated_second_network(self):
        collector.ENDPOINT='https://ivr.example'
        with patch.object(collector,'direct_fetch',side_effect=[b'<h1>We Are Sorry</h1>',b'<h1>article</h1>']) as fetch,patch.object(collector,'authorization',return_value='short-lived'):
            self.assertEqual(collector.fetch('https://mobile.mako.co.il/news-israel-elections'),b'<h1>article</h1>')
            self.assertIn('/collector/source?',fetch.call_args.args[0])
            self.assertEqual(fetch.call_args.args[1],{'Authorization':'Bearer short-lived'})

    def test_cdn_and_non_get_requests_are_never_relayed(self):
        collector.ENDPOINT='https://ivr.example'
        for url,body in [('https://cdn.example/video.mp4',None),('https://www.mako.co.il/AjaxPage',b'body')]:
            with patch.object(collector,'direct_fetch',side_effect=collector.urllib.error.URLError('failed')) as fetch:
                self.assertRaises(collector.urllib.error.URLError,collector.fetch,url,None,body)
                self.assertEqual(fetch.call_count,1)

    def test_block_page_is_failure_not_no_media(self):
        with patch.object(collector,'fetch',return_value=b'<h1>Request Rejected</h1>'):
            self.assertRaisesRegex(ValueError,'invalid_source_page',collector.article,'https://www.mako.co.il/news-israel-elections/2026/Article-a.htm')

    def test_public_election_opinion_without_media_has_a_title(self):
        page='<script type="application/ld+json">'+collector.json.dumps({'@type':'OpinionNewsArticle','headline':'מי באמת יגיע לקלפי בבחירות?'},ensure_ascii=False)+'</script>'
        with patch.object(collector,'fetch',return_value=page.encode()):
            title,media=collector.article('https://www.c14.co.il/article/1740992')
            self.assertIn('בחירות',title);self.assertEqual(media,[])

    def test_n12_embed_fallback_finds_public_original(self):
        page='<script type="application/ld+json">'+collector.json.dumps({'@type':'NewsArticle','headline':'סקר מנדטים','video':{'@type':'VideoObject','embedUrl':'https://www.mako.co.il/player-embed/?vid=v&cid=c&galleryCid=g'}})+'</script>'
        result=type('Result',(),{'stdout':b'{"media":[{"url":"https://cdn.example/clip.m3u8"}]}'})()
        with patch.object(collector,'fetch',side_effect=[page.encode(),b'encoded']),patch.object(collector.subprocess,'run',return_value=result):
            title,media=collector.article('https://www.mako.co.il/news-israel-elections/2026/Article-a.htm')
            self.assertEqual(media,['https://cdn.example/clip.m3u8'])

    def test_current_election_year_is_not_limited_to_thirty_days(self):
        self.assertTrue(collector.recent(str(collector.dt.datetime.now().year)+'-01-01T00:00:00Z'))
        self.assertEqual(collector.error_code(collector.urllib.error.HTTPError('https://example.org',403,'blocked',{},None)),'http_403')

class ReshetRecoveryTests(unittest.TestCase):
    def test_reshet_alternate_official_host(self):
        error=collector.urllib.error.HTTPError('https://13tv.co.il',403,'blocked',{},None)
        body=collector.json.dumps({'PageMeta':{'title':'סקרים'},'Content':{'Item':{'title':'סקר'}}}).encode()
        with patch.object(collector,'fetch',side_effect=[error,body]) as fetch:
            self.assertEqual(collector.reshet_data('https://13tv.co.il/tags/survey/')['PageMeta']['title'],'סקרים')
            self.assertIn('https://www.13tv.co.il/qdata/',fetch.call_args.args[0])

    def test_reshet_html_fallback_uses_only_page_data(self):
        error=collector.urllib.error.URLError('blocked')
        body=('<script id="__NEXT_DATA__">'+collector.json.dumps({'props':{'pageProps':{'page':{'PageMeta':{'title':'סקר'},'Content':{'Item':{'video':{'kalturaId':'editorial'}}}},'liveSources':{'kalturaId':'live'}}}})+'</script>').encode()
        with patch.object(collector,'fetch',side_effect=[error,error,body]):
            self.assertEqual(collector.reshet_data('https://13tv.co.il/item/news/poll-12345/')['Content']['Item']['video']['kalturaId'],'editorial')

class OfficialYoutubeTests(unittest.TestCase):
    CHANNEL='UCvQmPpU20hw1Trss_CVwaew'
    def test_only_exact_publisher_feed_and_election_items(self):
        feed=('''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>CHANNEL</yt:channelId><entry><yt:channelId>CHANNEL</yt:channelId><yt:videoId>RHmIAyFAlPo</yt:videoId><title>סקר בחירות</title></entry><entry><yt:channelId>CHANNEL</yt:channelId><yt:videoId>aaaaaaaaaaa</yt:videoId><title>ספורט</title></entry><entry><yt:channelId>other</yt:channelId><yt:videoId>bbbbbbbbbbb</yt:videoId><title>סקר בחירות</title></entry></feed>''').replace('CHANNEL',self.CHANNEL).encode()
        with patch.object(collector,'fetch',return_value=feed.replace(self.CHANNEL.encode(),self.CHANNEL[2:].encode(),1)):
            items=collector.official_youtube(self.CHANNEL);self.assertEqual(len(items),1)
            url=next(iter(items));self.assertEqual(collector.source(url),'reshet');self.assertEqual(collector.article(url),('סקר בחירות',[url]))
        with patch.object(collector,'fetch',return_value=feed.replace(self.CHANNEL.encode(),b'wrong',1)):
            self.assertRaisesRegex(ValueError,'publisher_mismatch',collector.official_youtube,self.CHANNEL)
        self.assertIsNone(collector.source('https://www.youtube.com/watch?v=RHmIAyFAlPo&channel_id=attacker'))

    def test_downloader_checks_publisher_and_excludes_live(self):
        from pathlib import Path
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            destination=Path(folder)/'audio.mp3';destination.write_bytes(b'audio')
            with patch.object(collector.subprocess,'run') as run,patch.object(collector.subprocess,'check_output',return_value=b'{"format":{"duration":"5"}}'):
                collector.make_audio('https://www.youtube.com/watch?v=RHmIAyFAlPo&channel_id='+self.CHANNEL,destination)
                command=run.call_args_list[0].args[0];self.assertIn('!is_live & !is_upcoming & channel_id = '+self.CHANNEL,command)
                self.assertEqual(command[-1],'https://www.youtube.com/watch?v=RHmIAyFAlPo')

class KalturaProfileTests(unittest.TestCase):
    def test_allowed_hls_profile_is_used_without_rewriting_to_forbidden_mp4(self):
        ctx={'actions':[{'objectType':'KalturaAccessControlLimitDeliveryProfilesAction','deliveryProfileIds':'18022'}],'sources':[{'format':'url','deliveryProfileId':999,'url':'https://cdn.example/forbidden.mp4'},{'format':'applehttp','deliveryProfileId':18022,'url':'https://cdn.example/allowed.m3u8'}]}
        self.assertEqual(collector.select_playback(ctx),['https://cdn.example/allowed.m3u8'])
        ctx['actions'][0]['isBlockedList']=True
        self.assertEqual(collector.select_playback(ctx),[])
        ctx['actions']=[{'objectType':'KalturaAccessControlBlockAction'}]
        self.assertRaisesRegex(ValueError,'restricted',collector.select_playback,ctx)

class DashTests(unittest.TestCase):
    def test_only_static_unprotected_public_dash(self):
        with patch.object(collector,'public_url',side_effect=lambda u:u),patch.object(collector,'fetch',return_value=b'<MPD type="static"><Period><AdaptationSet><BaseURL>https://cdn.example/audio/</BaseURL><SegmentTemplate media="$Number$.m4s" initialization="init.mp4"/></AdaptationSet></Period></MPD>'):
            self.assertEqual(collector.dash_input('https://cdn.example/manifest.mpd'),'https://cdn.example/manifest.mpd')
        for manifest,reason in [(b'<MPD type="dynamic"/>','live'),(b'<MPD><Period><ContentProtection schemeIdUri="urn:widevine"/></Period></MPD>','encrypted')]:
            with patch.object(collector,'public_url',side_effect=lambda u:u),patch.object(collector,'fetch',return_value=manifest):self.assertRaisesRegex(ValueError,reason,collector.dash_input,'https://cdn.example/manifest.mpd')

    def test_dash_selection_keeps_permitted_profile_and_rejects_drm(self):
        ctx={'actions':[{'objectType':'KalturaAccessControlLimitDeliveryProfilesAction','deliveryProfileIds':'12972,18022'}],'sources':[{'format':'applehttp','deliveryProfileId':18022,'url':'https://cdn.example/a.m3u8'},{'format':'mpegdash','deliveryProfileId':12972,'url':'https://cdn.example/a.mpd','drm':[]}]}
        self.assertEqual(collector.select_playback(ctx),['https://cdn.example/a.mpd'])
        ctx['sources'][1]['drm']=[{'scheme':'widevine'}]
        self.assertEqual(collector.select_playback(ctx),['https://cdn.example/a.m3u8'])
