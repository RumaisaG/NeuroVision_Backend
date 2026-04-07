

require('../setup')
const request = require('supertest')
const app     = require('../../server')

async function registerUser(suffix = Date.now()) {
  const user = {
    firstName: 'Black',
    lastName:  'Box',
    email:     `bb.${suffix}@test.com`,
    password:  'TestPass123',
    role:      'Researcher'
  }
  const res = await request(app).post('/api/auth/register').send(user)
  return { token: res.body.accessToken, user, cookies: res.headers['set-cookie'] }
}

// Input Validation
describe('Black-Box — Input Validation & Boundaries', () => {

  // TC-BB-01
  test('TC-BB-01: empty string inputs should not register a user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: '', lastName: '', email: '', password: '' })

    expect(res.status).toBe(400)
  })


  // TC-BB-02
  test('TC-BB-03: password of exactly 8 characters should be accepted', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Edge', lastName: 'Case', email: 'exact8@test.com', password: '12345678' })

    expect(res.status).toBe(201)
  })

  // TC-BB-03
  test('TC-BB-04: password of exactly 7 characters should be rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Edge', lastName: 'Case', email: 'seven@test.com', password: '1234567' })

    expect(res.status).toBe(400)
  })

  // TC-BB-04
  test('TC-BB-05: numeric-only password should be accepted (no character class restriction)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Num', lastName: 'Pass', email: 'numpass@test.com', password: '12345678' })

    expect(res.status).toBe(201)
  })

  // TC-BB-05
  test('TC-BB-06: special characters in name fields should be accepted', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: "O'Brien", lastName: 'García-López', email: 'special@test.com', password: 'ValidPass123' })

    expect(res.status).toBe(201)
  })
})

// NoSQL Injection Prevention

describe('Black-Box — NoSQL Injection Prevention', () => {

  // TC-BB-06
  test('TC-BB-07: NoSQL injection in login email field should not bypass auth', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: 'anything' })

    // Must return 400 or 401 — never 200
    expect([400, 401]).toContain(res.status)
    expect(res.body.accessToken).toBeUndefined()
  })

  // TC-BB-07
  test('TC-BB-08: NoSQL injection with $where operator should be handled safely', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $where: 'sleep(1000)' }, password: '{}' })

    expect([400, 401]).toContain(res.status)
    expect(res.body.accessToken).toBeUndefined()
  })

  // TC-BB-08
  test('TC-BB-09: injection in password field should not bypass authentication', async () => {
    await registerUser('inject')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `bb.inject@test.com`, password: { $ne: null } })

    expect([400, 401]).toContain(res.status)
  })
})

// Authentication Bypass Attempts
describe('Black-Box — Authentication Bypass', () => {

  // TC-BB-9
  test('TC-BB-10: null token in Authorization header should return 401', async () => {
    const res = await request(app)
      .get('/api/scans')
      .set('Authorization', 'Bearer null')

    expect(res.status).toBe(401)
  })

  // TC-BB-10
  test('TC-BB-11: Authorization header with no Bearer prefix should return 401', async () => {
    const res = await request(app)
      .get('/api/scans')
      .set('Authorization', 'ValidTokenWithoutBearer')

    expect(res.status).toBe(401)
  })

  // TC-BB-11
  test('TC-BB-12: JWT with algorithm:none attack should be rejected', async () => {
    // Manually craft a token with alg:none — a known JWT attack
    const header    = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload   = Buffer.from(JSON.stringify({ id: '507f1f77bcf86cd799439011', iat: Math.floor(Date.now()/1000) })).toString('base64url')
    const noneToken = `${header}.${payload}.`

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${noneToken}`)

    expect(res.status).toBe(401)
  })

  // TC-BB-12
  test('TC-BB-13: accessing protected route with empty Bearer token should return 401', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer ')

    expect(res.status).toBe(401)
  })
})


// Data Isolation 
describe('Black-Box — Data Isolation Between Users', () => {

  // TC-BB-13
  test('TC-BB-14: User A cannot read User B profile via /api/users/me', async () => {
    // /api/users/me always returns the authenticated user's own data
    const userA = await registerUser('iso_a')
    const userB = await registerUser('iso_b')

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userA.token}`)

    expect(res.body.user.email).toBe(userA.user.email)
    expect(res.body.user.email).not.toBe(userB.user.email)
  })

  // TC-BB-14
  test('TC-BB-15: User A cannot update User B profile', async () => {
    const userA = await registerUser('iso_patch_a')
    const userB = await registerUser('iso_patch_b')

    // User A tries to update using their own token — should only affect their account
    await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ firstName: 'Hacked' })

    // Verify User B is unchanged
    const resB = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userB.token}`)

    expect(resB.body.user.firstName).toBe('Black')  // unchanged
  })

  // TC-BB-15
  test('TC-BB-16: changing password should not affect other users', async () => {
    const userA = await registerUser('pw_iso_a')
    const userB = await registerUser('pw_iso_b')

    // User A changes password
    await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ currentPassword: 'TestPass123', newPassword: 'NewPassForA456' })

    // User B can still login with original password
    const resB = await request(app)
      .post('/api/auth/login')
      .send({ email: userB.user.email, password: 'TestPass123' })

    expect(resB.status).toBe(200)
  })
})

// Sensitive Data Exposure
describe('Black-Box — Sensitive Data Never Exposed', () => {

  // TC-BB-16
  test('TC-BB-17: passwordHash never appears in any API response', async () => {
    const { token } = await registerUser('sensitive')

    const responses = await Promise.all([
      request(app).post('/api/auth/register').send({ firstName:'S', lastName:'D', email:'sens2@test.com', password:'TestPass123', role:'Researcher' }),
      request(app).post('/api/auth/login').send({ email:'bb.sensitive@test.com', password:'TestPass123' }),
      request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)
    ])

    responses.forEach((res, i) => {
      const body = JSON.stringify(res.body)
      expect(body).not.toContain('passwordHash')
      expect(body).not.toContain('$2b$')   // bcrypt hash prefix
    })
  })

  // TC-BB-17
  test('TC-BB-18: JWT secret must never appear in any API response body', async () => {
    const { token } = await registerUser('jwt_secret')

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_ACCESS_SECRET)
    expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_REFRESH_SECRET)
  })

  // TC-BB-18
  test('TC-BB-19: internal server errors must not expose stack traces to the client', async () => {
    // Send a malformed MongoDB ObjectId to trigger a CastError
    const { token } = await registerUser('stack_trace')

    const res = await request(app)
      .get('/api/scans/not-a-valid-object-id')
      .set('Authorization', `Bearer ${token}`)

    // Should return a clean error, not a full stack trace
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('at Object.')
    expect(body).not.toContain('node_modules')
    expect([400, 404, 500]).toContain(res.status)
  })
})