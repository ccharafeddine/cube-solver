/** Lehmer-code rank of a permutation of 0..n-1. */
export function permRank(p: ArrayLike<number>): number {
  const n = p.length;
  let r = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r = r * (n - i) + smaller;
  }
  return r;
}

export function permUnrank(r: number, n: number): number[] {
  const digits: number[] = [];
  for (let i = 1; i <= n; i++) {
    digits.unshift(r % i);
    r = Math.floor(r / i);
  }
  const pool = Array.from({ length: n }, (_, i) => i);
  return digits.map((d) => pool.splice(d, 1)[0]);
}

export const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
