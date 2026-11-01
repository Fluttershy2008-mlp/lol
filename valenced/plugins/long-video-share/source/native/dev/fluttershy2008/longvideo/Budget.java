package dev.fluttershy2008.longvideo;

/** Size budgeting uses decimal MB; a 6% reserve covers MP4 overhead and rate control. */
public final class Budget {
    private Budget() {}
    public static int bitrate(long limit, long audioBytes, long durationUs) {
        if (limit < 1000000L || limit > 10000000000L || audioBytes < 0 || durationUs <= 0)
            throw new IllegalArgumentException("Invalid video size or duration.");
        double available = limit * 0.94 - audioBytes;
        long rate = (long) Math.floor(available * 8000000.0 / durationUs);
        if (rate < 96000L) throw new IllegalArgumentException("The audio and video will not fit this target. Choose a larger limit or share a hosted link.");
        return (int) Math.min(rate, 16000000L);
    }
    public static int retry(int previous, long bytes, long limit) {
        return (int) Math.max(96000, Math.min(previous - 1L, (long) (previous * ((double) limit / bytes) * 0.88)));
    }
    public static int[] dimensions(int width, int height, int shortSide) {
        if (width < 2 || height < 2 || width > 16384 || height > 16384 || shortSide < 144 || shortSide > 1080)
            throw new IllegalArgumentException("Unsupported video dimensions.");
        double scale = Math.min(1.0, (double) shortSide / Math.min(width, height));
        // Sixteen-pixel alignment works with the broadest range of AVC encoders.
        return new int[] { Math.max(16, ((int) (width * scale) / 16) * 16), Math.max(16, ((int) (height * scale) / 16) * 16) };
    }
}
