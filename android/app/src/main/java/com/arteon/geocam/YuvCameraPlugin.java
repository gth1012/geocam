package com.arteon.geocam;

import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.hardware.camera2.CaptureRequest;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.core.CameraControl;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "YuvCamera")
public class YuvCameraPlugin extends Plugin {

    private static final String TAG = "YuvCameraPlugin";
    private ExecutorService cameraExecutor;
    private ImageAnalysis imageAnalysis;
    private ProcessCameraProvider cameraProvider;
    private final AtomicBoolean isCapturing = new AtomicBoolean(false);
    private PluginCall pendingCall;

    // LOCK 안정화 관련
    private static final int LOCK_STABLE_FRAMES = 5;
    private int stableFrameCount = 0;
    private float prevMeanY = -1f;
    private boolean lockStable = false;

    // ============================================================
    // STEP 2-A: Edge Detection 파라미터
    // (calibration 전 임시값 — production LOCK 금지)
    // ============================================================
    private static final int   GAUSSIAN_KERNEL_SIZE = 5;
    private static final float GAUSSIAN_SIGMA       = 1.4f;
    private static final float CANNY_LOW_THRESHOLD  = 50f;
    private static final float CANNY_HIGH_THRESHOLD = 150f;

    @Override
    public void load() {
        cameraExecutor = Executors.newSingleThreadExecutor();
    }

    @PluginMethod
    public void startYuvAnalysis(PluginCall call) {
        call.setKeepAlive(true);
        pendingCall = call;
        stableFrameCount = 0;
        prevMeanY = -1f;
        lockStable = false;

        getActivity().runOnUiThread(() -> {
            ProcessCameraProvider.getInstance(getContext()).addListener(() -> {
                try {
                    cameraProvider = ProcessCameraProvider.getInstance(getContext()).get();
                    bindYuvAnalysis();
                } catch (Exception e) {
                    Log.e(TAG, "startYuvAnalysis error: " + e.getMessage());
                    call.reject("Camera init failed: " + e.getMessage());
                }
            }, ContextCompat.getMainExecutor(getContext()));
        });
    }

    private void bindYuvAnalysis() {
        cameraProvider.unbindAll();

        ImageAnalysis.Builder analysisBuilder = new ImageAnalysis.Builder()
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST);

