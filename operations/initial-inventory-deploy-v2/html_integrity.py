import hashlib
LF_SHA256='72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32'
OLD_CRLF_SHA256='fa057a968001d037e63a41760911a9f5e5adbd1038c2c31ee320b0f700b7031d'
def require_lf_candidate(data,expected):
 if expected!=LF_SHA256:raise ValueError('ONLY_VALIDATED_LF_HASH_ALLOWED')
 if b'\r' in data:raise ValueError('CRLF_OR_CR_NOT_ALLOWED')
 data.decode('utf-8')
 if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('LF_CANDIDATE_HASH_MISMATCH')
 return expected
def verify_html_triplet(candidate_lf,vps_file,https_body,expected):
 require_lf_candidate(candidate_lf,expected)
 for name,data in [('VPS',vps_file),('HTTPS',https_body)]:
  if b'\r' in data:raise ValueError(name+'_NOT_LF')
  if hashlib.sha256(data).hexdigest()!=expected:raise ValueError(name+'_HTML_HASH_MISMATCH')
 if not candidate_lf==vps_file==https_body:raise ValueError('HTML_BYTES_DIFFERENT')
 return {'hash_D_LF':expected,'hash_VPS':hashlib.sha256(vps_file).hexdigest(),'hash_HTTPS':hashlib.sha256(https_body).hexdigest(),'all_three_equal':True,'strict_byte_comparison':True,'normalization_during_comparison':False,'old_CRLF_candidate_rejected':True}
