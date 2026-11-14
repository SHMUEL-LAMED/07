import unittest
import collector

class ContentFilter(unittest.TestCase):
    def test_blocks(self):
        for t in ['חשד לאונס בדרום','פרשת הטרדה במשרד','תקיפה מינית בעיר']:self.assertFalse(collector.appropriate(t),t)
    def test_allows_containing_words(self):
        for t in ['סקר: גוש הימין מתחזק','שכר המינימום עולה','ביקור ברומניה','מינוי שר חדש']:self.assertTrue(collector.appropriate(t),t)
    def test_filtered_items_do_not_fail_the_run(self):
        self.assertFalse(collector.collection_failed(0,[{'status':'blocked','error':'content_not_allowed'}]))

if __name__=='__main__':unittest.main()
