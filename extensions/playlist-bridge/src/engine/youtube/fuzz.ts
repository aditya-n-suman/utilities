// Port of rapidfuzz's fuzz.ratio / partial_ratio / token_sort_ratio / token_set_ratio
// (rapidfuzz/fuzz_py.py reference implementation, default processor=None). Strings are compared
// by Unicode code point, like Python. Operation order mirrors the Python code so scores match bit for bit.

type Seq = string[];
const seq = (s: string): Seq => Array.from(s);
const cmpCodePoints = (a: string, b: string) => {
  const x = seq(a), y = seq(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
};

function lcsLength(a: Seq, b: Seq): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let curr = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = ai === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, curr[j - 1]!);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

const indelDistance = (a: Seq, b: Seq) => a.length + b.length - 2 * lcsLength(a, b);

function indelNormalizedSimilarity(a: Seq, b: Seq): number {
  const maximum = a.length + b.length;
  const normDist = maximum ? indelDistance(a, b) / maximum : 0;
  return 1.0 - normDist;
}

/** 0–100 */
export function ratio(s1: string, s2: string): number {
  return indelNormalizedSimilarity(seq(s1), seq(s2)) * 100;
}

/** rapidfuzz _partial_ratio_impl; assumes s1.length <= s2.length. Returns 0–1, or 100 on a perfect hit. */
function partialRatioImpl(s1: Seq, s2: Seq): number {
  const chars = new Set(s1);
  const len1 = s1.length, len2 = s2.length;
  let best = 0;
  const consider = (sub: Seq) => {
    const r = indelNormalizedSimilarity(s1, sub);
    if (r > best) best = r;
    return best === 1;
  };
  for (let i = 1; i < len1; i++) {
    if (!chars.has(s2[i - 1]!)) continue;
    if (consider(s2.slice(0, i))) return 100;
  }
  for (let i = 0; i < len2 - len1; i++) {
    if (!chars.has(s2.at(i + len1 - 1)!)) continue;
    if (consider(s2.slice(i, i + len1))) return 100;
  }
  for (let i = len2 - len1; i < len2; i++) {
    if (!chars.has(s2[i]!)) continue;
    if (consider(s2.slice(i))) return 100;
  }
  return best * 100;
}

/** 0–100 */
export function partialRatio(a: string, b: string): number {
  if (!a && !b) return 100;
  const s1 = seq(a), s2 = seq(b);
  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1];
  let score = partialRatioImpl(shorter, longer);
  if (score !== 100 && s1.length === s2.length) score = Math.max(score, partialRatioImpl(longer, shorter));
  return score;
}

const splitTokens = (s: string) => s.split(/\s+/u).filter(Boolean);

/** 0–100 */
export function tokenSortRatio(a: string, b: string): number {
  const sortJoin = (s: string) => splitTokens(s).sort(cmpCodePoints).join(" ");
  return ratio(sortJoin(a), sortJoin(b));
}

const normDistance = (dist: number, lensum: number) => (lensum ? 100 - (100 * dist) / lensum : 100);

/** 0–100 */
export function tokenSetRatio(a: string, b: string): number {
  const tokensA = new Set(splitTokens(a));
  const tokensB = new Set(splitTokens(b));
  if (!tokensA.size || !tokensB.size) return 0;
  const intersect = [...tokensA].filter((t) => tokensB.has(t));
  const diffAB = [...tokensA].filter((t) => !tokensB.has(t));
  const diffBA = [...tokensB].filter((t) => !tokensA.has(t));
  if (intersect.length && (!diffAB.length || !diffBA.length)) return 100;

  const diffABJoined = diffAB.sort(cmpCodePoints).join(" ");
  const diffBAJoined = diffBA.sort(cmpCodePoints).join(" ");
  const abLen = seq(diffABJoined).length;
  const baLen = seq(diffBAJoined).length;
  const sectLen = seq(intersect.join(" ")).length;
  const sectAbLen = sectLen + Number(sectLen !== 0) + abLen;
  const sectBaLen = sectLen + Number(sectLen !== 0) + baLen;

  const dist = indelDistance(seq(diffABJoined), seq(diffBAJoined));
  const result = normDistance(dist, sectAbLen + sectBaLen);
  if (!sectLen) return result;

  const sectAbRatio = normDistance(Number(sectLen !== 0) + abLen, sectLen + sectAbLen);
  const sectBaRatio = normDistance(Number(sectLen !== 0) + baLen, sectLen + sectBaLen);
  return Math.max(result, sectAbRatio, sectBaRatio);
}
