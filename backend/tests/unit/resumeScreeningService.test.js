'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/services/aiService', () => ({
  askWithFallback: jest.fn(),
  extractJson: jest.fn(),
}));
jest.mock('pdf-parse', () => jest.fn());

const aiService = require('../../src/services/aiService');
const pdfParse = require('pdf-parse');
const screeningService = require('../../src/services/resumeScreeningService');

const jd = {
  id: 'jd1',
  title: 'DevOps Sr',
  techStack: 'devops',
  experience: 'senior',
  jobRole: 'We are seeking a devops...',
  responsibilities: '- IaC with Terraform',
  qualifications: '- 5+ years',
  niceToHave: '- CKA',
  minYears: 5,
  maxYears: 10,
};

describe('resumeScreeningService.score', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns scored result when AI returns valid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: '{"matchPercent":78,"greenFlags":["5 years AWS"],"redFlags":["No K8s"],"summary":"Strong base."}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    aiService.extractJson.mockReturnValue({
      matchPercent: 78,
      greenFlags: ['5 years AWS'],
      redFlags: ['No K8s'],
      summary: 'Strong base.',
    });
    const result = await screeningService.score({ resumeText: 'resume text here', jd });
    expect(result.status).toBe('scored');
    expect(result.matchPercent).toBe(78);
    expect(result.greenFlags).toEqual(['5 years AWS']);
    expect(result.redFlags).toEqual(['No K8s']);
    expect(result.summary).toBe('Strong base.');
    expect(result.scoredBy).toBe('gemini-gemini-2.5-flash');
    expect(result.jdSnapshot.title).toBe('DevOps Sr');
  });

  test('returns failed status when AI returns null text', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null, errors: [{ provider: 'gemini', message: 'rate-limited' }] });
    const result = await screeningService.score({ resumeText: 'resume', jd });
    expect(result.status).toBe('failed');
    expect(result.matchPercent).toBeUndefined();
  });

  test('returns failed status when JSON parse returns null', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'not json', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    aiService.extractJson.mockReturnValue(null);
    const result = await screeningService.score({ resumeText: 'resume', jd });
    expect(result.status).toBe('failed');
  });

  test('clamps matchPercent to 0-100 range', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'x', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      matchPercent: 150,
      greenFlags: [],
      redFlags: [],
      summary: 's',
    });
    const result = await screeningService.score({ resumeText: 'r', jd });
    expect(result.matchPercent).toBe(100);
  });

  test('truncates flag arrays to at most 6 entries', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'x', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      matchPercent: 50,
      greenFlags: ['a','b','c','d','e','f','g','h'],
      redFlags: ['1','2','3','4','5','6','7','8'],
      summary: 's',
    });
    const result = await screeningService.score({ resumeText: 'r', jd });
    expect(result.greenFlags).toHaveLength(6);
    expect(result.redFlags).toHaveLength(6);
  });
});

describe('resumeScreeningService.extractResumeText', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns text from PDF buffer', async () => {
    pdfParse.mockResolvedValue({ text: 'extracted resume content' });
    const text = await screeningService.extractResumeText(Buffer.from('fake pdf'), 'application/pdf');
    expect(text).toBe('extracted resume content');
  });

  test('returns empty string when buffer is empty', async () => {
    const text = await screeningService.extractResumeText(null, 'application/pdf');
    expect(text).toBe('');
  });

  test('truncates extracted text to 20000 chars', async () => {
    pdfParse.mockResolvedValue({ text: 'a'.repeat(25000) });
    const text = await screeningService.extractResumeText(Buffer.from('x'), 'application/pdf');
    expect(text.length).toBe(20000);
  });
});
