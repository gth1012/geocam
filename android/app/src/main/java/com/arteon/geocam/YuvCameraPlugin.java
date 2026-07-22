package com.arteon.geocam;

// [한글 주석] LT-AUTOCAP-002 v1.2 - 2026-07-22 짱아
// 변경 이력:
//   - detectCardBoundaryOpenCV() 삭제: Canny+컨투어 방식, "STEP 4-B-2 판정 미연결"로
//     항상 false 반환하던 죽은 코드였음 (자동촬영이 영원히 안 되던 근본 원인)
//   - detectCardBoundary(), detectCardBoundaryFromPng() 삭제: JS 어디서도 호출 안 되는
//     완전한 죽은 코드로 확인됨 (grep 결과 인터페이스 선언조차 없음)
//   - startYuvAnalysis/bindYuvAnalysis/captureYuvFrame/stopYuvAnalysis 삭제:
//     CameraScreen.tsx v4.8이 startPreview/stopPreview/capturePhotoFile만 사용,
//     이 구버전 YUV 경로는 인터페이스 선언은 있으나 아무도 호출 안 함
//   - OpenCV 의존성 전체 제거 (컨투어 로직 삭제로 더 이상 불필요)
//   - 신규: 밝기 체크 / 포커스(Laplacian 분산) 체크 - 완전 신규 구현
//   - 개선: checkLockStability() - 기존엔 프레임 중앙 가로띠만 봤으나,
//     가이드박스 영역(setGuideBox로 전달받은 좌표) 내부로 샘플링 범위 변경
//   - 핵심 원칙: 이 플러그인은 "촬영품질(밝기/초점/안정성)"만 판단한다.
//     "GeoCode 존재여부"는 절대 판단하지 않는다 (서버 GEO-DETECT-CIRCLE-V7-KES 전담,
//     제니팀장 2026-07-22 피드백 반영)

import android.util.Log;
import android.util.Rational;

import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.core.UseCaseGroup;
import androidx.camera.core.ViewPort;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.ProcessLifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "YuvCamera")
public class YuvCameraPlugin extends Plugin {

    private static final String TAG = "YuvCameraPlugin";
    private ExecutorService cameraExecutor;
    private ImageAnalysis imageAnalysis;

    // GCS-CAMERA-UNIFIED-001: 촬영 세션 (startPreview/stopPreview/capturePhotoFile 전용)
    private ProcessCameraProvider previewCameraProvider;
    private ImageCapture unifiedImageCapture;

    // GCS-AUTO-CAPTURE-001: 자동촬영 상태
    private boolean autoCaptureNotified = false;

    // [한글 주석] 모션안정성 상태 (checkMotionStability에서 사용, 가이드박스 영역 기준)
    private static final int LOCK_STABLE_FRAMES = 5; // ⚠️ 잠정치, 실측 후 조정
    private int stableFrameCount = 0;
    private float prevGuideMeanY = -1f;
    private boolean lockStable = false;

    // [한글 주석] 신규 게이트 임계값 - 전부 잠정치, 실물 촬영 데이터로 실측 후 확정 필요
    private static final float BRIGHTNESS_MIN = 30f;   // ⚠️ 잠정치
    private static final float BRIGHTNESS_MAX = 220f;  // ⚠️ 잠정치
    private static final float FOCUS_MIN_VARIANCE = 60f; // ⚠️ 잠정치 (Laplacian 분산 기준)
    private static final int   SAMPLE_STEP = 2; // 성능을 위해 격자 2px 간격 샘플링

    // GCS-AUTO-CAPTURE-001: 가이드박스 (JS → Java, volatile: 플러그인 스레드 쓰기 / 분석 스레드 읽기)
    private volatile float previewViewWidth  = 0f;
    private volatile float previewViewHeight = 0f;
    private volatile float guideBoxX         = 0f;
    private volatile float guideBoxY         = 0f;
    private volatile float guideBoxWidth     = 0f;
    private volatile float guideBoxHeight    = 0f;

    @Override
    public void load() {
        cameraExecutor = Executors.newSingleThreadExecutor();
        // [한글 주석] OpenCV 초기화 제거됨 (컨투어 로직 삭제로 더 이상 불필요, LT-AUTOCAP-002 v1.2)
    }

