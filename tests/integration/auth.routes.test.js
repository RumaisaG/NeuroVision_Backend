

require('../setup')
const request = require('supertest')
const app     = require('../../server')

//  Shared test credentials 
const validUser = {
  firstName: 'Alice',
  lastName:  'Neurologist',
  email:     'alice@neurovision.test',
  password:  'SecurePass123',
  role:      'Neurologist'
}

async function getAuthToken(credentials = validUser) {
  await request(app).post('/api/auth/register').send(credentials)
  const res = await request(app).post('/api/auth/login').send({
    email:    credentials.email,
    password: credentials.password
  })
  return res.body.accessToken
}

// POST /api/auth/register

describe('POST /api/auth/register', () => {

  // TC-AR-01 — FR-01
  test('TC-AR-01: should register a new user and return 201 with accessToken', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validUser)

    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.email).toBe(validUser.email)
    expect(res.body.user.passwordHash).toBeUndefined()   
  })

  // TC-AR-02 — FR-01 (negative)
  test('TC-AR-02: should return 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'incomplete@test.com' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBeDefined()
  })

  // TC-AR-03 — FR-01 (negative)
  test('TC-AR-03: should return 400 when password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/8 characters/i)
  })

  // TC-AR-04 — FR-01 (negative)
  test('TC-AR-04: should return 409 when email is already registered', async () => {
    await request(app).post('/api/auth/register').send(validUser)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, firstName: 'Duplicate' })

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/already registered/i)
  })

})

// POST /api/auth/login
describe('POST /api/auth/login', () => {

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser)
  })

  // TC-AL-01 — FR-02
  test('TC-AL-01: should login with valid credentials and return accessToken', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.firstName).toBe(validUser.firstName)
  })

  // TC-AL-02 — FR-02 (negative)
  test('TC-AL-02: should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'WrongPassword999' })

    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/invalid email or password/i)
  })

  // TC-AL-03 — FR-02 (negative)
  test('TC-AL-03: should return 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notregistered@test.com', password: 'AnyPassword123' })

    expect(res.status).toBe(401)
  })

  // TC-AL-04 — FR-02 (negative)
  test('TC-AL-04: should return 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email })

    expect(res.status).toBe(400)
  })

  // TC-AL-05 — Security (case-insensitive email)
  test('TC-AL-05: should login successfully with uppercase email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email.toUpperCase(), password: validUser.password })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })

})

// GET /api/auth/me
describe('GET /api/auth/me', () => {

  // TC-AM-01
  test('TC-AM-01: should return current user profile with valid token', async () => {
    const token = await getAuthToken()
    const res   = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(validUser.email)
    expect(res.body.user.firstName).toBe(validUser.firstName)
  })

  // TC-AM-02
  test('TC-AM-02: should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  // TC-AM-03
  test('TC-AM-03: should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')

    expect(res.status).toBe(401)
  })
})

// POST /api/auth/refresh
describe('POST /api/auth/refresh', () => {

  // TC-RF-01
  test('TC-RF-01: should return new accessToken when valid refreshToken cookie is present', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser)
    const cookies     = registerRes.headers['set-cookie']

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies)

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })

  // TC-RF-02
  test('TC-RF-02: should return 401 when no refreshToken cookie is present', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/refresh token missing/i)
  })
})

// POST /api/auth/logout
describe('POST /api/auth/logout', () => {

  // TC-LO-01
  test('TC-LO-01: should clear refreshToken cookie on logout', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
    const setCookie = res.headers['set-cookie']
    if (setCookie) {
      const refreshCookie = setCookie.find(c => c.startsWith('refreshToken='))
      expect(refreshCookie).toMatch(/Max-Age=0|refreshToken=;/i)
    }
  })
})