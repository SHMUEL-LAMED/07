import datetime as dt
import unittest
from unittest.mock import patch
from pathlib import Path
import video_mail as v


class VideoDigestTests(unittest.TestCase):
    def test_split_parts_keep_correct_original_article_title(self):
        parts = [Path('part-000-000.mp4'), Path('part-000-001.mp4'), Path('part-001-000.mp4')]
        self.assertEqual(v.part_titles(parts, [{'title':'כתבה א'}, {'title':'כתבה ב'}]), ['כתבה א — חלק 1 מתוך 2', 'כתבה א — חלק 2 מתוך 2', 'כתבה ב'])

    def test_processing_retries_transient_failure_then_returns_processed_result(self):
        calls = []
        def process(remaining):
            calls.append(remaining)
            if len(calls) < 3:
                raise ValueError('temporary_analysis_failure')
            return 'processed'
        with patch.object(v.time, 'sleep') as sleep:
            self.assertEqual(v.retry_processing(process), 'processed')
        self.assertEqual(len(calls), 3)
        self.assertEqual([x.args[0] for x in sleep.call_args_list], [2, 5])
        self.assertTrue(all(0 < x <= 1500 for x in calls))

    def test_rate_limit_uses_longer_bounded_backoff(self):
        with patch.object(v.time, 'sleep') as sleep:
            with self.assertRaisesRegex(ValueError, 'blur_provider_429'):
                v.retry_processing(lambda _: (_ for _ in ()).throw(ValueError('blur_provider_429')))
        self.assertEqual([x.args[0] for x in sleep.call_args_list], [30, 60])

    def test_successful_observations_reused_after_later_failure(self):
        from women_blur import POLICY
        valid = {'policy': POLICY, 'frames': [{'index': 0, 'boxes': []}]}
        with patch.object(v, 'analyze_frames', side_effect=[valid, ValueError('blur_provider_429'), valid]) as provider:
            analyze = v.cached_analyzer('https://mail.example')
            self.assertEqual(analyze(['first']), valid)
            with self.assertRaises(ValueError):
                analyze(['second'])
            self.assertEqual(analyze(['first']), valid)
            self.assertEqual(analyze(['second']), valid)
            self.assertEqual(provider.call_count, 3)

    def test_incomplete_analysis_is_not_cached(self):
        with patch.object(v, 'analyze_frames', return_value={'frames': []}) as provider:
            analyze = v.cached_analyzer('https://mail.example')
            for _ in range(2):
                with self.assertRaises(ValueError):
                    analyze(['first'])
            self.assertEqual(provider.call_count, 2)

    def test_processing_stops_after_three_failures_and_never_returns_raw_fallback(self):
        from unittest.mock import Mock
        process = Mock(side_effect=ValueError('processing_failed'))
        with patch.object(v.time, 'sleep'):
            with self.assertRaisesRegex(ValueError, 'processing_failed'):
                v.retry_processing(process)
        self.assertEqual(process.call_count, 3)

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
            if path == '/news-video/backfill': return {'ok': True, 'more': False, 'archived': 0}
            if path == '/news-video/start': return {'id': 'batch', 'parts': 1, 'sent': []}
            delivered.append(path)
            return {'ok': True, 'gmailId': 'sent'}
        def video(url, dest, deadline=None):
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
