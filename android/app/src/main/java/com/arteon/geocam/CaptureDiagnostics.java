package com.arteon.geocam;

import android.content.Context;
import android.hardware.camera2.*;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.concurrent.*;

/** 촬영 조건을 변경하지 않는 관측기. 시간 구간 연결을 JPEG 타임스탬프 일치로 주장하지 않는다. */
final class CaptureDiagnostics {
    private static final String TAG = "CaptureDiagnostics";

    // Exact sensor timestamp association. This does not establish HDR-off.
    private final CaptureEvidenceLink evidenceLink = new CaptureEvidenceLink();
    private final java.util.Map<Long,JSONObject> hdrResults=new java.util.HashMap<>();
    private boolean hdrConflict;
    private long evidenceImageTime = -1;
    private String evidenceInputHash = "";
    private String evidenceSavedHash = "";
    void imageEvidence(String id, long timestamp, String inputHash, String crop, int rotation) {
        synchronized(lock) {
            if (!active.equals(id)) throw new IllegalStateException("STALE_CAPTURE_IMAGE");
            evidenceLink.image(id, timestamp);
            evidenceImageTime = timestamp; evidenceInputHash = inputHash;
            JSONObject j=event("IMAGE_PROXY_RECEIVED",id);
            put(j,"imageTimestampNs",Long.toString(timestamp));
            put(j,"inputJpegSha256",inputHash);put(j,"cropRect",crop);
            put(j,"rotationDegrees",rotation);
            put(j,"savePath","EXACT_CAMERAX_JPEG_NO_REENCODING");record(j);
            emitEvidenceLocked(id);
        }
    }
    private void resultEvidence(String id, CaptureRequest request, TotalCaptureResult result, HdrCaptureProfile trial) {
        synchronized(lock) {
            if (!active.equals(id)) return;
            Long time=result.get(CaptureResult.SENSOR_TIMESTAMP);
            evidenceLink.result(id,time==null?0:time,result.getFrameNumber());
            if(time!=null&&time>0){
                JSONObject verification=trial.verify(request,result);
                JSONObject previous=hdrResults.get(time);
                if(previous!=null&&!previous.toString().equals(verification.toString()))hdrConflict=true;
                else if(previous==null){if(hdrResults.size()<8)hdrResults.put(time,verification);else hdrConflict=true;}
            }
            emitEvidenceLocked(id);
        }
    }
    private void emitEvidenceLocked(String id) {
        JSONObject j=event("CAPTURE_LINK_STATUS",id);
        String status=evidenceLink.status(id);
        put(j,"timestampLinkStatus",status);
        put(j,"savedFileLinked",status.equals("TIMESTAMP_MATCHED")&&!evidenceSavedHash.isEmpty());
        put(j,"imageTimestampNs",evidenceImageTime>0?Long.toString(evidenceImageTime):null);
        put(j,"inputJpegSha256",evidenceInputHash);put(j,"savedSha256",evidenceSavedHash);
        put(j,"byteIdenticalToInput",!evidenceSavedHash.isEmpty()&&evidenceSavedHash.equals(evidenceInputHash));
        JSONObject hdr=hdrResults.get(evidenceImageTime);
        boolean linked=status.equals("TIMESTAMP_MATCHED")&&!evidenceSavedHash.isEmpty()
                &&evidenceSavedHash.equals(evidenceInputHash)&&!hdrConflict;
        put(j,"hdrVerification",linked&&hdr!=null?hdr.optString("status","UNVERIFIED"):"UNVERIFIED_PHOTO_LINK");
        put(j,"hdrRequestResultForImage",status.equals("TIMESTAMP_MATCHED")&&!hdrConflict?hdr:null);
        put(j,"hdrResultLinkedToSavedJpeg",linked&&hdr!=null);
        put(j,"hdrOffVerified",false);
        put(j,"associationScope","IMAGE_PROXY_TO_RESULT_AND_APP_SAVED_FILE");
        record(j);
    }

