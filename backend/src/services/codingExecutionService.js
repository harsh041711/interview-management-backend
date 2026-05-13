'use strict';

const logger = require('../config/logger');
const env = require('../config/env');

const PISTON_URL = env.piston.url;
const LANG_MAP = { js: 'javascript', python: 'python', php: 'php' };
const FILE_NAMES = { js: 'main.js', python: 'main.py', php: 'main.php' };
const RUN_TIMEOUT_MS = 3000;
const COMPILE_TIMEOUT_MS = 10000;
const MEMORY_LIMIT = 256_000_000;
const FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const runOne = async ({ language, code, stdin }) => {
  const pistonLang = LANG_MAP[language];
  const fileName = FILE_NAMES[language];
  if (!pistonLang || !fileName) {
    return { stdout: '', stderr: '', exitCode: null, runtimeMs: 0, error: `Unsupported language: ${language}` };
  }
  const body = {
    language: pistonLang,
    version: '*',
    files: [{ name: fileName, content: code }],
    stdin: stdin || '',
    run_timeout: RUN_TIMEOUT_MS,
    compile_timeout: COMPILE_TIMEOUT_MS,
    run_memory_limit: MEMORY_LIMIT,
  };
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      PISTON_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      FETCH_TIMEOUT_MS,
    );
    const runtimeMs = Date.now() - startedAt;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logger.warn('Piston returned non-OK', { status: res.status, body: txt.slice(0, 200) });
      return { stdout: '', stderr: '', exitCode: null, runtimeMs, error: `piston ${res.status}` };
    }
    const data = await res.json();
    const run = data?.run || {};
    return {
      stdout: run.stdout || '',
      stderr: run.stderr || '',
      exitCode: typeof run.code === 'number' ? run.code : null,
      runtimeMs,
      error: null,
    };
  } catch (err) {
    return {
      stdout: '', stderr: '',
      exitCode: null, runtimeMs: Date.now() - startedAt,
      error: err.message || 'fetch failed',
    };
  }
};

const runAllTestCases = async ({ language, code, testCases }) => {
  const runs = [];
  for (const tc of testCases) {
    const r = await runOne({ language, code, stdin: tc.stdin });
    runs.push({
      stdin: tc.stdin,
      expectedStdout: tc.expectedStdout,
      actualStdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
      runtimeMs: r.runtimeMs,
      passed: !r.error && r.exitCode === 0 && r.stdout.trim() === (tc.expectedStdout || '').trim(),
      error: r.error,
    });
  }
  return runs;
};

module.exports = { runOne, runAllTestCases, PISTON_URL };
