"""Hourly official full-episode archive: original first, then best-effort blur."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import collector as c
from video_mail import analyze_frames, probe, retry_processing, LIMIT
from women_blur import sanitize_video

LISTING = 'https://www.mako.co.il/mako-vod-keshet/eretz_nehederet'
EPISODE = re.compile(r'^https://www\.mako\.co\.il/mako-vod-keshet/eretz_nehederet-s\d+/VOD-[a-f0-9]+\.htm$')


def latest(page):
    data = c.next_data(page).get('props', {}).get('pageProps', {}).get('data', {})
    path = data.get('vod', {}).get('pageUrl', '')
    url = 'https://www.mako.co.il' + path
    if not EPISODE.fullmatch(url):
        raise ValueError('official_latest_episode_missing')
    return url, data.get('hero', {}).get('buttonText', 'ארץ נהדרת')


def receipt_key(url, variant, part):
    return hashlib.sha256(f'{url}:{variant}:{part}'.encode()).hexdigest()


def upload(endpoint, url, variant, parts, state):
    for number, path in enumerate(parts, 1):
        key = receipt_key(url, variant, number)
        if key in state.get('files', {}):
            continue
        if not 0 < path.stat().st_size <= LIMIT:
            raise ValueError('episode_part_too_large')
        headers = {'Content-Type': 'video/mp4', 'X-Eretz-Source': url,
                   'X-Eretz-Variant': variant, 'X-Eretz-Part': str(number),
                   'X-Eretz-Parts': str(len(parts))}
        if variant == 'blurred':
            headers['X-News-Filter'] = 'women-body-v1'
        result = retry_processing(lambda _: c.worker(endpoint, '/news-video/eretz', path.read_bytes(), headers), total_seconds=360)
        if not result.get('ok') or not result.get('id'):
            raise ValueError('episode_upload_not_confirmed')
        state.setdefault('files', {})[key] = result
        print('episode_drive_confirmed', variant, number, len(parts), result['id'], flush=True)


def download_episode(url, output):
    # Resume partial files on transient network failures; report only safe codes.
    for attempt in range(1, 4):
        try:
            subprocess.run([os.sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-warnings',
                            '--continue', '--socket-timeout', '30', '--retries', '3',
                            '--fragment-retries', '3',
                            '-f', 'best[height<=480][ext=mp4]/best[ext=mp4]',
                            '--merge-output-format', 'mp4', '-o', str(output), url],
                           capture_output=True, check=True, timeout=600)
            return
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            code = c.error_code(error)
            print('episode_download_attempt_failed', attempt, code, flush=True)
            if code in {'media_http_403', 'media_http_404', 'publisher_login_required'} or attempt == 3:
                raise
            time.sleep(5 * attempt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--endpoint', required=True)
    args = parser.parse_args()
    endpoint = args.endpoint.rstrip('/')
    url, title = latest(c.fetch(LISTING).decode())
    print('official_latest_episode', title, url, flush=True)
    state = c.worker(endpoint, '/news-video/eretz')
    if state.get('error'):
        raise ValueError('episode_archive_unavailable')
    completed = [x for x in state.get('files', {}).values() if x.get('source') == url and x.get('variant') == 'blurred']
    if completed and len(completed) == completed[0]['total']:
        print('latest_episode_already_archived_and_blurred', flush=True)
        return
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        original = folder/'episode.mp4'
        # Standard public publisher extraction only. No cookies, DRM or access bypass.
        download_episode(url, original)
        duration = probe(original)
        # Bounded parts let the existing private Drive bridge handle long episodes.
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(original),
                        '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1',
                        '-r', '20', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '128k',
                        '-maxrate', '144k', '-bufsize', '288k', '-g', '40',
                        '-c:a', 'aac', '-b:a', '32k', '-f', 'segment', '-segment_time', '120',
                        '-reset_timestamps', '1', '-y', str(folder/'original-%03d.mp4')],
                       capture_output=True, check=True, timeout=600)
        parts = sorted(folder.glob('original-*.mp4'))
        if not parts or abs(sum(probe(x) for x in parts)-duration) > len(parts)*.3:
            raise ValueError('episode_duration_mismatch')
        upload(endpoint, url, 'original', parts, state)
        print('original_episode_archived', round(duration), 'seconds', flush=True)
        started = time.monotonic()
        for number, part in enumerate(parts, 1):
            if receipt_key(url, 'blurred', number) in state.get('files', {}):
                continue
            if time.monotonic()-started > 1500:
                print('blur_budget_reached_retry_next_hour', flush=True)
                return
            output = folder/('blurred-%03d.mp4' % number)
            def analyze(frames):
                key = hashlib.sha256(json.dumps(frames).encode()).hexdigest()
                cache = folder/(key+'.json')
                if cache.exists():
                    return json.loads(cache.read_text())
                result = retry_processing(lambda _: analyze_frames(endpoint, frames), total_seconds=300)
                cache.write_text(json.dumps(result))
                return result
            retry_processing(lambda remaining: sanitize_video(part, output, analyze, deadline_seconds=remaining), total_seconds=600)
            if abs(probe(output)-probe(part)) > .3:
                raise ValueError('blurred_episode_duration_mismatch')
            # Preserve part numbering and total while uploading just this completed part.
            headers = {'Content-Type': 'video/mp4', 'X-Eretz-Source': url,
                       'X-Eretz-Variant': 'blurred', 'X-Eretz-Part': str(number),
                       'X-Eretz-Parts': str(len(parts)), 'X-News-Filter': 'women-body-v1'}
            if not 0 < output.stat().st_size <= LIMIT:
                raise ValueError('episode_part_too_large')
            result = retry_processing(lambda _: c.worker(endpoint, '/news-video/eretz', output.read_bytes(), headers), total_seconds=360)
            if not result.get('ok') or not result.get('id'):
                raise ValueError('blurred_upload_not_confirmed')
            print('episode_drive_confirmed', 'blurred', number, len(parts), result['id'], flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never expose signed media URLs or credentials in the Actions log.
        print('episode_archive_failed', c.error_code(error), flush=True)
        raise SystemExit(1)
