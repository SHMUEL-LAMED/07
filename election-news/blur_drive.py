"""Replace one explicitly selected Drive video only after filtering and AV validation."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import collector as c
from video_mail import probe
from women_blur import sanitize_video

FILES = {'1rDhBSHYbgYhX43oApu7XW9Q2Zb2fGqYn','15kq6-aPWIJE4rYoLQ5GgDBEPDUtZACQT','1Y15dd7yvUerMTQprpvSMmUl64lBksg3O','1Owz-STPGGUEAqbmtUR522TlpympTx2PT','1sV_kL2chdt5UUM6qILTWHOYvAQGFrKNq','1jOaK1Qf9iwTx2xf0qb0QUsEJpZNNu0RL','1Uca0MYjykTL5ozeSy9HqkSaTKgp8M1bD','18odiR4or56Kg6H3bS4FjwLOvj4nMFjq5','1CqkkKAtiMaVNSKxwJff0FBh-pHB-sqFJ'}

def call(endpoint, path, body=None, headers=None):
    req = urllib.request.Request(endpoint+path, data=body, headers={'User-Agent':c.UA,'Authorization':'Bearer '+c.authorization(endpoint), **(headers or {})})
    try:
        return urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as error:
        try:
            reason = json.loads(error.read(1024)).get('error', 'service_http_'+str(error.code))
        except ValueError:
            reason = 'service_http_'+str(error.code)
        raise RuntimeError(str(reason)[:180]) from None

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--file-id', required=True, choices=sorted(FILES))
    parser.add_argument('--endpoint', required=True)
    args=parser.parse_args()
    endpoint=args.endpoint.rstrip('/')
    route='/news-video/drive-blur/'+args.file_id
    with tempfile.TemporaryDirectory() as tmp:
        folder=Path(tmp)
        original,small,filtered=[folder/x for x in ('original.mp4','input.mp4','filtered.mp4')]
        with call(endpoint,route) as response:
            etag=response.headers.get('X-Drive-ETag')
            if not etag:raise ValueError('original_version_missing')
            size=0
            with original.open('wb') as output:
                while block:=response.read(1024*1024):
                    size+=len(block)
                    if size>100*1024*1024:raise ValueError('source_too_large')
                    output.write(block)
        duration=probe(original)
        print('original_downloaded',args.file_id,round(duration),flush=True)
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(original),'-vf','scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2','-r','20','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','96k','-y',str(small)],check=True,timeout=180)
        observations=0
        def analyze(frames):
            nonlocal observations
            # Retry just the failed batch; successful video observations are retained.
            data=json.dumps({'frames':frames}).encode()
            key=hashlib.sha256(data).hexdigest()
            cache=folder/(key+'.json')
            if cache.exists():return json.loads(cache.read_text())
            for attempt in range(3):
                try:
                    with call(endpoint,'/news-video/blur-frames',data,{'Content-Type':'application/json'}) as response:
                        value=json.load(response)
                    cache.write_text(json.dumps(value))
                    observations+=len(frames)
                    print('frames_analyzed',observations,flush=True)
                    return value
                except Exception:
                    if attempt==2:raise
                    print('frame_batch_retry',attempt+2,flush=True)
                    time.sleep(2+attempt*3)
        result=sanitize_video(small,filtered,analyze,deadline_seconds=2400)
        if abs(probe(filtered)-duration)>.3:raise ValueError('filtered_duration_mismatch')
        print('filtered_verified',result['frames'],result['observations'],flush=True)
        # The conditional update keeps the exact Drive ID and refuses concurrent edits.
        with call(endpoint,route,filtered.read_bytes(),{'Content-Type':'video/mp4','X-News-Filter':'women-body-v1','X-Drive-ETag':etag}) as response:
            confirmed=json.load(response)
        if not confirmed.get('ok') or confirmed.get('id')!=args.file_id:raise ValueError('replacement_not_confirmed')
        print('drive_replaced',args.file_id,confirmed.get('version'),flush=True)

if __name__=='__main__':main()
