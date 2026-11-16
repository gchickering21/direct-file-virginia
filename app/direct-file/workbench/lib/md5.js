// MD5, because form-builder keys the flow locale files by the first six hex digits of the MD5 of
// an element's inner markup (parser/TranslationContext.scala, getHashKey). The browser has no MD5
// in WebCrypto and Node's is behind an import, so one small implementation runs in both.
// RFC 1321, operating on UTF-8 bytes.

function utf8 (s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00) }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32))
const R = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const rotl = (x, c) => (x << c) | (x >>> (32 - c))

export function md5 (str) {
  const bytes = utf8(String(str))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLen / 2 ** (8 * i)) & 0xff)
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476
  for (let off = 0; off < bytes.length; off += 64) {
    const M = new Array(16)
    for (let i = 0; i < 16; i++) M[i] = bytes[off + i * 4] | (bytes[off + i * 4 + 1] << 8) | (bytes[off + i * 4 + 2] << 16) | (bytes[off + i * 4 + 3] << 24)
    let A = a0; let B = b0; let C = c0; let D = d0
    for (let i = 0; i < 64; i++) {
      let F; let g
      if (i < 16) { F = (B & C) | (~B & D); g = i } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 } else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      const tmp = D
      D = C
      C = B
      B = (B + rotl((A + F + K[i] + M[g]) | 0, R[i])) | 0
      A = tmp
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0
  }
  const hex = n => [0, 8, 16, 24].map(s => ((n >>> s) & 0xff).toString(16).padStart(2, '0')).join('')
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

/** The locale key form-builder gives a leaf element: `label-` and six hex digits of the MD5 of its content. */
export const hashKey = (label, content) => `${label}-${md5(String(content).trim()).slice(0, 6)}`
