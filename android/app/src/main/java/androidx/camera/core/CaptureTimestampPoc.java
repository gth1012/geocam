package androidx.camera.core;

import android.graphics.ImageFormat;
import androidx.annotation.NonNull;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/** POC only. Exact JPEG output; retains diagnostic sidecar for comparison. */
public final class CaptureTimestampPoc {
    public interface EvidenceListener {
        void onImage(long timestamp, String inputSha256, String cropRect, int rotation);
    }
    private CaptureTimestampPoc() {}
    public static void takePicture(ImageCapture capture,
            ImageCapture.OutputFileOptions options, Executor io, Executor callbacks, java.io.File evidenceDirectory,
            EvidenceListener evidence, ImageCapture.OnImageSavedCallback destination) {
        final AtomicBoolean delivered = new AtomicBoolean();
        final AtomicBoolean imageReceived = new AtomicBoolean();
        final ImageCapture.OnImageSavedCallback once = new ImageCapture.OnImageSavedCallback() {
            @Override public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) {
                if (delivered.compareAndSet(false, true)) destination.onImageSaved(result);
            }
            @Override public void onError(@NonNull ImageCaptureException error) {
                if (delivered.compareAndSet(false, true)) destination.onError(error);
            }
        };
        capture.takePicture(io, new ImageCapture.OnImageCapturedCallback() {
            @Override public void onCaptureSuccess(@NonNull ImageProxy source) {
                if (!imageReceived.compareAndSet(false, true)) { source.close(); return; }
                final AtomicBoolean closed = new AtomicBoolean();
                ImageProxy image = new ForwardingImageProxy(source) {
                    @Override public void close() {
                        if (closed.compareAndSet(false, true)) super.close();
                    }
                };
                try {
                    if (image.getFormat() != ImageFormat.JPEG) {
                        throw new IllegalStateException("POC_EXPECTED_JPEG");
                    }
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer().duplicate();
                    buffer.rewind();
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    digest.update(buffer);
                    StringBuilder hash = new StringBuilder();
                    for (byte b : digest.digest()) hash.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
                    // POC: preserve the exact CameraX-delivered JPEG alongside the existing output.
                    long rawStarted = android.os.SystemClock.elapsedRealtime();
                    if (evidenceDirectory == null || (!evidenceDirectory.isDirectory() && !evidenceDirectory.mkdirs()))
                        throw new java.io.IOException("INPUT_EVIDENCE_DIRECTORY_UNAVAILABLE");
                    java.io.File output = options.getFile();
                    if (output == null) throw new java.io.IOException("POC_REQUIRES_FILE_OUTPUT");
                    java.io.File raw = new java.io.File(evidenceDirectory, output.getName()+".input.jpg");
                    java.io.File part = new java.io.File(evidenceDirectory, output.getName()+".input.jpg.part");
                    if (raw.exists() || !part.createNewFile()) throw new java.io.IOException("INPUT_EVIDENCE_ALREADY_EXISTS");
                    ByteBuffer preserved = image.getPlanes()[0].getBuffer().duplicate(); preserved.rewind();
                    byte[] chunk = new byte[65536];
                    try (java.io.FileOutputStream stream = new java.io.FileOutputStream(part)) {
                        while (preserved.hasRemaining()) { int n=Math.min(chunk.length,preserved.remaining()); preserved.get(chunk,0,n); stream.write(chunk,0,n); }
                    }
                    MessageDigest reread=MessageDigest.getInstance("SHA-256");
                    try(java.io.FileInputStream stream=new java.io.FileInputStream(part)) {
                        int n;while((n=stream.read(chunk))!=-1)reread.update(chunk,0,n);
                    }
                    StringBuilder copiedHash=new StringBuilder();
                    for(byte b:reread.digest())copiedHash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                    if(!hash.toString().equals(copiedHash.toString()))throw new java.io.IOException("INPUT_EVIDENCE_HASH_MISMATCH");
                    if(!part.renameTo(raw))throw new java.io.IOException("INPUT_EVIDENCE_RENAME_FAILED");
                    org.json.JSONObject rawInfo=new org.json.JSONObject();
                    rawInfo.put("stage","SOURCE_JPEG_PRESERVED");rawInfo.put("captureId",output.getName());
                    rawInfo.put("imageTimestampNs",Long.toString(image.getImageInfo().getTimestamp()));
                    rawInfo.put("inputJpegSha256",hash.toString());rawInfo.put("preservedSha256",copiedHash.toString());
                    rawInfo.put("bytes",raw.length());rawInfo.put("preserveAndVerifyMs",android.os.SystemClock.elapsedRealtime()-rawStarted);
                    rawInfo.put("proxyWidth",image.getWidth());rawInfo.put("proxyHeight",image.getHeight());
                    rawInfo.put("cropRect",image.getCropRect().toString());rawInfo.put("rotationDegrees",image.getImageInfo().getRotationDegrees());
                    rawInfo.put("scope","CAMERAX_DELIVERED_JPEG_NOT_SENSOR_RAW");rawInfo.put("uploaded",false);
                    java.io.File metadata=new java.io.File(evidenceDirectory,output.getName()+".input.json");
                    if(!metadata.createNewFile())throw new java.io.IOException("INPUT_METADATA_ALREADY_EXISTS");
                    try(java.io.FileOutputStream stream=new java.io.FileOutputStream(metadata)) {
                        stream.write(rawInfo.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    }
                    android.util.Log.i("CaptureDiagnostics",rawInfo.toString());
                    evidence.onImage(image.getImageInfo().getTimestamp(), hash.toString(),
                            image.getCropRect().toString(), image.getImageInfo().getRotationDegrees());
                    // Exact CameraX JPEG output: no crop, rotation rewrite, or JPEG encoding.
                    androidx.exifinterface.media.ExifInterface exif =
                            new androidx.exifinterface.media.ExifInterface(raw.getAbsolutePath());
                    int orientation = exif.getAttributeInt(
                            androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 0);
                    int degrees = orientation == 1 ? 0 : orientation == 6 ? 90 :
                            orientation == 3 ? 180 : orientation == 8 ? 270 : -1;
                    if (degrees < 0 || degrees != image.getImageInfo().getRotationDegrees())
                        throw new java.io.IOException("EXACT_JPEG_ORIENTATION_NOT_VERIFIED");
                    java.io.File outputPart = new java.io.File(output.getAbsolutePath()+".exact.part");
                    if (output.exists()) throw new java.io.IOException("EXACT_OUTPUT_ALREADY_EXISTS");
                    if (!outputPart.createNewFile()) throw new java.io.IOException("EXACT_OUTPUT_PART_EXISTS");
                    try (java.io.FileInputStream srcStream = new java.io.FileInputStream(raw);
                            java.io.FileOutputStream dstStream = new java.io.FileOutputStream(outputPart)) {
                        int n; while ((n=srcStream.read(chunk))!=-1) dstStream.write(chunk,0,n);
                    }
                    MessageDigest finalDigest = MessageDigest.getInstance("SHA-256");
                    try (java.io.FileInputStream stream = new java.io.FileInputStream(outputPart)) {
                        int n; while ((n=stream.read(chunk))!=-1) finalDigest.update(chunk,0,n);
                    }
                    StringBuilder finalHash = new StringBuilder();
                    for (byte b:finalDigest.digest()) finalHash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                    if (!hash.toString().equals(finalHash.toString()))
                        throw new java.io.IOException("EXACT_OUTPUT_HASH_MISMATCH");
                    if (!outputPart.renameTo(output)) throw new java.io.IOException("EXACT_OUTPUT_RENAME_FAILED");
                    org.json.JSONObject exactInfo = new org.json.JSONObject();
                    exactInfo.put("stage","EXACT_JPEG_OUTPUT_READY");
                    exactInfo.put("captureId",output.getName());
                    exactInfo.put("inputJpegSha256",hash.toString());
                    exactInfo.put("outputSha256",finalHash.toString());
                    exactInfo.put("bytes",output.length());
                    exactInfo.put("exifOrientation",orientation);
                    exactInfo.put("cropApplied",false);
                    exactInfo.put("uploaded",false);
                    android.util.Log.i("CaptureDiagnostics",exactInfo.toString());
                    callbacks.execute(() -> once.onImageSaved(
                            new ImageCapture.OutputFileResults(android.net.Uri.fromFile(output))));
                } catch (Exception | OutOfMemoryError error) {
                    callbacks.execute(() -> once.onError(new ImageCaptureException(
                            ImageCapture.ERROR_UNKNOWN, "TIMESTAMP_POC_SAVE_FAILED", error)));
                } finally {
                    image.close();
                }
            }
            @Override public void onError(@NonNull ImageCaptureException error) {
                callbacks.execute(() -> once.onError(error));
            }
        });
    }
}
