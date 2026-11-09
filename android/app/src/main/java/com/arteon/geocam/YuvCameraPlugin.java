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
import java.util.Arrays;
import android.os.SystemClock;
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
import androidx.camera.core.Camera;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.FocusMeteringResult;
import com.google.common.util.concurrent.ListenableFuture;

@CapacitorPlugin(name = "YuvCamera")
public class YuvCameraPlugin extends Plugin {

    private static final String TAG = "YuvCameraPlugin";
    // 1235: serialize quality snapshots, permit consumption and config changes.
    private final Object captureGateLock = new Object();
    private String captureSession = java.util.UUID.randomUUID().toString();
    private String capturePermit = "";
    private long permitAtMs, permitCornerEpoch, qualityAtMs;
    private long qualityCornerEpoch = -1;
    private boolean qualityReady, captureSubmitted;
    private String focusedPermit = "";
    private long focusSucceededAt;
    static boolean focusPermitValid(String requested, String focused, long now, long succeeded) {
        return requested != null && !requested.isEmpty() && requested.equals(focused)
            && now >= succeeded && now - succeeded < 2250;
    }
    // AF completion never extends the old 250 ms capture permit.
    private void awaitFocusedQuality(PluginCall call, Camera camera, String original,
            long epoch, long succeeded, JSObject result) {
        synchronized (captureGateLock) {
            long now = SystemClock.elapsedRealtime();
            long[] corner = cornerPocTracker == null ? null : cornerPocTracker.captureState(now);
            boolean same = camera == previewCamera && !captureSubmitted
                && original.equals(capturePermit) && corner != null && corner[0] == epoch && tiltOk;
            if (!same || now - succeeded >= 2000) {
                result.put("captureReady", false);
                result.put("reason", same ? "POST_AF_QUALITY_TIMEOUT" : "POST_AF_CONDITIONS_CHANGED");
                Log.i(TAG, "[AF_CAPTURE_GATE] " + result.toString());
                camera.getCameraControl().cancelFocusAndMetering();
                call.resolve(result); return;
            }
            if (qualityReady && qualityCornerEpoch == epoch && qualityAtMs > succeeded
                    && now >= qualityAtMs && now - qualityAtMs < 250 && corner[1] > succeeded) {
                capturePermit = captureSession + ":" + java.util.UUID.randomUUID().toString();
                permitAtMs = now; permitCornerEpoch = epoch;
                focusedPermit = capturePermit; focusSucceededAt = succeeded;
                result.put("captureReady", true); result.put("permit", capturePermit);
                Log.i(TAG, "[AF_CAPTURE_GATE] READY qualityAgeMs=" + (now-qualityAtMs));
                call.resolve(result); return;
            }
        }
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
            () -> awaitFocusedQuality(call, camera, original, epoch, succeeded, result), 40);
    }
    private void resetCaptureSession() {
        synchronized (captureGateLock) {
            captureSession = java.util.UUID.randomUUID().toString();
            focusedPermit = ""; focusSucceededAt = 0;
            capturePermit = ""; qualityReady = false; qualityAtMs = 0;
            captureSubmitted = false; autoCaptureNotified = false;
            tiltHoldStartMs = 0; lastAnalysisMs = 0; observedCornerEpoch = -1;
        }
    }
    // Pure checks are exercised by the accompanying JVM regression runner.
    static boolean permitValid(String requested, String current, long now,
            long issuedAt, long sampledAt, boolean ready, boolean tilt,
            boolean submitted, long expectedEpoch, long qualityEpoch, long[] corner) {
        return requested != null && !requested.isEmpty() && requested.equals(current)
            && !submitted && ready && tilt && now >= issuedAt && now-issuedAt < 250
            && now >= sampledAt && now-sampledAt < 250 && corner != null
            && expectedEpoch == qualityEpoch && corner[0] == expectedEpoch;
    }
    @PluginMethod
    public void rearmAutoCapture(PluginCall call) {
        synchronized (captureGateLock) {
            if (!captureSubmitted && capturePermit.equals(call.getString("permit", ""))) {
                capturePermit = ""; autoCaptureNotified = false;
            }
        }
        call.resolve();
    }

    static String captureFileSha256(java.io.File file) throws Exception {
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        try (java.io.InputStream in = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return hex.toString();
    }
    @PluginMethod
    public void recordCaptureTrace(PluginCall call) {
        String stage = call.getString("stage", "");
        String captureId = call.getString("captureId", "");
        String savedHash = call.getString("savedSha256", "");
        String readHash = call.getString("readSha256", "");
        if (!(stage.equals("UPLOAD_READY") || stage.equals("SERVER_RESPONSE"))
                || !captureId.matches("geo_capture_[0-9]+\\.jpg")
                || !savedHash.matches("[0-9a-f]{64}") || !readHash.matches("[0-9a-f]{64}")) {
            call.reject("INVALID_CAPTURE_TRACE"); return;
        }
        JSObject record = new JSObject();
        record.put("stage", stage); record.put("captureId", captureId);
        record.put("savedSha256", savedHash); record.put("readSha256", readHash);
        record.put("hashesMatch", savedHash.equals(readHash));
        String requestId = call.getString("requestId", "");
        if (requestId.matches("[0-9a-fA-F-]{36}")) record.put("requestId", requestId);
        if (stage.equals("SERVER_RESPONSE")) {
            String serverHash = call.getString("serverSha256", "");
            boolean present = serverHash != null && serverHash.matches("[0-9a-fA-F]{64}");
            record.put("serverHashReported", present);
            if (present) {
                record.put("serverSha256", serverHash.toLowerCase(java.util.Locale.ROOT));
                record.put("clientServerHashesMatch", readHash.equalsIgnoreCase(serverHash));
            }
            record.put("serverHashSource", "SERVER_RESPONSE_NOT_INDEPENDENT_R2_READ");
        }
        // Record only bounded diagnostic fields, never the image or full server response.
        Log.i(TAG, "[CAPTURE_BYTES] " + record.toString());
        captureDiagnostics.trace(record);
        call.resolve();
    }

    private CaptureDiagnostics captureDiagnostics;
    private ExecutorService cameraExecutor;
    private CornerPocTracker cornerPocTracker;
    private ImageAnalysis imageAnalysis;

    // GCS-CAMERA-UNIFIED-001: 촬영 세션 (startPreview/stopPreview/capturePhotoFile 전용)
    private ProcessCameraProvider previewCameraProvider;
    private ImageCapture unifiedImageCapture;

    // GEOCAM-REFACTOR-INTEGRATED-001: AF/AE 초점제어용 카메라 컨트롤 핸들
    private Camera previewCamera;

    // GCS-AUTO-CAPTURE-001: 자동촬영 상태
    private volatile boolean autoCaptureNotified = false;

    // NS-LEGITTAG-AUTOCAPTURE-STEP-A2 STEP3(수정판): JS(devicemotion, ±6도 기준)에서
    // 전달받는 촬영자세 품질값. 카드 위치/경계 판단 아님 - 순수 자세(tilt) 품질게이트.
    // 기본값 false: JS가 최초 tilt 값을 아직 전달하기 전에는 자동촬영 차단.
    private volatile boolean tiltOk = false;

    // GEO-CAM-ARCHITECTURE-001 STEP 3-3: tiltDeg 원본값 + hold timer 관련 필드
    private volatile double latestTiltDeg = Double.NaN;
    private long tiltHoldStartMs = 0L;
    private long lastAnalysisMs = 0L;
    private long observedCornerEpoch = -1L;
    private static final long AUTO_CAPTURE_HOLD_MS = 1000L; // 전체 촬영조건 연속유지 시간 1초

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
        captureDiagnostics = new CaptureDiagnostics(getContext());
        cameraExecutor = Executors.newSingleThreadExecutor();
        cornerPocTracker = new CornerPocTracker(result -> notifyListeners("cornerPoc", result), getContext().getExternalFilesDir("corner_replay"), getContext());
        // [한글 주석] OpenCV 초기화 제거됨 (컨투어 로직 삭제로 더 이상 불필요, LT-AUTOCAP-002 v1.2)
    }

    // ============================================================
    // startPreview: Preview + ImageCapture + ImageAnalysis + ViewPort
    // (변경 없음 - LT-AUTOCAP-002 영향 없는 영역)
    // ============================================================
    @PluginMethod
    public void startPreview(PluginCall call) {
        resetCaptureSession();
        if (cornerPocTracker != null) cornerPocTracker.reset();
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
                        tiltOk = false;
                        tiltHoldStartMs = 0L;
                        stableFrameCount = 0;
                        prevGuideMeanY = -1f;
                        lockStable = false;

                        // 1. Preview UseCase
                        Preview preview = new Preview.Builder().build();
                        preview.setSurfaceProvider(previewView.getSurfaceProvider());

                        // 2. ImageCapture UseCase
                        ImageCapture.Builder captureBuilder = new ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY);
                        // S24 촬영 세션에 HDR 요청값 0 적용. 사진 연결 결과값은 진단 로그로 확인.
                        java.util.List<androidx.camera.core.CameraInfo> backCameras =
                            CameraSelector.DEFAULT_BACK_CAMERA.filter(previewCameraProvider.getAvailableCameraInfos());
                        if (backCameras.isEmpty()) throw new IllegalStateException("TRIAL_NO_BACK_CAMERA");
                        androidx.camera.core.CameraInfo selectedInfo = backCameras.get(0);
                        CameraSelector trialSelector = selectedInfo.getCameraSelector();
                        HdrCaptureProfile trial = new HdrCaptureProfile(getContext(), selectedInfo, captureBuilder);
                        new androidx.camera.camera2.interop.Camera2Interop.Extender<>(captureBuilder)
                            .setSessionCaptureCallback(captureDiagnostics.newBinding(trial));
                        Log.i(TAG, "[PROCESSING_TRIAL] " + trial.info().toString());
                        unifiedImageCapture = captureBuilder.build();

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

                        previewCamera = previewCameraProvider.bindToLifecycle(
                            ProcessLifecycleOwner.get(),
                            trialSelector,
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
        resetCaptureSession();
        if (cornerPocTracker != null) cornerPocTracker.reset();
        getActivity().runOnUiThread(() -> {
            try {
                if (previewCameraProvider != null) {
                    previewCameraProvider.unbindAll();
                    previewCameraProvider = null;
                }
                unifiedImageCapture = null;
                previewCamera = null;
                autoCaptureNotified = false;
                tiltOk = false;
                tiltHoldStartMs = 0L;

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
    // capturePhotoFile: 1235 permit recheck immediately before takePicture
    // ============================================================
    @PluginMethod
    public void capturePhotoFile(PluginCall call) {
        if (unifiedImageCapture == null) {
            call.reject("capturePhotoFile: ImageCapture not ready. startPreview() 먼저 호출 필요");
            return;
        }

        final ImageCapture imageCapture = unifiedImageCapture;
        final String requestedPermit = call.getString("permit", "");
        File outputDir  = getContext().getCacheDir();
        File outputFile = new File(outputDir, "geo_capture_" + System.currentTimeMillis() + ".jpg");

        ImageCapture.OutputFileOptions outputOptions =
            new ImageCapture.OutputFileOptions.Builder(outputFile).build();

        Log.d(TAG, "[capturePhotoFile] takePicture 시작 (unified session)");

        getActivity().runOnUiThread(() -> {
            synchronized (captureGateLock) {
            long now = SystemClock.elapsedRealtime();
            long[] corner = cornerPocTracker == null ? null : cornerPocTracker.captureState(now);
            if (!focusPermitValid(requestedPermit, focusedPermit, now, focusSucceededAt)
                    || imageCapture != unifiedImageCapture || !permitValid(requestedPermit, capturePermit,
                    now, permitAtMs, qualityAtMs, qualityReady, tiltOk, captureSubmitted,
                    permitCornerEpoch, qualityCornerEpoch, corner)) {
                JSObject deferred = new JSObject();
                deferred.put("deferred", true);
                deferred.put("reason", "CAPTURE_CONDITIONS_CHANGED_OR_EXPIRED");
                Log.i(TAG, "[CAPTURE_RECHECK] deferred permit=" + requestedPermit);
                call.resolve(deferred);
                return;
            }
            focusedPermit = "";
            captureSubmitted = true; // one permit can request only one picture
            Log.i(TAG, "[CAPTURE_RECHECK] accepted ageMs=" + (now-permitAtMs)
                + " qualityAgeMs=" + (now-qualityAtMs) + " cornerEpoch=" + corner[0]);
            try {
            captureDiagnostics.begin(outputFile.getName());
            androidx.camera.core.CaptureTimestampPoc.takePicture(
                imageCapture, outputOptions, cameraExecutor,
                ContextCompat.getMainExecutor(getContext()),
                getContext().getExternalFilesDir("capture_diag"),
                (timestamp, inputHash, crop, rotation) -> captureDiagnostics.imageEvidence(
                    outputFile.getName(), timestamp, inputHash, crop, rotation),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                        try {
                            long hashStartedAt = SystemClock.elapsedRealtime();
                            String savedSha256 = captureFileSha256(outputFile);
                            long fileSize = outputFile.length();
                            JSObject savedTrace = new JSObject();
                            savedTrace.put("stage", "JPEG_SAVED");
                            savedTrace.put("captureId", outputFile.getName());
                            savedTrace.put("savedSha256", savedSha256);
                            savedTrace.put("bytes", fileSize);
                            savedTrace.put("hashElapsedMs", SystemClock.elapsedRealtime()-hashStartedAt);
                            Log.i(TAG, "[CAPTURE_BYTES] " + savedTrace.toString());
                            captureDiagnostics.trace(savedTrace);
                            captureDiagnostics.saved(outputFile, savedSha256);
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
                            result.put("captureId", outputFile.getName());
                            result.put("savedSha256", savedSha256);
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
                        captureDiagnostics.error(outputFile.getName(), exception.toString());
                        Log.e(TAG, "[capturePhotoFile] takePicture ERROR: " + exception.getMessage());
                        call.reject("capturePhotoFile takePicture failed: " + exception.getMessage());
                    }
                }
            );
            } catch (Exception e) { captureDiagnostics.error(outputFile.getName(), e.toString()); call.reject("capturePhotoFile request failed: " + e.getMessage()); }
            }
        });
    }

    // ============================================================
    // analyzeFrame: LT-AUTOCAP-002 v1.2 신규 3중게이트
    // (1)밝기 AND (2)포커스 AND (3)모션안정 → 전부 통과 시에만 autoCaptureReady
    // ============================================================
    private void analyzeFrame(@NonNull ImageProxy image) {
        synchronized (captureGateLock) {
        try {
            qualityReady = false; // exceptions/null ROI never leave a usable stale quality result
            int frameW = image.getWidth();
            int frameH = image.getHeight();
            int rotationDegrees = image.getImageInfo().getRotationDegrees();

            // [한글 주석] 가이드박스 → 프레임 좌표 변환 (기존 STEP A/B 로직 재사용)
            android.graphics.Rect crop = image.getCropRect();
            int[] guideRect = computeGuideRectInFrame(crop.width(), crop.height(), rotationDegrees);
            if (guideRect != null) { guideRect[0] += crop.left; guideRect[1] += crop.top; }
            if (guideRect == null) {
                tiltHoldStartMs = 0L;
                lastAnalysisMs = 0L;
                observedCornerEpoch = -1L;
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

            // POC: geometry comes from four-corner tracking; quality gates remain.
            long nowMs = SystemClock.elapsedRealtime();
            long[] cornerState = cornerPocTracker == null ? null : cornerPocTracker.captureState(nowMs);
            boolean frameGap = lastAnalysisMs == 0L || nowMs < lastAnalysisMs || nowMs - lastAnalysisMs >= 250L;
            lastAnalysisMs = nowMs;
            boolean readyForHold = brightnessOk && focusOk && motionOk && tiltOk && cornerState != null;
            long cornerEpoch = cornerState == null ? -1L : cornerState[0];
            if (!readyForHold || frameGap || cornerEpoch != observedCornerEpoch) tiltHoldStartMs = 0L;
            observedCornerEpoch = cornerEpoch;
            if (readyForHold && tiltHoldStartMs == 0L) tiltHoldStartMs = nowMs;
            // Only a newly sampled corner frame can advance the hold duration.
            long heldMs = readyForHold ? Math.max(0L, cornerState[1] - tiltHoldStartMs) : 0L;
            boolean holdComplete = heldMs >= AUTO_CAPTURE_HOLD_MS;
            qualityAtMs = nowMs; qualityReady = readyForHold && holdComplete;
            qualityCornerEpoch = cornerEpoch;

            if (DebugFlags.CROP_LOG) {
                Log.d("GeoCamAuto", "[QUALITY_GATE]"
                    + " brightness=" + String.format("%.1f", sample.meanY) + "(" + brightnessOk + ")"
                    + " guideRect=" + guideRect[0] + "," + guideRect[1] + "," + guideRect[2] + "," + guideRect[3]);
            }

            if (qualityReady && !autoCaptureNotified && !captureSubmitted) {
                autoCaptureNotified = true;
                JSObject result = new JSObject();
                capturePermit = captureSession + ":" + java.util.UUID.randomUUID().toString();
                permitAtMs = nowMs; permitCornerEpoch = cornerEpoch;
                result.put("permit", capturePermit);
                result.put("qualityReady", true);
                result.put("cornerTracked", true);
                result.put("heldMs", heldMs);
                Log.d(TAG, "[CORNER_CAPTURE_POC] heldMs=" + heldMs + " cornerEpoch=" + cornerEpoch);
                notifyListeners("autoCaptureReady", result);
                Log.d(TAG, "[AUTO-CAPTURE] autoCaptureReady 전달 (품질게이트 3종 통과)");
            }
        } catch (Exception e) {
            tiltHoldStartMs = 0L;
            lastAnalysisMs = 0L;
            observedCornerEpoch = -1L;
            Log.e(TAG, "analyzeFrame error: " + e.getMessage());
        } finally {
            // CORNER_POC: sample the next geometry result before closing this image.
            try {
                if (cornerPocTracker != null && !captureSubmitted) cornerPocTracker.offer(image);
            } catch (Exception ignored) { }
            image.close();
        }
        }
    }

    // ============================================================
    // computeGuideRectInFrame: JS 가이드박스 좌표 → 프레임(Y플레인) 좌표 변환
    // CropRect-local FILL_CENTER inverse; add crop origin at caller. 180 branch deferred.
    // 반환: {left, top, width, height} 또는 가이드박스 미설정 시 null
    // ============================================================
    private int[] computeGuideRectInFrame(int frameW, int frameH, int rotationDegrees) {
        return guideRectForCrop(frameW, frameH, rotationDegrees,
            previewViewWidth, previewViewHeight, guideBoxX, guideBoxY, guideBoxWidth, guideBoxHeight);
    }
    static int[] guideRectForCrop(int frameW, int frameH, int rotationDegrees,
            float pvW, float pvH, float jsX, float jsY, float jsW, float jsH) {
        if (frameW <= 0 || frameH <= 0 || !Float.isFinite(pvW) || !Float.isFinite(pvH)
            || !Float.isFinite(jsX) || !Float.isFinite(jsY) || !Float.isFinite(jsW)
            || !Float.isFinite(jsH) || pvW <= 0 || pvH <= 0 || jsW <= 0 || jsH <= 0) return null;
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

        return width > 2 && height > 2 ? new int[]{ left, top, width, height } : null;
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
    // TOO_FAR/SIZE_OK/TOO_CLOSE가 실제로 어떤 수치 패턴으로 나타나는지 측정만 한다.
    // AutoCapture Gate에 연결하지 않는다. 촬영 차단하지 않는다. threshold 만들지 않는다.
    // GEO-CAM-ARCHITECTURE-001 STEP 2-B: GuideBox Edge Position POC
    // 평균 밝기로 크기를 추측하지 않는다. GuideBox 4변 각각에서 여러 지점
    // 수직/수평 교차 스캔으로 실제 카드 edge 좌표를 찾고 median으로 대표값을
    // 잡는다. AutoCapture Gate에 연결하지 않는다. threshold/sizeOk 없음.
    private static final int EDGE_SCAN_RANGE_PX = 40; // 측정범위(판정기준 아님)
    private static final int EDGE_GRAD_STEP = 3;

    // 단일 지점에서 GuideBox 변에 수직으로 가로지르는 1D 스캔.
    // axis='V': fixedCoord=x 고정, guideLinePos 기준 y를 위아래로 스캔(TOP/BOTTOM).
    // axis='H': fixedCoord=y 고정, guideLinePos 기준 x를 좌우로 스캔(LEFT/RIGHT).
    // 반환: [최대 gradient 위치, 그 gradient 크기]
    // "이 변 전체에서 가장 많은 구간이 동시에 지지하는 위치가 어디냐"로 판단.
    // 카드 내부 콘텐츠 선(얼굴/머리카락/패턴)은 일부 구간에서만 강하고,
    // 카드 실제 외곽선은 변 전체에 걸쳐 길게 이어진다는 물리적 특성을 이용.
    // EDGE_SEGMENT_SUPPORT_MIN_GRAD는 측정용 내부 파라미터(최종판정 threshold 아님).
    private static final int EDGE_SEGMENT_COUNT = 12;
    private static final float EDGE_SEGMENT_SUPPORT_MIN_GRAD = 15f;

    // 반환: [bestOffsetAbsPos, supportRatio(0~1), meanGradientAtBest]
    // LT-GEOCAM-FINALIZE-002 STEP 4: Contrast Gate + GuideFit Gate 상수
    private static final float CONTRAST_SUPPORT_MIN = 0.5f;
    private static final float CONTRAST_GRADIENT_MIN = 30f;
    private static final int CONTRAST_MIN_RELIABLE_SIDES = 3;

    private static final float GUIDEFIT_TOP_MIN    = -5f,  GUIDEFIT_TOP_MAX    = 24f;
    private static final float GUIDEFIT_RIGHT_MIN  = -41f, GUIDEFIT_RIGHT_MAX  = -9f;
    private static final float GUIDEFIT_BOTTOM_MIN = -26f, GUIDEFIT_BOTTOM_MAX = 7f;
    private static final float GUIDEFIT_LEFT_MIN   = -5f,  GUIDEFIT_LEFT_MAX   = 26f;

    private static class ContrastGuideFitResult {
        boolean contrastOk;
        boolean guideFitOk;
    }

    private ContrastGuideFitResult evaluateContrastAndGuideFit(
        ByteBuffer yBuf, int rowStride, int pixelStride,
        int[] guideRect, int frameW, int frameH
    ) {
        int left = guideRect[0], top = guideRect[1], w = guideRect[2], h = guideRect[3];
        int right = left + w, bottom = top + h;

        float[] t = findConsistentEdge(yBuf, rowStride, pixelStride, frameW, frameH, 'V', top,    left, right, EDGE_SCAN_RANGE_PX);
        float[] r = findConsistentEdge(yBuf, rowStride, pixelStride, frameW, frameH, 'H', right,  top, bottom, EDGE_SCAN_RANGE_PX);
        float[] b = findConsistentEdge(yBuf, rowStride, pixelStride, frameW, frameH, 'V', bottom, left, right, EDGE_SCAN_RANGE_PX);
        float[] l = findConsistentEdge(yBuf, rowStride, pixelStride, frameW, frameH, 'H', left,   top, bottom, EDGE_SCAN_RANGE_PX);

        int reliableCount = 0;
        if (t[1] >= CONTRAST_SUPPORT_MIN && t[2] >= CONTRAST_GRADIENT_MIN) reliableCount++;
        if (r[1] >= CONTRAST_SUPPORT_MIN && r[2] >= CONTRAST_GRADIENT_MIN) reliableCount++;
        if (b[1] >= CONTRAST_SUPPORT_MIN && b[2] >= CONTRAST_GRADIENT_MIN) reliableCount++;
        if (l[1] >= CONTRAST_SUPPORT_MIN && l[2] >= CONTRAST_GRADIENT_MIN) reliableCount++;

        ContrastGuideFitResult result = new ContrastGuideFitResult();
        result.contrastOk = reliableCount >= CONTRAST_MIN_RELIABLE_SIDES;

        float topOffset    = t[0] - top;
        float rightOffset  = r[0] - right;
        float bottomOffset = b[0] - bottom;
        float leftOffset   = l[0] - left;

        boolean topFit    = topOffset    >= GUIDEFIT_TOP_MIN    && topOffset    <= GUIDEFIT_TOP_MAX;
        boolean rightFit  = rightOffset  >= GUIDEFIT_RIGHT_MIN  && rightOffset  <= GUIDEFIT_RIGHT_MAX;
        boolean bottomFit = bottomOffset >= GUIDEFIT_BOTTOM_MIN && bottomOffset <= GUIDEFIT_BOTTOM_MAX;
        boolean leftFit   = leftOffset   >= GUIDEFIT_LEFT_MIN   && leftOffset   <= GUIDEFIT_LEFT_MAX;

        result.guideFitOk = topFit && rightFit && bottomFit && leftFit;

        return result;
    }

    private float[] findConsistentEdge(
        ByteBuffer yBuf, int rowStride, int pixelStride, int frameW, int frameH,
        char axis, int guideLinePos, int spanStart, int spanEnd, int range
    ) {
        int bestOffset = guideLinePos;
        int bestSupportCount = -1;
        float bestSumGrad = 0f;

        for (int p = guideLinePos - range + EDGE_GRAD_STEP; p < guideLinePos + range - EDGE_GRAD_STEP; p++) {
            int supportCount = 0;
            float sumGrad = 0f;
            for (int s = 0; s < EDGE_SEGMENT_COUNT; s++) {
                float frac = (s + 0.5f) / EDGE_SEGMENT_COUNT;
                int fixedCoord = spanStart + Math.round((spanEnd - spanStart) * frac);
                int v0, v1;
                if (axis == 'V') {
                    int y0 = p - EDGE_GRAD_STEP, y1 = p + EDGE_GRAD_STEP;
                    if (y0 < 1 || y1 >= frameH - 1 || fixedCoord < 1 || fixedCoord >= frameW - 1) continue;
                    v0 = yBuf.get(y0 * rowStride + fixedCoord * pixelStride) & 0xFF;
                    v1 = yBuf.get(y1 * rowStride + fixedCoord * pixelStride) & 0xFF;
                } else {
                    int x0 = p - EDGE_GRAD_STEP, x1 = p + EDGE_GRAD_STEP;
                    if (x0 < 1 || x1 >= frameW - 1 || fixedCoord < 1 || fixedCoord >= frameH - 1) continue;
                    v0 = yBuf.get(fixedCoord * rowStride + x0 * pixelStride) & 0xFF;
                    v1 = yBuf.get(fixedCoord * rowStride + x1 * pixelStride) & 0xFF;
                }
                int grad = Math.abs(v1 - v0);
                if (grad > EDGE_SEGMENT_SUPPORT_MIN_GRAD) {
                    supportCount++;
                    sumGrad += grad;
                }
            }
            if (supportCount > bestSupportCount || (supportCount == bestSupportCount && sumGrad > bestSumGrad)) {
                bestSupportCount = supportCount;
                bestSumGrad = sumGrad;
                bestOffset = p;
            }
        }

        float supportRatio = bestSupportCount >= 0 ? (float) bestSupportCount / EDGE_SEGMENT_COUNT : 0f;
        float meanGrad = bestSupportCount > 0 ? bestSumGrad / bestSupportCount : 0f;
        return new float[]{ (float) bestOffset, supportRatio, meanGrad };
    }

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
        int base = yBuf.position();

        for (int y = startY; y < bottom; y += SAMPLE_STEP) {
            for (int x = startX; x < right; x += SAMPLE_STEP) {
                int idxC = base + y * rowStride + x * pixelStride;
                int idxL = base + y * rowStride + (x - 1) * pixelStride;
                int idxR = base + y * rowStride + (x + 1) * pixelStride;
                int idxU = base + (y - 1) * rowStride + x * pixelStride;
                int idxD = base + (y + 1) * rowStride + x * pixelStride;

                if (idxU < base || idxL < base || idxD >= yBuf.limit() || idxR >= yBuf.limit())
                    throw new IllegalArgumentException("QUALITY_PLANE_BOUNDS");

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
    // NS-LEGITTAG-AUTOCAPTURE-STEP-A2 STEP3(수정판): JS devicemotion 기반 tiltOk 전달.
    // 카드 위치 판단 아님 - 순수 기기 자세(tilt) 품질게이트만 갱신한다.
    @PluginMethod
    public void setTiltStatus(PluginCall call) {
        synchronized (captureGateLock) {
        if (!call.getBoolean("tiltOk", false)) { qualityReady = false; tiltHoldStartMs = 0; }

        tiltOk = call.getBoolean("tiltOk", false);
        Double newTiltDeg = call.getDouble("tiltDeg");
        if (newTiltDeg != null) { latestTiltDeg = newTiltDeg; }
        if (cornerPocTracker != null) cornerPocTracker.tilt(tiltOk);
        call.resolve();
            }
    }

    @PluginMethod
    public void setGuideBox(PluginCall call) {
        synchronized (captureGateLock) {
        qualityReady = false; tiltHoldStartMs = 0;

        float previewW = call.getFloat("previewW", 0f);
        float previewH = call.getFloat("previewH", 0f);
        float guideX   = call.getFloat("guideX",   0f);
        float guideY   = call.getFloat("guideY",   0f);
        float guideW   = call.getFloat("guideW",   0f);
        float guideH   = call.getFloat("guideH",   0f);

        if (!Float.isFinite(previewW) || !Float.isFinite(previewH) || !Float.isFinite(guideX)
                || !Float.isFinite(guideY) || !Float.isFinite(guideW) || !Float.isFinite(guideH)
                || previewW <= 0f || previewH <= 0f || guideW <= 0f || guideH <= 0f) {
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
    }

    // ============================================================
    // GEOCAM-REFACTOR-INTEGRATED-001: AF/AE 초점제어
    // JS에서 가이드박스 중앙 좌표를 넘겨받아 그 지점에 초점+노출 맞춤
    // ============================================================
    static float[] focusPoint(float x, float y, float cssW, float cssH,
            int webW, int webH, int webX, int webY, int previewX, int previewY,
            int previewW, int previewH) {
        if (!Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(cssW)
            || !Float.isFinite(cssH) || cssW <= 0 || cssH <= 0 || webW <= 0 || webH <= 0)
            throw new IllegalArgumentException("INVALID_FOCUS_VIEWPORT");
        float px = x * webW / cssW + webX - previewX;
        float py = y * webH / cssH + webY - previewY;
        if (px < 0 || py < 0 || px >= previewW || py >= previewH)
            throw new IllegalArgumentException("FOCUS_OUTSIDE_PREVIEW");
        return new float[]{px, py};
    }
    @PluginMethod
    public void triggerAutoFocus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Camera camera = previewCamera;
                PreviewView pv = ((MainActivity)getActivity()).getCameraPreviewView();
                android.webkit.WebView web = getBridge().getWebView();
                if (camera == null || pv == null || web == null) { call.reject("FOCUS_CAMERA_NOT_READY"); return; }
                final String original = call.getString("permit", "");
                final long focusEpoch;
                synchronized (captureGateLock) {
                    long now = SystemClock.elapsedRealtime();
                    long[] corner = cornerPocTracker == null ? null : cornerPocTracker.captureState(now);
                    if (!permitValid(original, capturePermit, now, permitAtMs, qualityAtMs,
                            qualityReady, tiltOk, captureSubmitted, permitCornerEpoch, qualityCornerEpoch, corner)) {
                        JSObject deferred = new JSObject(); deferred.put("captureReady", false);
                        deferred.put("reason", "AF_START_CONDITIONS_CHANGED"); call.resolve(deferred); return;
                    }
                    focusEpoch = corner[0]; focusedPermit = "";
                }
                int[] wl = new int[2], pl = new int[2];
                web.getLocationOnScreen(wl); pv.getLocationOnScreen(pl);
                float[] p = focusPoint(call.getFloat("x", Float.NaN), call.getFloat("y", Float.NaN),
                    call.getFloat("viewportW", 0f), call.getFloat("viewportH", 0f),
                    web.getWidth(), web.getHeight(), wl[0], wl[1], pl[0], pl[1], pv.getWidth(), pv.getHeight());
                MeteringPoint point = pv.getMeteringPointFactory().createPoint(p[0], p[1]);
                FocusMeteringAction action = new FocusMeteringAction.Builder(point,
                    FocusMeteringAction.FLAG_AF | FocusMeteringAction.FLAG_AE)
                    .setAutoCancelDuration(10, java.util.concurrent.TimeUnit.SECONDS).build();
                FocusMeteringAction afOnly = new FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF).build();
                final boolean supported = camera.getCameraInfo().isFocusMeteringSupported(action);
                final boolean afSupported = camera.getCameraInfo().isFocusMeteringSupported(afOnly);
                final long started = SystemClock.elapsedRealtime();
                final java.util.concurrent.atomic.AtomicBoolean delivered = new java.util.concurrent.atomic.AtomicBoolean();
                final java.util.function.BiConsumer<String, Boolean> finish = (status, success) -> {
                    if (!delivered.compareAndSet(false, true)) return;
                    JSObject result = new JSObject();
                    result.put("status", status); result.put("triggered", supported);
                    result.put("afSupported", afSupported); result.put("focusSuccessful", success);
                    result.put("elapsedMs", SystemClock.elapsedRealtime()-started);
                    result.put("nativeX", p[0]); result.put("nativeY", p[1]);
                    result.put("webWidth", web.getWidth()); result.put("webHeight", web.getHeight());
                    result.put("previewWidth", pv.getWidth()); result.put("previewHeight", pv.getHeight());
                    result.put("originDeltaX", wl[0]-pl[0]); result.put("originDeltaY", wl[1]-pl[1]);
                    Log.i(TAG, "[AF_RESULT] " + result.toString());
                    if (success) {
                        awaitFocusedQuality(call, camera, original, focusEpoch, SystemClock.elapsedRealtime(), result);
                    } else {
                        result.put("captureReady", false);
                        camera.getCameraControl().cancelFocusAndMetering();
                        // Restart the existing one-second stable hold before another attempt.
                        synchronized (captureGateLock) {
                            if (original.equals(capturePermit)) { qualityReady = false; tiltHoldStartMs = 0; }
                        }
                        call.resolve(result);
                    }
                };
                if (!supported || !afSupported) { finish.accept("UNSUPPORTED", false); return; }
                final ListenableFuture<FocusMeteringResult> future = camera.getCameraControl().startFocusAndMetering(action);
                android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
                Runnable timeout = () -> { finish.accept("TIMEOUT", false); future.cancel(true); };
                handler.postDelayed(timeout, 5000);
                future.addListener(() -> {
                    handler.removeCallbacks(timeout);
                    try {
                        FocusMeteringResult r = future.get();
                        boolean success = afSupported && r.isFocusSuccessful();
                        finish.accept(!afSupported ? "AF_UNSUPPORTED_AE_COMPLETED" : success ? "SUCCESS" : "NOT_FOCUSED", success);
                    } catch (java.util.concurrent.CancellationException e) { finish.accept("CANCELLED", false); }
                    catch (java.util.concurrent.ExecutionException e) {
                        finish.accept(e.getCause() instanceof androidx.camera.core.CameraControl.OperationCanceledException
                            ? "CANCELLED" : "ERROR", false);
                    } catch (InterruptedException e) { Thread.currentThread().interrupt(); finish.accept("INTERRUPTED", false); }
                    catch (RuntimeException e) { finish.accept("ERROR", false); }
                }, ContextCompat.getMainExecutor(getContext()));
            } catch (Exception e) { call.reject("triggerAutoFocus error: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void setCornerPocConfig(PluginCall call) {
        synchronized (captureGateLock) {

        try {
            if (cornerPocTracker == null) { call.reject("CORNER_POC_NOT_READY"); return; }
            cornerPocTracker.configure(call.getString("token", ""), call.getBoolean("enabled", false),
                call.getDouble("previewW", 0.0), call.getDouble("previewH", 0.0),
                call.getDouble("guideX", 0.0), call.getDouble("guideY", 0.0),
                call.getDouble("guideW", 0.0), call.getDouble("guideH", 0.0));
            call.resolve();
        } catch (Exception e) { call.reject("CORNER_POC_CONFIG_FAILED"); }
            }
    }

    @Override
    protected void handleOnDestroy() {
        if (cornerPocTracker != null) cornerPocTracker.close();
        if (cameraExecutor != null) cameraExecutor.shutdown();
        if (captureDiagnostics != null) captureDiagnostics.close();
    }

    // [한글 주석] 디버그 로그 on/off 플래그 (기존 DEBUG_CROP_LOG 대체)
    private static class DebugFlags {
        static final boolean CROP_LOG = true;
    }
}

