package com.arteon.geocam;
import java.nio.ByteBuffer;
/** Owns RGB samples before ImageProxy.close; never retains camera plane buffers. */
final class CornerYuvRgb {
    private static int clamp(int x){return Math.max(0,Math.min(255,x));}
    static int color(int y,int u,int v){int c=Math.max(0,y-16),d=u-128,e=v-128;return 0xff000000|(clamp((298*c+409*e+128)>>8)<<16)|(clamp((298*c-100*d-208*e+128)>>8)<<8)|clamp((298*c+516*d+128)>>8);}
    static int[] snapshot(ByteBuffer y,int ys,int yp,ByteBuffer u,int us,int up,ByteBuffer v,int vs,int vp,
            int left,int top,int width,int height,int rotation,int ow,int oh){
        if(rotation!=0&&rotation!=90&&rotation!=180&&rotation!=270)throw new IllegalArgumentException("RGB_ROTATION");
        int rw=rotation==90||rotation==270?height:width,rh=rotation==90||rotation==270?width:height;
        double reduction=Math.min(1,640.0/Math.max(rw,rh));
        if(ow!=Math.round(rw*reduction)||oh!=Math.round(rh*reduction))throw new IllegalArgumentException("RGB_FRAME_MISMATCH");
        int[] out=new int[ow*oh];int yb=y.position(),ub=u.position(),vb=v.position();
        for(int oy=0;oy<oh;oy++)for(int ox=0;ox<ow;ox++){
            int a=Math.min(rw-1,(int)((ox+.5)/reduction)),b=Math.min(rh-1,(int)((oy+.5)/reduction)),sx,sy;
            if(rotation==90){sx=b;sy=height-1-a;}else if(rotation==180){sx=width-1-a;sy=height-1-b;}else if(rotation==270){sx=width-1-b;sy=a;}else{sx=a;sy=b;}
            sx+=left;sy+=top;
            int yy=y.get(yb+sy*ys+sx*yp)&255,uu=u.get(ub+(sy/2)*us+(sx/2)*up)&255,vv=v.get(vb+(sy/2)*vs+(sx/2)*vp)&255;
            out[oy*ow+ox]=color(yy,uu,vv);
        }
        return out;
    }
}
