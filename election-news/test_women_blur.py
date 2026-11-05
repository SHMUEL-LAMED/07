import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import women_blur as w


class WomenBlurTests(unittest.TestCase):
    def test_invalid_or_incomplete_analysis_cannot_produce_a_video(self):
        self.assertRaises(ValueError, w.padded_boxes, [[0, 0, 1200, 100]], 320, 180)
        self.assertRaises(ValueError, w.padded_boxes, [[0, float('nan'), 500, 500]], 320, 180)

    def test_video_is_blurred_inside_body_region_and_audio_survives(self):
        try:
            import cv2
            import numpy as np
        except ImportError:
            self.skipTest('video integration dependencies are installed in the video job')
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source, out = folder/'source.mp4', folder/'filtered.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=160x96:rate=20:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',str(source)], check=True)
            def analyze(frames):
                return {'policy': w.POLICY, 'frames': [{'index': i, 'boxes': [[0, 0, 1000, 450]]} for i in range(len(frames))]}
            result = w.sanitize_video(source, out, analyze)
            self.assertEqual(result['frames'], 20)
            streams = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams']
            self.assertEqual({x['codec_type'] for x in streams}, {'audio','video'})
            a, b = cv2.VideoCapture(str(source)), cv2.VideoCapture(str(out))
            ok1, raw = a.read(); ok2, filtered = b.read(); a.release(); b.release()
            self.assertTrue(ok1 and ok2)
            # The high-frequency body texture is suppressed; an unrelated area survives.
            self.assertLess(cv2.Laplacian(filtered[:, :60], cv2.CV_64F).var(), cv2.Laplacian(raw[:, :60], cv2.CV_64F).var()*.1)
            self.assertLess(np.abs(raw[:, 110:].astype(float)-filtered[:, 110:].astype(float)).mean(), 15)
            bad = folder/'bad.mp4'
            with self.assertRaises(ValueError):
                w.sanitize_video(source, bad, lambda frames: {'policy':w.POLICY,'frames':[]})
            self.assertFalse(bad.exists())


if __name__ == '__main__':
    unittest.main()
