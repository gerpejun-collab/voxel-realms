package com.voxelrealms.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    WebView webView;
    static final String PREFS_NAME = "VoxelRealmsPrefsV2";
    static final String KEY_SERVER_URL = "server_url_w9l3";
    // Public production server URL on Render
    static final String DEFAULT_SERVER_URL = "https://voxel-realms-w9l3.onrender.com";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen awake and lock sensor landscape
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        // Apply true immersive sticky fullscreen
        applyImmersiveSticky();

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.game_webview);
        configureWebView();

        // Load the live Voxel Realms multiplayer world
        String targetUrl = getIntent().getStringExtra("SERVER_URL");
        if (targetUrl == null || targetUrl.trim().isEmpty()) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            targetUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
        }
        webView.loadUrl(targetUrl);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        // Core WebGL & JavaScript execution
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Web Audio autoplay support without requiring user interaction
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Rendering & Performance optimizations
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Cache & offline storage
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Mixed content support (HTTPS + WSS / local HTTP)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Hardware acceleration
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        webView.addJavascriptInterface(new VoxelAndroidBridge(this), "VoxelAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new GameWebViewClient(this));
    }

    void showConnectionHub(String attemptedUrl) {
        String safeUrl = attemptedUrl != null ? attemptedUrl.replace("\"", "&quot;") : DEFAULT_SERVER_URL;
        String html = "<!DOCTYPE html><html lang='es'><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
            + "<style>"
            + "body{margin:0;padding:16px;background:#11141c;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:92vh;}"
            + ".card{background:#1e222d;border:2px solid #475569;padding:20px 24px;max-width:520px;width:100%;box-sizing:border-box;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.8);}"
            + "h1{margin:0 0 6px;color:#fbbf24;font-size:22px;letter-spacing:2px;}"
            + "p{margin:6px 0 14px;color:#cbd5e1;font-size:13px;line-height:1.4;}"
            + "input{width:100%;padding:10px 12px;box-sizing:border-box;background:#0f1319;border:2px solid #334155;color:#fff;font-size:14px;margin-bottom:12px;}"
            + ".btn{display:block;width:100%;padding:12px;margin-top:8px;background:#2e6930;color:#fff;border:2px solid #000;font-weight:800;font-size:14px;cursor:pointer;}"
            + ".btn-sec{background:#3b4252;font-size:12px;padding:9px;}"
            + "</style></head><body><div class='card'>"
            + "<h1>VOXEL REALMS ONLINE</h1>"
            + "<p>Conectando con tu servidor multijugador en Render.<br>Si el servidor gratuito estaba en reposo, tarda ~25s en despertar:</p>"
            + "<input id='srv' type='url' value='" + safeUrl + "' placeholder='https://voxel-realms-w9l3.onrender.com' />"
            + "<button class='btn' onclick='connectNow()'>⚡ CONECTAR AL MUNDO MULTIJUGADOR</button>"
            + "<button class='btn btn-sec' onclick='setPreset(\"https://voxel-realms-w9l3.onrender.com\")'>🌐 Servidor Oficial (voxel-realms-w9l3.onrender.com)</button>"
            + "</div><script>"
            + "function setPreset(u){document.getElementById('srv').value=u;connectNow();}"
            + "function connectNow(){var u=document.getElementById('srv').value.trim();if(!u)return;if(!u.startsWith('http'))u='https://'+u;if(window.VoxelAndroid){window.VoxelAndroid.saveAndConnect(u);}else{location.href=u;}}"
            + "</script></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private void applyImmersiveSticky() {
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN;
        decorView.setSystemUiVisibility(uiOptions);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveSticky();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        applyImmersiveSticky();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}

class GameWebViewClient extends WebViewClient {
    private final MainActivity activity;

    GameWebViewClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return false; // Stay inside WebView
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request.isForMainFrame()) {
            activity.showConnectionHub(request.getUrl().toString());
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        activity.showConnectionHub(failingUrl);
    }
}

class LoadUrlTask implements Runnable {
    private final MainActivity activity;
    private final String url;

    LoadUrlTask(MainActivity activity, String url) {
        this.activity = activity;
        this.url = url;
    }

    @Override
    public void run() {
        if (activity.webView != null) {
            activity.webView.loadUrl(url);
        }
    }
}

class VoxelAndroidBridge {
    private final MainActivity activity;

    VoxelAndroidBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void saveAndConnect(final String url) {
        SharedPreferences prefs = activity.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(MainActivity.KEY_SERVER_URL, url).apply();
        activity.runOnUiThread(new LoadUrlTask(activity, url));
    }
}