    // ============================================================
    // startPreview: Preview + ImageCapture + ImageAnalysis + ViewPort
    // (변경 없음 - LT-AUTOCAP-002 영향 없는 영역)
    // ============================================================
    @PluginMethod
    public void startPreview(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                MainActivity activity = (MainActivity) getActivity();
                PreviewView previewView = activity.getCameraPreviewView();
                if (previewView == null) {
                    call.reject("startPreview: PreviewView not found");
                    return;
                }

                Runnable bindCamera = () -> {
                    try {
                        previewCameraProvider = ProcessCameraProvider.getInstance(getContext()).get();
                        previewCameraProvider.unbindAll();

                        // 자동촬영 상태 리셋
                        autoCaptureNotified = false;
                        stableFrameCount = 0;
                        prevGuideMeanY = -1f;
                        lockStable = false;

                        // 1. Preview UseCase
                        Preview preview = new Preview.Builder().build();
                        preview.setSurfaceProvider(previewView.getSurfaceProvider());

                        // 2. ImageCapture UseCase
                        unifiedImageCapture = new ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                            .build();

                        // 3. ImageAnalysis UseCase (자동촬영 품질게이트용)
                        imageAnalysis = new ImageAnalysis.Builder()
                            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build();
                        imageAnalysis.setAnalyzer(cameraExecutor, this::analyzeFrame);

                        // 4. ViewPort
                        int pvW = previewView.getWidth();
                        int pvH = previewView.getHeight();
                        int rotation = previewView.getDisplay() != null
                            ? previewView.getDisplay().getRotation()
                            : android.view.Surface.ROTATION_0;

                        ViewPort viewPort = new ViewPort.Builder(
                            new Rational(pvW, pvH), rotation
                        ).build();

                        // 5. UseCaseGroup
                        UseCaseGroup useCaseGroup = new UseCaseGroup.Builder()
                            .addUseCase(preview)
                            .addUseCase(unifiedImageCapture)
                            .addUseCase(imageAnalysis)
                            .setViewPort(viewPort)
                            .build();

                        previewCameraProvider.bindToLifecycle(
                            ProcessLifecycleOwner.get(),
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            useCaseGroup
                        );

                        Log.d(TAG, "[startPreview] 바인딩 완료 viewPort=" + pvW + "x" + pvH);

                        JSObject result = new JSObject();
                        result.put("started", true);
                        result.put("viewPortW", pvW);
                        result.put("viewPortH", pvH);
                        call.resolve(result);

                    } catch (Exception e) {
                        Log.e(TAG, "[startPreview] 바인딩 실패: " + e.getMessage());
                        call.reject("startPreview bind failed: " + e.getMessage());
                    }
                };

                activity.showCameraPreview();

                if (previewView.getWidth() > 0 && previewView.getHeight() > 0) {
                    Log.d(TAG, "[startPreview] 크기 확정 즉시 바인딩: "
                        + previewView.getWidth() + "x" + previewView.getHeight());
                    ProcessCameraProvider.getInstance(getContext()).addListener(
                        bindCamera, ContextCompat.getMainExecutor(getContext()));
                } else {
                    Log.d(TAG, "[startPreview] 크기 미확정 → OnGlobalLayoutListener 대기");
                    previewView.getViewTreeObserver().addOnGlobalLayoutListener(
                        new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                            @Override
                            public void onGlobalLayout() {
                                if (previewView.getWidth() > 0 && previewView.getHeight() > 0) {
                                    previewView.getViewTreeObserver().removeOnGlobalLayoutListener(this);
                                    Log.d(TAG, "[startPreview] 레이아웃 확정: "
                                        + previewView.getWidth() + "x" + previewView.getHeight());
                                    ProcessCameraProvider.getInstance(getContext()).addListener(
                                        bindCamera, ContextCompat.getMainExecutor(getContext()));
                                }
                            }
                        }
                    );
                }

            } catch (Exception e) {
                Log.e(TAG, "[startPreview] error: " + e.getMessage());
                call.reject("startPreview error: " + e.getMessage());
            }
        });
    }

    // ============================================================
    // stopPreview (변경 없음)
    // ============================================================
    @PluginMethod
    public void stopPreview(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (previewCameraProvider != null) {
                    previewCameraProvider.unbindAll();
                    previewCameraProvider = null;
                }
                unifiedImageCapture = null;
                autoCaptureNotified = false;

                MainActivity activity = (MainActivity) getActivity();
                activity.hideCameraPreview();

                Log.d(TAG, "[stopPreview] 바인딩 해제 완료");
                JSObject result = new JSObject();
                result.put("stopped", true);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "[stopPreview] error: " + e.getMessage());
                call.reject("stopPreview error: " + e.getMessage());
            }
        });
    }

    // ============================================================
    // capturePhotoFile (변경 없음)
    // ============================================================
    @PluginMethod
    public void capturePhotoFile(PluginCall call) {
        if (unifiedImageCapture == null) {
            call.reject("capturePhotoFile: ImageCapture not ready. startPreview() 먼저 호출 필요");
            return;
        }

        final ImageCapture imageCapture = unifiedImageCapture;
        File outputDir  = getContext().getCacheDir();
        File outputFile = new File(outputDir, "geo_capture_" + System.currentTimeMillis() + ".jpg");

        ImageCapture.OutputFileOptions outputOptions =
            new ImageCapture.OutputFileOptions.Builder(outputFile).build();

        Log.d(TAG, "[capturePhotoFile] takePicture 시작 (unified session)");

        getActivity().runOnUiThread(() -> {
            imageCapture.takePicture(
                outputOptions,
                ContextCompat.getMainExecutor(getContext()),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                        try {
                            long fileSize = outputFile.length();
                            String absolutePath = outputFile.getAbsolutePath();
                            String uri = outputFileResults.getSavedUri() != null
                                ? outputFileResults.getSavedUri().toString()
                                : "file://" + absolutePath;

                            android.graphics.BitmapFactory.Options opts =
                                new android.graphics.BitmapFactory.Options();
                            opts.inJustDecodeBounds = true;
                            android.graphics.BitmapFactory.decodeFile(absolutePath, opts);
                            int jpegWidth  = opts.outWidth;
                            int jpegHeight = opts.outHeight;

                            int exifRotation = 0;
                            try {
                                androidx.exifinterface.media.ExifInterface exif =
                                    new androidx.exifinterface.media.ExifInterface(absolutePath);
                                int orientation = exif.getAttributeInt(
                                    androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
                                    androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL);
                                if (orientation == androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90)  exifRotation = 90;
                                else if (orientation == androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180) exifRotation = 180;
                                else if (orientation == androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270) exifRotation = 270;
                            } catch (Exception ex) {
                                Log.w(TAG, "[capturePhotoFile] EXIF read failed: " + ex.getMessage());
                            }

                            Log.d(TAG, "[capturePhotoFile] SAVED"
                                + " path=" + absolutePath
                                + " size=" + fileSize
                                + " jpegW=" + jpegWidth
                                + " jpegH=" + jpegHeight
                                + " exifRotation=" + exifRotation);

                            androidx.camera.core.ResolutionInfo resInfo = imageCapture.getResolutionInfo();
                            if (resInfo != null) {
                                Log.d("GCS_CROP_FACT", "cropRect=" + resInfo.getCropRect()
                                    + ", resolution=" + resInfo.getResolution()
                                    + ", rotation=" + resInfo.getRotationDegrees());
                            } else {
                                Log.d("GCS_CROP_FACT", "resolutionInfo=null");
                            }

                            JSObject result = new JSObject();
                            result.put("path",         absolutePath);
                            result.put("uri",          uri);
                            result.put("size",         fileSize);
                            result.put("mimeType",     "image/jpeg");
                            result.put("width",        jpegWidth);
                            result.put("height",       jpegHeight);
                            result.put("exifRotation", exifRotation);
                            call.resolve(result);

                        } catch (Exception e) {
                            Log.e(TAG, "[capturePhotoFile] result error: " + e.getMessage());
                            call.reject("capturePhotoFile result error: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException exception) {
                        Log.e(TAG, "[capturePhotoFile] takePicture ERROR: " + exception.getMessage());
                        call.reject("capturePhotoFile takePicture failed: " + exception.getMessage());
                    }
                }
            );
        });
    }

    // ============================================================
    // analyzeFrame: LT-AUTOCAP-002 v1.2 신규 3중게이트
    // (1)밝기 AND (2)포커스 AND (3)모션안정 → 전부 통과 시에만 autoCaptureReady
    // ============================================================
    private void analyzeFrame(@NonNull ImageProxy image) {
        try {
            int frameW = image.getWidth();
            int frameH = image.getHeight();
            int rotationDegrees = image.getImageInfo().getRotationDegrees();

            // [한글 주석] 가이드박스 → 프레임 좌표 변환 (기존 STEP A/B 로직 재사용)
            int[] guideRect = computeGuideRectInFrame(frameW, frameH, rotationDegrees);
            if (guideRect == null) {
                // 가이드박스 미설정 시 게이트 판단 불가, 대기
                return;
            }

            ImageProxy.PlaneProxy yPlane = image.getPlanes()[0];
            ByteBuffer yBuf = yPlane.getBuffer().duplicate();
            int rowStride   = yPlane.getRowStride();
            int pixelStride = yPlane.getPixelStride();

            // [한글 주석] 가이드박스 영역 내부 샘플링 (밝기+포커스+안정성 한번에 계산)
            GateSampleResult sample = sampleGuideRegion(
                yBuf, rowStride, pixelStride, guideRect, frameW, frameH);

            boolean brightnessOk = sample.meanY >= BRIGHTNESS_MIN && sample.meanY <= BRIGHTNESS_MAX;
            boolean focusOk      = sample.laplacianVariance >= FOCUS_MIN_VARIANCE;
            boolean motionOk     = updateMotionStability(sample.meanY);

            if (DebugFlags.CROP_LOG) {
                Log.d("GeoCamAuto", "[QUALITY_GATE]"
                    + " brightness=" + String.format("%.1f", sample.meanY) + "(" + brightnessOk + ")"
                    + " focusVar=" + String.format("%.1f", sample.laplacianVariance) + "(" + focusOk + ")"
                    + " motionStable=" + motionOk
                    + " guideRect=" + guideRect[0] + "," + guideRect[1] + "," + guideRect[2] + "," + guideRect[3]);
            }

            if (brightnessOk && focusOk && motionOk && !autoCaptureNotified) {
                autoCaptureNotified = true;
                JSObject result = new JSObject();
                result.put("qualityReady", true);
                notifyListeners("autoCaptureReady", result);
                Log.d(TAG, "[AUTO-CAPTURE] autoCaptureReady 전달 (품질게이트 3종 통과)");
            }
        } catch (Exception e) {
            Log.e(TAG, "analyzeFrame error: " + e.getMessage());
        } finally {
            image.close();
        }
    }

    // ============================================================
    // computeGuideRectInFrame: JS 가이드박스 좌표 → 프레임(Y플레인) 좌표 변환
    // (기존 detectCardBoundaryOpenCV STEP A/B 로직 그대로 유지, 컨투어 부분만 제거)
    // 반환: {left, top, width, height} 또는 가이드박스 미설정 시 null
    // ============================================================
    private int[] computeGuideRectInFrame(int frameW, int frameH, int rotationDegrees) {
        float pvW = previewViewWidth;
        float pvH = previewViewHeight;
        float jsX = guideBoxX;
        float jsY = guideBoxY;
        float jsW = guideBoxWidth;
        float jsH = guideBoxHeight;

        if (pvW <= 0f || pvH <= 0f || jsW <= 0f || jsH <= 0f) {
            return null;
        }

        float rotatedFrameW, rotatedFrameH;
        if (rotationDegrees == 90 || rotationDegrees == 270) {
            rotatedFrameW = frameH;
            rotatedFrameH = frameW;
        } else {
            rotatedFrameW = frameW;
            rotatedFrameH = frameH;
        }

        float scale       = Math.max(pvW / rotatedFrameW, pvH / rotatedFrameH);
        float cropOffsetX = (rotatedFrameW * scale - pvW) / 2f;
        float cropOffsetY = (rotatedFrameH * scale - pvH) / 2f;

        float rotGuideX = (jsX + cropOffsetX) / scale;
        float rotGuideY = (jsY + cropOffsetY) / scale;
        float rotGuideW = jsW / scale;
        float rotGuideH = jsH / scale;

        float aLeft, aTop, aWidth, aHeight;
        if (rotationDegrees == 90) {
            aLeft   = rotGuideY;
            aTop    = rotatedFrameW - rotGuideX - rotGuideW;
            aWidth  = rotGuideH;
            aHeight = rotGuideW;
        } else if (rotationDegrees == 270) {
            aLeft   = rotatedFrameH - rotGuideY - rotGuideH;
            aTop    = rotGuideX;
            aWidth  = rotGuideH;
            aHeight = rotGuideW;
        } else {
            aLeft   = rotGuideX;
            aTop    = rotGuideY;
            aWidth  = rotGuideW;
            aHeight = rotGuideH;
        }

        int left   = Math.max(0, Math.round(aLeft));
        int top    = Math.max(0, Math.round(aTop));
        int width  = Math.min(frameW - left, Math.round(aWidth));
        int height = Math.min(frameH - top,  Math.round(aHeight));

        return new int[]{ left, top, width, height };
    }

    // [한글 주석] 샘플링 결과 묶음 (밝기평균 + Laplacian분산)
    private static class GateSampleResult {
        float meanY;
        float laplacianVariance;
    }

    // ============================================================
    // sampleGuideRegion: 가이드박스 영역 내부에서 밝기평균 + 포커스(Laplacian분산) 계산
    // 성능을 위해 SAMPLE_STEP 간격으로 격자 샘플링
    // ============================================================
    private GateSampleResult sampleGuideRegion(
        ByteBuffer yBuf, int rowStride, int pixelStride,
        int[] guideRect, int frameW, int frameH
    ) {
        int left = guideRect[0], top = guideRect[1], w = guideRect[2], h = guideRect[3];
        int right  = Math.min(frameW - 2, left + w);
        int bottom = Math.min(frameH - 2, top + h);
        int startX = Math.max(1, left);
        int startY = Math.max(1, top);

        long sumY = 0;
        long sumLapSq = 0;
        long sumLap = 0;
        int count = 0;

        for (int y = startY; y < bottom; y += SAMPLE_STEP) {
            for (int x = startX; x < right; x += SAMPLE_STEP) {
                int idxC = y * rowStride + x * pixelStride;
                int idxL = y * rowStride + (x - 1) * pixelStride;
                int idxR = y * rowStride + (x + 1) * pixelStride;
                int idxU = (y - 1) * rowStride + x * pixelStride;
                int idxD = (y + 1) * rowStride + x * pixelStride;

                if (idxD >= yBuf.capacity() || idxR >= yBuf.capacity()) continue;

                int c = yBuf.get(idxC) & 0xFF;
                int l = yBuf.get(idxL) & 0xFF;
                int r = yBuf.get(idxR) & 0xFF;
                int u = yBuf.get(idxU) & 0xFF;
                int d = yBuf.get(idxD) & 0xFF;

                int lap = 4 * c - l - r - u - d; // 이산 라플라시안 (블러 검출용)

                sumY   += c;
                sumLap += lap;
                sumLapSq += (long) lap * lap;
                count++;
            }
        }

        GateSampleResult result = new GateSampleResult();
        if (count == 0) {
            result.meanY = 0f;
            result.laplacianVariance = 0f;
            return result;
        }

        result.meanY = (float) sumY / count;
        float lapMean = (float) sumLap / count;
        // 분산 = E[X^2] - (E[X])^2
        result.laplacianVariance = ((float) sumLapSq / count) - (lapMean * lapMean);
        return result;
    }

    // ============================================================
    // updateMotionStability: 가이드박스 영역 밝기평균의 프레임간 변화로 안정 여부 판단
    // (기존 checkLockStability를 가이드박스 기준으로 개선. 원리는 동일: 연속 N프레임
    //  변화량이 임계 미만이면 안정으로 판단)
    // ============================================================
    private boolean updateMotionStability(float currentMeanY) {
        if (prevGuideMeanY >= 0) {
            float variance = Math.abs(currentMeanY - prevGuideMeanY);
            if (variance < 2.0f) { // ⚠️ 잠정치, 기존 checkLockStability 값 그대로 유지
                stableFrameCount++;
                if (stableFrameCount >= LOCK_STABLE_FRAMES) {
                    lockStable = true;
                }
            } else {
                stableFrameCount = 0;
                lockStable = false;
            }
        }
        prevGuideMeanY = currentMeanY;
        return lockStable;
    }

    // GCS-AUTO-CAPTURE-001: JS에서 가이드박스 좌표 전달 (변경 없음)
    @PluginMethod
    public void setGuideBox(PluginCall call) {
        float previewW = call.getFloat("previewW", 0f);
        float previewH = call.getFloat("previewH", 0f);
        float guideX   = call.getFloat("guideX",   0f);
        float guideY   = call.getFloat("guideY",   0f);
        float guideW   = call.getFloat("guideW",   0f);
        float guideH   = call.getFloat("guideH",   0f);

        if (previewW <= 0f || previewH <= 0f || guideW <= 0f || guideH <= 0f) {
            Log.w("GeoCamAuto",
                "[SET_GUIDE_BOX_FAIL] " +
                "preview=" + previewW + "x" + previewH +
                " guide=" + guideX + "," + guideY + "," + guideW + "," + guideH);
            call.reject("Invalid guide box values");
            return;
        }

        this.previewViewWidth  = previewW;
        this.previewViewHeight = previewH;
        this.guideBoxX         = guideX;
        this.guideBoxY         = guideY;
        this.guideBoxWidth     = guideW;
        this.guideBoxHeight    = guideH;

        Log.d("GeoCamAuto",
            "[SET_GUIDE_BOX_OK] " +
            "preview=" + previewW + "x" + previewH +
            " guide=" + guideX + "," + guideY + "," + guideW + "," + guideH);

        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (cameraExecutor != null) cameraExecutor.shutdown();
    }

    // [한글 주석] 디버그 로그 on/off 플래그 (기존 DEBUG_CROP_LOG 대체)
    private static class DebugFlags {
        static final boolean CROP_LOG = true;
    }
}
