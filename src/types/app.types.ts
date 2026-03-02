import type { ReactElement } from 'react'

export type Screen = 'home' | 'camera' | 'scan' | 'scanResult' | 'result' | 'records' | 'gallery' | 'preview' | 'settings' | 'otpInput' | 'registerResult'
export type ScanMode = 'camera' | 'scan'
export type ScanStatus = 'UNCLAIMED' | 'CLAIMED' | 'PENDING' | 'ALREADY_CLAIMED' | 'EXPIRED' | 'ERROR'
export type VerifyStatus = 'VALID' | 'SUSPECT' | 'UNKNOWN' | 'INVALID' | null

export interface RecordInfo {
  recordId: string;
  packHash: string;
  createdAt: string;
}

export interface ScanResultInfo {
  status: ScanStatus;
  pendingId?: string;
  message?: string;
}

export interface AppState {
  screen: Screen;
  scanMode: ScanMode;
  qrData: string | null;
  capturedImage: string | null;
  previewImage: string;
  recordInfo: RecordInfo | null;
  scanResultInfo: ScanResultInfo | null;
  verifyStatus: VerifyStatus;
  processing: boolean;
  errorCode: string | null;
  networkError: boolean;
  cameraError: string | null;
  sessionToken: string | null;
  nonce: string | null;
  dinaId: string | null;
  signatureVerified: boolean | null;
  confidence: number | null;
  matchScore: number | null;
  registering: boolean;
  registerStatus: string | null;
  registerError: string | null;
  otpInput: string;
}

export interface ScreenProps {
  safeGoHome: () => void;
  safeGoCamera: () => void;
  safeGoScan: () => void;
  openGalleryPicker: () => Promise<void>;
  runPipeline: (qrRaw: string | null, imageUri: string) => Promise<void>;
  getDeviceFingerprint: () => string;
  BackArrow: () => ReactElement;
  t: any;
}

export interface HomeScreenProps extends ScreenProps {
  setScreen: (screen: Screen) => void;
}

export interface CameraScreenProps extends ScreenProps {
  sessionToken: string | null;
  nonce: string | null;
  dinaId: string | null;
  qrData: string | null;
  setCapturedImage: (image: string | null) => void;
  setConfidence: (value: number | null) => void;
  setMatchScore: (value: number | null) => void;
  setVerifyStatus: (status: VerifyStatus) => void;
  setRecordInfo: (info: RecordInfo | null) => void;
  setErrorCode: (code: string | null) => void;
  setNetworkError: (value: boolean) => void;
  setProcessing: (value: boolean) => void;
  setScreen: (screen: Screen) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
}

export interface ScanScreenProps extends ScreenProps {
  setQrData: (data: string | null) => void;
  setQrDetected: (detected: boolean) => void;
  setProcessing: (value: boolean) => void;
  setNetworkError: (value: boolean) => void;
  setErrorCode: (code: string | null) => void;
  setSessionToken: (token: string | null) => void;
  setNonce: (nonce: string | null) => void;
  setDinaId: (id: string | null) => void;
  setScanResultInfo: (info: ScanResultInfo | null) => void;
  setScanMode: (mode: ScanMode) => void;
  setScreen: (screen: Screen) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
}

export interface ScanResultScreenProps extends ScreenProps {
  processing: boolean;
  scanResultInfo: ScanResultInfo | null;
  dinaId: string | null;
  networkError: boolean;
  setScanResultInfo: (info: ScanResultInfo | null) => void;
  setScreen: (screen: Screen) => void;
}

export interface ResultScreenProps extends ScreenProps {
  scanMode: ScanMode;
  errorCode: string | null;
  verifyStatus: VerifyStatus;
  capturedImage: string | null;
  previewImage: string;
  matchScore: number | null;
  confidence: number | null;
  signatureVerified: boolean | null;
  recordInfo: RecordInfo | null;
  networkError: boolean;
  sessionToken: string | null;
  dinaId: string | null;
  nonce: string | null;
  registering: boolean;
  setRegistering: (value: boolean) => void;
  setRegisterStatus: (status: string | null) => void;
  setRegisterError: (error: string | null) => void;
  setScreen: (screen: Screen) => void;
  setQrDetected: (detected: boolean) => void;
  setQrData: (data: string | null) => void;
  setCapturedImage: (image: string | null) => void;
  setRecordInfo: (info: RecordInfo | null) => void;
  setError: (error: string | null) => void;
  setProcessing: (value: boolean) => void;
  setVerifyStatus: (status: VerifyStatus) => void;
}

export interface GalleryScreenProps {
  safeGoHome: () => void;
}

export interface PreviewScreenProps extends ScreenProps {
  previewImage: string;
  setCapturedImage: (image: string | null) => void;
  setScreen: (screen: Screen) => void;
}

export interface OtpInputScreenProps extends ScreenProps {
  qrData: string | null;
  otpInput: string;
  setOtpInput: (value: string) => void;
  setQrData: (data: string | null) => void;
  setScanMode: (mode: ScanMode) => void;
  setQrDetected: (detected: boolean) => void;
  setCapturedImage: (image: string | null) => void;
  setRecordInfo: (info: RecordInfo | null) => void;
  setError: (error: string | null) => void;
  setErrorCode: (code: string | null) => void;
  setProcessing: (value: boolean) => void;
  setNetworkError: (value: boolean) => void;
  setVerifyStatus: (status: VerifyStatus) => void;
  setCameraError: (error: string | null) => void;
  setScreen: (screen: Screen) => void;
}

export interface RegisterResultScreenProps extends ScreenProps {
  registerStatus: string | null;
  registerError: string | null;
}

export interface SettingsScreenProps extends ScreenProps {
  i18n: { language: string; changeLanguage: (lng: string) => void };
}

export interface RecordsScreenProps extends ScreenProps {}
