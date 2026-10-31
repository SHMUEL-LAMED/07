import datetime as dt
import unittest
from unittest.mock import patch
from pathlib import Path
import video_mail as v


class VideoDigestTests(unittest.TestCase):
    def test_failed_source_does_not_starve_other_sources(self):
        candidates = {f'https://www.mako.co.il/news/Article-{i}.htm': 'כתבה' for i in range(12)}
        good = 'https://www.i24news.tv/he/news/politics/test'
        candidates[good] = 'כתבה נוספת'
        attempts, delivered = [], []
        def article(url):
            attempts.append(url)
            if 'mako.co.il' in url:
                raise ValueError('source_access_error')
            v.c.PUBLICATION_DATES[v.c.canonical(url)] = dt.datetime.now(dt.timezone.utc).isoformat()
            return 'כתבת בחירות', ['https://cdn.example/video.mp4']
        def worker(endpoint, path, body=None, headers=None):
            if path == '/news-video/state': return {'sent': [], 'recipient': 'owner@example.test'}
            if path == '/collector/state': return {}
            if path == '/news-video/start': return {'id': 'batch', 'parts': 1, 'sent': []}
            delivered.append(path)
            return {'ok': True, 'gmailId': 'sent'}
        def video(url, dest):
            dest.write_bytes(b'test')
            return 1
        with patch.object(v.os.sys, 'argv', ['video_mail.py', '--endpoint', 'https://news.example', '--mail-endpoint', 'https://mail.example']), patch.object(v.c, 'worker', side_effect=worker), patch.object(v.c, 'discover', return_value=candidates), patch.object(v.c, 'article', side_effect=article), patch.object(v, 'make_video', side_effect=video), patch.object(v, 'split_digest', side_effect=lambda clips, folder: clips):
            v.main()
        self.assertEqual(len([x for x in attempts if 'mako.co.il' in x]), 4)
        self.assertIn(good, attempts)
        self.assertEqual(delivered, ['/news-video/part/batch/1'])

    def test_articles_remain_separate_attachments(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            clips = [folder / 'clip-000.mp4', folder / 'clip-001.mp4']
            commands = []
            def segment(command, **kwargs):
                commands.append(command)
                Path(command[-1].replace('%03d', '000')).write_bytes(b'mp4')
            with patch.object(v.subprocess, 'run', side_effect=segment), patch.object(v, 'probe', return_value=10):
                parts = v.split_digest(clips, folder)
            self.assertEqual(len(parts), 2)
            self.assertEqual([c[c.index('-i') + 1] for c in commands], list(map(str, clips)))
            self.assertNotEqual(parts[0].name, parts[1].name)

    def test_first_run_uses_israel_day_and_future_dates_are_rejected(self):
        now = dt.datetime(2026, 10, 30, 0, 0, tzinfo=dt.timezone.utc)
        self.assertTrue(v.eligible('2026-10-29T22:05:00Z', {}, now))
        self.assertFalse(v.eligible('2026-10-29T21:59:00Z', {}, now))
        self.assertFalse(v.eligible('2026-10-30T01:00:00Z', {}, now))

    def test_video_hls_keeps_video_and_separate_audio(self):
        master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,AUDIO="a"\nvideo.m3u8\n'
        media = '#EXTM3U\n#EXTINF:3,\npart.ts\n#EXT-X-ENDLIST\n'
        with patch.object(v.c, 'public_url', side_effect=lambda x: x), patch.object(v.c, 'fetch', side_effect=lambda u: (master if u.endswith('/master.m3u8') else media).encode()), patch.object(v.c, 'hls_input', side_effect=lambda x: x):
            self.assertEqual(v.video_inputs('https://cdn.example/master.m3u8'), ('https://cdn.example/video.m3u8', 'https://cdn.example/audio.m3u8'))

    def test_live_encrypted_and_audio_only_masters_are_rejected(self):
        for playlist in ['#EXTM3U\n#EXTINF:3,\na.ts', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXT-X-ENDLIST', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=30000,CODECS="mp4a.40.2"\naudio.m3u8']:
            with patch.object(v.c, 'public_url', side_effect=lambda x: x), patch.object(v.c, 'fetch', return_value=playlist.encode()):
                with self.assertRaises(ValueError):
                    v.video_inputs('https://cdn.example/master.m3u8')


if __name__ == '__main__':
    unittest.main()
