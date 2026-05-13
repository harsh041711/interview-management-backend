'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const execService = require('../../src/services/codingExecutionService');

const okResponse = (run) => ({
  ok: true,
  json: jest.fn().mockResolvedValue({ language: 'python', version: '3.12', run }),
});

describe('codingExecutionService.runOne', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('returns stdout, stderr, exitCode from Piston', async () => {
    mockFetch.mockResolvedValue(okResponse({ stdout: 'hello\n', stderr: '', code: 0, signal: null, output: 'hello\n' }));
    const r = await execService.runOne({ language: 'python', code: 'print("hello")', stdin: '' });
    expect(r.stdout).toBe('hello\n');
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeNull();
  });

  test('returns error when Piston returns 5xx', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: jest.fn().mockResolvedValue('down') });
    const r = await execService.runOne({ language: 'python', code: 'x', stdin: '' });
    expect(r.error).toMatch(/piston/i);
    expect(r.stdout).toBe('');
  });

  test('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const r = await execService.runOne({ language: 'python', code: 'x', stdin: '' });
    expect(r.error).toMatch(/network/i);
  });
});

describe('codingExecutionService.runAllTestCases', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  test('aggregates results, marks pass/fail correctly', async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse({ stdout: '6\n', stderr: '', code: 0, signal: null, output: '6\n' }))
      .mockResolvedValueOnce(okResponse({ stdout: '5\n', stderr: '', code: 0, signal: null, output: '5\n' }));
    const runs = await execService.runAllTestCases({
      language: 'python',
      code: 'x',
      testCases: [
        { stdin: '1 2 3', expectedStdout: '6' },
        { stdin: '10 -5', expectedStdout: '99' },
      ],
    });
    expect(runs).toHaveLength(2);
    expect(runs[0].passed).toBe(true);
    expect(runs[1].passed).toBe(false);
  });
});
