# GeoCam MEMORY  System Rules

## 작업 프로토콜
1. Cleanup  Check  Proceed  Finalize 순서 고정
2. 한 번에 1단계만 진행
3. 사용자 완료 확인 후 다음 단계

## 명령 실행 규칙
- 모든 명령은 윈도우 파워셀(작업용 창)에서 실행
- 로그/화면 기반 판단만 허용 (추측 금지)

## 코드 작업 규칙
- 부분 수정 지시 금지
- 항상 전체 파일 통짜 교체 방식 사용

## MEMORY 운영 규칙
- 현재 상태는 20_CURRENT_STATE.md가 단일 진실 원본
- 다음 행동은 40_NEXT_ACTION.md에 1단계만 기록
- SESSION_LOG에는 실제 명령/에러 원문 기록
# GeoCam Project Fingerprint

## 프로젝트 경로
C:\Users\user\Desktop\Artion\A-1정품인증P-J\GeoCam

## 프로젝트 구조 (팩트 기준)
- src/App.tsx 존재
- android/ (Capacitor Android 프로젝트)
- dist/ (빌드 결과)
- package.json 존재

## 기술 스택
- Vite + React (웹 프론트엔드)
- Capacitor (Android 래퍼)
- Android APK 배포: npx cap run android

## 패키지명
com.arteon.geocam

## 최근 adb 기기
R3CX409HA8Z (device)
# Current State

## 현재 Phase
Check

## 현재 작업 목표


## 오늘 확정된 사실
- 정보 없음

## 현재 막힌 포인트


## 현재 상태

# Next Action

## 다음 1단계 작업


## 실행 위치
윈도우 파워셀(작업용 창)

## 성공 기준

# Session Log

## 오늘 작업 요약
- Android 앱 빌드 및 배포 확인
- adb 기기 연결 확인
- MEMORY 시스템 설계서 작성
- MEMORY 폴더 및 기본 파일 생성
- 시스템/프로젝트/현재 상태 문서 작성

## 주요 명령 기록
adb devices
npx cap run android
mkdir MEMORY, tools
ni MEMORY\*.md

## 에러 기록
- PowerShell에서 일반 문장을 명령으로 입력해 오류 발생 (해결 완료)

## 현재 상태
정상 진행 중
