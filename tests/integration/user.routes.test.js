

require('../setup')
const request = require('supertest')
const app     = require('../../server')

async function registerAndLogin(overrides = {}) {
  const user = {
    firstName: 'Profile',
    lastName:  'Tester',
    email:     `profile.${Date.now()}@test.com`,
    password:  'TestPass123',
    role:      'Neurologist',
    ...overrides
  }
  const res = await request(app).post('/api/auth/register').send(user)
  return { token: res.body.accessToken, user: res.body.user, password: user.password }
}

describe('GET /api/users/me — Get Profile', () => {

  // TC-UP-01
  test('TC-UP-01: should return user profile for authenticated user', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.user.firstName).toBe('Profile')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  // TC-UP-02
  test('TC-UP-02: should return 401 without authentication', async () => {
    const res = await request(app).get('/api/users/me')
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/users/me — Update Profile', () => {

  // TC-UP-03
  test('TC-UP-03: should update firstName, lastName, and institution', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Updated', lastName: 'Name', institution: 'NHS Hospital' })

    expect(res.status).toBe(200)
    expect(res.body.user.firstName).toBe('Updated')
    expect(res.body.user.lastName).toBe('Name')
    expect(res.body.user.institution).toBe('NHS Hospital')
  })

  // TC-UP-04
  test('TC-UP-04: should update role to a valid value', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Profile', lastName: 'Tester', role: 'Radiologist' })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('Radiologist')
  })

})

describe('PATCH /api/users/me/password — Change Password', () => {

  // TC-PW-01
  test('TC-PW-01: should change password with correct current password', async () => {
    const { token, password } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NewSecure456' })

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/password updated/i)
  })

  // TC-PW-02
  test('TC-PW-02: should return 401 with wrong current password', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongCurrentPass', newPassword: 'NewPass789' })

    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/incorrect/i)
  })

  // TC-PW-03
  test('TC-PW-03: should return 400 when new password is shorter than 8 chars', async () => {
    const { token, password } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/8 characters/i)
  })

  // TC-PW-04
  test('TC-PW-04: should return 400 when fields are missing', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OnlyThisOne' })

    expect(res.status).toBe(400)
  })
})


describe('GET /api/users/me/stats — Analytics Stats', () => {

  // TC-ST-01
  test('TC-ST-01: should return stats object with correct shape', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .get('/api/users/me/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.stats).toBeDefined()
    expect(res.body.stats).toHaveProperty('total')
    expect(res.body.stats).toHaveProperty('completed')
    expect(res.body.stats).toHaveProperty('withReport')
    expect(res.body.stats).toHaveProperty('avgConfidence')
    expect(res.body.stats).toHaveProperty('stageCounts')
    expect(res.body.stats).toHaveProperty('weekActivity')
    expect(res.body.stats).toHaveProperty('monthlyTrend')
  })
})

describe('DELETE /api/users/me — Delete Account', () => {

  // TC-DA-01
  test('TC-DA-01: should delete account and return 200', async () => {
    const { token } = await registerAndLogin()
    const res = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

})