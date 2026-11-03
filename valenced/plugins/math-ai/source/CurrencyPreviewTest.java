package dev.fluttershy2008.mathai;

import android.text.Editable;
import android.graphics.Canvas;
import android.graphics.Paint;
import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.Map;

/** Host tests for source/span ownership, not a claim of phone UI execution. */
public final class CurrencyPreviewTest {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    static final class Record { int start, end, flags; Record(int s, int e, int f) { start=s; end=e; flags=f; } }
    static final class Text implements Editable {
        final String raw;
        final IdentityHashMap<Object, Record> spans = new IdentityHashMap<Object, Record>();
        Text(String raw) { this.raw=raw; }
        public int length() { return raw.length(); }
        public char charAt(int i) { return raw.charAt(i); }
        public CharSequence subSequence(int s, int e) { return raw.subSequence(s,e); }
        public String toString() { return raw; }
        public void setSpan(Object span, int s, int e, int f) { spans.put(span,new Record(s,e,f)); }
        public void removeSpan(Object span) { spans.remove(span); }
        public int getSpanStart(Object span) { return spans.containsKey(span)?spans.get(span).start:-1; }
        public int getSpanEnd(Object span) { return spans.containsKey(span)?spans.get(span).end:-1; }
        public int getSpanFlags(Object span) { return spans.containsKey(span)?spans.get(span).flags:0; }
        @SuppressWarnings("unchecked") public <T> T[] getSpans(int s, int e, Class<T> type) {
            ArrayList<T> found=new ArrayList<T>();
            for (Map.Entry<Object,Record> item:spans.entrySet())
                if (type.isInstance(item.getKey()) && item.getValue().end>=s && item.getValue().start<=e) found.add((T)item.getKey());
            return found.toArray((T[])Array.newInstance(type,found.size()));
        }
    }
    static final class Drawing extends Canvas {
        String drawn="";
        public void drawText(String text,float x,float y,Paint paint) { drawn=text; }
    }
    public static void main(String[] args) {
        String raw="10 myr to sgd",label="10 MYR ≈ 3.10 SGD · 2026-11-03";
        Text text=new Text(raw);Object selection=new Object(),foreign=new Object();
        text.setSpan(selection,raw.length(),raw.length(),34);text.setSpan(foreign,0,2,33);
        check(CurrencyPreview.restyle(text,raw,label),"adds display span");
        CurrencyPreview.ConversionSpan[] own=text.getSpans(0,text.length(),CurrencyPreview.ConversionSpan.class);
        check(own.length==1 && own[0].label.equals(label),"shows fetched conversion");
        check(text.toString().equals(raw),"original query retained");
        check(text.getSpanStart(selection)==raw.length() && text.getSpanEnd(selection)==raw.length(),"selection preserved");
        check(text.getSpanStart(foreign)==0 && text.getSpanEnd(foreign)==2,"foreign formatting preserved");
        check(!CurrencyPreview.restyle(text,raw,label),"identical render does not churn spans");
        check(own[0]==text.getSpans(0,text.length(),CurrencyPreview.ConversionSpan.class)[0],"reuses existing span");
        Paint paint=new Paint();Drawing canvas=new Drawing();
        check(own[0].getSize(paint,text,0,text.length(),new Paint.FontMetricsInt())>0,"native layout reserves display width");
        own[0].draw(canvas,text,0,text.length(),0,0,20,30,paint);check(canvas.drawn.equals(label),"native canvas draws conversion");
        check(CurrencyPreview.restyle(text,"20 myr to sgd",label),"stale source clears span");
        check(text.getSpans(0,text.length(),CurrencyPreview.ConversionSpan.class).length==0,"no stale answer remains");
        check(text.getSpanStart(selection)==raw.length() && text.getSpanStart(foreign)==0,"clear retains other spans");
        Object composing=new Object();text.setSpan(composing,0,2,256);
        check(!CurrencyPreview.restyle(text,raw,label),"does not obscure IME composition");text.removeSpan(composing);
        check(CurrencyPreview.restyle(text,raw,label),"restores after composition ends");
        check(CurrencyPreview.restyle(text,"",""),"disable clears owned span");
        check(text.toString().equals(raw) && text.getSpanStart(foreign)==0,"disable leaves source and Markdown untouched");
        check(!CurrencyPreview.restyle(null,raw,label),"null editor is safe");
        System.out.println("Currency preview: "+checks+" native span checks passed.");
    }
}
