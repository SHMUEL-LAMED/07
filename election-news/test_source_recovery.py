import datetime as dt
import json
import unittest
from unittest.mock import patch

import collector


def next_page(data):
    return '<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props':{'pageProps':{'pageData':data}}})+'</script>'


class SourceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime.now(dt.timezone.utc).isoformat()
        self.url='https://www.mako.co.il/news-israel-elections/2026/Article-a.htm'

    def test_n12_schema_in_next_data_supplies_original_publication(self):
        page=next_page({'seo':{'schema':{'@type':'NewsArticle','headline':'סקר בחירות','datePublished':self.now}}})
        with patch.object(collector,'fetch',return_value=page.encode()):
            self.assertEqual(collector.article(self.url),('סקר בחירות',[]))
        self.assertEqual(collector.PUBLICATION_DATES[self.url],self.now)

    def test_header_original_date_is_supported_but_navigation_date_is_not(self):
        page=next_page({'header':{'title':{'text':'סקר בחירות'},'publishDate':{'datetime':self.now}}})
        self.assertEqual(collector.article_metadata(page,'n12')[1],self.now)
        page=next_page({'header':{'title':{'text':'סקר בחירות'}},'lastUpdate':self.now,'timestamp':dt.datetime.now().timestamp()*1000})
        with patch.object(collector,'fetch',return_value=page.encode()):
            self.assertRaisesRegex(ValueError,'stale_or_missing_publication_date',collector.article,self.url)

    def test_n12_http_200_homepage_does_not_hide_working_desktop_article(self):
        homepage='<h1>חדשות</h1>'+next_page({'pageType':'home','lastUpdate':self.now})
        article=next_page({'seo':{'schema':{'@type':'NewsArticle','headline':'סקר בחירות','datePublished':self.now}}})
        with patch.object(collector,'fetch',side_effect=[homepage.encode(),article.encode()]) as fetch:
            self.assertEqual(collector.article(self.url),('סקר בחירות',[]))
            self.assertEqual(fetch.call_args.args[0],self.url)
            self.assertEqual(fetch.call_count,2)

    def test_old_original_date_is_not_replaced_by_new_modified_or_header_date(self):
        page=next_page({'seo':{'schema':{'@type':'NewsArticle','headline':'סקר בחירות','datePublished':'2020-01-01T00:00:00Z','dateModified':self.now}},'header':{'publishDate':{'datetime':self.now}}})
        with patch.object(collector,'fetch',return_value=page.encode()):
            self.assertRaisesRegex(ValueError,'stale_or_missing_publication_date',collector.article,self.url)

    def test_all_article_videos_keep_stable_positions_when_one_fails(self):
        v1={'videoVcmId':'first','videoChannelId':'channel','videoGalleryChannelId':'gallery'}
        v2={**v1,'videoVcmId':'second'}
        page=next_page({'seo':{'schema':{'@type':'NewsArticle','headline':'סקר בחירות','datePublished':self.now}},'header':{'mainVideo':v1},'content':[{'video':v1},{'video':v2}],'recommendations':[{'video':{**v1,'videoVcmId':'unrelated'}}]})
        with patch.object(collector,'fetch',return_value=page.encode()),patch.object(collector,'mako_media',side_effect=[ValueError('http_403'),['https://cdn.example/second.mp4']]) as media:
            self.assertEqual(collector.article(self.url)[1],[None,'https://cdn.example/second.mp4'])
            self.assertEqual(media.call_count,2)

    def test_plain_json_playlist_and_protected_media(self):
        video={'videoVcmId':'v','videoChannelId':'c','videoGalleryChannelId':'g'}
        playlist={'media':[{'url':'https://cdn.example/ad.mp4','ssai':True},{'url':'https://cdn.example/clip.mp4'}]}
        with patch.object(collector,'fetch',return_value=json.dumps(playlist).encode()):
            self.assertEqual(collector.mako_media(video),['https://cdn.example/clip.mp4'])
        playlist['videoDetails']={'extraParams':{'protectedContent':True}}
        with patch.object(collector,'fetch',return_value=json.dumps(playlist).encode()):
            self.assertRaisesRegex(ValueError,'playback_restricted',collector.mako_media,video)

    def test_reshet_reads_public_html_before_qdata(self):
        page='<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props':{'pageProps':{'page':{'PageMeta':{'title':'סקר'},'Content':{'Item':{'title':'סקר'}}}}}})+'</script>'
        with patch.object(collector,'fetch',return_value=page.encode()) as fetch:
            self.assertIn('Content',collector.reshet_data('https://13tv.co.il/tags/survey/'))
            self.assertEqual(fetch.call_args.args[0],'https://13tv.co.il/tags/survey/')
            self.assertEqual(fetch.call_count,1)

    def test_channels_get_turns_before_large_channel_exhausts_budget(self):
        urls=['https://www.mako.co.il/news/Article-a.htm','https://www.mako.co.il/news/Article-b.htm','https://www.kan.org.il/content/kan-news/politic/1/','https://13tv.co.il/item/news/politics/123456/']
        result=list(collector.fair_candidates(dict.fromkeys(urls,'')))
        self.assertEqual(result,[urls[0],urls[2],urls[3],urls[1]])

    def test_failed_first_download_does_not_stop_second_clip(self):
        state={'uploaded':[],'seen':[],'todo':[],'reshet_items':{}}
        reports=[];uploads=[]
        def worker(endpoint,path,body=None,headers=None):
            if path=='/collector/state':return state
            if path=='/collector/report':reports.extend(json.loads(body)['items']);return {'ok':True}
            if path=='/collector/ingest':uploads.append(headers);return {'file':'123.wav'}
            raise AssertionError(path)
        def audio(url,path):
            if url.endswith('bad.mp4'):raise ValueError('broken_first_clip')
            path.write_bytes(b'audio');return 12
        collector.PUBLICATION_DATES[self.url]=self.now
        with patch.object(collector.os.sys,'argv',['collector','--endpoint','https://ivr.example']),patch.object(collector,'worker',side_effect=worker),patch.object(collector,'discover',return_value={self.url:'סקר בחירות'}),patch.object(collector,'article',return_value=('סקר בחירות',['https://cdn.example/bad.mp4','https://cdn.example/good.mp4'])),patch.object(collector,'make_audio',side_effect=audio):
            try:collector.main()
            finally:collector.ENDPOINT=None
        self.assertEqual(len(uploads),1)
        meta=json.loads(collector.base64.b64decode(uploads[0]['X-Article-Meta']))
        self.assertEqual(meta['url'],self.url+'#media=1')
        self.assertEqual(reports[0]['error'],'broken_first_clip')

    def test_reshet_text_article_without_video_is_not_a_processing_crash(self):
        page={'Content':{'Item':{'title':'בחירות לכנסת','publishDate':self.now,'video':None}},'PageMeta':{'title':'בחירות לכנסת'}}
        with patch.object(collector,'reshet_data',return_value=page):
            self.assertEqual(collector.article('https://13tv.co.il/item/news/politics/politics/123456/'),('בחירות לכנסת',[]))


if __name__=='__main__':unittest.main()
