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
