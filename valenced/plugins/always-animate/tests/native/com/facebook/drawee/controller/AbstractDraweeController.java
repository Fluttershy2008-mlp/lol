package com.facebook.drawee.controller;
import java.util.*;
public class AbstractDraweeController {
 public final Object request;
 public boolean loaded;
 public boolean supportsAnimation=true;
 public AbstractDraweeController(Object request){this.request=request;}
 public final List<ControllerListener> listeners=new ArrayList<ControllerListener>();
 public final Animation animation=new Animation();
 public android.graphics.drawable.Animatable getAnimatable(){return loaded && supportsAnimation?animation:null;}
 public void addControllerListener(ControllerListener l){listeners.add(l);}
 public void removeControllerListener(ControllerListener l){listeners.remove(l);}
 public void onAttach(){}
 public void onNewResultInternal(){loaded=true;}
 public void loaded(){for(ControllerListener l:new ArrayList<ControllerListener>(listeners))l.onFinalImageSet("test",null,animation);}
 public static class Animation implements android.graphics.drawable.Animatable {public int starts,stops;public boolean running; public void start(){starts++;running=true;} public void stop(){stops++;running=false;}public boolean isRunning(){return running;}}
}
