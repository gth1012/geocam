// src/types/app.types.ts
// 2026-07-07: CardProfile CUSTOM 추가 + aspectRatio / aspectTolerance 추가
//             LC-CARD-BOUNDARY-001 v1.3 STEP 1

// ── CardProfile ───────────────────────────────────────────────────────────────

export interface CardProfile {
  id:               string
  name:             string
  widthMm:          number
  heightMm:         number
  aspectHOverW:     number   // H/W (UI 미리보기용)
  aspectRatio:      number   // W/H (4-corner 검출 기준)
  aspectTolerance:  number   // 허용 오차 (PRESET=0.15 / CUSTOM=0.10)
  isCustom?:        boolean
}

export const CARD_PROFILES: CardProfile[] = [
  {
    id:              'STANDARD',
    name:            '표준형',
    widthMm:         54,
    heightMm:        85,
    aspectHOverW:    85 / 54,
    aspectRatio:     54 / 85,
    aspectTolerance: 0.15,
  },
  {
    id:              'GOODS',
    name:            '굿즈형',
    widthMm:         55,
    heightMm:        85,
    aspectHOverW:    85 / 55,
    aspectRatio:     55 / 85,
    aspectTolerance: 0.15,
  },
  {
    id:              'LARGE',
    name:            '대형',
    widthMm:         70,
    heightMm:        100,
    aspectHOverW:    100 / 70,
    aspectRatio:     70 / 100,
    aspectTolerance: 0.15,
  },
  {
    id:              'MINI',
    name:            '미니포스터형',
    widthMm:         100,
    heightMm:        150,
    aspectHOverW:    150 / 100,
    aspectRatio:     100 / 150,
    aspectTolerance: 0.15,
  },
]

export const DEFAULT_CARD_PROFILE: CardProfile = CARD_PROFILES[1] // 굿즈형

export const makeCustomProfile = (widthMm: number, heightMm: number): CardProfile => ({
  id:              'CUSTOM',
  name:            '직접입력',
  widthMm,
  heightMm,
  aspectHOverW:    heightMm / widthMm,
  aspectRatio:     widthMm  / heightMm,
  aspectTolerance: 0.10,   // 직접입력은 더 정확한 비율 → 허용 오차 좁힘
  isCustom:        true,
})

// ── SizeSelectScreen Props ────────────────────────────────────────────────────

export interface SizeSelectScreenProps {
  onProfileSelected: (profile: CardProfile) => void
}

// ── 기존 타입들 (유지) ─────────────────────────────────────────────────────────

export type ScanResultV2       = 'PRESENT' | 'ABSENT' | 'INSUFFICIENT_DATA'
export type ScanResultLegacy   = 'VALID'   | 'SUSPECT' | 'UNKNOWN'
export type PatternResult      = 'PRESENT' | 'WEAK'    | 'ABSENT'
export type VerifyStatus       = 'PRESENT' | 'ABSENT'  | 'INSUFFICIENT_DATA'
export type PhysicalVerifyVerdict = 'PHYSICAL VERIFIED' | 'RETRY' | 'INVALID'

export interface ScanResultDetail {
  result:         ScanResultV2
  result_legacy:  ScanResultLegacy
  pattern_result: PatternResult | null
  is_conflict:    boolean
  reason_code:    string
}

export interface DetectSignalApiResult {
  verdict:         'SIGNAL_PRESENT' | 'SIGNAL_UNCERTAIN' | 'SIGNAL_ABSENT' | 'SIGNAL_UNKNOWN'
  overall_excess:  number
  hybrid_verdict?: 'PASS' | 'UNCERTAIN' | 'FAIL'
  reason_code?:    string
}