/**
 * turnstile-widget.tsx
 *
 * Hidden WebView that renders a self-contained Turnstile widget page. The
 * page is loaded with `baseUrl` = monochrome.tf (the hostname the sitekey
 * is authorized for), so the hostname check in the Turnstile challenge
 * passes without needing to deploy any helper page.
 *
 * The sitekey (0x4AAAAAADgxqF6QVMm0GLHH) is domain-restricted, so the
 * baseUrl MUST match one of its authorized hostnames for the widget to
 * solve (error 110200 otherwise).
 *
 * Wire-up:
 *  - Cloudflare docs: https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/
 *  - Widget rendering mirrors Monochrome js/api.js:2120.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { turnstileService, TurnstileMessage } from '../services/turnstile-service';

const SITE_KEY = '0x4AAAAAADgxqF6QVMm0GLHH';
// Authorized hostname for the sitekey. baseUrl satisfies the hostname check
// client-side without requiring an actual page to exist on that origin.
const TURNSTILE_BASE_URL = 'https://monochrome.tf/';

const TURNSTILE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
</head>
<body style="margin:0;padding:0;background:transparent;">
  <div id="turnstile-container"></div>
  <script>
    (function () {
      function post(message) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } catch (e) {}
      }

      function renderWidget() {
        if (typeof window.turnstile === 'undefined') {
          setTimeout(renderWidget, 100);
          return;
        }
        var container = document.getElementById('turnstile-container');
        var widgetId = null;
        var settled = false;
        var timeoutId = setTimeout(function () {
          if (!settled) finish('Turnstile timed out', 'timeout');
        }, 30000);

        function finish(error, type, token) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          if (widgetId != null && window.turnstile && window.turnstile.remove) {
            try { window.turnstile.remove(widgetId); } catch (e) {}
          }
          if (error) post({ type: type || 'error', error: error });
          else post({ type: 'token', token: token });
        }

        widgetId = window.turnstile.render(container, {
          sitekey: '${SITE_KEY}',
          action: 'auth',
          execution: 'execute',
          appearance: 'interaction-only',
          theme: 'auto',
          callback: function (token) { finish(null, 'token', token); },
          'error-callback': function (code) { finish('Turnstile failed (' + (code || 'unknown-code') + ')', 'error'); },
          'expired-callback': function () { finish('Turnstile expired', 'expired'); },
          'timeout-callback': function () { finish('Turnstile challenge timed out', 'timeout'); }
        });
        window.turnstile.execute(widgetId);
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(renderWidget, 0);
      } else {
        window.addEventListener('load', renderWidget);
      }
    })();
  </script>
</body>
</html>`;

export default function TurnstileWidget() {
  const [reloadKey, setReloadKey] = useState(0);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as TurnstileMessage;
      turnstileService.handleWebViewMessage(data);
    } catch {}
  }, []);

  // Allow the service to force a fresh challenge by remounting the WebView.
  useEffect(() => {
    turnstileService.setResetFn(() => {
      setReloadKey((n) => n + 1);
    });
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        source={{ html: TURNSTILE_HTML, baseUrl: TURNSTILE_BASE_URL }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Rendered at the widget's natural size (Turnstile fails or degrades in
    // 1x1 containers) but visually imperceptible.
    position: 'absolute',
    width: 320,
    height: 65,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: {
    width: 320,
    height: 65,
    backgroundColor: 'transparent',
  },
});
