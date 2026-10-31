#!/usr/bin/env python3
"""Hourly MP4 digest. Runs on GitHub's server; Google credentials stay in Cloudflare."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
from zoneinfo import ZoneInfo
import collector as c

LIMIT = 8 * 1024 * 1024


def video_inputs(url, depth=0):
    c.public_url(url)
    if depth > 4:
        raise ValueError('nested_playlist')
    if re.search(r'\.mpd(?:\?|$)', url, re.I):
        return c.dash_input(url), None
    if not re.search(r'\.m3u8(?:\?|$)', url, re.I):
        return url, None
    text = c.fetch(url).decode()
    if re.search(r'#EXT-X-KEY:(?![^\r\n]*METHOD=NONE)', text):
        raise ValueError('encrypted_media')
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    variants = []
    audio = {}
    for index, line in enumerate(lines):
        if line.startswith('#EXT-X-MEDIA:') and 'TYPE=AUDIO' in line:
            group = re.search(r'GROUP-ID="([^"]+)"', line)
            uri = re.search(r'URI="([^"]+)"', line)
            if group and uri:
                audio[group[1]] = urllib.parse.urljoin(url, uri[1])
        if line.startswith('#EXT-X-STREAM-INF:') and index + 1 < len(lines):
            # Audio-only variants must never masquerade as video.
            if 'RESOLUTION=' not in line and not re.search(r'avc|hev|hvc|vp0?9|av01', line, re.I):
                continue
            bandwidth = re.search(r'BANDWIDTH=(\d+)', line)
            group = re.search(r'AUDIO="([^"]+)"', line)
            if bandwidth:
                variants.append((int(bandwidth[1]), urllib.parse.urljoin(url, lines[index + 1]), group[1] if group else None))
    if variants:
        _, variant, group = min(variants)
        video, nested_audio = video_inputs(variant, depth + 1)
        return video, c.hls_input(audio[group]) if group in audio else nested_audio
    if '#EXT-X-STREAM-INF:' in text:
        raise ValueError('media_no_video')
    if '#EXT-X-ENDLIST' not in text:
        raise ValueError('live_media')
    for line in lines:
        if not line.startswith('#'):
            c.public_url(urllib.parse.urljoin(url, line))
        for uri in re.findall(r'URI="([^"]+)"', line):
            c.public_url(urllib.parse.urljoin(url, uri))
    return url, None


def probe(path):
    data = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], timeout=30))
    if not any(x.get('codec_type') == 'video' for x in data.get('streams', [])):
        raise ValueError('media_no_video')
    if not any(x.get('codec_type') == 'audio' for x in data.get('streams', [])):
        raise ValueError('media_no_audio')
    duration = float(data.get('format', {}).get('duration', 0))
    if duration <= 0:
        raise ValueError('empty_video')
    return duration


def make_video(url, destination):
    downloaded = None
    if urllib.parse.urlsplit(url).hostname == 'www.youtube.com':
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        channel = query.get('channel_id', [''])[0]
        if channel and channel not in c.YOUTUBE_CHANNELS:
            raise ValueError('untrusted_publisher')
        downloaded = destination.with_suffix('.input.mp4')
        filters = '!is_live & !is_upcoming' + (' & channel_id = ' + channel if channel else '')
        subprocess.run([os.sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--js-runtimes', 'node', '--match-filter', filters, '-f', 'worstvideo[ext=mp4]+bestaudio[ext=m4a]/worst[ext=mp4]', '--merge-output-format', 'mp4', '-o', str(downloaded), url], check=True, capture_output=True, timeout=300)
        inputs, maps = ['-i', str(downloaded)], ['-map', '0:v:0', '-map', '0:a:0']
    else:
        video, audio = video_inputs(url)
        inputs = ['-user_agent', c.UA, '-protocol_whitelist', 'http,https,tcp,tls', '-i', video]
        if audio:
            inputs += ['-user_agent', c.UA, '-protocol_whitelist', 'http,https,tcp,tls', '-i', audio]
        maps = ['-map', '0:v:0', '-map', '1:a:0' if audio else '0:a:0']
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', *inputs, *maps,
                        '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1',
                        '-r', '20', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '128k', '-maxrate', '144k', '-bufsize', '288k', '-g', '40',
                        '-c:a', 'aac', '-b:a', '32k', '-ac', '2', '-ar', '44100', '-movflags', '+faststart', '-y', str(destination)], check=True, capture_output=True, timeout=600)
        return probe(destination)
    finally:
        if downloaded:
            downloaded.unlink(missing_ok=True)


def split_digest(clips, folder):
    listing = folder / 'concat.txt'
    # All paths are generated numeric names under this temporary directory.
    listing.write_text(''.join("file '" + str(path) + "'\n" for path in clips))
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(listing), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
                    '-f', 'segment', '-segment_time', '300', '-reset_timestamps', '1', '-segment_format_options', 'movflags=+faststart', '-y', str(folder / 'part-%03d.mp4')], check=True, capture_output=True, timeout=180)
    parts = sorted(folder.glob('part-*.mp4'))
    if not parts:
        raise ValueError('no_video_parts')
    for part in parts:
        if not 0 < part.stat().st_size <= LIMIT:
            raise ValueError('video_part_too_large')
        probe(part)
    return parts


def eligible(date, state, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    value = c.publication_time(date)
    if not value or value > now + dt.timedelta(minutes=10):
        return False
    if state.get('lastSentAt'):
        cutoff = now - dt.timedelta(days=1)
    else:
        cutoff = now.astimezone(ZoneInfo('Asia/Jerusalem')).replace(hour=0, minute=0, second=0, microsecond=0)
    return value >= cutoff


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--mail-endpoint', required=True)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    endpoint, mail = args.endpoint.rstrip('/'), args.mail_endpoint.rstrip('/')
    c.ENDPOINT = endpoint
    state = c.worker(mail, '/news-video/state')
    print('mail_server_ready', flush=True)
    if args.check_only:
        return
    pending = state.get('pending')
    if pending:
        candidates = {x['id'].split('#')[0]: x['title'] for x in pending['items']}
        required = {x['id'] for x in pending['items']}
    else:
        news = c.worker(endpoint, '/collector/state')
        c.RESHET_ITEMS.update(news.get('reshet_items', {}))
        candidates = c.discover()
        required = None
    sent = {x['id'] for x in state.get('sent', [])}
    items, clips, failures = [], [], 0
    source_failures = {}
    start = time.monotonic()
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        # Resolve metadata first. Downloads run in original chronological order.
        resolved = []
        for url in c.fair_candidates(candidates):
            if time.monotonic() - start > 1500:
                break
            if source_failures.get(c.source(url), 0) >= 4:
                continue
            try:
                title, media = c.article(url)
                date = c.PUBLICATION_DATES[c.canonical(url)]
                if not pending and not eligible(date, state):
                    continue
                for index, video in enumerate(media):
                    key = url + ('#media=' + str(index) if index else '')
                    if key in sent or (required is not None and key not in required):
                        continue
                    if video:
                        resolved.append((date, key, title, video))
            except Exception as error:
                failures += 1
                kind = c.source(url)
                source_failures[kind] = source_failures.get(kind, 0) + 1
                print('video_source_failed', c.source(url), c.error_code(error), flush=True)
        for date, key, title, video in sorted(resolved, key=lambda x: (c.publication_time(x[0]), x[1])):
            if time.monotonic() - start > 2100:
                break
            try:
                path = folder / ('clip-%03d.mp4' % len(clips))
                duration = make_video(video, path)
                clips.append(path)
                items.append({'id': key, 'title': title[:600], 'publishedAt': date})
                print('video_ready', c.source(key), round(duration), flush=True)
            except Exception as error:
                failures += 1
                print('video_download_failed', c.source(key), c.error_code(error), flush=True)
        if pending and {x['id'] for x in items} != required:
            raise SystemExit('pending_digest_incomplete: retry retained batch on next run')
        if not clips:
            if failures:
                raise SystemExit('no_video_collected: source failures; no email sent')
            print('no_new_videos', flush=True)
            return
        parts = split_digest(clips, folder)
        batch = c.worker(mail, '/news-video/start', json.dumps({'items': items, 'parts': len(parts)}, ensure_ascii=False).encode(), {'Content-Type': 'application/json'})
        for number, part in enumerate(parts, 1):
            if number in batch.get('sent', []):
                continue
            # Transport retries use a stable MIME Message-ID and server receipts.
            for attempt in range(3):
                try:
                    result = c.worker(mail, '/news-video/part/%s/%d' % (batch['id'], number), part.read_bytes(), {'Content-Type': 'video/mp4'})
                    if not result.get('ok'):
                        raise ValueError('email_not_confirmed')
                    print('video_emailed' if result.get('gmailId') else 'video_staged', number, len(parts), result.get('gmailId', ''), flush=True)
                    break
                except (urllib.error.URLError, TimeoutError):
                    if attempt == 2:
                        raise
                    time.sleep(5)
        print('video_digest_complete', len(items), 'clips', 1 if batch.get('delivery') == 'single-email' else len(parts), 'emails', len(parts), 'attachments', failures, 'source_failures', flush=True)


if __name__ == '__main__':
    main()
