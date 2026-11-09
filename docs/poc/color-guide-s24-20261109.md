# S24 camera RGB guide POC

This branch records the previously uncommitted R02 app baseline separately from the RGB guide feature. The default branch is not changed. Local signing material and environment files are not copied into these commits.

The camera uses the existing luma edge detector with minimum line support 36. If it fails, a same-frame RGB model proposal must pass guide geometry and luma-edge refinement. A failed frame never reuses stale corners. Keep the three-frame stability, one-second hold, 250ms freshness, AF success and final capture recheck.

## Model

- Source: https://huggingface.co/HanClinto/cornelius
- Asset: `android/app/src/main/assets/guide_cornelius.onnx`
- SHA-256: `650da3cc3e9ac778c6951de631f824ec1e63bdabf3aaa39a35d7435af625612e`
- Model license: AGPL-3.0; license and notice accompany the asset.
- Runtime: ONNX Runtime Android 1.24.3, CPU, one thread. This S24-only POC requires API 24+.
- Preprocessing: owned YUV-to-RGB samples, crop/rotation/stride aware, 384x384 bilinear resize and ImageNet normalization. No JPEG roundtrip or network inference.
- Native refinement is an IRLS approximation to the offline OpenCV fit. In the checked 43-image port sample it returned 43 refinements; the 14 hand-labelled examples passed IoU >=0.90, with maximum corner difference of 0.89px from the offline implementation. These are exploratory results, not a population accuracy estimate.

## Tested artifact and observations

APK SHA-256: `57A777E3A7466F54D2E6BAB09CB48318290F2806703CC3E4C2636E59F8D41AF1`.

On 2026-11-09 KST, the user installed that exact artifact on two SM-S921N phones and checked the installed base.apk hashes. For each phone, the user reported one successful automatic capture and genuine result on white paper, black background and wood grain, plus no capture when removing the card during focus on each background. These are six successful captures and six user-observed removal attempts, not long-running or broad-device validation.

The supplied logs contain three AF successes and three accepted final capture rechecks per device. No `POST_AF_CONDITIONS_CHANGED` was recorded in those logs. The old-phone log returned 67 RGB fallback candidates, of which two were explicitly discarded. The new-phone log returned 63, with no explicit discard among those returned candidates. Candidate counts are not independently labelled correct detections, and removal attempts do not each have a synchronized video/frame label.

Capture response latency is deferred to the next session. JPEG-save to response was 34.405/25.507/49.957 seconds on the old phone and 16.128/18.019/15.848 seconds on the new phone. These include upload/network/server time, not isolated reader inference. No server reader, verdict rule, deployment or latency optimization is part of this feature.

The tested APK was built in the isolated POC before this source commit. The commit script verifies source blobs against that build source; it does not claim an APK rebuilt from this Git checkout has been installed. Machine-local environment/signing configuration and generated assets remain outside this source snapshot.
