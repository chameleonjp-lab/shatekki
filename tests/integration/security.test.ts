import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Things that must never ship to the browser or live in the public repo. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['service_role', /service[_-]?role/i],
  ['supabase secret key', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT-looking token', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['aws access key', /(?<![A-Za-z0-9+/])AKIA[0-9A-Z]{16}(?![A-Za-z0-9+/])/],
  ['github token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['generic secret assignment', /(?:secret|password|passwd|api[_-]?secret)\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];

function scan(files: readonly string[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    if (!/\.(ts|js|mjs|css|html|json|map)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const [label, re] of FORBIDDEN) if (re.test(text)) hits.push(`${f.slice(ROOT.length + 1)}: ${label}`);
  }
  return hits;
}

describe('no secrets in the shipped code', () => {
  it('src/ contains no service_role key or secret-looking value', () => {
    const files = walk(join(ROOT, 'src'));
    expect(files.length).toBeGreaterThan(10);
    expect(scan(files)).toEqual([]);
  });

  it('only the publishable key is present, and it is the public sb_publishable_ form', () => {
    const text = readFileSync(join(ROOT, 'src/ranking/config.ts'), 'utf8');
    const keys = text.match(/sb_[a-z]+_[A-Za-z0-9_-]+/g) ?? [];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith('sb_publishable_'), k).toBe(true);
  });

  it('the published game keeps ranking and lab disabled while sharing its own URL', () => {
    const text = readFileSync(join(ROOT, 'src/ranking/config.ts'), 'utf8');
    expect(text).toMatch(/gameSlug: null,/);
    expect(text).toContain("canonicalUrl: 'https://chameleonjp-lab.github.io/shatekki/'");
    expect(text).toMatch(/labDetailUrl: null,/);
  });

  it('the production build output contains no service_role key or secret-looking value', () => {
    const outDir = join(ROOT, 'test-results', 'dist-security');
    rmSync(outDir, { recursive: true, force: true });
    execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: ROOT, stdio: 'pipe' });
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    const files = walk(outDir);
    expect(files.length).toBeGreaterThan(1);
    expect(scan(files)).toEqual([]);
    // the build must not ship the old submit endpoint either
    const joined = files.filter((f) => /\.js$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(joined).not.toMatch(/rpc\/submit_score['"`]/);
    rmSync(outDir, { recursive: true, force: true });
  });
});
