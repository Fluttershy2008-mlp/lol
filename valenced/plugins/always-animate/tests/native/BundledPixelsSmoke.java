import dev.fluttershy.alwaysanimate.ApngFrames;import java.nio.file.*;import java.lang.reflect.*;import java.util.*;import android.graphics.Bitmap;
public class BundledPixelsSmoke {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 public static void main(String[] args)throws Exception {
  Class<?> type=Class.forName("dev.fluttershy.alwaysanimate.BundledFramePlayer$AndroidPixels");Constructor<?> constructor=type.getDeclaredConstructor();constructor.setAccessible(true);ApngFrames.Pixels backend=(ApngFrames.Pixels)constructor.newInstance();
  for(String file:new String[]{"frames.png","default.png"}) {
   byte[] png=Files.readAllBytes(Paths.get("native-build/fixtures/"+file));ApngFrames.Result frames=ApngFrames.decode(png,96,backend);
   check(frames.images.size()==4 && frames.delays.equals(Arrays.asList(60,80,100,120)),"APNG frame count and real timing");
   Bitmap first=(Bitmap)frames.images.get(0),second=(Bitmap)frames.images.get(1),third=(Bitmap)frames.images.get(2),fourth=(Bitmap)frames.images.get(3);
   check(first.pixels.getRGB(0,0)==0xffff0000,"first frame red; hidden default image excluded");
   check(second.pixels.getRGB(1,0)==0xff0000ff,"frame offset and SOURCE operation");
   check(third.pixels.getRGB(1,0)==0xffff0000 && third.pixels.getRGB(2,0)==0xff00ff00,"PREVIOUS disposal restores exact canvas");
   check(fourth.pixels.getRGB(2,0)==0,"BACKGROUND disposal clears transparency");
   int blend=fourth.pixels.getRGB(0,1);check(((blend>>>16)&255)==127 && (blend&255)==128,"OVER alpha composition");
   check(first.pixels.getRGB(1,0)==0xffff0000 && !first.recycled,"stored frames independent from mutable/recycled compositor");
   png[44]^=1;boolean rejected=false;try{ApngFrames.decode(png,96,backend);}catch(java.io.IOException error){rejected=true;}check(rejected,"corrupt PNG rejected before drawing");
  }
  System.out.println("PASS: real PNG decompression, APNG frame reconstruction, offsets, SOURCE/OVER blend, BACKGROUND/PREVIOUS disposal, hidden default image, timing, snapshots and CRC validation.");
 }
}
