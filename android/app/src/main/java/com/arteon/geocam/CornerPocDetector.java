package com.arteon.geocam;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/** Display-only experiment. No capture, crop, upload or verdict authority. */
public final class CornerPocDetector {
    public static final class Frame {
        final int w, h;
        final byte[] y;
        final double viewScale, offsetX, offsetY;
        Frame(int w, int h, byte[] y, double scale, double ox, double oy) {
            this.w=w; this.h=h; this.y=y; viewScale=scale; offsetX=ox; offsetY=oy;
        }
        double[] toView(double x, double y) {
            return new double[]{x*viewScale-offsetX, y*viewScale-offsetY};
        }
    }

    // Copy while ImageProxy is alive; worker receives owned bytes only.
    // CropRect and all four right-angle rotations are handled explicitly.
    public static Frame snapshot(ByteBuffer plane, int rowStride, int pixelStride,
            int left, int top, int width, int height, int rotation, double vw, double vh) {
        if (width<8 || height<8 || vw<=0 || vh<=0 || rowStride<=0 || pixelStride<=0)
            throw new IllegalArgumentException("INVALID_FRAME");
        if (rotation!=0 && rotation!=90 && rotation!=180 && rotation!=270)
            throw new IllegalArgumentException("INVALID_ROTATION");
        int rw=(rotation==90 || rotation==270)?height:width;
        int rh=(rotation==90 || rotation==270)?width:height;
        // Same scale on both axes; keep exact view transform despite raster rounding.
        double reduction=Math.min(1.0, 640.0/Math.max(rw,rh));
        int ow=Math.max(1,(int)Math.round(rw*reduction));
        int oh=Math.max(1,(int)Math.round(rh*reduction));
        // Sample directly in view aspect to avoid using an approximate shared x/y scale.
        double imageToView=Math.max(vw/rw,vh/rh);
        double outToView=imageToView/reduction;
        double ox=(rw*imageToView-vw)/2, oy=(rh*imageToView-vh)/2;
        byte[] out=new byte[ow*oh];
        int base=plane.position();
        for(int y=0;y<oh;y++) for(int x=0;x<ow;x++) {
            int u=Math.min(rw-1,(int)((x+0.5)/reduction));
            int v=Math.min(rh-1,(int)((y+0.5)/reduction));
            int sx,sy;
            if(rotation==90){sx=v;sy=height-1-u;}
            else if(rotation==180){sx=width-1-u;sy=height-1-v;}
            else if(rotation==270){sx=width-1-v;sy=u;}
            else{sx=u;sy=v;}
            int at=base+(top+sy)*rowStride+(left+sx)*pixelStride;
            if(at<base || at>=plane.limit()) throw new IllegalArgumentException("PLANE_BOUNDS");
            out[y*ow+x]=plane.get(at);
        }
        return new Frame(ow,oh,out,outToView,ox,oy);
    }