        Camera2Interop.Extender<ImageAnalysis> interop =
            new Camera2Interop.Extender<>(analysisBuilder);
        interop.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_LOCK, true);
        interop.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE,
            CaptureRequest.CONTROL_AF_MODE_OFF);
        interop.setCaptureRequestOption(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, 0);

        imageAnalysis = analysisBuilder.build();
        imageAnalysis.setAnalyzer(cameraExecutor, this::analyzeFrame);

        Preview preview = new Preview.Builder().build();
        CameraSelector cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA;

        cameraProvider.bindToLifecycle(
            (LifecycleOwner) getActivity(),
            cameraSelector,
            preview,
            imageAnalysis
        );

        Log.d(TAG, "YUV ImageAnalysis bound. LOCK applied.");
    }

    private void analyzeFrame(@NonNull ImageProxy image) {
        if (!isCapturing.get()) {
            checkLockStability(image);
            image.close();
            return;
        }

        try {
            int width    = image.getWidth();
            int height   = image.getHeight();
            int rotation = image.getImageInfo().getRotationDegrees();
            Rect cropRect = image.getCropRect();

            ImageProxy.PlaneProxy yPlane   = image.getPlanes()[0];
            ByteBuffer yBuffer             = yPlane.getBuffer();
            int rowStride                  = yPlane.getRowStride();
            int pixelStride                = yPlane.getPixelStride();

            Log.d(TAG, "[YUV] width=" + width + " height=" + height
                + " rotation=" + rotation
                + " rowStride=" + rowStride
                + " pixelStride=" + pixelStride
                + " cropRect=" + cropRect.toString());

            Bitmap bitmap = yPlaneToBitmap(yBuffer, width, height, rowStride, pixelStride);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            Log.d(TAG, "[YUV] PNG base64 length=" + base64.length()
                + " estimatedKB=" + (base64.length() / 1024));

            JSObject result = new JSObject();
            result.put("yuvBase64",       base64);
            result.put("sourceWidth",     width);
            result.put("sourceHeight",    height);
            result.put("rotationDegrees", rotation);
            result.put("cropRectLeft",    cropRect.left);
            result.put("cropRectTop",     cropRect.top);
            result.put("cropRectRight",   cropRect.right);
            result.put("cropRectBottom",  cropRect.bottom);
            result.put("rowStride",       rowStride);
            result.put("pixelStride",     pixelStride);
            result.put("lockStable",      lockStable);
            result.put("lockStableFrames", stableFrameCount);
            result.put("source",          "YUV_ANALYSIS");

            if (pendingCall != null) {
                pendingCall.resolve(result);
                pendingCall = null;
            }

        } catch (Exception e) {
            Log.e(TAG, "analyzeFrame error: " + e.getMessage());
            if (pendingCall != null) {
                pendingCall.reject("YUV analysis failed: " + e.getMessage());
                pendingCall = null;
            }
        } finally {
            isCapturing.set(false);
            image.close();
        }
    }

    private void checkLockStability(@NonNull ImageProxy image) {
        try {
            ImageProxy.PlaneProxy yPlane = image.getPlanes()[0];
            ByteBuffer yBuffer = yPlane.getBuffer().duplicate();
            int rowStride = yPlane.getRowStride();
            int width  = image.getWidth();
            int height = image.getHeight();

            long sum = 0; int count = 0;
            int centerY = height / 2;
            int startX  = width / 4;
            int endX    = width * 3 / 4;
            for (int x = startX; x < endX; x++) {
                int idx = centerY * rowStride + x;
                if (idx < yBuffer.capacity()) {
                    sum += (yBuffer.get(idx) & 0xFF);
                    count++;
                }
            }
            float meanY = count > 0 ? (float) sum / count : 0f;

            if (prevMeanY >= 0) {
                float variance = Math.abs(meanY - prevMeanY);
                if (variance < 2.0f) {
                    stableFrameCount++;
                    if (stableFrameCount >= LOCK_STABLE_FRAMES) {
                        lockStable = true;
                        Log.d(TAG, "[LOCK] Stable confirmed. frames=" + stableFrameCount
                            + " meanY=" + meanY);
                    }
                } else {
                    stableFrameCount = 0;
                    lockStable = false;
                }
            }
            prevMeanY = meanY;
        } catch (Exception e) {
            Log.e(TAG, "checkLockStability error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void captureYuvFrame(PluginCall call) {
        if (!lockStable) {
            Log.w(TAG, "[captureYuvFrame] LOCK not stable yet. frames=" + stableFrameCount);
        }
        pendingCall = call;
        isCapturing.set(true);
    }

    @PluginMethod
    public void stopYuvAnalysis(PluginCall call) {
        if (cameraProvider != null) {
            getActivity().runOnUiThread(() -> {
                cameraProvider.unbindAll();
                Log.d(TAG, "YUV analysis stopped.");
            });
        }
        isCapturing.set(false);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    // ============================================================
    // STEP 2-A: detectCardBoundary() — Edge map 생성까지
    // 입력: Y-plane raw bytes (grayscale)
    // 출력: JSObject { edgePixelCount, edgeRatio, debugInfo }
    // ============================================================

    @PluginMethod
    public void detectCardBoundary(PluginCall call) {
        // 파라미터 수신 (LC-CARD-BOUNDARY-001 v1.3 §5.1)
        double targetWidthMm   = call.getDouble("targetWidthMm",  55.0);
        double targetHeightMm  = call.getDouble("targetHeightMm", 85.0);
        double aspectTolerance = call.getDouble("aspectTolerance", 0.15);

        // Y-plane base64 수신
        String yBase64 = call.getString("yBase64");
        if (yBase64 == null || yBase64.isEmpty()) {
            call.reject("yBase64 is required");
            return;
        }

        try {
            byte[] yBytes = Base64.decode(yBase64, Base64.NO_WRAP);
            int width  = call.getInt("width",  0);
            int height = call.getInt("height", 0);

            if (width <= 0 || height <= 0 || yBytes.length < width * height) {
                call.reject("invalid width/height or yBytes length");
                return;
            }

            Log.d(TAG, "[CardBoundary2A] start width=" + width + " height=" + height
                + " targetW=" + targetWidthMm + " targetH=" + targetHeightMm
                + " tolerance=" + aspectTolerance);

            // ── STEP 1: Gaussian Blur ─────────────────────────────
            float[] blurred = gaussianBlur(yBytes, width, height,
                GAUSSIAN_KERNEL_SIZE, GAUSSIAN_SIGMA);

            // ── STEP 2: Sobel Gradient ────────────────────────────
            float[] magnitude = new float[width * height];
            float[] direction = new float[width * height];
            computeSobelGradient(blurred, width, height, magnitude, direction);

            // ── STEP 3: Non-Maximum Suppression ───────────────────
            float[] suppressed = nonMaximumSuppression(magnitude, direction, width, height);

            // ── STEP 4: Double Threshold ──────────────────────────
            // magnitude 최대값 기준으로 비율 적용
            float maxMag = 0f;
            for (float v : suppressed) if (v > maxMag) maxMag = v;
            float highT = maxMag > 0 ? Math.min(CANNY_HIGH_THRESHOLD, maxMag * 0.8f)
                                     : CANNY_HIGH_THRESHOLD;
            float lowT  = highT * (CANNY_LOW_THRESHOLD / CANNY_HIGH_THRESHOLD);

            byte[] edgeMap = applyDoubleThreshold(suppressed, width, height, lowT, highT);

            // ── STEP 5: Edge Hysteresis ───────────────────────────
            edgeHysteresis(edgeMap, width, height);

            // ── 검증: edge pixel 수 집계 ──────────────────────────
            int edgePixelCount = 0;
            for (byte b : edgeMap) if (b == 2) edgePixelCount++;
            float edgeRatio = (float) edgePixelCount / (width * height);

            Log.d(TAG, "[CardBoundary2A] edgePixelCount=" + edgePixelCount
                + " edgeRatio=" + String.format("%.4f", edgeRatio)
                + " highT=" + String.format("%.1f", highT)
                + " lowT="  + String.format("%.1f", lowT));

            JSObject result = new JSObject();
            result.put("step",           "2A");
            result.put("edgePixelCount", edgePixelCount);
            result.put("edgeRatio",      edgeRatio);
            result.put("width",          width);
            result.put("height",         height);
            result.put("highThreshold",  highT);
            result.put("lowThreshold",   lowT);
            result.put("debugInfo",      "gaussianBlur→sobelGradient→NMS→doubleThreshold→hysteresis OK");
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "[CardBoundary2A] error: " + e.getMessage());
            call.reject("detectCardBoundary 2A failed: " + e.getMessage());
        }
    }

    // ============================================================
    // 2-A 내부 알고리즘 구현
    // ============================================================

    /**
     * gaussianBlur: 5×5 Gaussian kernel (sigma=1.4) 직접 구현
     */
    private float[] gaussianBlur(byte[] yBytes, int width, int height,
                                  int kernelSize, float sigma) {
        float[] kernel = makeGaussianKernel(kernelSize, sigma);
        int half = kernelSize / 2;
        float[] out = new float[width * height];

        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                float sum = 0f;
                float wSum = 0f;
                for (int kr = -half; kr <= half; kr++) {
                    for (int kc = -half; kc <= half; kc++) {
                        int r = Math.max(0, Math.min(height - 1, row + kr));
                        int c = Math.max(0, Math.min(width  - 1, col + kc));
                        float w = kernel[(kr + half) * kernelSize + (kc + half)];
                        sum  += w * (yBytes[r * width + c] & 0xFF);
                        wSum += w;
                    }
                }
                out[row * width + col] = sum / wSum;
            }
        }
        return out;
    }

    private float[] makeGaussianKernel(int size, float sigma) {
        float[] kernel = new float[size * size];
        int half = size / 2;
        float sum = 0f;
        for (int i = -half; i <= half; i++) {
            for (int j = -half; j <= half; j++) {
                float val = (float) Math.exp(-(i * i + j * j) / (2 * sigma * sigma));
                kernel[(i + half) * size + (j + half)] = val;
                sum += val;
            }
        }
        // normalize
        for (int i = 0; i < kernel.length; i++) kernel[i] /= sum;
        return kernel;
    }

    /**
     * computeSobelGradient: 3×3 Sobel 직접 구현
     * magnitude / direction 배열 채움
     */
    private void computeSobelGradient(float[] blurred, int width, int height,
                                       float[] magnitude, float[] direction) {
        for (int row = 1; row < height - 1; row++) {
            for (int col = 1; col < width - 1; col++) {
                float gx =
                    -blurred[(row-1)*width+(col-1)] + blurred[(row-1)*width+(col+1)]
                    -2*blurred[row*width+(col-1)]   + 2*blurred[row*width+(col+1)]
                    -blurred[(row+1)*width+(col-1)] + blurred[(row+1)*width+(col+1)];
                float gy =
                     blurred[(row-1)*width+(col-1)] + 2*blurred[(row-1)*width+col]
                    +blurred[(row-1)*width+(col+1)]
                    -blurred[(row+1)*width+(col-1)] - 2*blurred[(row+1)*width+col]
                    -blurred[(row+1)*width+(col+1)];

                magnitude[row*width+col] = (float) Math.sqrt(gx*gx + gy*gy);
                direction[row*width+col] = (float) Math.toDegrees(Math.atan2(gy, gx));
            }
        }
    }

    /**
     * nonMaximumSuppression: gradient direction 따라 local maximum만 유지
     */
    private float[] nonMaximumSuppression(float[] magnitude, float[] direction,
                                            int width, int height) {
        float[] out = new float[width * height];
        for (int row = 1; row < height - 1; row++) {
            for (int col = 1; col < width - 1; col++) {
                float angle = direction[row*width+col] % 180f;
                if (angle < 0) angle += 180f;
                float mag = magnitude[row*width+col];
                float n1, n2;
                if (angle < 22.5f || angle >= 157.5f) {
                    n1 = magnitude[row*width+(col-1)];
                    n2 = magnitude[row*width+(col+1)];
                } else if (angle < 67.5f) {
                    n1 = magnitude[(row+1)*width+(col-1)];
                    n2 = magnitude[(row-1)*width+(col+1)];
                } else if (angle < 112.5f) {
                    n1 = magnitude[(row-1)*width+col];
                    n2 = magnitude[(row+1)*width+col];
                } else {
                    n1 = magnitude[(row-1)*width+(col-1)];
                    n2 = magnitude[(row+1)*width+(col+1)];
                }
                out[row*width+col] = (mag >= n1 && mag >= n2) ? mag : 0f;
            }
        }
        return out;
    }

    /**
     * applyDoubleThreshold: strong(2) / weak(1) / none(0) 분류
     */
    private byte[] applyDoubleThreshold(float[] suppressed, int width, int height,
                                          float lowT, float highT) {
        byte[] edgeMap = new byte[width * height];
        for (int i = 0; i < suppressed.length; i++) {
            if      (suppressed[i] >= highT) edgeMap[i] = 2; // strong
            else if (suppressed[i] >= lowT)  edgeMap[i] = 1; // weak
            else                             edgeMap[i] = 0; // none
        }
        return edgeMap;
    }

    /**
     * edgeHysteresis: weak pixel이 strong과 8-연결이면 strong으로 승격, 아니면 제거
     */
    private void edgeHysteresis(byte[] edgeMap, int width, int height) {
        boolean changed = true;
        while (changed) {
            changed = false;
            for (int row = 1; row < height - 1; row++) {
                for (int col = 1; col < width - 1; col++) {
                    if (edgeMap[row*width+col] == 1) {
                        boolean nearStrong = false;
                        outer:
                        for (int dr = -1; dr <= 1; dr++) {
                            for (int dc = -1; dc <= 1; dc++) {
                                if (edgeMap[(row+dr)*width+(col+dc)] == 2) {
                                    nearStrong = true;
                                    break outer;
                                }
                            }
                        }
                        if (nearStrong) {
                            edgeMap[row*width+col] = 2;
                            changed = true;
                        }
                    }
                }
            }
        }
        // 최종: weak(1) → 제거(0)
        for (int i = 0; i < edgeMap.length; i++) {
            if (edgeMap[i] == 1) edgeMap[i] = 0;
        }
    }

    // ============================================================
    // 기존 유틸
    // ============================================================

    private Bitmap yPlaneToBitmap(ByteBuffer yBuffer, int width, int height,
                                   int rowStride, int pixelStride) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        int[] pixels = new int[width * height];
        yBuffer.rewind();
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                int idx = row * rowStride + col * pixelStride;
                if (idx < yBuffer.capacity()) {
                    int y = yBuffer.get(idx) & 0xFF;
                    pixels[row * width + col] = 0xFF000000 | (y << 16) | (y << 8) | y;
                }
            }
        }
        bitmap.setPixels(pixels, 0, width, 0, 0, width, height);
        return bitmap;
    }

    @Override
    protected void handleOnDestroy() {
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
    }
}