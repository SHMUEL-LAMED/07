import unittest
import collector

class CollectionHealth(unittest.TestCase):
    def test_reports_and_interviews_are_candidates(self):
        self.assertTrue(collector.collectible('ראיון מיוחד עם ראש הממשלה'))
        self.assertTrue(collector.collectible('המהדורה המרכזית המלאה'))
        self.assertFalse(collector.collectible(''))
    def test_zero_uploads_with_media_failure_is_failure(self):
        self.assertTrue(collector.collection_failed(0,[{'status':'blocked','error':'http_502'}]))
        self.assertFalse(collector.collection_failed(1,[{'status':'blocked','error':'http_502'}]))
    def test_empty_or_old_news_is_not_a_broken_run(self):
        self.assertFalse(collector.collection_failed(0,[]))
        self.assertFalse(collector.collection_failed(0,[{'status':'blocked','error':'stale_or_missing_publication_date'}]))
        self.assertFalse(collector.collection_failed(0,[{'status':'no_media'}]))

    def test_media_failures_are_classified_without_private_urls(self):
        import subprocess
        failure=subprocess.CalledProcessError(1,['ffmpeg'],stderr=b'HTTP error 403: https://media.example/video?token=SECRET')
        self.assertEqual(collector.error_code(failure),'media_http_403')
        failure.stderr=b'Sign in to confirm you are not a bot'
        self.assertEqual(collector.error_code(failure),'publisher_login_required')
        failure.stderr=b'unknown failure https://media.example/?token=SECRET'
        self.assertEqual(collector.error_code(failure),'media_process_failed')
