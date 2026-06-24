import type { ReactElement } from 'react'

// ─────────────────────────────────────────────
// Screen 타입 (Auth UX 리팩 v2.0)
//
// 비로그인 허용 화면 (publicScreens):
//   authLanding | login | register
//
// 보호 화면 (protectedScreens):
//   mainMenu | digitalVerify | camera | qrScan | gallery | myCollection | settings
//
// 변경 이력:
//   - 'home' 제거 → 'authLanding' + 'mainMenu' 로 분리
//   - 'scan' → 'qrScan' 명칭 통일 (설계서 기준)
//   - 'collection' → 'myCollection' 명칭 통일 (설계서 기준)
//   - 'register' 신규 추가 (기존 LoginScreen mode 전환 → Screen 상태 분리)
// ─────────────────────────────────────────────
export type Screen =
  // 비로그인 허용
  | 'authLanding'
  | 'login'
  | 'register'
  // 보호 화면
  | 'mainMenu'
  | 'digitalVerify'
  | 'camera'
  | 'qrScan'
  | 'gallery'
  | 'myCollection'
  | 'settings'
  // 기능 서브 화면 (보호)
  | 'scanResult'
  | 'result'
  | 'records'
  | 'preview'
  | 'otpInput'
  | 'registerResult'
  | 'claim'
  | 'claimBundle'
  // 인증 서브 화면 (비로그인 허용)
  | 'registerPending'

export type ScanMode = 'camera' | 'scan'

export type ScanStatus =
  | 'UNCLAIMED'
  | 'CLAIMED'
  | 'PENDING'
  | 'ALREADY_CLAIMED'
  | 'EXPIRED'
  | 'ERROR'

// W1 정정 (P0-5 LT-ENGINE v0.2 § 4 + AUDIT-001 v1.1 § 4 + 빅보스 결정 D2 LOCK):
// VerifyStatus = 4-state → 3-state LOCK
// 매핑: GENUINE → PRESENT / REPRODUCTION_TRACE → ABSENT / INSUFFICIENT → INSUFFICIENT_DATA
export type VerifyStatus = 'PRESENT' | 'ABSENT' | 'INSUFFICIENT_DATA' | null

// SS PRN 디지털 검증 결과 (LegCam-RPK-001)
export type DigitalVerifyStatus = 'ORIGINAL' | 'MODIFIED' | 'INVALID' | 'TAMPERED' | 'ERROR' | null

// QR 스캔 컨텍스트
export type ScanContext = 'claim' | 'verify'

// ─────────────────────────────────────────────
// Auth 관련 타입
// ─────────────────────────────────────────────
export interface AuthState {
  isAuthenticated: boolean
  authToken: string | null
  userId: string | null
  userNickname: string | null
}

// ─────────────────────────────────────────────
// 데이터 타입
// ─────────────────────────────────────────────
export interface RecordInfo {
  recordId: string
  packHash: string
  createdAt: string
}

export interface ScanResultInfo {
  status: ScanStatus
  pendingId?: string
  message?: string
}

export interface DigitalVerifyResult {
  status: DigitalVerifyStatus
  pearson_r: number | null
  score: number | null
  asset: {
    dina_id: string
    series?: string
    artist?: string
    [key: string]: any
  } | null
  message?: string
}

export interface AppState {
  screen: Screen
  scanMode: ScanMode
  qrData: string | null
  capturedImage: string | null
  previewImage: string
  recordInfo: RecordInfo | null
  scanResultInfo: ScanResultInfo | null
  verifyStatus: VerifyStatus
  processing: boolean
  errorCode: string | null
  networkError: boolean
  cameraError: string | null
  sessionToken: string | null
  nonce: string | null
  dinaId: string | null
  signatureVerified: boolean | null
  confidence: number | null
  matchScore: number | null
  registering: boolean
  registerStatus: string | null
  registerError: string | null
  otpInput: string
  authToken: string | null
  userId: string | null
  userNickname: string | null
}

// ─────────────────────────────────────────────
// 공통 navigateToScreen 타입
// ─────────────────────────────────────────────
export type NavigateToScreen = (screen: Screen) => void

// ─────────────────────────────────────────────
// Screen Props 타입
// ─────────────────────────────────────────────
export interface ScreenProps {
  safeGoHome: () => void
  safeGoCamera: () => void
  safeGoScan: () => void
  openGalleryPicker: () => Promise<void>
  runPipeline: (qrRaw: string | null, imageUri: string) => Promise<void>
  getDeviceFingerprint: () => string
  BackArrow: () => ReactElement
}

// AuthLandingScreen props
export interface AuthLandingScreenProps {
  navigateToScreen: NavigateToScreen
}

// MainMenuScreen props
export interface MainMenuScreenProps {
  safeGoHome: () => void
  safeGoCamera: () => void
  safeGoScan: () => void
  openGalleryPicker: () => Promise<void>
  BackArrow: () => ReactElement
  navigateToScreen: NavigateToScreen
}

// HomeScreen props (미사용 — 컴파일 호환용 유지)
export interface HomeScreenProps {
  safeGoHome: () => void
  safeGoCamera: () => void
  safeGoScan: () => void
  openGalleryPicker: () => Promise<void>
  BackArrow: () => ReactElement
  setScreen: (screen: Screen) => void
}

