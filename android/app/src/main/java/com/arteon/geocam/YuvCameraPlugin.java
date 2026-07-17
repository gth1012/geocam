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
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
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
import java.io.File;
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

    private static final int LOCK_STABLE_FRAMES = 5;
    private int stableFrameCount = 0;
    private float prevMeanY = -1f;
    private boolean lockStable = false;

    private static final int   GAUSSIAN_KERNEL_SIZE = 5;
    private static final float GAUSSIAN_SIGMA       = 1.4f;
    private static final float CANNY_LOW_THRESHOLD  = 50f;
    private static final float CANNY_HIGH_THRESHOLD = 150f;

    @Override
    public void load() {
        cameraExecutor = Executors.newSingleThreadExecutor();
    }

    // ============================================================
    // capturePhotoFile — CameraX ImageCapture 직접 파일 저장
    // GEO-CAM-TRANSFER-001 STEP 1
    // Canvas / Bitmap / Base64 / YUV→RGB 변환 일절 없음
    // ============================================================
    @PluginMethod
    public void capturePhotoFile(PluginCall call) {
        // 백그라운드 스레드에서 재시도 루프 실행
        // WebView stream.stop() 이후 Android OS 카메라 해제까지 시간이 필요
        // → 최대 5회, 600ms 간격으로 bindToLifecycle 재시도
        cameraExecutor.execute(() -> {
            final int MAX_RETRY    = 5;
            final int RETRY_DELAY_MS = 600;

            ProcessCameraProvider provider = null;
            try {
                provider = ProcessCameraProvider.getInstance(getContext()).get();
            } catch (Exception e) {
                Log.e(TAG, "[capturePhotoFile] provider get failed: " + e.getMessage());
                call.reject("capturePhotoFile provider failed: " + e.getMessage());
                return;
            }
            final ProcessCameraProvider finalProvider = provider;

            for (int attempt = 1; attempt <= MAX_RETRY; attempt++) {
                final int currentAttempt = attempt;
                Log.d(TAG, "[capturePhotoFile] attempt=" + currentAttempt);

                try {
                    // UI 스레드에서 바인딩 실행 (CameraX 요구사항)
                    final boolean[] bindSuccess = {false};
                    final ImageCapture[] imageCaptureHolder = {null};
                    final Object lock = new Object();

                    getActivity().runOnUiThread(() -> {
                        synchronized (lock) {
                            try {
                                finalProvider.unbindAll();

                                Preview preview = new Preview.Builder().build();
                                ImageCapture imageCapture = new ImageCapture.Builder()
                                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                                    .build();

                                finalProvider.bindToLifecycle(
                                    (LifecycleOwner) getActivity(),
                                    CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview,
                                    imageCapture
                                );

                                imageCaptureHolder[0] = imageCapture;
                                bindSuccess[0] = true;
                                Log.d(TAG, "[capturePhotoFile] bind success attempt=" + currentAttempt);
                            } catch (Exception e) {
                                Log.w(TAG, "[capturePhotoFile] bind failed attempt=" + currentAttempt
                                    + " error=" + e.getMessage());
                                bindSuccess[0] = false;
                            } finally {
                                lock.notifyAll();
                            }
                        }
                    });

                    // UI 스레드 완료 대기
                    synchronized (lock) {
                        lock.wait(2000);
                    }

                    if (!bindSuccess[0] || imageCaptureHolder[0] == null) {
                        if (attempt < MAX_RETRY) {
                            Log.d(TAG, "[capturePhotoFile] retry in " + RETRY_DELAY_MS + "ms");
                            Thread.sleep(RETRY_DELAY_MS);
                            continue;
                        } else {
                            call.reject("capturePhotoFile: camera bind failed after " + MAX_RETRY + " attempts");
                            return;
                        }
                    }

                    // 바인딩 성공 → takePicture
                    final ImageCapture imageCapture = imageCaptureHolder[0];
                    File outputDir  = getContext().getCacheDir();
                    File outputFile = new File(outputDir,
                        "geo_capture_" + System.currentTimeMillis() + ".jpg");

                    ImageCapture.OutputFileOptions outputOptions =
                        new ImageCapture.OutputFileOptions.Builder(outputFile).build();

                    final Object photoLock = new Object();
                    final boolean[] photoDone = {false};

                    getActivity().runOnUiThread(() -> {
                        imageCapture.takePicture(
                            outputOptions,
                            ContextCompat.getMainExecutor(getContext()),
                            new ImageCapture.OnImageSavedCallback() {
                                @Override
                                public void onImageSaved(
                                        @NonNull ImageCapture.OutputFileResults outputFileResults) {
                                    try {
                                        long fileSize = outputFile.length();
                                        String absolutePath = outputFile.getAbsolutePath();
                                        String uri = outputFileResults.getSavedUri() != null
                                            ? outputFileResults.getSavedUri().toString()
                                            : "file://" + absolutePath;

                                        Log.d(TAG, "[capturePhotoFile] SAVED"
                                            + " path=" + absolutePath
                                            + " size=" + fileSize);

                                        JSObject result = new JSObject();
                                        result.put("path",     absolutePath);
                                        result.put("uri",      uri);
                                        result.put("size",     fileSize);
                                        result.put("mimeType", "image/jpeg");

                                        finalProvider.unbindAll();
                                        call.resolve(result);
                                    } catch (Exception e) {
                                        Log.e(TAG, "[capturePhotoFile] result error: " + e.getMessage());
                                        call.reject("capturePhotoFile result error: " + e.getMessage());
                                    } finally {
                                        synchronized (photoLock) {
                                            photoDone[0] = true;
                                            photoLock.notifyAll();
                                        }
                                    }
                                }

                                @Override
                                public void onError(@NonNull ImageCaptureException exception) {
                                    Log.e(TAG, "[capturePhotoFile] takePicture ERROR: "
                                        + exception.getMessage());
                                    finalProvider.unbindAll();
                                    call.reject("capturePhotoFile takePicture failed: "
                                        + exception.getMessage());
                                    synchronized (photoLock) {
                                        photoDone[0] = true;
                                        photoLock.notifyAll();
                                    }
                                }
                            }
                        );
                    });

                    // takePicture 완료 대기
                    synchronized (photoLock) {
                        if (!photoDone[0]) photoLock.wait(15000);
                    }
                    return; // 성공 또는 에러 반환 완료

                } catch (Exception e) {
                    Log.e(TAG, "[capturePhotoFile] attempt=" + currentAttempt
                        + " exception=" + e.getMessage());
                    if (attempt < MAX_RETRY) {
                        try { Thread.sleep(RETRY_DELAY_MS); } catch (InterruptedException ie) { break; }
                    } else {
                        call.reject("capturePhotoFile failed: " + e.getMessage());
                    }
                }
            }
        });
    }

    // ============================================================
    // 기존 메서드 (변경 없음)
    // ============================================================

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
    // detectCardBoundary: Y-plane raw bytes 입력
    // ============================================================
    @PluginMethod
    public void detectCardBoundary(PluginCall call) {
        double targetWidthMm   = call.getDouble("targetWidthMm",  55.0);
        double targetHeightMm  = call.getDouble("targetHeightMm", 85.0);
        double aspectTolerance = call.getDouble("aspectTolerance", 0.15);

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

            float[] blurred   = gaussianBlur(yBytes, width, height, GAUSSIAN_KERNEL_SIZE, GAUSSIAN_SIGMA);
            float[] magnitude = new float[width * height];
            float[] direction = new float[width * height];
            computeSobelGradient(blurred, width, height, magnitude, direction);
            float[] suppressed = nonMaximumSuppression(magnitude, direction, width, height);

            float maxMag = 0f;
            for (float v : suppressed) if (v > maxMag) maxMag = v;
            float highT = maxMag > 0 ? Math.min(CANNY_HIGH_THRESHOLD, maxMag * 0.8f) : CANNY_HIGH_THRESHOLD;
            float lowT  = highT * (CANNY_LOW_THRESHOLD / CANNY_HIGH_THRESHOLD);

            byte[] edgeMap = applyDoubleThreshold(suppressed, width, height, lowT, highT);
            edgeHysteresis(edgeMap, width, height);

            int edgeBeforeClosing = 0;
            for (byte bv : edgeMap) if (bv == 2) edgeBeforeClosing++;
            morphologicalClosing(edgeMap, width, height);
            int edgeAfterClosing = 0;
            for (byte bv : edgeMap) if (bv == 2) edgeAfterClosing++;
            Log.d(TAG, "[CardBoundary-2B1-Closing] edgePixelBefore=" + edgeBeforeClosing
                + " edgePixelAfter=" + edgeAfterClosing);

            int edgePixelCount = 0;
            for (byte b : edgeMap) if (b == 2) edgePixelCount++;
            float edgeRatio = (float) edgePixelCount / (width * height);

            java.util.List<int[]> contours = traceContours(edgeMap, width, height);
            java.util.List<int[][]> quads  = findQuadrilateralCandidates(contours, width, height);

            boolean cardDetected   = false;
            int[][] orderedCorners = null;
            double  bestArea       = 0;

            for (int[][] quad : quads) {
                double area = 0;
                for (int i = 0; i < 4; i++) {
                    int j = (i + 1) % 4;
                    area += quad[i][0] * quad[j][1];
                    area -= quad[j][0] * quad[i][1];
                }
                area = Math.abs(area) / 2.0;
                if (area > bestArea) {
                    bestArea       = area;
                    orderedCorners = orderCorners(quad);
                    cardDetected   = true;
                }
            }

            double aspectRatioScore = 0;
            double coverageScore    = 0;
            double targetRatio      = targetWidthMm / targetHeightMm;

            if (cardDetected && orderedCorners != null) {
                int[] tl = orderedCorners[0], tr = orderedCorners[1];
                int[] br = orderedCorners[2], bl = orderedCorners[3];
                double w = (dist(tl, tr) + dist(bl, br)) / 2.0;
                double h = (dist(tl, bl) + dist(tr, br)) / 2.0;
                double measuredRatio = h > 0 ? w / h : 0;
                aspectRatioScore = Math.max(0, 1 - Math.abs(measuredRatio - targetRatio) / aspectTolerance);
                coverageScore    = Math.min(1.0, bestArea / (width * height * 0.5));
            }

            JSObject result = new JSObject();
            result.put("step",             "2B");
            result.put("edgePixelCount",   edgePixelCount);
            result.put("edgeRatio",        edgeRatio);
            result.put("contourCount",     contours.size());
            result.put("quadCount",        quads.size());
            result.put("cardDetected",     cardDetected);
            result.put("aspectRatioScore", aspectRatioScore);
            result.put("coverageScore",    coverageScore);
            result.put("width",            width);
            result.put("height",           height);
            result.put("highThreshold",    highT);
            result.put("lowThreshold",     lowT);
            if (cardDetected && orderedCorners != null) {
                JSObject corners = new JSObject();
                corners.put("tlX", orderedCorners[0][0]); corners.put("tlY", orderedCorners[0][1]);
                corners.put("trX", orderedCorners[1][0]); corners.put("trY", orderedCorners[1][1]);
                corners.put("brX", orderedCorners[2][0]); corners.put("brY", orderedCorners[2][1]);
                corners.put("blX", orderedCorners[3][0]); corners.put("blY", orderedCorners[3][1]);
                result.put("corners", corners);
            }
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "[CardBoundary2B] error: " + e.getMessage());
            call.reject("detectCardBoundary failed: " + e.getMessage());
        }
    }

    // ============================================================
    // detectCardBoundaryFromPng: PNG Base64 입력 전용
    // ============================================================
    @PluginMethod
    public void detectCardBoundaryFromPng(PluginCall call) {
        double targetWidthMm   = call.getDouble("targetWidthMm",  55.0);
        double targetHeightMm  = call.getDouble("targetHeightMm", 85.0);
        double aspectTolerance = call.getDouble("aspectTolerance", 0.15);

        String pngBase64 = call.getString("pngBase64");
        if (pngBase64 == null || pngBase64.isEmpty()) {
            call.reject("pngBase64 is required");
            return;
        }

        try {
            byte[] pngBytes = Base64.decode(pngBase64, Base64.NO_WRAP);
            android.graphics.Bitmap bitmap = android.graphics.BitmapFactory
                .decodeByteArray(pngBytes, 0, pngBytes.length);
            if (bitmap == null) {
                call.reject("BitmapFactory decode failed");
                return;
            }

            int width  = bitmap.getWidth();
            int height = bitmap.getHeight();

            Log.d(TAG, "[CardBoundaryPng] input width=" + width + " height=" + height);

            byte[] yBytes = new byte[width * height];
            int[] pixels  = new int[width * height];
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
            for (int i = 0; i < pixels.length; i++) {
                int r = (pixels[i] >> 16) & 0xFF;
                int g = (pixels[i] >>  8) & 0xFF;
                int b = (pixels[i]      ) & 0xFF;
                yBytes[i] = (byte)(0.299 * r + 0.587 * g + 0.114 * b);
            }
            bitmap.recycle();

            float[] blurred   = gaussianBlur(yBytes, width, height, GAUSSIAN_KERNEL_SIZE, GAUSSIAN_SIGMA);
            float[] magnitude = new float[width * height];
            float[] direction = new float[width * height];
            computeSobelGradient(blurred, width, height, magnitude, direction);
            float[] suppressed = nonMaximumSuppression(magnitude, direction, width, height);

            float maxMag = 0f;
            for (float v : suppressed) if (v > maxMag) maxMag = v;
            float highT = maxMag > 0 ? Math.min(CANNY_HIGH_THRESHOLD, maxMag * 0.8f) : CANNY_HIGH_THRESHOLD;
            float lowT  = highT * (CANNY_LOW_THRESHOLD / CANNY_HIGH_THRESHOLD);

            byte[] edgeMap = applyDoubleThreshold(suppressed, width, height, lowT, highT);
            edgeHysteresis(edgeMap, width, height);

            int edgeBeforeClosing = 0;
            for (byte bv : edgeMap) if (bv == 2) edgeBeforeClosing++;
            morphologicalClosing(edgeMap, width, height);
            int edgeAfterClosing = 0;
            for (byte bv : edgeMap) if (bv == 2) edgeAfterClosing++;
            Log.d(TAG, "[CardBoundary-2B1-Closing] edgePixelBefore=" + edgeBeforeClosing
                + " edgePixelAfter=" + edgeAfterClosing);

            int edgePixelCount = 0;
            for (byte bv : edgeMap) if (bv == 2) edgePixelCount++;
            float edgeRatio = (float) edgePixelCount / (width * height);

            Log.d(TAG, "[CardBoundaryPng] edgePixelCount=" + edgePixelCount
                + " edgeRatio=" + String.format("%.4f", edgeRatio)
                + " highT=" + String.format("%.1f", highT)
                + " lowT="  + String.format("%.1f", lowT));

            java.util.List<int[]> contours = traceContours(edgeMap, width, height);
            java.util.List<int[][]> quads  = findQuadrilateralCandidates(contours, width, height);

            boolean cardDetected   = false;
            int[][] orderedCorners = null;
            double  bestArea       = 0;

            for (int[][] quad : quads) {
                double area = 0;
                for (int i = 0; i < 4; i++) {
                    int j = (i + 1) % 4;
                    area += quad[i][0] * quad[j][1];
                    area -= quad[j][0] * quad[i][1];
                }
                area = Math.abs(area) / 2.0;
                if (area > bestArea) {
                    bestArea       = area;
                    orderedCorners = orderCorners(quad);
                    cardDetected   = true;
                }
            }

            double aspectRatioScore = 0;
            double coverageScore    = 0;
            double targetRatio      = targetWidthMm / targetHeightMm;

            if (cardDetected && orderedCorners != null) {
                int[] tl = orderedCorners[0], tr = orderedCorners[1];
                int[] br = orderedCorners[2], bl = orderedCorners[3];
                double w = (dist(tl, tr) + dist(bl, br)) / 2.0;
                double h = (dist(tl, bl) + dist(tr, br)) / 2.0;
                double measuredRatio = h > 0 ? w / h : 0;
                aspectRatioScore = Math.max(0, 1 - Math.abs(measuredRatio - targetRatio) / aspectTolerance);
                coverageScore    = Math.min(1.0, bestArea / (width * height * 0.5));
                Log.d(TAG, "[CardBoundaryPng] cardDetected=true"
                    + " aspectScore=" + String.format("%.3f", aspectRatioScore)
                    + " coverageScore=" + String.format("%.3f", coverageScore));
            }

            JSObject result = new JSObject();
            result.put("step",             "PNG");
            result.put("edgePixelCount",   edgePixelCount);
            result.put("edgeRatio",        edgeRatio);
            result.put("contourCount",     contours.size());
            result.put("quadCount",        quads.size());
            result.put("cardDetected",     cardDetected);
            result.put("aspectRatioScore", aspectRatioScore);
            result.put("coverageScore",    coverageScore);
            result.put("width",            width);
            result.put("height",           height);
            result.put("highThreshold",    highT);
            result.put("lowThreshold",     lowT);
            if (cardDetected && orderedCorners != null) {
                JSObject corners = new JSObject();
                corners.put("tlX", orderedCorners[0][0]); corners.put("tlY", orderedCorners[0][1]);
                corners.put("trX", orderedCorners[1][0]); corners.put("trY", orderedCorners[1][1]);
                corners.put("brX", orderedCorners[2][0]); corners.put("brY", orderedCorners[2][1]);
                corners.put("blX", orderedCorners[3][0]); corners.put("blY", orderedCorners[3][1]);
                result.put("corners", corners);
            }
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "[CardBoundaryPng] error: " + e.getMessage());
            call.reject("detectCardBoundaryFromPng failed: " + e.getMessage());
        }
    }

    // ============================================================
    // Edge Detection 알고리즘 (변경 없음)
    // ============================================================

    private float[] gaussianBlur(byte[] yBytes, int width, int height, int kernelSize, float sigma) {
        float[] kernel = makeGaussianKernel(kernelSize, sigma);
        int half = kernelSize / 2;
        float[] out = new float[width * height];
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                float sum = 0f, wSum = 0f;
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
        for (int i = 0; i < kernel.length; i++) kernel[i] /= sum;
        return kernel;
    }

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

    private float[] nonMaximumSuppression(float[] magnitude, float[] direction, int width, int height) {
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

    private byte[] applyDoubleThreshold(float[] suppressed, int width, int height, float lowT, float highT) {
        byte[] edgeMap = new byte[width * height];
        for (int i = 0; i < suppressed.length; i++) {
            if      (suppressed[i] >= highT) edgeMap[i] = 2;
            else if (suppressed[i] >= lowT)  edgeMap[i] = 1;
            else                             edgeMap[i] = 0;
        }
        return edgeMap;
    }

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
        for (int i = 0; i < edgeMap.length; i++) {
            if (edgeMap[i] == 1) edgeMap[i] = 0;
        }
    }

    private void morphologicalClosing(byte[] edgeMap, int width, int height) {
        byte[] dilated = new byte[width * height];
        for (int row = 1; row < height - 1; row++) {
            for (int col = 1; col < width - 1; col++) {
                boolean hasEdge = false;
                outer:
                for (int dr = -1; dr <= 1; dr++) {
                    for (int dc = -1; dc <= 1; dc++) {
                        if (edgeMap[(row+dr)*width+(col+dc)] == 2) {
                            hasEdge = true;
                            break outer;
                        }
                    }
                }
                dilated[row*width+col] = hasEdge ? (byte)2 : (byte)0;
            }
        }
        byte[] eroded = new byte[width * height];
        for (int row = 1; row < height - 1; row++) {
            for (int col = 1; col < width - 1; col++) {
                boolean allEdge = true;
                outer:
                for (int dr = -1; dr <= 1; dr++) {
                    for (int dc = -1; dc <= 1; dc++) {
                        if (dilated[(row+dr)*width+(col+dc)] != 2) {
                            allEdge = false;
                            break outer;
                        }
                    }
                }
                eroded[row*width+col] = allEdge ? (byte)2 : (byte)0;
            }
        }
        System.arraycopy(eroded, 0, edgeMap, 0, edgeMap.length);
    }

    // ============================================================
    // Contour + Quadrilateral (변경 없음)
    // ============================================================

    private java.util.List<int[]> traceContours(byte[] edgeMap, int width, int height) {
        java.util.List<int[]> contours = new java.util.ArrayList<>();
        boolean[] visited = new boolean[width * height];

        for (int row = 1; row < height - 1; row++) {
            for (int col = 1; col < width - 1; col++) {
                int idx = row * width + col;
                if (edgeMap[idx] == 2 && !visited[idx]) {
                    java.util.List<int[]> points = new java.util.ArrayList<>();
                    java.util.Queue<int[]> queue = new java.util.LinkedList<>();
                    queue.add(new int[]{col, row});
                    visited[idx] = true;

                    while (!queue.isEmpty()) {
                        int[] p = queue.poll();
                        points.add(p);
                        int px = p[0], py = p[1];
                        for (int dr = -1; dr <= 1; dr++) {
                            for (int dc = -1; dc <= 1; dc++) {
                                if (dr == 0 && dc == 0) continue;
                                int nr = py + dr, nc = px + dc;
                                if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
                                int nIdx = nr * width + nc;
                                if (edgeMap[nIdx] == 2 && !visited[nIdx]) {
                                    visited[nIdx] = true;
                                    queue.add(new int[]{nc, nr});
                                }
                            }
                        }
                    }

                    if (points.size() >= 20) {
                        int[] flat = new int[points.size() * 2];
                        for (int i = 0; i < points.size(); i++) {
                            flat[i * 2]     = points.get(i)[0];
                            flat[i * 2 + 1] = points.get(i)[1];
                        }
                        contours.add(flat);
                    }
                }
            }
        }
        Log.d(TAG, "[Contour] total=" + contours.size());
        return contours;
    }

    private java.util.List<int[]> approximatePolygonDouglasPeucker(int[] points, double epsilon) {
        if (points.length < 4) return new java.util.ArrayList<>();
        int n = points.length / 2;
        boolean[] keep = new boolean[n];
        keep[0] = true;
        keep[n - 1] = true;
        dpRecursive(points, 0, n - 1, epsilon, keep);
        java.util.List<int[]> result = new java.util.ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (keep[i]) result.add(new int[]{points[i * 2], points[i * 2 + 1]});
        }
        return result;
    }

    private void dpRecursive(int[] points, int start, int end, double epsilon, boolean[] keep) {
        if (end <= start + 1) return;
        int x1 = points[start * 2], y1 = points[start * 2 + 1];
        int x2 = points[end   * 2], y2 = points[end   * 2 + 1];
        double lineLen = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));

        double maxDist = 0;
        int maxIdx = start;
        for (int i = start + 1; i < end; i++) {
            int px = points[i * 2], py = points[i * 2 + 1];
            double dist;
            if (lineLen < 1e-6) {
                dist = Math.sqrt((px-x1)*(px-x1) + (py-y1)*(py-y1));
            } else {
                dist = Math.abs((y2-y1)*px - (x2-x1)*py + x2*y1 - y2*x1) / lineLen;
            }
            if (dist > maxDist) { maxDist = dist; maxIdx = i; }
        }

        if (maxDist > epsilon) {
            keep[maxIdx] = true;
            dpRecursive(points, start, maxIdx, epsilon, keep);
            dpRecursive(points, maxIdx, end, epsilon, keep);
        }
    }

    private java.util.List<int[][]> findQuadrilateralCandidates(
            java.util.List<int[]> contours, int width, int height) {

        java.util.List<int[][]> quads = new java.util.ArrayList<>();
        double EPSILON_RATIO = 0.04;
        double frameArea = (double) width * height;
        double minAreaRatio = 0.05;
        double minArea = frameArea * minAreaRatio;

        java.util.List<int[]> sorted = new java.util.ArrayList<>(contours);
        sorted.sort((a, b) -> {
            double areaA = 0, areaB = 0;
            for (int i = 0; i < a.length/2; i++) {
                int j = (i+1) % (a.length/2);
                areaA += Math.abs(a[i*2]*(double)a[j*2+1] - a[j*2]*(double)a[i*2+1]);
            }
            for (int i = 0; i < b.length/2; i++) {
                int j = (i+1) % (b.length/2);
                areaB += Math.abs(b[i*2]*(double)b[j*2+1] - b[j*2]*(double)b[i*2+1]);
            }
            return Double.compare(areaB/2, areaA/2);
        });

        int diagLimit = Math.min(10, sorted.size());
        for (int idx = 0; idx < sorted.size(); idx++) {
            int[] contour = sorted.get(idx);
            int n = contour.length / 2;

            double perimeter = 0;
            for (int i = 0; i < n; i++) {
                int next = (i + 1) % n;
                int dx = contour[next*2] - contour[i*2];
                int dy = contour[next*2+1] - contour[i*2+1];
                perimeter += Math.sqrt(dx*dx + dy*dy);
            }

            double area = 0;
            for (int i = 0; i < n; i++) {
                int j = (i + 1) % n;
                area += contour[i*2] * (double)contour[j*2+1];
                area -= contour[j*2] * (double)contour[i*2+1];
            }
            area = Math.abs(area) / 2.0;
            double areaRatio = area / frameArea;

            double epsilon = EPSILON_RATIO * perimeter;
            java.util.List<int[]> approx = approximatePolygonDouglasPeucker(contour, epsilon);

            if (idx < diagLimit) {
                Log.d(TAG, "[CardBoundary-2B-Contour] index=" + idx
                    + " pointCount=" + n
                    + " area=" + (int)area
                    + " areaRatio=" + String.format("%.4f", areaRatio)
                    + " perimeter=" + (int)perimeter
                    + " epsilon=" + String.format("%.1f", epsilon)
                    + " approxVertexCount=" + approx.size());
            }

            String rejectReason = null;
            if (area < minArea) {
                rejectReason = "AREA_TOO_SMALL(area=" + (int)area + " min=" + (int)minArea + ")";
            } else if (approx.size() < 4) {
                rejectReason = "APPROX_VERTEX_LT4(approxSize=" + approx.size() + ")";
            } else if (approx.size() > 4) {
                rejectReason = "APPROX_VERTEX_GT4(approxSize=" + approx.size() + ")";
            }

            if (rejectReason != null) {
                if (idx < diagLimit) {
                    Log.d(TAG, "[CardBoundary-2B-Reject] index=" + idx + " reason=" + rejectReason);
                }
                continue;
            }

            int[][] quad = new int[4][2];
            for (int i = 0; i < 4; i++) {
                quad[i][0] = approx.get(i)[0];
                quad[i][1] = approx.get(i)[1];
            }
            quads.add(quad);
            Log.d(TAG, "[Quad] found area=" + (int)area
                + " perimeter=" + (int)perimeter
                + " areaRatio=" + String.format("%.4f", areaRatio));
        }
        Log.d(TAG, "[Quad] candidates=" + quads.size());
        return quads;
    }

    private int[][] orderCorners(int[][] quad) {
        int[][] ordered = new int[4][2];
        int[] sumArr  = new int[4];
        int[] diffArr = new int[4];
        for (int i = 0; i < 4; i++) {
            sumArr[i]  = quad[i][0] + quad[i][1];
            diffArr[i] = quad[i][1] - quad[i][0];
        }
        int tlIdx = 0;
        for (int i = 1; i < 4; i++) if (sumArr[i] < sumArr[tlIdx]) tlIdx = i;
        ordered[0] = quad[tlIdx];
        int brIdx = 0;
        for (int i = 1; i < 4; i++) if (sumArr[i] > sumArr[brIdx]) brIdx = i;
        ordered[2] = quad[brIdx];
        int trIdx = 0;
        for (int i = 1; i < 4; i++) if (diffArr[i] < diffArr[trIdx]) trIdx = i;
        ordered[1] = quad[trIdx];
        int blIdx = 0;
        for (int i = 1; i < 4; i++) if (diffArr[i] > diffArr[blIdx]) blIdx = i;
        ordered[3] = quad[blIdx];
        return ordered;
    }

    private double dist(int[] a, int[] b) {
        int dx = a[0] - b[0];
        int dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ============================================================
    // 기존 유틸 (변경 없음)
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
