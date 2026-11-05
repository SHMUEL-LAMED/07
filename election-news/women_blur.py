"""Best-effort full-body blur; an analysis/encoding failure never returns raw video."""
import base64
import math
import subprocess
import tempfile
import time
from pathlib import Path

POLICY = 'women-body-v1'


def padded_boxes(boxes, width, height):
    result = []
    for box in boxes:
        if len(box) != 4 or any(not isinstance(x, (float, int)) or not math.isfinite(x) for x in box):
            raise ValueError('invalid_blur_box')
        y0, x0, y1, x1 = box
        if not (0 <= x0 < x1 <= 1000 and 0 <= y0 < y1 <= 1000):
            raise ValueError('invalid_blur_box')
        # Cover hair, limbs and motion beyond the model's body boundary.
        px, py = max(8, (x1-x0)*width/1000*.15), max(8, (y1-y0)*height/1000*.12)
        result.append((max(0, int(x0*width/1000-px)), max(0, int(y0*height/1000-py)),
                       min(width, math.ceil(x1*width/1000+px)), min(height, math.ceil(y1*height/1000+py))))
    return result


def blur_frame(frame, boxes):
    import cv2
    output = frame.copy()
    for x0, y0, x1, y1 in padded_boxes(boxes, frame.shape[1], frame.shape[0]):
        region = output[y0:y1, x0:x1]
        if region.size:
            # Strong optical blur retains the person rather than deleting or painting over her.
            output[y0:y1, x0:x1] = cv2.GaussianBlur(region, (0, 0), sigmaX=max(7, (x1-x0)/5), sigmaY=max(7, (y1-y0)/7))
    return output


def sanitize_video(source, destination, analyze, deadline_seconds=1500):
    import cv2
    import numpy as np
    started = time.monotonic()
    cap = cv2.VideoCapture(str(source))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not cap.isOpened() or not math.isfinite(fps) or fps <= 0:
        raise ValueError('video_decode_failed')
    width, height = int(cap.get(3)), int(cap.get(4))
    stride = max(1, round(fps/4))
    samples, scene, previous, frame_count, last = [], 0, None, 0, None
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36))
            cut = previous is not None and np.mean(cv2.absdiff(gray, previous)) > 35
            if cut:
                scene += 1
            previous = gray
            if cut or frame_count % stride == 0:
                encoded_ok, jpg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if not encoded_ok:
                    raise ValueError('frame_encode_failed')
                samples.append({'frame': frame_count, 'scene': scene, 'image': base64.b64encode(jpg).decode()})
            last = frame
            frame_count += 1
            if len(samples) > 3000 or time.monotonic()-started > deadline_seconds:
                raise ValueError('blur_analysis_budget_exceeded')
        if not frame_count:
            raise ValueError('empty_video')
        if samples[-1]['frame'] != frame_count-1:
            ok, jpg = cv2.imencode('.jpg', last)
            if not ok:
                raise ValueError('frame_encode_failed')
            samples.append({'frame': frame_count-1, 'scene': scene, 'image': base64.b64encode(jpg).decode()})
    finally:
        cap.release()
    for start in range(0, len(samples), 8):
        if time.monotonic()-started > deadline_seconds:
            raise ValueError('blur_analysis_budget_exceeded')
        batch = samples[start:start+8]
        response = analyze([x['image'] for x in batch])
        frames = response.get('frames')
        if response.get('policy') != POLICY or not isinstance(frames, list) or len(frames) != len(batch):
            raise ValueError('incomplete_blur_analysis')
        by_index = {x.get('index'): x.get('boxes') for x in frames}
        if set(by_index) != set(range(len(batch))):
            raise ValueError('incomplete_blur_analysis')
        for index, sample in enumerate(batch):
            boxes = by_index[index]
            if not isinstance(boxes, list) or len(boxes) > 50:
                raise ValueError('invalid_blur_analysis')
            padded_boxes(boxes, width, height)
            sample['boxes'] = boxes
            del sample['image']
    cap = cv2.VideoCapture(str(source))
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'bgr24', '-video_size', f'{width}x{height}',
               '-framerate', str(fps), '-i', 'pipe:0', '-i', str(source), '-map', '0:v:0', '-map', '1:a:0',
               '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '128k', '-maxrate', '144k', '-bufsize', '288k',
               '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', '-y', str(destination)]
    process = None
    try:
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=errors, stdout=subprocess.DEVNULL)
            current, index = 0, 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                while index+1 < len(samples) and samples[index+1]['frame'] <= current:
                    index += 1
                boxes = samples[index]['boxes']
                # The union between observations covers movement, without carrying masks over scene cuts.
                if index+1 < len(samples) and samples[index+1]['scene'] == samples[index]['scene']:
                    boxes = boxes + samples[index+1]['boxes']
                process.stdin.write(blur_frame(frame, boxes).tobytes())
                current += 1
                if time.monotonic()-started > deadline_seconds:
                    raise ValueError('blur_render_budget_exceeded')
            process.stdin.close()
            if process.wait(timeout=120) or current != frame_count:
                raise ValueError('blur_render_failed')
        return {'policy': POLICY, 'frames': frame_count, 'observations': len(samples)}
    except BaseException:
        if process and process.poll() is None:
            process.kill()
            process.wait()
        Path(destination).unlink(missing_ok=True)
        raise
    finally:
        cap.release()
