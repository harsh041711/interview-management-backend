'use strict';

// Quick SMTP smoke test. Run from backend/ with: node scripts/test-smtp.js
const env = require('../src/config/env');
const nodemailer = require('nodemailer');

(async () => {
  const { host, port, secure, user, password, from } = env.smtp;
  console.log('SMTP config:', {
    host, port, secure, user,
    password: password ? `${password.slice(0, 3)}…(${password.length} chars)` : '(empty)',
    from,
  });
  if (!host || !user || !password) {
    console.error('✗ Missing SMTP_HOST / SMTP_USER / SMTP_PASSWORD in .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host, port, secure, auth: { user, pass: password },
  });

  try {
    await transporter.verify();
    console.log('✓ SMTP login OK');
  } catch (err) {
    console.error('✗ SMTP login failed:', err.message);
    process.exit(2);
  }

  const to = process.argv[2] || env.admin.seed.hrEmail || user;
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Interview Management — SMTP test',
      text: 'If you can read this, SMTP works.',
    });
    console.log(`✓ Email sent to ${to}, messageId=${info.messageId}`);
    process.exit(0);
  } catch (err) {
    console.error('✗ Send failed:', err.message);
    if (err.response) console.error('  server response:', err.response);
    process.exit(3);
  }
})();