    private static double sample(Frame f, int x, int y) {
        x=Math.max(1,Math.min(f.w-2,x)); y=Math.max(1,Math.min(f.h-2,y));
        int sum=0;
        for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) sum+=f.y[(y+dy)*f.w+x+dx]&255;
        return sum/9.0;
    }
    private static double[] fit(List<double[]> pts, double tol, double span) {
        if(pts.size()<24) return null;
        double bestA=0,bestB=0; int best=0;
        // Deterministic RANSAC; avoid random state across camera sessions.
        for(int i=0;i<pts.size();i+=3) for(int j=i+8;j<pts.size();j+=7) {
            double[] p=pts.get(i),q=pts.get(j);
            if(Math.abs(q[0]-p[0])<span*0.25) continue;
            double a=(q[1]-p[1])/(q[0]-p[0]),b=p[1]-a*p[0];
            if(Math.abs(a)>0.55) continue;
            int n=0; for(double[] r:pts) if(Math.abs(r[1]-a*r[0]-b)<=tol)n++;
            if(n>best){best=n;bestA=a;bestB=b;}
        }
        if(best<36)return null; // POC support 36; RGB fallback is verified separately
        for(int pass=0;pass<2;pass++){
            double sx=0,sy=0,sxx=0,sxy=0; int n=0;
            for(double[] p:pts)if(Math.abs(p[1]-bestA*p[0]-bestB)<=tol){n++;sx+=p[0];sy+=p[1];sxx+=p[0]*p[0];sxy+=p[0]*p[1];}
            double den=n*sxx-sx*sx; if(n<24 || Math.abs(den)<1e-6)return null;
            bestA=(n*sxy-sx*sy)/den;bestB=(sy-bestA*sx)/n;
        }
        int n=0;double lo=Double.POSITIVE_INFINITY,hi=-lo,err=0;
        for(double[] p:pts){double e=p[1]-bestA*p[0]-bestB;if(Math.abs(e)<=tol){n++;lo=Math.min(lo,p[0]);hi=Math.max(hi,p[0]);err+=e*e;}}
        if(n<36 || hi-lo<span*0.60 || Math.sqrt(err/n)>tol*0.85)return null;
        // A similarly supported distinct edge is ambiguous: do not guess a border.
        for(int i=0;i<pts.size();i+=3)for(int j=i+8;j<pts.size();j+=7){
            double[] p=pts.get(i),q=pts.get(j);
            if(Math.abs(q[0]-p[0])<span*.25)continue;
            double a=(q[1]-p[1])/(q[0]-p[0]),b=p[1]-a*p[0];
            if(Math.abs(a)>.55 || Math.abs((a-bestA)*(lo+hi)/2+b-bestB)<Math.max(tol*3,span*.04))continue;
            int rival=0;for(double[] r:pts)if(Math.abs(r[1]-a*r[0]-b)<=tol)rival++;
            if(rival>=Math.max(36,n*.90))return null;
        }
        return new double[]{bestA,bestB};
    }
    private static double[] edge(Frame f, boolean horizontal, double start, double end, double center, double band) {
        List<double[]> pts=new ArrayList<>();
        for(int i=0;i<72;i++){
            int fixed=(int)Math.round(start+(end-start)*(i+0.5)/72);
            int low=(int)Math.ceil(center-band),high=(int)Math.floor(center+band);
            int limit=horizontal?f.h:f.w;
            low=Math.max(4,low); high=Math.min(limit-5,high);
            if(high<low)continue;
            double[] gradients=new double[high-low+1];
            for(int v=low;v<=high;v++){
                double g=horizontal?Math.abs(sample(f,fixed,v+2)-sample(f,fixed,v-2))
                    :Math.abs(sample(f,v+2,fixed)-sample(f,v-2,fixed));
                gradients[v-low]=g;
            }
            // Keep up to three distinct local candidates. Card artwork may have
            // a stronger edge than the physical boundary in an individual scan.
            int suppress=(int)Math.ceil(2*Math.max(1.6,(end-start)*.009))+1;
            for(int candidate=0;candidate<3;candidate++){
                double best=14;int at=-1;
                for(int k=0;k<gradients.length;k++)if(gradients[k]>best){best=gradients[k];at=k;}
                if(at<0)break;
                pts.add(new double[]{fixed,low+at});
                for(int k=Math.max(0,at-suppress);k<=Math.min(gradients.length-1,at+suppress);k++)gradients[k]=0;
            }
        }
        return fit(pts,Math.max(1.6,(end-start)*0.009),end-start);
    }
    private static double[] intersect(double[] h,double[] v){
        double den=1-h[0]*v[0];if(Math.abs(den)<0.2)return null;
        double y=(h[0]*v[1]+h[1])/den;return new double[]{v[0]*y+v[1],y};
    }
    private static double dist(double[] a,double[] b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
    public static double[][] detect(Frame f,double gx,double gy,double gw,double gh) {
        double x=(gx+f.offsetX)/f.viewScale,y=(gy+f.offsetY)/f.viewScale;
        double w=gw/f.viewScale,h=gh/f.viewScale;
        if(w<40 || h<60)return null;
        double[] top=edge(f,true,x+w*.08,x+w*.92,y,h*.22);
        double[] bottom=edge(f,true,x+w*.08,x+w*.92,y+h,h*.22);
        double[] left=edge(f,false,y+h*.08,y+h*.92,x,w*.22);
        double[] right=edge(f,false,y+h*.08,y+h*.92,x+w,w*.22);
        if(top==null||bottom==null||left==null||right==null)return null;
        double[][] c={intersect(top,left),intersect(top,right),intersect(bottom,right),intersect(bottom,left)};
        for(double[] p:c)if(p==null||!Double.isFinite(p[0])||!Double.isFinite(p[1])||p[0]<3||p[1]<3||p[0]>f.w-4||p[1]>f.h-4)return null;
        double t=dist(c[0],c[1]),b=dist(c[3],c[2]),l=dist(c[0],c[3]),r=dist(c[1],c[2]);
        double aw=(t+b)/2,ah=(l+r)/2;
        if(aw<w*.6||aw>w*1.4||ah<h*.6||ah>h*1.4)return null;
        if(Math.abs(ah/aw-h/w)/(h/w)>.22 || Math.abs(t-b)/aw>.30 || Math.abs(l-r)/ah>.30)return null;
        // Convex, clockwise in screen coordinates, and not a near-degenerate quad.
        for(int i=0;i<4;i++){
            double[] p=c[i],q=c[(i+1)%4],s=c[(i+2)%4];
            double ax=q[0]-p[0],ay=q[1]-p[1],bx=s[0]-q[0],by=s[1]-q[1];
            if(ax*by-ay*bx<=0 || Math.abs(ax*bx+ay*by)/Math.hypot(ax,ay)/Math.hypot(bx,by)>.6)return null;
        }
        for(int i=0;i<4;i++)c[i]=f.toView(c[i][0]+0.5,c[i][1]+0.5);
        return c;
    }
}
