// server.test.js - basic tests for server endpoints using supertest
const request = require('supertest');
const app = require('../server');

describe('Server basic endpoints', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  test('POST /invite-therapist requires email', async () => {
    const res = await request(app).post('/invite-therapist').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /invite-therapist returns token with email', async () => {
    const res = await request(app).post('/invite-therapist').send({ email: 'test@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
