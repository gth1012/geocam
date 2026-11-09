package com.arteon.geocam;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Bounded POC input recorder. Stores the exact detector input, not the full photo. */
final class CornerReplayRecorder {
    private final File directory;
    private long startedAt = -1;
    CornerReplayRecorder(File root) {
        directory = root == null ? null : new File(root, "session_" + System.currentTimeMillis());
    }
    synchronized void record(CornerPocDetector.Frame frame, long frameId, long sampledAt,
            double gx, double gy, double gw, double gh, boolean found) throws IOException {
        if (directory == null) return;
        if (startedAt < 0) startedAt = sampledAt;
        if (sampledAt - startedAt > 180000L) return;
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("REPLAY_DIRECTORY_FAILED");
        String slot = String.format(Locale.ROOT, "%03d", frameId % 128);
        File metadata = new File(directory, slot + ".tsv");
        if (metadata.exists() && !metadata.delete()) throw new IOException("REPLAY_METADATA_RESET_FAILED");
        try (FileOutputStream out = new FileOutputStream(new File(directory, slot + ".pgm"))) {
            out.write(("P5\n" + frame.w + " " + frame.h + "\n255\n").getBytes(StandardCharsets.US_ASCII));
            out.write(frame.y);
        }
        String header = "frameId\tsampledAt\tw\th\tviewScale\toffsetX\toffsetY\tguideX\tguideY\tguideW\tguideH\tfound\n";
        String row = frameId+"\t"+sampledAt+"\t"+frame.w+"\t"+frame.h+"\t"+frame.viewScale+"\t"+frame.offsetX+"\t"+frame.offsetY+"\t"+gx+"\t"+gy+"\t"+gw+"\t"+gh+"\t"+found+"\n";
        try (FileOutputStream out = new FileOutputStream(metadata)) {
            out.write((header + row).getBytes(StandardCharsets.US_ASCII));
        }
    }
}
