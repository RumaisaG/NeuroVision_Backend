

require('../setup')
const jwt  = require('jsonwebtoken')
const User = require('../../models/User')
const { protect } = require('../../middleware/authMiddleware')

function makeReqResNext(headerToken = null, queryToken = null) {
  const req = {
    headers: headerToken
      ? { authorization: `Bearer ${headerToken}` }
      : {},
    query: queryToken ? { token: queryToken } : {},
    user:  null
  }
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis()
  }
  const next = jest.fn()
  return { req, res, next }
}

function makeToken(userId, expiresIn = '15m') {
  return jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, { expiresIn })
}

let testUser

beforeEach(async () => {
  testUser = await User.create({
    firstName:    'Auth',
    lastName:     'Tester',
    email:        'auth.middleware@test.com',
    passwordHash: 'TestPass1234',
    role:         'Neurologist'
  })
})

describe('Auth Middleware — protect()', () => {

  // TC-MW-01
  test('TC-MW-01: should call next() with valid Bearer token in header', async () => {
    const token = makeToken(testUser._id)
    const { req, res, next } = makeReqResNext(token)
    await protect(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user).toBeDefined()
    expect(req.user._id.toString()).toBe(testUser._id.toString())
  })


  
  // TC-MW-02
  test('TC-MW-02: should return 401 with TOKEN_EXPIRED code for expired token', async () => {
    const expiredToken = makeToken(testUser._id, '-1s')  // expired 1 second ago
    
    const { req, res, next } = makeReqResNext(expiredToken)
    await protect(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    const jsonArg = res.json.mock.calls[0][0]
    expect(jsonArg.code).toBe('TOKEN_EXPIRED')
  })

  // TC-MW-03
  test('TC-MW-03: should return 401 for token signed with wrong secret', async () => {
    const badToken = jwt.sign({ id: testUser._id }, 'wrong_secret', { expiresIn: '15m' })
    const { req, res, next } = makeReqResNext(badToken)
    await protect(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  // TC-MW-04
  test('TC-MW-04: should return 401 when token userId does not exist in DB', async () => {
    const fakeId    = '507f1f77bcf86cd799439011'
    const badToken  = makeToken(fakeId)
    const { req, res, next } = makeReqResNext(badToken)
    await protect(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

// TC-MW-05
test('TC-MW-05: should return 403 for deactivated user account', async () => {
  // Direct save is reliable — findByIdAndUpdate can have flush timing issues
  const user = await User.findById(testUser._id)
  user.isActive = false
  await user.save()

  const token = makeToken(testUser._id)
  const { req, res, next } = makeReqResNext(token)
  await protect(req, res, next)

  expect(res.status).toHaveBeenCalledWith(403)
})
 
})