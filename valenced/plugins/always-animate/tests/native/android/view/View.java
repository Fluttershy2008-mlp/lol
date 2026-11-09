package android.view;
import android.content.Context;
import java.util.*;
public class View {
 public interface OnLayoutChangeListener {void onLayoutChange(View v,int l,int t,int r,int b,int ol,int ot,int or,int ob);}
 public interface OnAttachStateChangeListener {void onViewAttachedToWindow(View v);void onViewDetachedFromWindow(View v);}
 public final List<OnLayoutChangeListener> layouts=new ArrayList<OnLayoutChangeListener>();
 public final List<OnAttachStateChangeListener> attaches=new ArrayList<OnAttachStateChangeListener>();
 public int left=10,top=20,width=80,height=80,visibility; public float alpha=1,tx,ty; public boolean attached=true;public Object parent;
 public final ViewTreeObserver observer=new ViewTreeObserver();public ViewTreeObserver getViewTreeObserver(){return observer;}
 public Context getContext(){return new Context();} public Object getParent(){return parent;}
 public int getLeft(){return left;}public int getTop(){return top;}public int getWidth(){return width;}public int getHeight(){return height;}
 public float getAlpha(){return alpha;}public void setAlpha(float a){alpha=a;}
 public float getTranslationX(){return tx;}public float getTranslationY(){return ty;}public void setTranslationX(float v){tx=v;}public void setTranslationY(float v){ty=v;}
 public int getVisibility(){return visibility;}public void setVisibility(int v){visibility=v;}
 public boolean isAttachedToWindow(){return attached;}
 public void setClickable(boolean v){}public void setFocusable(boolean v){}public void setImportantForAccessibility(int v){}
 public void addOnLayoutChangeListener(OnLayoutChangeListener l){layouts.add(l);}public void removeOnLayoutChangeListener(OnLayoutChangeListener l){layouts.remove(l);}
 public void addOnAttachStateChangeListener(OnAttachStateChangeListener l){attaches.add(l);}public void removeOnAttachStateChangeListener(OnAttachStateChangeListener l){attaches.remove(l);}
 public void measure(int w,int h){}public void layout(int l,int t,int r,int b){left=l;top=t;width=r-l;height=b-t;}
 public void relayout(int l,int t,int w,int h){left=l;top=t;width=w;height=h;for(OnLayoutChangeListener x:new ArrayList<OnLayoutChangeListener>(layouts))x.onLayoutChange(this,l,t,l+w,t+h,0,0,0,0);}
 public boolean postDelayed(Runnable task,long delay){android.os.Handler.tasks.add(task);return true;}public boolean removeCallbacks(Runnable task){return android.os.Handler.tasks.remove(task);}
 public void attach(){attached=true;for(OnAttachStateChangeListener x:new ArrayList<OnAttachStateChangeListener>(attaches))x.onViewAttachedToWindow(this);}
 public void detach(){attached=false;for(OnAttachStateChangeListener x:new ArrayList<OnAttachStateChangeListener>(attaches))x.onViewDetachedFromWindow(this);}
}
