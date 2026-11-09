package com.arteon.geocam;
import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/** Offline RGB corner model on the tracker worker only. Camera POC; no network. */
final class ColorCornerPocModel {
    static final String VERSION="LT_GUIDE_RGB_HYBRID_POC_20261109_V1";
    static final String MODEL_SHA="650da3cc3e9ac778c6951de631f824ec1e63bdabf3aaa39a35d7435af625612e";
    private final Context context;
    private OrtSession session;
    private OrtEnvironment env;
    private FloatBuffer tensorBuffer;
    private boolean failed;
    float lastSharpness=Float.NaN;
    ColorCornerPocModel(Context context){this.context=context.getApplicationContext();}
    private void initialize() throws Exception {
        if(session!=null)return;
        if(failed)throw new IllegalStateException("RGB_MODEL_DISABLED_AFTER_INIT_ERROR");
        try{
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream in=context.getAssets().open("guide_cornelius.onnx")){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
            byte[] bytes=out.toByteArray();byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder hash=new StringBuilder();for(byte b:digest)hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            if(!MODEL_SHA.equals(hash.toString()))throw new IllegalStateException("RGB_MODEL_HASH_MISMATCH");
            env=OrtEnvironment.getEnvironment();
            try(OrtSession.SessionOptions options=new OrtSession.SessionOptions()){
                options.setIntraOpNumThreads(1);options.setInterOpNumThreads(1);
                session=env.createSession(bytes,options);
            }
            tensorBuffer=ByteBuffer.allocateDirect(3*384*384*4).order(ByteOrder.nativeOrder()).asFloatBuffer();
            Log.i("CornerHybrid", "INIT_READY version="+VERSION+" modelSHA="+MODEL_SHA+" provider=CPU input=RGB_BILINEAR_384");
        }catch(Exception e){failed=true;Log.e("CornerHybrid","INIT_FAILED",e);throw e;}
    }
    void warmup(){try{initialize();}catch(Exception e){Log.e("CornerHybrid","WARMUP_FAILED",e);}}
    double[][] predict(CornerPocDetector.Frame f,int[] rgb,double gx,double gy,double gw,double gh) throws Exception {
        lastSharpness=Float.NaN;
        if(failed||rgb==null||rgb.length!=f.w*f.h)return null;
        initialize();
        Bitmap original=null,scaled=null;
        try{
            original=Bitmap.createBitmap(rgb,f.w,f.h,Bitmap.Config.ARGB_8888);
            scaled=Bitmap.createScaledBitmap(original,384,384,true);int[] pixels=new int[384*384];scaled.getPixels(pixels,0,384,0,0,384,384);
            tensorBuffer.clear();float[] mean={.485f,.456f,.406f},std={.229f,.224f,.225f};
            for(int channel=0;channel<3;channel++)for(int i=0;i<pixels.length;i++){int shift=16-channel*8;float value=(pixels[i]>>shift)&255;tensorBuffer.put((value/255f-mean[channel])/std[channel]);}
            tensorBuffer.flip();
            try(OnnxTensor input=OnnxTensor.createTensor(env,tensorBuffer,new long[]{1,3,384,384});OrtSession.Result result=session.run(Collections.singletonMap("image",input))){
                float[] points=((float[][])result.get(0).getValue())[0];lastSharpness=((float[])result.get(2).getValue())[0];
                if(!Float.isFinite(lastSharpness)||lastSharpness<.03f)return null;
                double[][] p=new double[4][2];for(int i=0;i<4;i++){p[i][0]=points[i*2]*f.w;p[i][1]=points[i*2+1]*f.h;}
                p=HybridCornerGeometry.order(p);
                if(!HybridCornerGeometry.valid(f,p,gx,gy,gw,gh))return null;
                double[][] refined=HybridCornerGeometry.refine(f,p);
                if(!HybridCornerGeometry.valid(f,refined,gx,gy,gw,gh))return null;
                for(int i=0;i<4;i++)refined[i]=f.toView(refined[i][0]+.5,refined[i][1]+.5);
                return refined;
            }
        }finally{
            if(scaled!=null&&scaled!=original)scaled.recycle();if(original!=null)original.recycle();
        }
    }
    void close(){try{if(session!=null)session.close();}catch(Exception e){Log.e("CornerHybrid","CLOSE_ERROR",e);}finally{session=null;tensorBuffer=null;}}
}
