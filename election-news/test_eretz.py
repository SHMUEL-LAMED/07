import json
import unittest
from unittest.mock import patch
import eretz


class EretzTests(unittest.TestCase):
    def test_latest_uses_publisher_current_episode_not_navigation(self):
        path='/mako-vod-keshet/eretz_nehederet-s24/VOD-abc123.htm'
        data={'props':{'pageProps':{'data':{'vod':{'pageUrl':path},'hero':{'buttonText':'עונה 24 פרק 4'}}}}}
        page='<script id="__NEXT_DATA__">'+json.dumps(data)+'</script>'
        self.assertEqual(eretz.latest(page),('https://www.mako.co.il'+path,'עונה 24 פרק 4'))
        data['props']['pageProps']['data']['vod']['pageUrl']='//attacker.example/x'
        with self.assertRaises(ValueError):
            eretz.latest('<script id="__NEXT_DATA__">'+json.dumps(data)+'</script>')

    def test_receipts_separate_versions_and_skip_confirmed_uploads(self):
        url='https://www.mako.co.il/mako-vod-keshet/eretz_nehederet-s24/VOD-abc.htm'
        key=eretz.receipt_key(url,'original',1)
        self.assertNotEqual(key,eretz.receipt_key(url,'blurred',1))
        with patch.object(eretz.c,'worker') as worker:
            eretz.upload('https://mail.example',url,'original',[None],{'files':{key:{'id':'saved'}}})
            worker.assert_not_called()
