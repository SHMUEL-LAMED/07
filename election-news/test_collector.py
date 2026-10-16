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
