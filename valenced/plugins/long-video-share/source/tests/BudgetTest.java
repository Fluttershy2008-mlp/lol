import dev.fluttershy2008.longvideo.Budget;

public final class BudgetTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    private static void rejects(long limit, long audio, long duration) {
        try { Budget.bitrate(limit, audio, duration); throw new AssertionError("Invalid budget accepted"); }
        catch (IllegalArgumentException expected) {}
    }
    public static void main(String[] ignored) {
        long duration = 45L * 60 * 1000000;
        long audio = 43200000L;
        int rate = Budget.bitrate(500000000L, audio, duration);
        check(rate > 1200000 && rate < 1300000);
        check(rate * (duration / 1000000.0) / 8 + audio <= 500000000L * 0.94);
        check(Budget.bitrate(1000000000L, audio, duration) > rate);
        check(Budget.bitrate(500000000L, 0, duration) > rate);
        rejects(20000000, audio, duration); rejects(500000000, audio, 0);
        rejects(-1, 0, duration); rejects(Long.MAX_VALUE, 0, duration);
        check(Budget.retry(rate, 550000000, 500000000) < rate);
        check(Budget.retry(96000, 100000000, 20000000) == 96000);
        int[] landscape = Budget.dimensions(1920, 1080, 720);
        check(landscape[0] == 1280 && landscape[1] == 720);
        int[] portrait = Budget.dimensions(1080, 1920, 720);
        check(portrait[0] == 720 && portrait[1] == 1280);
        int[] small = Budget.dimensions(640, 480, 1080);
        check(small[0] == 640 && small[1] == 480);
        System.out.println("Native size budgeting, 45-minute targets, audio reserve, retry and rotation dimensions passed.");
    }
}
