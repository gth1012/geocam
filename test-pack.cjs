// packCanonical 테스트

const crypto = require('crypto');

function sortObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (typeof obj === 'object') {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const value = obj[key];
      if (value !== undefined) {
        sorted[key] = sortObject(value);
      }
    }
    return sorted;
  }
  return obj;
}

function canonicalizePack(pack) {
  return JSON.stringify(sortObject(pack));
}

function hashPack(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// 테스트
const pack1 = { zebra: 1, apple: 2, mango: 3 };
const pack2 = { apple: 2, mango: 3, zebra: 1 };
const pack3 = { a: 1, b: undefined, c: 3 };
const pack4 = { items: [3, 1, 2], name: 'test' };

const c1 = canonicalizePack(pack1);
const c2 = canonicalizePack(pack2);
const c3 = canonicalizePack(pack3);
const c4 = canonicalizePack(pack4);

console.log('Test 1 (key sort):', c1 === c2 ? 'PASS' : 'FAIL');
console.log('  Result:', c1);

console.log('Test 2 (undefined remove):', !c3.includes('undefined') ? 'PASS' : 'FAIL');
console.log('  Result:', c3);

console.log('Test 3 (array order):', c4.includes('[3,1,2]') ? 'PASS' : 'FAIL');
console.log('  Result:', c4);

const hash1 = hashPack(c1);
const hash2 = hashPack(c2);
console.log('Test 4 (same hash):', hash1 === hash2 ? 'PASS' : 'FAIL');
console.log('  Hash:', hash1);
