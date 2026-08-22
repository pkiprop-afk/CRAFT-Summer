/**
 * Paired significance tests for the primary-judge deltas.
 *
 * Wilcoxon signed-rank (zeros dropped, midranks for ties; exact two-sided p by
 * enumeration when the reduced n has no rank ties and n <= 25, otherwise the
 * tie-corrected normal approximation) plus the paired t-test. Both two-sided.
 *
 * The ceiling makes the delta distribution heavily zero-inflated, so the
 * Wilcoxon result is primary; the t-test is reported alongside with a
 * normality caveat computed from the data rather than assumed.
 */

export interface WilcoxonResult {
  /** Pairs remaining after zero differences are dropped. */
  nNonZero: number;
  nZero: number;
  wPlus: number;
  wMinus: number;
  /** min(wPlus, wMinus) — the reported statistic. */
  statistic: number;
  pTwoSided: number | null;
  method: "exact" | "normal-approximation" | "not-estimable";
}

export function wilcoxonSignedRank(differences: number[]): WilcoxonResult {
  const nonZero = differences.filter((d) => d !== 0);
  const nZero = differences.length - nonZero.length;
  const n = nonZero.length;
  if (n === 0) {
    return {
      nNonZero: 0,
      nZero,
      wPlus: 0,
      wMinus: 0,
      statistic: 0,
      pTwoSided: null,
      method: "not-estimable",
    };
  }

  // Midranks of |d|.
  const sorted = nonZero
    .map((d, i) => ({ abs: Math.abs(d), sign: Math.sign(d), i }))
    .sort((a, b) => a.abs - b.abs);
  const ranks = new Array<number>(n);
  const tieGroups: number[] = [];
  let pos = 0;
  while (pos < n) {
    let end = pos;
    while (end + 1 < n && sorted[end + 1].abs === sorted[pos].abs) end++;
    const midrank = (pos + 1 + (end + 1)) / 2;
    for (let k = pos; k <= end; k++) ranks[sorted[k].i] = midrank;
    if (end > pos) tieGroups.push(end - pos + 1);
    pos = end + 1;
  }

  let wPlus = 0;
  nonZero.forEach((d, i) => {
    if (d > 0) wPlus += ranks[i];
  });
  const total = (n * (n + 1)) / 2;
  const wMinus = total - wPlus;
  const statistic = Math.min(wPlus, wMinus);

  // Exact enumeration is valid only with untied integer ranks.
  if (tieGroups.length === 0 && n <= 25) {
    // dist[w] = number of sign assignments with positive-rank-sum w.
    const dist = new Array<number>(total + 1).fill(0);
    dist[0] = 1;
    for (let r = 1; r <= n; r++) {
      for (let w = total; w >= r; w--) dist[w] += dist[w - r];
    }
    const totalAssignments = 2 ** n;
    let cumulative = 0;
    for (let w = 0; w <= statistic; w++) cumulative += dist[w];
    const p = Math.min(1, (2 * cumulative) / totalAssignments);
    return { nNonZero: n, nZero, wPlus, wMinus, statistic, pTwoSided: p, method: "exact" };
  }

  // Normal approximation with tie correction (no continuity correction, so the
  // figure matches the conventional software default).
  const mean = total / 2;
  const tieCorrection = tieGroups.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection;
  if (variance <= 0) {
    return {
      nNonZero: n,
      nZero,
      wPlus,
      wMinus,
      statistic,
      pTwoSided: null,
      method: "not-estimable",
    };
  }
  const z = (statistic - mean) / Math.sqrt(variance);
  const p = Math.min(1, 2 * normalCdf(-Math.abs(z)));
  return {
    nNonZero: n,
    nZero,
    wPlus,
    wMinus,
    statistic,
    pTwoSided: p,
    method: "normal-approximation",
  };
}

export interface PairedTResult {
  n: number;
  meanDifference: number;
  sdDifference: number;
  t: number | null;
  df: number;
  pTwoSided: number | null;
}

export function pairedTTest(differences: number[]): PairedTResult {
  const n = differences.length;
  const mean = n === 0 ? 0 : differences.reduce((s, d) => s + d, 0) / n;
  // Sample SD (n-1).
  const sd =
    n < 2
      ? 0
      : Math.sqrt(differences.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1));
  if (n < 2 || sd === 0) {
    return { n, meanDifference: mean, sdDifference: sd, t: null, df: n - 1, pTwoSided: null };
  }
  const t = mean / (sd / Math.sqrt(n));
  const df = n - 1;
  const p = 2 * tTailProbability(Math.abs(t), df);
  return { n, meanDifference: mean, sdDifference: sd, t, df, pTwoSided: Math.min(1, p) };
}

/** P(T > t) for Student's t with df degrees of freedom, t >= 0. */
function tTailProbability(t: number, df: number): number {
  const x = df / (df + t * t);
  return 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26 via erf; |error| < 1.5e-7 — ample for reporting.
  const sign = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-a * a);
  return 0.5 * (1 + sign * erf);
}

function logGamma(x: number): number {
  // Lanczos approximation.
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized incomplete beta I_x(a, b) via continued fraction. */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Continued fraction converges fast only for x below the pivot; use the
  // symmetry relation on the other side.
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(b, a, 1 - x);
  }
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  // Lentz's algorithm.
  const EPS = 1e-12;
  let f = 1,
    c = 1,
    d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0)
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    if (Math.abs(1 - c * d) < EPS) break;
  }
  return front * (f - 1);
}
