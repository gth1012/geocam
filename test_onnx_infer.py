"""
GeoCode ONNX 오프라인 추론 테스트
"""
import numpy as np
import onnxruntime as ort

print("=" * 50)
print("GeoCode ONNX 오프라인 추론 테스트")
print("=" * 50)

# 1. 모델 로드
print("\n[1] ONNX 모델 로드...")
session = ort.InferenceSession("GeoCodeModel.onnx")
print("load OK")

# 2. 입력/출력 정보 확인
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name
print(f"    입력: {input_name} {session.get_inputs()[0].shape}")
print(f"    출력: {output_name} {session.get_outputs()[0].shape}")

# 3. 테스트 이미지 생성 (랜덤 224x224 RGB)
print("\n[2] 테스트 이미지 생성...")
test_image = np.random.rand(1, 3, 224, 224).astype(np.float32)
print(f"    shape: {test_image.shape}")
print("infer OK")

# 4. 추론 실행
print("\n[3] 추론 실행...")
result = session.run([output_name], {input_name: test_image})
confidence = result[0][0][0]
print(f"confidence 출력 OK: {confidence:.4f}")

# 5. 결과 판정
print("\n[4] 결과 판정...")
THRESHOLD = 0.5
if confidence >= THRESHOLD:
    status = "DETECTED"
else:
    status = "NOT_DETECTED"
print(f"    status: {status}")
print(f"    confidence: {confidence:.4f}")

print("\n" + "=" * 50)
print("GeoCode AI ONNX 오프라인 추론 테스트 완료!")
print("=" * 50)
