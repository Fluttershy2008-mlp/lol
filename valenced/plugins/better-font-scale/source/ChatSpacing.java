// SPDX-License-Identifier: MIT
package dev.fluttershy2008.fontscale;

import android.widget.TextView;

/** Applies spacing relative to Discord's current metrics without changing the typeface. */
final class ChatSpacing {
    private final Metric letters = new Metric();
    private final Metric lineExtra = new Metric();
    private final Metric lineMultiplier = new Metric();

    void apply(TextView view, float letterPercent, float linePercent) {
        float currentLetters = view.getLetterSpacing();
        float adjustedLetters = letters.apply(currentLetters, 1, letterPercent / 100);
        if (!same(currentLetters, adjustedLetters)) view.setLetterSpacing(adjustedLetters);

        float currentExtra = view.getLineSpacingExtra();
        float currentMultiplier = view.getLineSpacingMultiplier();
        float scale = 1 + linePercent / 100;
        float adjustedExtra = lineExtra.apply(currentExtra, scale, 0);
        float adjustedMultiplier = lineMultiplier.apply(currentMultiplier, scale, 0);
        if (!same(currentExtra, adjustedExtra) || !same(currentMultiplier, adjustedMultiplier)) {
            view.setLineSpacing(adjustedExtra, adjustedMultiplier);
        }
    }

    private static boolean same(float first, float second) {
        return Math.abs(first - second) < 0.0001f;
    }

    private static final class Metric {
        private boolean active;
        private float original;
        private float last;

        float apply(float current, float scale, float offset) {
            if (!active || !same(current, last)) original = current;
            active = scale != 1 || offset != 0;
            last = original * scale + offset;
            return last;
        }
    }
}
