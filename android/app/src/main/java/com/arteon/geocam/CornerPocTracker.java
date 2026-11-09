package com.arteon.geocam;

import android.graphics.Rect;
import android.os.SystemClock;
import androidx.camera.core.ImageProxy;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** Camera geometry authority for POC. Existing freshness/hold/AF checks remain. */
final class CornerPocTracker {
    interface Sink { void send(JSObject result); }
    private static final class Config {
        final String token; final double vw,vh,x,y,w,h;
        Config(String token,double vw,double vh,double x,double y,double w,double h){
            this.token=token;this.vw=vw;this.vh=vh;this.x=x;this.y=y;this.w=w;this.h=h;
        }
    }
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private final Sink sink;
    private final CornerReplayRecorder replay;
    private final ColorCornerPocModel colorModel;
    private volatile Config config;
    private volatile boolean tiltAllowed=false;
    private volatile long tiltEpoch=0;
    private long lastSampleMs=0,frameId=0;
    private long diagnosticLastMs=0;
    private long captureEpoch=0, captureFrameMs=-1;
    private int captureStableFrames=0;
    private double[][] capturePrevious;
    private synchronized void invalidateCapture(){captureEpoch++;captureFrameMs=-1;captureStableFrames=0;capturePrevious=null;}
    synchronized long[] captureState(long now){
        if(config==null||!tiltAllowed||captureFrameMs<0||now<captureFrameMs||now-captureFrameMs>=250){invalidateCapture();return null;}
        return captureStableFrames>=3?new long[]{captureEpoch,captureFrameMs}:null;
    }
    private synchronized void recordCapture(Config c,long epoch,long sampledAt,double[][] points){
        if(config!=c||!tiltAllowed||tiltEpoch!=epoch)return;
        long now=SystemClock.elapsedRealtime();
        if(points==null||points.length!=4||now-sampledAt>=250){invalidateCapture();return;}
        for(double[] p:points)if(p==null||p.length<2||!Double.isFinite(p[0])||!Double.isFinite(p[1])||p[0]<0||p[1]<0||p[0]>c.vw||p[1]>c.vh){invalidateCapture();return;}
        boolean near=capturePrevious!=null&&sampledAt>captureFrameMs&&sampledAt-captureFrameMs<250;
        if(near)for(int i=0;i<4;i++)if(Math.hypot(points[i][0]-capturePrevious[i][0],points[i][1]-capturePrevious[i][1])>Math.min(c.w,c.h)*0.08){near=false;break;}
        if(!near)invalidateCapture();
        captureStableFrames++;captureFrameMs=sampledAt;capturePrevious=points;
    }
    CornerPocTracker(Sink sink, java.io.File replayRoot, android.content.Context context){this.sink=sink;this.replay=new CornerReplayRecorder(replayRoot);this.colorModel=new ColorCornerPocModel(context);worker.execute(()->colorModel.warmup());}
    synchronized void tilt(boolean allowed){
        if(tiltAllowed!=allowed){tiltEpoch++;invalidateCapture();}
        tiltAllowed=allowed;
    }
    synchronized void configure(String token,boolean enabled,double vw,double vh,double x,double y,double w,double h){
        if(!enabled){if(config!=null&&config.token.equals(token)){config=null;invalidateCapture();}return;}
        double[] values={vw,vh,x,y,w,h};
        for(double v:values)if(!Double.isFinite(v))throw new IllegalArgumentException("INVALID_CORNER_CONFIG");
        if(token==null||token.isEmpty()||vw<=0||vh<=0||w<=0||h<=0||x<0||y<0||x+w>vw+1||y+h>vh+1)
            throw new IllegalArgumentException("INVALID_CORNER_CONFIG");
        invalidateCapture();config=new Config(token,vw,vh,x,y,w,h);
        android.util.Log.i("CornerDiag","CONFIG enabled preview="+vw+"x"+vh+" guide="+x+","+y+","+w+","+h);
    }
    synchronized void reset(){invalidateCapture();config=null;tiltAllowed=false;tiltEpoch++;}
    void close(){reset();try{worker.execute(()->colorModel.close());}finally{worker.shutdown();}}
    void offer(ImageProxy image){
        Config c=config;long now=SystemClock.elapsedRealtime();long epoch=tiltEpoch;
        if(now-diagnosticLastMs>=1000){diagnosticLastMs=now;android.util.Log.i("CornerDiag","FRAME config="+(c!=null)+" tilt="+tiltAllowed+" busy="+busy.get());}
        if(c==null||!tiltAllowed||now-lastSampleMs<125||!busy.compareAndSet(false,true))return;
        lastSampleMs=now;long id=++frameId;long capturedAt=System.currentTimeMillis();
        try{
            long copyStart=SystemClock.elapsedRealtimeNanos();
            Rect crop=image.getCropRect();ImageProxy.PlaneProxy p=image.getPlanes()[0];
            CornerPocDetector.Frame f=CornerPocDetector.snapshot(p.getBuffer().duplicate(),p.getRowStride(),p.getPixelStride(),
                crop.left,crop.top,crop.width(),crop.height(),image.getImageInfo().getRotationDegrees(),c.vw,c.vh);
            int[] colorCopy=null;
            try {
                ImageProxy.PlaneProxy[] planes=image.getPlanes();
                if(planes.length!=3)throw new IllegalStateException("RGB_REQUIRES_YUV420_3_PLANES");
                colorCopy=CornerYuvRgb.snapshot(planes[0].getBuffer().duplicate(),planes[0].getRowStride(),planes[0].getPixelStride(),
                    planes[1].getBuffer().duplicate(),planes[1].getRowStride(),planes[1].getPixelStride(),
                    planes[2].getBuffer().duplicate(),planes[2].getRowStride(),planes[2].getPixelStride(),
                    crop.left,crop.top,crop.width(),crop.height(),image.getImageInfo().getRotationDegrees(),f.w,f.h);
            }catch(Exception rgbError){android.util.Log.e("CornerHybrid","RGB_COPY_FAILED",rgbError);}
            final int[] ownedRgb=colorCopy;
            double copyMs=(SystemClock.elapsedRealtimeNanos()-copyStart)/1e6;
            worker.execute(()->{
                try{
                    if(config!=c||!tiltAllowed||tiltEpoch!=epoch)return;
                    long started=SystemClock.elapsedRealtimeNanos();
                    double[][] corners=CornerPocDetector.detect(f,c.x,c.y,c.w,c.h);
                    boolean rgbTried=corners==null;
                    if(rgbTried){try{corners=colorModel.predict(f,ownedRgb,c.x,c.y,c.w,c.h);}catch(Exception modelError){android.util.Log.e("CornerHybrid","RGB_DETECT_FAILED",modelError);}}
                    android.util.Log.i("CornerHybrid","RESULT version="+ColorCornerPocModel.VERSION+" frame="+id+" source="+(rgbTried?"RGB_MODEL_EDGE":"EDGE36")+" found="+(corners!=null)+" sharpness="+(rgbTried?colorModel.lastSharpness:Float.NaN)+" rgbCopied="+(ownedRgb!=null)+" ageMs="+(SystemClock.elapsedRealtime()-now));
                    double detectMs=(SystemClock.elapsedRealtimeNanos()-started)/1e6;
                    android.util.Log.i("CornerDiag","RESULT frame="+id+" found="+(corners!=null)+" ageMs="+(SystemClock.elapsedRealtime()-now)+" copyMs="+copyMs+" detectMs="+detectMs+" configCurrent="+(config==c)+" tilt="+tiltAllowed+" epochCurrent="+(tiltEpoch==epoch));
                    if(config!=c||!tiltAllowed||tiltEpoch!=epoch||SystemClock.elapsedRealtime()-now>=250){
                        synchronized(CornerPocTracker.this){if(config==c&&tiltEpoch==epoch)invalidateCapture();}
                        android.util.Log.i("CornerHybrid","FRAME_REJECTED_STALE_OR_CHANGED frame="+id);return;
                    }
                    JSObject out=new JSObject();out.put("token",c.token);out.put("frameId",id);
                    out.put("capturedAt",capturedAt);out.put("status",corners==null?"NOT_FOUND":"VALID");
                    out.put("copyMs",copyMs);out.put("detectMs",detectMs);
                    JSONArray points=new JSONArray();
                    if(corners!=null)for(double[] q:corners){JSObject point=new JSObject();point.put("x",q[0]);point.put("y",q[1]);points.put(point);}
                    recordCapture(c,epoch,now,corners);
                    out.put("points",points);sink.send(out);
                    try { replay.record(f,id,now,c.x,c.y,c.w,c.h,corners!=null); }
                    catch(Exception recordError){android.util.Log.e("CornerDiag","REPLAY_WRITE_ERROR",recordError);}
                }catch(Exception e){android.util.Log.e("CornerDiag","DETECT_ERROR",e); synchronized(CornerPocTracker.this){if(config==c&&tiltEpoch==epoch)invalidateCapture();} }
                finally{busy.set(false);}
            });
        }catch(Exception e){android.util.Log.e("CornerDiag","SNAPSHOT_ERROR",e);synchronized(this){if(config==c&&tiltEpoch==epoch)invalidateCapture();}busy.set(false);}
    }
}
