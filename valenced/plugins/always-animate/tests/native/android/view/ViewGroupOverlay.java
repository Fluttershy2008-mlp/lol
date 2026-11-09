package android.view;
import java.util.*;
public class ViewGroupOverlay {public final List<View> views=new ArrayList<View>();public void add(View v){if(!views.contains(v))views.add(v);v.attached=true;}public void remove(View v){views.remove(v);v.attached=false;}}
