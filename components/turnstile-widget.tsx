/**
 * turnstile-widget.tsx
 *
 * Hidden WebView that loads a Turnstile helper page from the Monochrome
 * deployment (monochrome.tf/luna-turnstile.html). The helper page renders
 * the Turnstile widget on the whitelisted domain, solves the challenge,
 * and posts the token back to React Native via WebView messaging.
 *
 * The sitekey (0x4AAAAAADgxqF6QVMm0GLHH) is domain-restricted to monochrome.tf,
 * so the helper page MUST be served from that domain.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { turnstileService, TurnstileMessage } from '../services/turnstile-service';

const TURNSTILE_HELPER_URL = 'https://monochrome.tf/luna-turnstile.html';
const SITE_KEY = '0x4AAAAAADgxqF6QVMm0GLHH';

export default function TurnstileWidget() {
  const webViewRef = useRef<WebView>(null);
  const reloadKey = useRef(0);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as TurnstileMessage;
      turnstileService.handleWebViewMessage(data);
    } catch {}
  }, []);

  // Allow the service to trigger a reload (for force-refresh)
  useEffect(() => {
    turnstileService.setResetFn(() => {
      reloadKey.current += 1;
    });
  }, []);

  const uri = `${TURNSTILE_HELPER_URL}?sitekey=${SITE_KEY}&action=auth&execution=execute&appearance=interaction-only&theme=auto`;

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey.current}
        ref={webViewRef as any}
        source={{ uri }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
