import datetime as dt
import unittest
from unittest.mock import patch
import video_mail as v


class VideoDigestTests(unittest.TestCase):
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
