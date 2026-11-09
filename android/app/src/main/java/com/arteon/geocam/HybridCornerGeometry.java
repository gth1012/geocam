package com.arteon.geocam;

/** Camera POC only. No code reading, image rectification or verdict logic. */
final class HybridCornerGeometry {
    private static final int N=72;
    static double[][] order(double[][] input) {
        double[][] p=new double[4][2]; double cx=0,cy=0;
        for(int i=0;i<4;i++){p[i]=input[i].clone();cx+=p[i][0]/4;cy+=p[i][1]/4;}
        final double x=cx,y=cy;
        java.util.Arrays.sort(p,(a,b)->Double.compare(Math.atan2(a[1]-y,a[0]-x),Math.atan2(b[1]-y,b[0]-x)));
        int first=0;for(int i=1;i<4;i++)if(p[i][0]+p[i][1]<p[first][0]+p[first][1])first=i;
        double[][] out=new double[4][2];for(int i=0;i<4;i++)out[i]=p[(first+i)%4];return out;
    }
    static double dist(double[] a,double[] b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
    static boolean valid(CornerPocDetector.Frame f,double[][] p,double gx,double gy,double gw,double gh){
        if(p==null||p.length!=4)return false;
        for(double[] q:p)if(q==null||!Double.isFinite(q[0])||!Double.isFinite(q[1])||q[0]<2||q[1]<2||q[0]>f.w-3||q[1]>f.h-3)return false;
        for(int i=0;i<4;i++){
            double[] a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];
            double ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
            if(ux*vy-uy*vx<=0||Math.abs(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy))>.6)return false;
        }
        double t=dist(p[0],p[1])*f.viewScale,b=dist(p[2],p[3])*f.viewScale,l=dist(p[0],p[3])*f.viewScale,r=dist(p[1],p[2])*f.viewScale;
        double aw=(t+b)/2,ah=(l+r)/2;
        if(aw<gw*.6||aw>gw*1.4||ah<gh*.6||ah>gh*1.4||Math.abs(ah/aw-gh/gw)/(gh/gw)>.22||Math.abs(t-b)/aw>.3||Math.abs(l-r)/ah>.3)return false;
        double cx=0,cy=0;for(double[] q:p){cx+=q[0]*f.viewScale/4;cy+=q[1]*f.viewScale/4;}
        return Math.hypot(cx-f.offsetX-gx-gw/2,cy-f.offsetY-gy-gh/2)<=Math.min(gw,gh)*.25;
    }
    private static double pix(float[] im,int w,int h,double x,double y){
        x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));int ix=(int)x,iy=(int)y,jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);double fx=x-ix,fy=y-iy;
        return im[iy*w+ix]*(1-fx)*(1-fy)+im[iy*w+jx]*fx*(1-fy)+im[jy*w+ix]*(1-fx)*fy+im[jy*w+jx]*fx*fy;
    }
    static double[][] refine(CornerPocDetector.Frame f,double[][] p){
        float[] im=new float[f.w*f.h];int[] k={1,2,1};
        for(int y=0;y<f.h;y++)for(int x=0;x<f.w;x++){int sum=0;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++)sum+=(f.y[Math.max(0,Math.min(f.h-1,y+dy))*f.w+Math.max(0,Math.min(f.w-1,x+dx))]&255)*k[dx+1]*k[dy+1];im[y*f.w+x]=sum/16f;}
        double[][] lines=new double[4][3];
        for(int side=0;side<4;side++){
            double[] a=p[side],b=p[(side+1)%4];double len=dist(a,b),tx=(b[0]-a[0])/len,ty=(b[1]-a[1])/len,nx=-ty,ny=tx;
            double[] ss=new double[N],dd=new double[N];int count=0;
            for(int i=0;i<N;i++){
                double s=(.08+.84*i/(N-1))*len,bx=a[0]+s*tx,by=a[1]+s*ty,best=-1,gradient=0;int offset=0;
                for(int d=-6;d<=6;d++){
                    double g=Math.abs(pix(im,f.w,f.h,bx+(d+2)*nx,by+(d+2)*ny)-pix(im,f.w,f.h,bx+(d-2)*nx,by+(d-2)*ny));double score=g-.35*Math.abs(d);
                    if(score>best){best=score;gradient=g;offset=d;}
                }
                if(gradient>=8){ss[count]=s;dd[count]=offset;count++;}
            }
            if(count<33)return null;
            double slope=0,intercept=0;
            for(int pass=0;pass<4;pass++){
                double sw=0,sx=0,sy=0,sxx=0,sxy=0;
                for(int i=0;i<count;i++){double e=Math.abs(dd[i]-slope*ss[i]-intercept),weight=pass==0||e<=1.345?1:1.345/e;sw+=weight;sx+=weight*ss[i];sy+=weight*dd[i];sxx+=weight*ss[i]*ss[i];sxy+=weight*ss[i]*dd[i];}
                double den=sw*sxx-sx*sx;if(Math.abs(den)<1e-8)return null;slope=(sw*sxy-sx*sy)/den;intercept=(sy-slope*sx)/sw;
            }
            if(1/Math.sqrt(1+slope*slope)<.97)return null;
            int n=0;double lo=Double.POSITIVE_INFINITY,hi=-lo;
            for(int i=0;i<count;i++)if(Math.abs(dd[i]-slope*ss[i]-intercept)/Math.sqrt(1+slope*slope)<=2.5){n++;lo=Math.min(lo,ss[i]);hi=Math.max(hi,ss[i]);}
            if(n<33||hi-lo<len*.50)return null;
            double lx=nx-slope*tx,ly=ny-slope*ty;lines[side]=new double[]{lx,ly,lx*a[0]+ly*a[1]+intercept};
        }
        double[][] out=new double[4][2];
        for(int i=0;i<4;i++){double[] a=lines[(i+3)%4],b=lines[i];double det=a[0]*b[1]-a[1]*b[0];if(Math.abs(det)<.2)return null;out[i]=new double[]{(a[2]*b[1]-a[1]*b[2])/det,(a[0]*b[2]-a[2]*b[0])/det};}
        return out;
    }
}
