// SPDX-License-Identifier: MIT
package dev.fluttershy2008.fontscale;

import android.text.Spannable;
import android.text.Spanned;
import android.text.style.ReplacementSpan;
import android.text.style.ScaleXSpan;
import android.text.style.TypefaceSpan;

final class WordSpacing {
    private WordSpacing() {}

    static void apply(Spannable text, float percent) {
        int length = text.length();
        for (Gap span : text.getSpans(0, length, Gap.class)) text.removeSpan(span);
        if (percent == 0) return;

        float scale = 1 + percent / 100;
        for (int index = 1; index < length - 1; index++) {
            // Keep indentation, repeated spaces, tabs and line breaks intact.
            if (text.charAt(index) != ' ' || isSpace(text.charAt(index - 1)) || isSpace(text.charAt(index + 1))) continue;
            if (protectedGap(text, index)) continue;
            text.setSpan(new Gap(scale), index, index + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
    }

    private static boolean isSpace(char character) {
        return Character.isWhitespace(character) || Character.isSpaceChar(character);
    }

    private static boolean protectedGap(Spannable text, int index) {
        if (text.getSpans(index, index + 1, ReplacementSpan.class).length > 0) return true;
        for (TypefaceSpan face : text.getSpans(index, index + 1, TypefaceSpan.class)) {
            if ("monospace".equals(face.getFamily())) return true;
        }
        return false;
    }

    private static final class Gap extends ScaleXSpan {
        Gap(float scale) { super(scale); }
    }
}
