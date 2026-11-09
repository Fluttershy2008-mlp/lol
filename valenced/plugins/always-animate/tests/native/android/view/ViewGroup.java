package android.view;
import java.util.*;
public class ViewGroup extends View {
 public final ViewGroupOverlay overlay=new ViewGroupOverlay();public final List<View> children=new ArrayList<View>();public ViewGroupOverlay getOverlay(){return overlay;}
 public int getChildCount(){return children.size();}public View getChildAt(int i){return children.get(i);}public void addView(View view){children.add(view);view.parent=this;view.attached=attached;}
 public void layout(int l,int t,int r,int b){super.layout(l,t,r,b);for(View v:children)v.layout(0,0,r-l,b-t);}
}
