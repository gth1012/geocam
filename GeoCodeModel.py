"""
GeoCode Detection Model v1.0
- 입력: 이미지 (224x224 RGB)
- 출력: confidence score (0~1)
- 목적: 비가시 패턴(GeoCode) 감지
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class GeoCodeDetector(nn.Module):
    """
    경량 CNN 기반 GeoCode 감지 모델
    - MobileNet 스타일 depthwise separable conv
    - 오프라인/모바일 추론 최적화
    """
    
    def __init__(self):
        super().__init__()
        
        # Feature Extractor
        self.features = nn.Sequential(
            # Block 1: 224x224x3 -> 112x112x32
            nn.Conv2d(3, 32, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            
            # Block 2: 112x112x32 -> 56x56x64
            nn.Conv2d(32, 32, 3, stride=1, padding=1, groups=32, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 64, 1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            
            # Block 3: 56x56x64 -> 28x28x128
            nn.Conv2d(64, 64, 3, stride=1, padding=1, groups=64, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, 1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            
            # Block 4: 28x28x128 -> 14x14x256
            nn.Conv2d(128, 128, 3, stride=1, padding=1, groups=128, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 256, 1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            
            # Block 5: 14x14x256 -> 7x7x512
            nn.Conv2d(256, 256, 3, stride=1, padding=1, groups=256, bias=False),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 512, 1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
        )
        
        # Global Average Pooling + Classifier
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(0.2),
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x


def export_to_onnx(model, save_path="GeoCodeModel.onnx"):
    model.eval()
    dummy_input = torch.randn(1, 3, 224, 224)
    
    torch.onnx.export(
        model,
        dummy_input,
        save_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['image'],
        output_names=['confidence'],
        dynamic_axes={
            'image': {0: 'batch_size'},
            'confidence': {0: 'batch_size'}
        }
    )
    print(f"ONNX export 완료: {save_path}")


if __name__ == "__main__":
    model = GeoCodeDetector()
    print(f"모델 파라미터 수: {sum(p.numel() for p in model.parameters()):,}")
    
    model.eval()
    test_input = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        output = model(test_input)
    print(f"테스트 추론 결과: confidence = {output.item():.4f}")
    
    export_to_onnx(model)
    print("완료!")
