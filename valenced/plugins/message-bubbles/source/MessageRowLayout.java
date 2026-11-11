package dev.fluttershy2008.messagebubbles;

import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

final class MessageRowLayout {
    private static final String REACTIONS = "com.discord.reactions.ShortcutsFlexbox";
    private static final int FLEX_END = 1;
    private static final int FLEX_START = 0;
    private final Map<ViewGroup, Row> rows = new WeakHashMap<>();
    private final Map<View, ReactionAlignment> reactionJustification = new WeakHashMap<>();
    private Class<?> reactions;
    private Method getJustify;
    private Method setJustify;
    private volatile boolean active;

    void install(ClassLoader loader, List<XC_MethodHook.Unhook> hooks) {
        try {
            reactions = loader.loadClass(REACTIONS);
            getJustify = reactions.getMethod("getJustifyContent");
            setJustify = reactions.getMethod("setJustifyContent", int.class);
            Method layout = getJustify.getDeclaringClass().getDeclaredMethod(
                "onLayout", boolean.class, int.class, int.class, int.class, int.class);
            hooks.add(XposedBridge.hookMethod(layout, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam param) {
                    updateReaction((View) param.thisObject);
                }
            }));
            active = true;
        } catch (ReflectiveOperationException | RuntimeException error) {
            XposedBridge.log("[Message Bubbles] Reaction alignment unavailable: " + error);
        }
    }

    void restoreRow(ViewGroup row) {
        Row state = rows.remove(row);
        if (state == null) return;
        for (Map.Entry<View, Integer> entry : state.visibility.entrySet()) {
            View view = entry.getKey();
            if (view != null && view.getVisibility() == View.GONE) view.setVisibility(entry.getValue());
        }
        if (state.quote != null) state.quote.restore();
    }

    void applyRow(ViewGroup row, boolean own) {
        Row state = new Row(!own);
        rows.put(row, state);
        if (own) {
            for (String name : new String[] {"header", "author_avatar", "author_avatar_decoration"}) {
                View view = directChild(row, name);
                if (view == null || view.getVisibility() == View.GONE) continue;
                state.visibility.put(view, view.getVisibility());
                view.setVisibility(View.GONE);
            }
            return;
        }
        View preview = directChild(row, "reply_preview_view");
        if (preview instanceof ViewGroup && preview.getVisibility() == View.VISIBLE) {
            state.quote = new Quote((ViewGroup) preview);
        }
    }

    void updateReaction(View view) {
        if (!active || !reactions.isInstance(view) || !MessageBubbles.onMainThread()) return;
        ViewParent accessories = view.getParent();
        Row row = accessories == null ? null : rows.get(accessories.getParent());
        try {
            if (row == null) {
                restoreReaction(view);
                return;
            }
            int alignment = (Integer) getJustify.invoke(view);
            boolean rtl = view.getLayoutDirection() == View.LAYOUT_DIRECTION_RTL;
            int desired = row.rightAligned != rtl ? FLEX_END : FLEX_START;
            if (alignment != desired) {
                ReactionAlignment previous = reactionJustification.get(view);
                int original = previous != null && previous.applied == alignment ? previous.original : alignment;
                reactionJustification.put(view, new ReactionAlignment(original, desired));
                setJustify.invoke(view, desired);
            }
        } catch (ReflectiveOperationException error) {
            active = false;
            XposedBridge.log("[Message Bubbles] Could not align reactions: " + error);
        }
    }

    private void restoreReaction(View view) throws ReflectiveOperationException {
        ReactionAlignment state = reactionJustification.remove(view);
        if (state != null && (Integer) getJustify.invoke(view) == state.applied) {
            setJustify.invoke(view, state.original);
        }
    }

    void close() {
        active = false;
        for (ViewGroup row : new ArrayList<>(rows.keySet())) {
            if (row != null) restoreRow(row);
        }
        for (View view : new ArrayList<>(reactionJustification.keySet())) {
            if (view == null) continue;
            try {
                restoreReaction(view);
            } catch (ReflectiveOperationException error) {
                XposedBridge.log("[Message Bubbles] Could not restore reactions: " + error);
            }
        }
        reactionJustification.clear();
    }

    private static View directChild(ViewGroup parent, String name) {
        // Valenced installs may use a renamed package while keeping Discord's resources.
        int id = parent.getResources().getIdentifier(name, "id", parent.getContext().getPackageName());
        if (id == 0) id = parent.getResources().getIdentifier(name, "id", "com.discord");
        View view = id == 0 ? null : parent.findViewById(id);
        return view != null && view.getParent() == parent ? view : null;
    }

    private static final class Row {
        final Map<View, Integer> visibility = new WeakHashMap<>();
        final boolean rightAligned;
        Quote quote;

        Row(boolean rightAligned) {
            this.rightAligned = rightAligned;
        }
    }

    private static final class ReactionAlignment {
        final int original;
        final int applied;

        ReactionAlignment(int original, int applied) {
            this.original = original;
            this.applied = applied;
        }
    }

    private static final class Quote implements View.OnLayoutChangeListener {
        private final GradientDrawable edge = new GradientDrawable();
        private final WeakReference<ViewGroup> view;
        private final WeakReference<View> spine;
        private final float originalTranslation;
        private final float originalSpineAlpha;
        private float lastTranslation;

        Quote(ViewGroup preview) {
            view = new WeakReference<>(preview);
            originalTranslation = lastTranslation = preview.getTranslationX();
            View spineView = directChild(preview, "reply_spline");
            spine = new WeakReference<>(spineView);
            originalSpineAlpha = spineView == null ? 1f : spineView.getAlpha();
            if (spineView != null) spineView.setAlpha(0f);
            edge.setColor(0xB17CAACC);
            edge.setCornerRadius(MessageBubbles.dp(preview, 2));
            preview.getOverlay().add(edge);
            preview.addOnLayoutChangeListener(this);
            update(preview);
        }

        @Override public void onLayoutChange(View view, int left, int top, int right, int bottom,
                                             int oldLeft, int oldTop, int oldRight, int oldBottom) {
            update((ViewGroup) view);
        }

        private void update(ViewGroup preview) {
            int width = preview.getWidth();
            int height = preview.getHeight();
            int padding = MessageBubbles.dp(preview, 6);
            int gap = MessageBubbles.dp(preview, 5);
            View spineView = spine.get();
            int end = 0;
            for (int i = 0; i < preview.getChildCount(); i++) {
                View child = preview.getChildAt(i);
                if (child != spineView && child.getVisibility() == View.VISIBLE) end = Math.max(end, child.getRight());
            }
            if (end <= 0 || height <= 2 * padding) {
                edge.setBounds(0, 0, 0, 0);
                lastTranslation = originalTranslation;
                preview.setTranslationX(lastTranslation);
                return;
            }
            int edgeWidth = Math.max(1, MessageBubbles.dp(preview, 2));
            int edgeLeft = Math.max(0, Math.min(end + gap, width - padding - edgeWidth));
            int shift = Math.max(0, width - padding - edgeLeft - edgeWidth);
            lastTranslation = originalTranslation + shift;
            preview.setTranslationX(lastTranslation);
            edge.setBounds(edgeLeft, padding, edgeLeft + edgeWidth, height - padding);
        }

        void restore() {
            ViewGroup preview = view.get();
            if (preview == null) return;
            preview.removeOnLayoutChangeListener(this);
            preview.getOverlay().remove(edge);
            if (preview.getTranslationX() == lastTranslation) preview.setTranslationX(originalTranslation);
            View spineView = spine.get();
            if (spineView != null && spineView.getAlpha() == 0f) spineView.setAlpha(originalSpineAlpha);
        }
    }
}
