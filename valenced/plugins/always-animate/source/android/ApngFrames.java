/* SPDX-License-Identifier: GPL-3.0-or-later */
package dev.fluttershy.alwaysanimate;
import java.io.*;
import java.util.*;
import java.util.zip.CRC32;

/** APNG chunk reconstruction and compositing, independent of Discord classes. */
public final class ApngFrames {
  public interface Pixels {
    Object empty(int w,int h)throws Exception;
    Object decode(byte[] png)throws Exception;
    Object copy(Object image)throws Exception;
    Object snapshot(Object image,int w,int h)throws Exception;
    void clear(Object image,int x,int y,int w,int h)throws Exception;
    void draw(Object canvas,Object image,int x,int y)throws Exception;
    void release(Object image);
  }
  public static final class Result {
    public final List<Object> images=new ArrayList<Object>();
    public final List<Integer> delays=new ArrayList<Integer>();
    public int width,height;
    public long bytes(){return (long)width*height*4*images.size();}
  }
  private static final byte[] SIGNATURE={(byte)137,80,78,71,13,10,26,10};
  private static final class Frame {
    int w,h,x,y,delay=100,dispose,blend;
    final ByteArrayOutputStream data=new ByteArrayOutputStream();
  }
  private static int integer(byte[] b,int p)throws IOException {
    if(p<0 || p+4>b.length)throw new IOException("truncated PNG integer");
    return (b[p]&255)<<24|(b[p+1]&255)<<16|(b[p+2]&255)<<8|(b[p+3]&255);
  }
  private static int small(byte[] b,int p){return (b[p]&255)<<8|(b[p+1]&255);}
  private static void put(byte[] b,int p,int n){b[p]=(byte)(n>>>24);b[p+1]=(byte)(n>>>16);b[p+2]=(byte)(n>>>8);b[p+3]=(byte)n;}
  private static void chunk(DataOutputStream out,String type,byte[] data)throws IOException {
    byte[] tag=type.getBytes("US-ASCII");out.writeInt(data.length);out.write(tag);out.write(data);
    CRC32 crc=new CRC32();crc.update(tag);crc.update(data);out.writeInt((int)crc.getValue());
  }
  public static Result decode(byte[] bytes,int target,Pixels pixels)throws Exception {
    if(bytes.length>8*1024*1024 || bytes.length<33 || !Arrays.equals(Arrays.copyOf(bytes,8),SIGNATURE))throw new IOException("not a PNG asset");
    byte[] header=null;int width=0,height=0,expected=0,sequence=0;boolean animated=false,ended=false;
    ByteArrayOutputStream shared=new ByteArrayOutputStream();List<Frame> frames=new ArrayList<Frame>();Frame frame=null;
    for(int pos=8;pos<bytes.length;) {
      int len=integer(bytes,pos);if(len<0 || len>bytes.length-pos-12)throw new IOException("invalid PNG chunk length");
      String type=new String(bytes,pos+4,4,"US-ASCII");int data=pos+8;
      CRC32 crc=new CRC32();crc.update(bytes,pos+4,len+4);if((int)crc.getValue()!=integer(bytes,data+len))throw new IOException("PNG CRC mismatch");
      if(type.equals("IHDR")) {
        if(header!=null || len!=13 || pos!=8)throw new IOException("invalid PNG header");
        header=Arrays.copyOfRange(bytes,data,data+13);width=integer(header,0);height=integer(header,4);
        if(width<1 || height<1 || width>2048 || height>2048)throw new IOException("PNG canvas too large");
      }else if(type.equals("acTL")) {
        if(len!=8)throw new IOException("invalid APNG animation control");animated=true;expected=integer(bytes,data);
        if(expected<1 || expected>600)throw new IOException("APNG frame limit exceeded");
      }else if(type.equals("fcTL")) {
        if(!animated || len!=26 || integer(bytes,data)!=sequence++)throw new IOException("invalid APNG frame control");
        if(frame!=null){if(frame.data.size()==0)throw new IOException("empty APNG frame");frames.add(frame);}
        frame=new Frame();frame.w=integer(bytes,data+4);frame.h=integer(bytes,data+8);frame.x=integer(bytes,data+12);frame.y=integer(bytes,data+16);
        if(frame.w<1 || frame.h<1 || frame.x<0 || frame.y<0 || (long)frame.x+frame.w>width || (long)frame.y+frame.h>height)throw new IOException("APNG frame outside canvas");
        int den=small(bytes,data+22);if(den==0)den=100;
        frame.delay=Math.max(20,(int)Math.round(1000.0*small(bytes,data+20)/den));frame.dispose=bytes[data+24]&255;frame.blend=bytes[data+25]&255;
        if(frame.dispose>2 || frame.blend>1)throw new IOException("unknown APNG composite operation");
      }else if(type.equals("IDAT")) {
        if(!animated && frame==null){frame=new Frame();frame.w=width;frame.h=height;}
        // An APNG default image preceding fcTL is only a fallback, not a frame.
        if(frame!=null)frame.data.write(bytes,data,len);
      }else if(type.equals("fdAT")) {
        if(frame==null || len<4 || integer(bytes,data)!=sequence++)throw new IOException("invalid APNG frame data");frame.data.write(bytes,data+4,len-4);
      }else if(type.equals("IEND")){ended=true;break;}
      else if(type.equals("PLTE") || type.equals("tRNS") || type.equals("sRGB") || type.equals("gAMA") || type.equals("cHRM"))shared.write(bytes,pos,len+12);
      pos+=len+12;
    }
    if(frame!=null && frame.data.size()>0)frames.add(frame);
    if(!ended || header==null || frames.isEmpty() || (animated && frames.size()!=expected))throw new IOException("incomplete PNG animation");
    Result result=new Result();int edge=Math.min(192,Math.max(16,target));
    edge=Math.min(edge,(int)Math.sqrt(2*1024*1024/frames.size()));
    double scale=Math.min(1.0,edge/(double)Math.max(width,height));result.width=Math.max(1,(int)Math.round(width*scale));result.height=Math.max(1,(int)Math.round(height*scale));
    Object canvas=pixels.empty(width,height);
    try {
      for(Frame f:frames) {
        byte[] ihdr=header.clone();put(ihdr,0,f.w);put(ihdr,4,f.h);
        ByteArrayOutputStream png=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(png);
        out.write(SIGNATURE);chunk(out,"IHDR",ihdr);out.write(shared.toByteArray());chunk(out,"IDAT",f.data.toByteArray());chunk(out,"IEND",new byte[0]);
        Object image=pixels.decode(png.toByteArray()),previous=null;
        if(image==null)throw new IOException("PNG frame decode failed");
        try {
          if(f.dispose==2)previous=pixels.copy(canvas);
          if(f.blend==0)pixels.clear(canvas,f.x,f.y,f.w,f.h);
          pixels.draw(canvas,image,f.x,f.y);result.images.add(pixels.snapshot(canvas,result.width,result.height));result.delays.add(f.delay);
          if(f.dispose==1)pixels.clear(canvas,f.x,f.y,f.w,f.h);
          if(f.dispose==2){pixels.clear(canvas,0,0,width,height);pixels.draw(canvas,previous,0,0);}
        }finally{pixels.release(image);if(previous!=null)pixels.release(previous);}
      }
    }catch(Exception e){for(Object image:result.images)pixels.release(image);throw e;}
    finally{pixels.release(canvas);}
    return result;
  }
}
