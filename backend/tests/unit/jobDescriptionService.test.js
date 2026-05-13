'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/jobDescriptionRepository');

const jdService = require('../../src/services/jobDescriptionService');
const jdRepo = require('../../src/repositories/jobDescriptionRepository');

describe('jobDescriptionService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects 409 when active JD already exists for combo', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue({ _id: 'jd1' });
    await expect(jdService.create({
      title: 'React Sr', techStack: 'react', experience: 'senior',
      jobRole: 'role', responsibilities: 'resp', qualifications: 'quals',
    }, 'admin1')).rejects.toMatchObject({ statusCode: 409 });
  });

  test('creates JD when no active duplicate exists', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue(null);
    const created = { id: 'jd1', title: 'React Sr', techStack: 'react' };
    jdRepo.create.mockResolvedValue(created);
    const result = await jdService.create({
      title: 'React Sr', techStack: 'react', experience: 'senior',
      jobRole: 'role', responsibilities: 'resp', qualifications: 'quals',
    }, 'admin1');
    expect(jdRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'React Sr', techStack: 'react', experience: 'senior', createdBy: 'admin1',
    }));
    expect(result.id).toBe('jd1');
  });
});

describe('jobDescriptionService.deactivate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('soft-deletes by setting isActive=false', async () => {
    jdRepo.findById.mockResolvedValue({ id: 'jd1', isActive: true });
    jdRepo.updateById.mockResolvedValue({ id: 'jd1', isActive: false });
    await jdService.deactivate('jd1');
    expect(jdRepo.updateById).toHaveBeenCalledWith('jd1', { isActive: false });
  });

  test('404 when JD not found', async () => {
    jdRepo.findById.mockResolvedValue(null);
    await expect(jdService.deactivate('jd1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('jobDescriptionService.lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns matching active JD', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue({ id: 'jd1', techStack: 'react' });
    const result = await jdService.lookup('react', 'senior');
    expect(result.id).toBe('jd1');
  });

  test('returns null when no active JD matches', async () => {
    jdRepo.findActiveByCombo.mockResolvedValue(null);
    const result = await jdService.lookup('rust', 'senior');
    expect(result).toBeNull();
  });
});