    private final File directory;
    private final ThreadPoolExecutor writer = new ThreadPoolExecutor(1, 1, 0L,
        TimeUnit.MILLISECONDS, new ArrayBlockingQueue<Runnable>(256));
    private final Object lock = new Object();
    private String binding = "";
    private String active = "";
    private long started;
    private int candidates;
    private boolean saved;
    private HdrCaptureProfile activeTrial;
    private static void put(JSONObject j, String k, Object v) {
        try { j.put(k, v == null ? JSONObject.NULL : v); } catch (Exception ignored) { }
    }
    CaptureDiagnostics(Context context) {
        directory = context.getExternalFilesDir("capture_diag");
    }
    private JSONObject event(String stage, String captureId) {
        JSONObject j = new JSONObject();
        put(j,"schema","LT_CAPTURE_DIAG_1"); put(j,"stage",stage);
        put(j,"captureId",captureId); put(j,"elapsedRealtimeNs",Long.toString(SystemClock.elapsedRealtimeNanos()));
        put(j,"wallTimeMs",System.currentTimeMillis()); return j;
    }
    private void queue(Runnable job) {
        try { writer.execute(job); }
        catch (Exception e) { Log.e(TAG,"DIAGNOSTIC_QUEUE_FAILED",e); }
    }
    private void append(JSONObject j) throws Exception {
        if (directory == null || (!directory.isDirectory() && !directory.mkdirs()))
            throw new IOException("DIAGNOSTIC_DIRECTORY_UNAVAILABLE");
        String id = j.optString("captureId", "");
        if (!id.matches("geo_capture_[0-9]+\\.jpg")) throw new IOException("INVALID_CAPTURE_ID");
        try (FileOutputStream f = new FileOutputStream(new File(directory,id+".jsonl"),true)) {
            f.write((j.toString()+"\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }
    private void record(JSONObject j) {
        queue(() -> { try { append(j); } catch(Exception e) { Log.e(TAG,"DIAGNOSTIC_WRITE_FAILED",e); } });
    }
    void trace(JSONObject source) {
        try { JSONObject copy = new JSONObject(source.toString());
            put(copy,"schema","LT_CAPTURE_DIAG_1"); record(copy);
        } catch(Exception e) { Log.e(TAG,"DIAGNOSTIC_TRACE_FAILED",e); }
    }
    CameraCaptureSession.CaptureCallback newBinding(HdrCaptureProfile trial) {
        final String token = java.util.UUID.randomUUID().toString();
        synchronized(lock) { evidenceLink.cancel(active); binding=token; active=""; activeTrial=trial; }
        return new CameraCaptureSession.CaptureCallback() {
            @Override public void onCaptureCompleted(CameraCaptureSession session, CaptureRequest request,
                    TotalCaptureResult result) {
                try {
                    Integer intent = request.get(CaptureRequest.CONTROL_CAPTURE_INTENT);
                    // 프리뷰 결과는 정지사진 결과로 대체하지 않는다.
                    if (intent == null || (intent != CaptureRequest.CONTROL_CAPTURE_INTENT_STILL_CAPTURE
                            && intent != CaptureRequest.CONTROL_CAPTURE_INTENT_ZERO_SHUTTER_LAG)) return;
                    final String id; final int index; final boolean afterSave;
                    synchronized(lock) {
                        if (!binding.equals(token) || active.isEmpty()
                                || SystemClock.elapsedRealtime()-started > 15000) return;
                        id=active; index=++candidates; afterSave=saved;
                    }
                    JSONObject j=event("STILL_RESULT_CANDIDATE",id);
                    put(j,"bindingId",token); put(j,"candidateIndex",index);
                    put(j,"receivedAfterSavedCallback",afterSave);
                    put(j,"association","CAPTURE_WINDOW_ONLY_NOT_JPEG_TIMESTAMP_VERIFIED");
                    put(j,"requestIntent",intent); put(j,"frameNumber",Long.toString(result.getFrameNumber()));
                    put(j,"sequenceId",result.getSequenceId());
                    put(j,"requestIdentity",Integer.toHexString(System.identityHashCode(request)));
                    put(j,"logicalCameraId",session.getDevice().getId());
                    put(j,"experiment","REFACTOR_HDR_REQUEST_0_POC_1");
                    put(j,"trial",trial.info());
                    put(j,"trialVerification",trial.verify(request,result));
                    put(j,"result",metadata(result)); record(j);
                    resultEvidence(id,request,result,trial);
                } catch(Exception e) { Log.e(TAG,"CAPTURE_RESULT_READ_FAILED",e); }
            }
            @Override public void onCaptureFailed(CameraCaptureSession session, CaptureRequest request,
                    CaptureFailure failure) {
                try {
                    String id;
                    synchronized(lock) { if(!binding.equals(token) || active.isEmpty())return; id=active; }
                    JSONObject j=event("CAMERA_CAPTURE_FAILED",id);
                    put(j,"requestIntent",request.get(CaptureRequest.CONTROL_CAPTURE_INTENT));
                    put(j,"frameNumber",Long.toString(failure.getFrameNumber()));
                    put(j,"reason",failure.getReason()); put(j,"sequenceId",failure.getSequenceId());record(j);
                } catch(Exception e) { Log.e(TAG,"FAILURE_READ_FAILED",e); }
            }
        };
    }
    void begin(String id) {
        if(!id.matches("geo_capture_[0-9]+\\.jpg")) return;
        JSONObject j=event("TAKE_PICTURE_REQUEST",id);
        synchronized(lock) {
            active=id; started=SystemClock.elapsedRealtime(); candidates=0; saved=false;
            evidenceLink.begin(id); hdrResults.clear(); hdrConflict=false; evidenceImageTime=-1; evidenceInputHash=""; evidenceSavedHash="";
            put(j,"bindingId",binding);
        }
        put(j,"experiment","REFACTOR_HDR_REQUEST_0_POC_1");
        synchronized(lock) { if(activeTrial != null) put(j,"trial",activeTrial.info()); }
        put(j,"model",Build.MODEL);put(j,"sdk",Build.VERSION.SDK_INT);
        put(j,"association","CAPTURE_WINDOW_ONLY_NOT_JPEG_TIMESTAMP_VERIFIED");record(j);
    }
    void saved(File original, String expectedHash) {
        final String id=original.getName(); final JSONObject j=event("JPEG_DIAGNOSTIC_COPY",id);
        synchronized(lock) {
            if(active.equals(id)) { saved=true; evidenceSavedHash=expectedHash; emitEvidenceLocked(id); put(j,"candidateCountAtSaved",candidates);
                if(activeTrial != null) { put(j,"trial",activeTrial.info()); activeTrial.markSaved(); } }
        }
        put(j,"savedSha256",expectedHash);
        synchronized(lock) { put(j,"jpegSensorTimestamp",JSONObject.NULL); put(j,"sourceImageSensorTimestamp",active.equals(id)&&evidenceImageTime>0?Long.toString(evidenceImageTime):null); put(j,"timestampLinkStatus",evidenceLink.status(id)); }
        put(j,"association","CAPTURE_WINDOW_ONLY_NOT_JPEG_TIMESTAMP_VERIFIED");
        queue(() -> {
            try {
                if(directory==null || (!directory.isDirectory() && !directory.mkdirs()))
                    throw new IOException("DIAGNOSTIC_DIRECTORY_UNAVAILABLE");
                File copy=new File(directory,id); File temp=new File(directory,id+".part");
                if(copy.exists())throw new IOException("COPY_ALREADY_EXISTS");
                try (InputStream in=new FileInputStream(original);OutputStream out=new FileOutputStream(temp)) {
                    byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
                }
                String actual=YuvCameraPlugin.captureFileSha256(temp);
                put(j,"copySha256",actual);put(j,"bytes",temp.length());
                if(!expectedHash.equals(actual))throw new IOException("COPY_HASH_MISMATCH");
                if(!temp.renameTo(copy))throw new IOException("COPY_RENAME_FAILED");
                put(j,"copyVerified",true);append(j);
                Log.i(TAG,"COPY_VERIFIED "+id);
            }catch(Exception e) {put(j,"copyVerified",false);put(j,"error",e.toString());
                try{append(j);}catch(Exception ignored){} Log.e(TAG,"DIAGNOSTIC_COPY_FAILED",e);}
        });
    }
    void error(String id, String reason) {
        JSONObject j=event("APP_CAPTURE_ERROR",id);put(j,"reason",reason);record(j);
        synchronized(lock){if(active.equals(id)){evidenceLink.cancel(id);emitEvidenceLocked(id);active="";}}
    }
    void close() { synchronized(lock){evidenceLink.cancel(active);if(!active.isEmpty())emitEvidenceLocked(active);active="";} writer.shutdown(); }
    private static Object jsonValue(Object value) throws Exception {
        if(value==null)return JSONObject.NULL;
        if(value instanceof Long)return value.toString(); // JS 정밀도 손실 방지
        if(value instanceof Number || value instanceof Boolean || value instanceof String)return value;
        if(value.getClass().isArray()) {
            JSONArray a=new JSONArray();int n=java.lang.reflect.Array.getLength(value);
            for(int i=0;i<n;i++)a.put(jsonValue(java.lang.reflect.Array.get(value,i)));return a;
        }
        return value.toString();
    }
    private static JSONObject metadata(TotalCaptureResult r) {
        JSONObject j=new JSONObject();
        String[] names={"SENSOR_TIMESTAMP","SENSOR_EXPOSURE_TIME","SENSOR_SENSITIVITY",
            "SENSOR_FRAME_DURATION","SENSOR_ROLLING_SHUTTER_SKEW","CONTROL_AE_STATE",
            "CONTROL_AE_MODE","CONTROL_AE_LOCK","CONTROL_AE_EXPOSURE_COMPENSATION",
            "CONTROL_AE_ANTIBANDING_MODE","CONTROL_AE_TARGET_FPS_RANGE","CONTROL_AF_STATE",
            "CONTROL_AF_MODE","LENS_STATE","LENS_FOCUS_DISTANCE","LENS_FOCAL_LENGTH",
            "LENS_APERTURE","LENS_OPTICAL_STABILIZATION_MODE","CONTROL_AWB_STATE",
            "CONTROL_AWB_MODE","CONTROL_AWB_LOCK","COLOR_CORRECTION_MODE",
            "COLOR_CORRECTION_GAINS","COLOR_CORRECTION_TRANSFORM","NOISE_REDUCTION_MODE",
            "EDGE_MODE","TONEMAP_MODE","TONEMAP_CURVE","SHADING_MODE","HOT_PIXEL_MODE",
            "COLOR_CORRECTION_ABERRATION_MODE","DISTORTION_CORRECTION_MODE",
            "CONTROL_VIDEO_STABILIZATION_MODE","CONTROL_MODE","CONTROL_SCENE_MODE",
            "CONTROL_CAPTURE_INTENT","SCALER_CROP_REGION","CONTROL_ZOOM_RATIO",
            "LOGICAL_MULTI_CAMERA_ACTIVE_PHYSICAL_ID","FLASH_STATE","JPEG_QUALITY",
            "JPEG_ORIENTATION","SENSOR_PIXEL_MODE"};
        JSONObject unavailable=new JSONObject();
        for(String name:names) {
            try {
                Object key=CaptureResult.class.getField(name).get(null);
                Object value=r.get((CaptureResult.Key<?>)key);
                put(j,name,jsonValue(value));
                if(value==null)put(unavailable,name,"NOT_REPORTED");
            }catch(NoSuchFieldException e){put(j,name,JSONObject.NULL);put(unavailable,name,"API_NOT_AVAILABLE");}
            catch(Exception e){put(j,name,JSONObject.NULL);put(unavailable,name,"READ_ERROR");}
        }
        put(j,"unavailable",unavailable);return j;
    }
}

/** 고정 기본 프로필: 실험 순환과 설정 덮어쓰기를 제거한다. */ final class CameraProcessingTrial { private final String cameraId; CameraProcessingTrial(Context context, androidx.camera.core.CameraInfo selected, androidx.camera.core.ImageCapture.Builder builder) { cameraId=androidx.camera.camera2.interop.Camera2CameraInfo.from(selected).getCameraId(); } private static void put(JSONObject j,String k,Object v){try{j.put(k,v==null?JSONObject.NULL:v);}catch(Exception ignored){}} JSONObject info(){JSONObject j=new JSONObject();put(j,"batch","REFACTOR_FIXED_BASELINE_1");put(j,"arm","FIXED_BASELINE");put(j,"selectedCameraId",cameraId);put(j,"changedKey","");put(j,"desiredValue",null);put(j,"overrideRequested",false);put(j,"supportEvidence","BASELINE");put(j,"availableModes",new JSONArray());put(j,"trialCyclingEnabled",false);return j;} JSONObject verify(CaptureRequest request,TotalCaptureResult result){JSONObject j=new JSONObject();put(j,"status","BASELINE_NO_OVERRIDE");return j;} void markSaved(){} }
