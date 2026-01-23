/**
 * GeoCam v2 - Security Chain Module
 * Phase 2-A: Evidence Pack 무결성 체인 강화
 * 
 * 기준 문서: Implementation Baseline Package v1.0 (LOCK)
 * 
 * ⚠️ 이 모듈은 증거 생성만 담당
 * ❌ 판정 로직 없음
 * ❌ VALID/INVALID 없음
 */

// ============================================
// 무결성 체인 타입 정의
// ============================================

export interface ChainLink {
  // 현재 Evidence Pack 해시
  current_hash: string;
  
  // 이전 Evidence Pack 해시 (첫 스캔이면 null)
  previous_hash: string | null;
  
  // 체인 순서 번호
  sequence_number: number;
  
  // 체인 생성 시각
  chained_at: string;
}

export interface IntegrityChain {
  // DINA 코드 (체인 식별자)
  dina_code: string;
  
  // 체인 링크 목록 (Append-Only)
  links: ChainLink[];
  
  // 체인 시작 시각
  chain_started_at: string;
  
  // 마지막 링크 해시
  latest_hash: string;
}

// ============================================
// 위변조 탐지용 보조 필드
// ============================================

export interface TamperDetectionFlags {
  // 재촬영 흔적
  reshot_indicators: {
    screen_reflection_detected: boolean;
    moire_pattern_detected: boolean;
    frame_edge_detected: boolean;
  };
  
  // 시간 왜곡 (Time Drift)
  time_drift: {
    local_server_diff_ms: number | null;
    drift_flag: 'NORMAL' | 'MINOR_DRIFT' | 'MAJOR_DRIFT' | 'UNKNOWN';
  };
  
  // geo_bucket 변화 이력
  geo_history: {
    previous_buckets: string[];
    bucket_change_count: number;
    rapid_change_detected: boolean;
  };
}

// ============================================
// SHA256 해시 유틸리티
// ============================================

export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// 체인 링크 생성
// ============================================

export async function createChainLink(
  evidencePackJson: string,
  previousHash: string | null,
  sequenceNumber: number
): Promise<ChainLink> {
  const currentHash = await sha256(evidencePackJson);
  
  return {
    current_hash: `sha256:${currentHash}`,
    previous_hash: previousHash,
    sequence_number: sequenceNumber,
    chained_at: new Date().toISOString()
  };
}

// ============================================
// 체인 연속성 검증 (무결성 확인용)
// ============================================

export function verifyChainContinuity(chain: IntegrityChain): {
  continuous: boolean;
  break_points: number[];
} {
  const breakPoints: number[] = [];
  
  for (let i = 1; i < chain.links.length; i++) {
    const current = chain.links[i];
    const previous = chain.links[i - 1];
    
    // 이전 해시 참조 확인
    if (current.previous_hash !== previous.current_hash) {
      breakPoints.push(i);
    }
    
    // 순서 번호 연속성 확인
    if (current.sequence_number !== previous.sequence_number + 1) {
      breakPoints.push(i);
    }
  }
  
  return {
    continuous: breakPoints.length === 0,
    break_points: breakPoints
  };
}

// ============================================
// Time Drift 계산
// ============================================

export function calculateTimeDrift(
  timestampLocal: string,
  timestampServer: string | null
): TamperDetectionFlags['time_drift'] {
  if (!timestampServer) {
    return {
      local_server_diff_ms: null,
      drift_flag: 'UNKNOWN'
    };
  }
  
  const localTime = new Date(timestampLocal).getTime();
  const serverTime = new Date(timestampServer).getTime();
  const diffMs = Math.abs(localTime - serverTime);
  
  let driftFlag: 'NORMAL' | 'MINOR_DRIFT' | 'MAJOR_DRIFT';
  
  if (diffMs < 5000) {
    driftFlag = 'NORMAL';
  } else if (diffMs < 60000) {
    driftFlag = 'MINOR_DRIFT';
  } else {
    driftFlag = 'MAJOR_DRIFT';
  }
  
  return {
    local_server_diff_ms: diffMs,
    drift_flag: driftFlag
  };
}

// ============================================
// geo_bucket 이력 분석
// ============================================

export function analyzeGeoHistory(
  currentBucket: string | null,
  previousBuckets: string[]
): TamperDetectionFlags['geo_history'] {
  const buckets = currentBucket 
    ? [...previousBuckets, currentBucket]
    : previousBuckets;
  
  // 변화 횟수 계산
  let changeCount = 0;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i] !== buckets[i - 1]) {
      changeCount++;
    }
  }
  
  // 급격한 변화 탐지 (최근 5개 중 4개 이상 다름)
  const recentBuckets = buckets.slice(-5);
  const uniqueRecent = new Set(recentBuckets).size;
  const rapidChange = recentBuckets.length >= 4 && uniqueRecent >= 4;
  
  return {
    previous_buckets: previousBuckets.slice(-10), // 최근 10개만 보관
    bucket_change_count: changeCount,
    rapid_change_detected: rapidChange
  };
}
