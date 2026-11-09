package android.view;import java.util.*;public class ViewTreeObserver {
 public interface OnPreDrawListener {boolean onPreDraw();}
 public final List<OnPreDrawListener> listeners=new ArrayList<OnPreDrawListener>();
 public void addOnPreDrawListener(OnPreDrawListener l){listeners.add(l);}public void removeOnPreDrawListener(OnPreDrawListener l){listeners.remove(l);}
 public void draw(){for(OnPreDrawListener l:new ArrayList<OnPreDrawListener>(listeners))if(!l.onPreDraw())throw new AssertionError("must not cancel draw");}
}