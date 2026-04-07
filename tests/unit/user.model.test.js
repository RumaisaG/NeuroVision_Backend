
require('../setup')
const User = require('../../models/User')
const bcrypt = require('bcrypt')
//  Test data  
const makeUser = (overrides = {}) => ({
  firstName:    'Jane',
  lastName:     'Smith',
  email:        'jane.s@neurovision.test',
  passwordHash: 'Secure1123',
  role:         'Neurologist',
  ...overrides
})

// User Model Unit Tests

describe('User Model — Schema Validation', () => {

  // TC-UM-01
  test('TC-UM-01: should create a valid user with all required fields', async () => {
    const user = await User.create(makeUser())
    expect(user._id).toBeDefined()
    expect(user.firstName).toBe('Jane')
    expect(user.lastName).toBe('Doe')
    expect(user.email).toBe('jane.doe@neurovision.test')
    expect(user.role).toBe('Neurologist')
    expect(user.isActive).toBe(true)
    expect(user.createdAt).toBeDefined()
  })

  // TC-UM-02
  test('TC-UM-02: should reject user with missing firstName', async () => {
    const { firstName, ...data } = makeUser()
    await expect(User.create(data)).rejects.toThrow()
  })

  // TC-UM-03
  test('TC-UM-03: should reject user with missing lastName', async () => {
    const { lastName, ...data } = makeUser()
    await expect(User.create(data)).rejects.toThrow()
  })

  // TC-UM-04
  test('TC-UM-04: should reject user with missing email', async () => {
    const { email, ...data } = makeUser()
    await expect(User.create(data)).rejects.toThrow()
  })

  // TC-UM-05
  test('TC-UM-05: should reject duplicate email (unique constraint)', async () => {
    await User.create(makeUser())
    await expect(User.create(makeUser({ firstName: 'John' })))
      .rejects.toThrow()
  })

  // TC-UM-06
  test('TC-UM-06: should lowercase and trim email on save', async () => {
    const user = await User.create(makeUser({ email: '  JANE.DOE@Test.COM  ' }))
    expect(user.email).toBe('jane.doe@test.com')
  })

  // TC-UM-07
  test('TC-UM-07: should reject invalid role enum value', async () => {
    await expect(User.create(makeUser({ role: 'InvalidRole' }))).rejects.toThrow()
  })

  // TC-UM-08
  test('TC-UM-08: should accept all valid role enum values', async () => {
    const validRoles = ['Neurologist', 'Radiologist', 'General Practitioner', 'Researcher', 'Medical Student']
    for (const role of validRoles) {
      const email = `test_${role.replace(/\s/g, '_').toLowerCase()}@test.com`
      const user  = await User.create(makeUser({ email, role }))
      expect(user.role).toBe(role)
      await User.deleteOne({ _id: user._id })
    }
  })
})

describe('User Model — Password Hashing', () => {

  // TC-UM-09
   test('TC-UM-09: should hash the password before saving', async () => {

    const plainPassword = 'SecurePass123456'
    const user = await User.create(makeUser({ passwordHash: plainPassword }))
    const fetched = await User.findById(user._id).select('+passwordHash')

    expect(fetched.passwordHash).not.toBe(plainPassword)

    expect(fetched.passwordHash).toMatch(/^\$2[aby]\$/)
    const isMatch = await bcrypt.compare(plainPassword, fetched.passwordHash)
    expect(isMatch).toBe(true)

  })

  // TC-UM-10
  test('TC-UM-10: should not re-hash password if it was not modified', async () => {
    const user    = await User.create(makeUser())
    const fetched = await User.findById(user._id).select('+passwordHash')
    const hash1   = fetched.passwordHash
    fetched.firstName = 'UpdatedName'
    await fetched.save()
    const fetched2 = await User.findById(user._id).select('+passwordHash')
    expect(fetched2.passwordHash).toBe(hash1)
  })
})

describe('User Model — comparePassword method', () => {

  // TC-UM-11
  test('TC-UM-11: comparePassword returns true for correct password', async () => {
    const plain = 'SecurePass123'
    const user  = await User.create(makeUser({ passwordHash: plain }))
    const found = await User.findById(user._id).select('+passwordHash')
    const match = await found.comparePassword(plain)
    expect(match).toBe(true)
  })

  // TC-UM-12
  test('TC-UM-12: comparePassword returns false for wrong password', async () => {
    const user  = await User.create(makeUser({ passwordHash: 'CorrectPass123' }))
    const found = await User.findById(user._id).select('+passwordHash')
    const match = await found.comparePassword('WrongPassword999')
    expect(match).toBe(false)
  })

  // TC-UM-13
  test('TC-UM-13: comparePassword returns false for empty string', async () => {
    const user  = await User.create(makeUser())
    const found = await User.findById(user._id).select('+passwordHash')
    const match = await found.comparePassword('')
    expect(match).toBe(false)
  })
})

describe('User Model — toJSON sanitisation', () => {

  // TC-UM-14
  test('TC-UM-14: toJSON should strip passwordHash from response', async () => {
    const user   = await User.create(makeUser())
    const json   = user.toJSON()
    expect(json.passwordHash).toBeUndefined()
  })

  // TC-UM-15
  test('TC-UM-15: toJSON should include non-sensitive fields', async () => {
    const user = await User.create(makeUser())
    const json = user.toJSON()
    expect(json.firstName).toBe('Jane')
    expect(json.email).toBe('jane.doe@neurovision.test')
    expect(json.role).toBe('Neurologist')
  })
})