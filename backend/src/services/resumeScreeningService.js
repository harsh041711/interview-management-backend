'use strict';

const aiService = require('./aiService');
const logger = require('../config/logger');

const MAX_RESUME_CHARS = 20000;
const MAX_FLAGS = 6;
const MAX_SUMMARY = 500;

const extractResumeText = async (buffer, mimeType) => {
  if (!buffer || !buffer.length) return '';
  try {
    if (mimeType === 'application/pdf' || mimeType?.includes('pdf')) {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      const text = (parsed?.text || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, MAX_RESUME_CHARS);
    }
    if (
      mimeType?.includes('officedocument.wordprocessingml.document') ||
      mimeType?.includes('msword') ||
      mimeType?.includes('docx')
    ) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      const text = (value || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, MAX_RESUME_CHARS);
    }
    return '';
  } catch (err) {
    logger.warn('Resume text extraction failed', { mimeType, err: err.message });
    return '';
  }
};

const buildPrompt = ({ resumeText, jd }) => `You are a senior technical recruiter. Score how well the candidate's resume matches the job description. Be strict but fair.

JOB DESCRIPTION:
Title: ${jd.title} · ${jd.techStack} · ${jd.experience} · ${jd.minYears ?? '?'}-${jd.maxYears ?? '?'} years

Job Role:
${jd.jobRole}

Role + Responsibilities:
${jd.responsibilities}

Person Specification and Qualifications:
${jd.qualifications}

Plus Points (Nice-to-Have):
${jd.niceToHave || '(none)'}

CANDIDATE RESUME:
${resumeText}

Respond with ONLY valid JSON in this exact shape:
{
  "matchPercent": <0-100 integer>,
  "greenFlags": [<at most ${MAX_FLAGS} short phrases>],
  "redFlags":  [<at most ${MAX_FLAGS} short phrases>],
  "summary":   "<1-2 sentence overall assessment>"
}`;

const snapshotJd = (jd) => ({
  title: jd.title,
  jobRole: jd.jobRole,
  responsibilities: jd.responsibilities,
  qualifications: jd.qualifications,
  niceToHave: jd.niceToHave || '',
  minYears: jd.minYears ?? null,
  maxYears: jd.maxYears ?? null,
});

const score = async ({ resumeText, jd }) => {
  if (!resumeText || !resumeText.trim()) {
    return { status: 'failed', jdId: jd.id, jdSnapshot: snapshotJd(jd), resumeText: '', scoredAt: new Date() };
  }
  const prompt = buildPrompt({ resumeText, jd });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    return {
      status: 'failed',
      jdId: jd.id,
      jdSnapshot: snapshotJd(jd),
      resumeText,
      scoredAt: new Date(),
    };
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || typeof parsed.matchPercent !== 'number') {
    return {
      status: 'failed',
      jdId: jd.id,
      jdSnapshot: snapshotJd(jd),
      resumeText,
      scoredAt: new Date(),
    };
  }
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const truncList = (arr) =>
    Array.isArray(arr) ? arr.slice(0, MAX_FLAGS).map((s) => String(s).slice(0, 200)) : [];
  return {
    status: 'scored',
    matchPercent: clamp(parsed.matchPercent),
    greenFlags: truncList(parsed.greenFlags),
    redFlags: truncList(parsed.redFlags),
    summary: String(parsed.summary || '').slice(0, MAX_SUMMARY),
    jdId: jd.id,
    jdSnapshot: snapshotJd(jd),
    resumeText,
    scoredAt: new Date(),
    scoredBy: `${provider}-${model}`,
  };
};

module.exports = { score, extractResumeText, buildPrompt };
