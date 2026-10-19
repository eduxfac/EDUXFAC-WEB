import unittest,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('html_integrity',Path(__file__).with_name('html_integrity.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
LF=(ROOT/'public/index.html').read_bytes()
CRLF=(ROOT/'operations/initial-inventory-lf/index.before-crlf.html').read_bytes()
class Tests(unittest.TestCase):
 def test_accepts_only_identical_lf_triplet(self):
  result=m.verify_html_triplet(LF,LF,LF,m.LF_SHA256)
  self.assertTrue(result['all_three_equal']);self.assertEqual(result['hash_D_LF'],result['hash_HTTPS'])
 def test_rejects_old_crlf_manifest(self):
  with self.assertRaisesRegex(ValueError,'ONLY_VALIDATED_LF_HASH_ALLOWED'):m.verify_html_triplet(CRLF,CRLF,LF,m.OLD_CRLF_SHA256)
 def test_rejects_crlf_candidate_even_expected_lf(self):
  with self.assertRaisesRegex(ValueError,'CRLF_OR_CR_NOT_ALLOWED'):m.verify_html_triplet(CRLF,LF,LF,m.LF_SHA256)
 def test_rejects_crlf_vps_no_normalization_fallback(self):
  with self.assertRaisesRegex(ValueError,'VPS_NOT_LF'):m.verify_html_triplet(LF,CRLF,LF,m.LF_SHA256)
 def test_rejects_crlf_https_no_normalization_fallback(self):
  with self.assertRaisesRegex(ValueError,'HTTPS_NOT_LF'):m.verify_html_triplet(LF,LF,CRLF,m.LF_SHA256)
 def test_rejects_different_https(self):
  with self.assertRaisesRegex(ValueError,'HTTPS_HTML_HASH_MISMATCH'):m.verify_html_triplet(LF,LF,LF+b' ',m.LF_SHA256)
 def test_rejects_different_vps(self):
  with self.assertRaisesRegex(ValueError,'VPS_HTML_HASH_MISMATCH'):m.verify_html_triplet(LF,LF+b' ',LF,m.LF_SHA256)
if __name__=='__main__':unittest.main(verbosity=2)
