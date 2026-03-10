import requests
import json
import base64
import random

TIDAL_INSTANCES = [
    'https://eu-central.monochrome.tf',
    'https://us-west.monochrome.tf',
    'https://arran.monochrome.tf',
    'https://triton.squid.wtf',
    'https://api.monochrome.tf',
    'https://monochrome-api.samidy.com',
    'https://wolf.qqdl.site',
    'https://maus.qqdl.site',
    'https://vogel.qqdl.site',
    'https://hund.qqdl.site',
    'https://katze.qqdl.site',
    'https://tidal.kinoplus.online',
]

QOBUZ_API = 'https://qobuz.squid.wtf/api'

TRACK_ID = '203443205'
QOBUZ_TRACK_ID = '211130638' # Example Qobuz track ID
QUALITY = 'HI_RES_LOSSLESS'

def extract_stream_url(manifest):
    try:
        decoded = base64.b64decode(manifest).decode('utf-8')
        if '<MPD' in decoded:
            return "DASH Manifest (XML)"
        
        try:
            parsed = json.loads(decoded)
            if 'urls' in parsed and parsed['urls']:
                return parsed['urls'][0]
        except:
            import re
            match = re.search(r'https?://[\w\-.~:?#[@!$&\'()*+,;=%/]+', decoded)
            return match.group(0) if match else None
    except Exception as e:
        return f"Error: {e}"

def test_instances():
    print(f"Testing Tidal instances for Track ID: {TRACK_ID}, Quality: {QUALITY}\n")
    
    for base_url in TIDAL_INSTANCES:
        url = f"{base_url.rstrip('/')}/track/?id={TRACK_ID}&quality={QUALITY}"
        print(f"Checking: {url}")
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Handle possible different response structures
                entries = data if isinstance(data, list) else [data]
                
                track_found = False
                manifest_found = False
                original_url = None
                
                # Check for nested data if present (v2.4+)
                if 'data' in data:
                    entries = [data['data']]
                else:
                    entries = data if isinstance(data, list) else [data]
                
                for entry in entries:
                    if not entry: continue
                    # Check for manifest in data or info.manifest
                    manifest = entry.get('manifest') or entry.get('info', {}).get('manifest')
                    
                    if 'duration' in entry or 'title' in entry:
                        track_found = True
                        title = entry.get('title') or entry.get('track', {}).get('title', 'Unknown')
                        artist = entry.get('artist', {}).get('name') or entry.get('track', {}).get('artist', {}).get('name', 'Unknown')
                        print(f"  [✓] Track metadata found: {title} - {artist}")
                    
                    if manifest:
                        manifest_found = True
                        stream_url = extract_stream_url(manifest)
                        print(f"  [✓] Manifest found. Stream URL: {stream_url}")
                    
                    if 'OriginalTrackUrl' in entry or 'originalTrackUrl' in entry:
                        original_url = entry.get('OriginalTrackUrl') or entry.get('originalTrackUrl')
                        print(f"  [✓] OriginalTrackUrl found: {original_url}")
                
                if not (track_found or manifest_found or original_url):
                    print(f"  [!] Instance returned success but no usable data found: {data}")
            else:
                print(f"  [✗] Failed with status code: {response.status_code}")
        except Exception as e:
            print(f"  [✗] Error: {e}")
        print("-" * 40)

def test_qobuz():
    print(f"\nTesting Qobuz: {QOBUZ_API}")
    # The app uses apiService.getQobuzStreamUrl which calls /download-music?track_id={id}&quality=7
    url = f"{QOBUZ_API}/download-music?track_id={QOBUZ_TRACK_ID}&quality=7"
    print(f"Checking: {url}")
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            try:
                data = response.json()
                if data.get('url') or (data.get('data') and data['data'].get('url')):
                    url = data.get('url') or data['data'].get('url')
                    print(f"  [✓] Stream URL found: {url}")
                else:
                    print(f"  [!] No URL found in response: {data}")
            except json.JSONDecodeError:
                print(f"  [✗] Response is not JSON: {response.text[:200]}")
        else:
            print(f"  [✗] Failed with status code: {response.status_code}")
    except Exception as e:
        print(f"  [✗] Error: {e}")

if __name__ == "__main__":
    test_instances()
    test_qobuz()
    test_qobuz()
