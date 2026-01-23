/**
 * Evidence Pack Canonicalize + Hash 모듈
 * Phase 2-A / Step 3
 */

function sortObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    
    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined) {
        sorted[key] = sortObject(value);
      }
    }
    return sorted;
  }

  return obj;
}

export function canonicalizePack(pack: Record<string, unknown>): string {
  const sorted = sortObject(pack);
  return JSON.stringify(sorted);
}

export async function hashPack(canonicalString: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