export interface DigitalVerifyScreenProps {
  safeGoHome: () => void
  BackArrow: () => ReactElement
  navigateToScreen: NavigateToScreen
}

// Phase 2: GeoCapsule Individual Claim
export interface ClaimScreenProps {
  safeGoHome: () => void
  BackArrow: () => ReactElement
  navigateToScreen: NavigateToScreen
  claimToken: string | null
  authToken: string | null
  userId: string | null
}

// Phase 2: GeoCapsule Bundle Claim
export interface ClaimBundleScreenProps {
  safeGoHome: () => void
  BackArrow: () => ReactElement
  navigateToScreen: NavigateToScreen
  bundleClaimToken: string | null
  authToken: string | null
  userId: string | null
}

export interface CameraScreenProps extends ScreenProps {
  sessionToken: string | null
  nonce: string | null
  dinaId: string | null
  qrData: string | null
  setCapturedImage: (image: string | null) => void
  setConfidence: (value: number | null) => void
  setMatchScore: (value: number | null) => void
  setVerifyStatus: (status: VerifyStatus) => void
  setRecordInfo: (info: RecordInfo | null) => void
  setErrorCode: (code: string | null) => void
  setNetworkError: (value: boolean) => void
  setProcessing: (value: boolean) => void
  navigateToScreen: NavigateToScreen
  cameraError: string | null
  setCameraError: (error: string | null) => void
}

export interface ScanScreenProps extends ScreenProps {
  setQrData: (data: string | null) => void
  setQrDetected: (detected: boolean) => void
  setProcessing: (value: boolean) => void
  setNetworkError: (value: boolean) => void
  setErrorCode: (code: string | null) => void
  setSessionToken: (token: string | null) => void
  setNonce: (nonce: string | null) => void
  setDinaId: (id: string | null) => void
  setScanResultInfo: (info: ScanResultInfo | null) => void
  setScanMode: (mode: ScanMode) => void
  navigateToScreen: NavigateToScreen
  cameraError: string | null
  setCameraError: (error: string | null) => void
  scanContext: ScanContext
}

export interface ScanResultScreenProps extends ScreenProps {
  processing: boolean
  scanResultInfo: ScanResultInfo | null
  dinaId: string | null
  networkError: boolean
  setScanResultInfo: (info: ScanResultInfo | null) => void
  navigateToScreen: NavigateToScreen
}

export interface ResultScreenProps extends ScreenProps {
  scanMode: ScanMode
  errorCode: string | null
  verifyStatus: VerifyStatus
  capturedImage: string | null
  previewImage: string
  matchScore: number | null
  confidence: number | null
  signatureVerified: boolean | null
  recordInfo: RecordInfo | null
  networkError: boolean
  sessionToken: string | null
  dinaId: string | null
  nonce: string | null
  registering: boolean
  setRegistering: (value: boolean) => void
  setRegisterStatus: (status: string | null) => void
  setRegisterError: (error: string | null) => void
  navigateToScreen: NavigateToScreen
  setQrDetected: (detected: boolean) => void
  setQrData: (data: string | null) => void
  setCapturedImage: (image: string | null) => void
  setRecordInfo: (info: RecordInfo | null) => void
  setError: (error: string | null) => void
  setProcessing: (value: boolean) => void
  setVerifyStatus: (status: VerifyStatus) => void
}

export interface GalleryScreenProps {
  safeGoHome: () => void
}

export interface PreviewScreenProps extends ScreenProps {
  previewImage: string
  setCapturedImage: (image: string | null) => void
  navigateToScreen: NavigateToScreen
}

export interface OtpInputScreenProps extends ScreenProps {
  qrData: string | null
  otpInput: string
  setOtpInput: (value: string) => void
  setQrData: (data: string | null) => void
  setScanMode: (mode: ScanMode) => void
  setQrDetected: (detected: boolean) => void
  setCapturedImage: (image: string | null) => void
  setRecordInfo: (info: RecordInfo | null) => void
  setError: (error: string | null) => void
  setErrorCode: (code: string | null) => void
  setProcessing: (value: boolean) => void
  setNetworkError: (value: boolean) => void
  setVerifyStatus: (status: VerifyStatus) => void
  setCameraError: (error: string | null) => void
  navigateToScreen: NavigateToScreen
}

export interface RegisterResultScreenProps extends ScreenProps {
  registerStatus: string | null
  registerError: string | null
  onGoCollection: () => void
}

export interface CollectionScreenProps {
  safeGoHome: () => void
  BackArrow: () => ReactElement
  navigateToScreen: NavigateToScreen
  authToken: string | null
  userId: string | null
}

export interface LoginScreenProps {
  mode: 'login' | 'register'
  navigateToScreen: NavigateToScreen
  onLoginSuccess: (token: string, userId: string, nickname: string, status: string) => void
}

export interface RegisterPendingScreenProps {
  onProfileComplete: (nickname: string) => void
  authToken: string
}

export interface SettingsScreenProps extends ScreenProps {
  i18n: { language: string; changeLanguage: (lng: string) => void }
  onLogout: () => void
}

export interface RecordsScreenProps extends ScreenProps {}
