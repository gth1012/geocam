package com.arteon.geocam;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.camera.view.PreviewView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PreviewView cameraPreviewView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YuvCameraPlugin.class);
        super.onCreate(savedInstanceState);

        ViewGroup rootView = (ViewGroup) getWindow().getDecorView()
            .findViewById(android.R.id.content);

        if (rootView != null) {
            cameraPreviewView = new PreviewView(this);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            );
            cameraPreviewView.setLayoutParams(params);
            cameraPreviewView.setVisibility(View.GONE);
            rootView.addView(cameraPreviewView, 0);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setBackgroundColor(0x00000000);
        }
    }

    public PreviewView getCameraPreviewView() {
        return cameraPreviewView;
    }

    public void showCameraPreview() {
        if (cameraPreviewView != null) {
            runOnUiThread(() -> cameraPreviewView.setVisibility(View.VISIBLE));
        }
    }

    public void hideCameraPreview() {
        if (cameraPreviewView != null) {
            runOnUiThread(() -> cameraPreviewView.setVisibility(View.GONE));
        }
    }
}