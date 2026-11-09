package com.arteon.geocam;
import android.content.Context;
import android.hardware.camera2.*;
import android.os.Build;
import org.json.JSONObject;
import org.json.JSONArray;
/** S24-only experimental session request. No system settings or preferences are written. */
final class HdrCaptureProfile {
    private static final String KEY="samsung.android.control.liveHdrMode";
    private final String cameraId;
    private boolean applied;
    private boolean nrApplied;
    private int[] nrModes;
    private String nrSupport="NOT_CHECKED_DEVICE_OUT_OF_SCOPE";
    private String support="UNSUPPORTED_DEVICE_BASELINE";
    private final CaptureRequest.Key<int[]> key=new CaptureRequest.Key<>(KEY,int[].class);
    HdrCaptureProfile(Context context, androidx.camera.core.CameraInfo selected,
            androidx.camera.core.ImageCapture.Builder builder) {
        cameraId=androidx.camera.camera2.interop.Camera2CameraInfo.from(selected).getCameraId();
        if(!"samsung".equalsIgnoreCase(Build.MANUFACTURER)||!"SM-S921N".equals(Build.MODEL)||!"0".equals(cameraId))return;
        // Prior CaptureLab on this S24 observed int[1] and request/result 0.
        // Treat this as an experimental profile, not universal HDR-off capability proof.
        new androidx.camera.camera2.interop.Camera2Interop.Extender<>(builder)
                .setCaptureRequestOption(key,new int[]{0});
        applied=true;support="PRIOR_S24_TEMPLATE_INT_ARRAY_1_DEVICE_RESULT_0_POC";
        // JPEG 생성 전 노이즈 제거만 추가 제어. 다른 처리 항목은 비교를 위해 유지.
        try {
            nrModes=androidx.camera.camera2.interop.Camera2CameraInfo.from(selected)
                .getCameraCharacteristic(CameraCharacteristics.NOISE_REDUCTION_AVAILABLE_NOISE_REDUCTION_MODES);
            nrSupport="OFF_NOT_SUPPORTED";
            if(nrModes!=null) for(int mode:nrModes) if(mode==CaptureRequest.NOISE_REDUCTION_MODE_OFF) {
                new androidx.camera.camera2.interop.Camera2Interop.Extender<>(builder)
                    .setCaptureRequestOption(CaptureRequest.NOISE_REDUCTION_MODE,CaptureRequest.NOISE_REDUCTION_MODE_OFF);
                nrApplied=true;nrSupport="CHARACTERISTICS_OFF_SUPPORTED_REQUESTED";break;
            }
            if(nrModes==null)nrSupport="AVAILABLE_MODES_NOT_REPORTED";
        } catch(Exception e) { nrSupport="SETUP_ERROR:"+e.getClass().getSimpleName(); }

    }
    private static void put(JSONObject j,String k,Object v){try{j.put(k,v==null?JSONObject.NULL:v);}catch(Exception ignored){}}
    private static Object jsonValue(Object v){if(v==null)return JSONObject.NULL;if(v instanceof int[]){JSONArray a=new JSONArray();for(int n:(int[])v)a.put(n);return a;}return "UNEXPECTED_TYPE:"+v.getClass().getName();}
    JSONObject info(){JSONObject j=new JSONObject();put(j,"batch","REFACTOR_HDR_REQUEST_0_POC_1");put(j,"arm",applied?"S24_HDR_REQUEST_0":"UNSUPPORTED_BASELINE");put(j,"selectedCameraId",cameraId);put(j,"changedKey",KEY);put(j,"desiredValue",jsonValue(new int[]{0}));put(j,"overrideRequested",applied);put(j,"supportEvidence",support);put(j,"trialCyclingEnabled",false);put(j,"model",Build.MODEL);put(j,"fingerprint",Build.FINGERPRINT);put(j,"scope","APP_CAMERA_SESSION_ONLY");put(j,"hdrOffVerified",false);put(j,"noiseReduction",nrInfo());return j;}
    JSONObject verify(CaptureRequest request,TotalCaptureResult result){
        JSONObject j=new JSONObject();Object q=null,v=null;String error="";
        try{for(CaptureRequest.Key<?> k:request.getKeys())if(KEY.equals(k.getName())){q=request.get(k);break;}
            for(CaptureResult.Key<?> k:result.getKeys())if(KEY.equals(k.getName())){v=result.get(k);break;}}
        catch(Exception e){error=e.getClass().getSimpleName();}
        put(j,"key",KEY);put(j,"requested",jsonValue(q));put(j,"returned",jsonValue(v));
        put(j,"status",error.isEmpty()?HdrValueCheck.status(q,v,applied):"READ_ERROR");
        put(j,"readError",error);put(j,"hdrOffVerified",false);
        JSONObject nr=nrInfo();
        try {
            Integer nq=request.get(CaptureRequest.NOISE_REDUCTION_MODE);
            Integer nv=result.get(CaptureResult.NOISE_REDUCTION_MODE);
            put(nr,"requested",nq);put(nr,"returned",nv);
            put(nr,"status",HdrValueCheck.status(nq==null?null:new int[]{nq},nv==null?null:new int[]{nv},nrApplied));
        } catch(Exception e) {put(nr,"status","READ_ERROR");put(nr,"readError",e.getClass().getSimpleName());}
        put(j,"noiseReduction",nr);return j;
    }
    private JSONObject nrInfo(){
        JSONObject n=new JSONObject();put(n,"profile","HDR0_NR_OFF_POC_1");
        put(n,"key","android.noiseReduction.mode");put(n,"desiredValue",0);
        put(n,"availableModes",jsonValue(nrModes));put(n,"overrideRequested",nrApplied);
        put(n,"supportEvidence",nrSupport);put(n,"codePreservationVerified",false);return n;
    }
    void markSaved(){}
}
