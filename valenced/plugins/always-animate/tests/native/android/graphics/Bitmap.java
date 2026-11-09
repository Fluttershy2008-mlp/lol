package android.graphics;import java.awt.image.*;import java.awt.*;public class Bitmap {
 public enum Config {ARGB_8888}public final BufferedImage pixels;public boolean recycled;public Bitmap(BufferedImage b){pixels=b;}
 public static Bitmap createBitmap(int w,int h,Config c){return new Bitmap(new BufferedImage(w,h,BufferedImage.TYPE_INT_ARGB));}
 public Bitmap copy(Config c,boolean mutable){Bitmap b=createBitmap(pixels.getWidth(),pixels.getHeight(),c);Graphics2D g=b.pixels.createGraphics();g.setComposite(AlphaComposite.Src);g.drawImage(pixels,0,0,null);g.dispose();return b;}
 public static Bitmap createScaledBitmap(Bitmap b,int w,int h,boolean filter){if(w==b.pixels.getWidth()&&h==b.pixels.getHeight())return b;Bitmap out=createBitmap(w,h,Config.ARGB_8888);Graphics2D g=out.pixels.createGraphics();g.drawImage(b.pixels,0,0,w,h,null);g.dispose();return out;}
 public void recycle(){recycled=true;}
}