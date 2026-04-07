
require('../setup')
const request  = require('supertest')
const path     = require('path')
const fs       = require('fs')
const app      = require('../../server')

// ── Mock external services — no real Supabase, ML, or Gemini calls ────────────
jest.mock('../../services/storageService', () => ({
  uploadMRI:     jest.fn().mockResolvedValue({
    storagePath: 'scans/test-mri.jpg',
    publicUrl:   'https://test.supabase.co/storage/v1/object/public/mri-scans/scans/test-mri.jpg'
  }),
  deleteMRI:     jest.fn().mockResolvedValue(),
  uploadGradCAM: jest.fn().mockResolvedValue({
    gradCamPath: 'gradcam/test-gradcam.png',
    gradCamUrl:  'https://test.supabase.co/storage/v1/object/public/mri-scans/gradcam/test-gradcam.png'
  }),
  deleteGradCAM: jest.fn().mockResolvedValue()
}))

jest.mock('../../services/mlService', () => ({
  predict: jest.fn().mockResolvedValue({
    predictedClass: 'NonDemented',
    confidence:     0.9743,
    probabilities: {
      NonDemented:      0.9743,
      VeryMildDemented: 0.0152,
      MildDemented:     0.0073,
      ModerateDemented: 0.0032
    },
    gradCamPath:  'gradcam/test-gradcam.png',
    gradCamUrl:   '/uploads/gradcam/test-gradcam.png',
    rawResponse:  {}
  })
}))

jest.mock('../../services/pdfService', () => ({
  generateReport: jest.fn().mockResolvedValue({
    filePath:  '/app/uploads/reports/report_SC-TEST_1234567890.pdf',
    publicUrl: '/uploads/reports/report_SC-TEST_1234567890.pdf'
  })
}))

// ── Create a tiny valid JPEG buffer for upload tests ──────────────────────────
const DUMMY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH' +
  'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAA' +
  'BAAEBAREAAf/bAAQAAf/9AA0ABAAFAAYABwAIAAn/xAAUEAABAAAAAAAAAAAAAAAA' +
  'AAAA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=',
  'base64'
)
const DUMMY_JPEG_PATH = path.join(__dirname, 'dummy.jpg')

beforeAll(() => fs.writeFileSync(DUMMY_JPEG_PATH, DUMMY_JPEG))
afterAll(()  => { if (fs.existsSync(DUMMY_JPEG_PATH)) fs.unlinkSync(DUMMY_JPEG_PATH) })

// ── Helper: register + login, return { token, agent } ────────────────────────
async function authAgent() {
  const user = {
    firstName: 'Scan',
    lastName:  'Tester',
    email:     `scan.tester.${Date.now()}@test.com`,
    password:  'TestPass123',
    role:      'Radiologist'
  }
  const regRes = await request(app).post('/api/auth/register').send(user)
  return {
    token:  regRes.body.accessToken,
    userId: regRes.body.user._id
  }
}

// ── Helper: upload a scan and return the scan doc ─────────────────────────────
async function uploadScan(token, overrides = {}) {
  const res = await request(app)
    .post('/api/scans')
    .set('Authorization', `Bearer ${token}`)
    .attach('scan', DUMMY_JPEG_PATH)
    .field('hasPatient', 'false')
    .field('gradCamEnabled', 'true')
    .field('reportEnabled', 'false')

  if (overrides.field) {
    // Handled by caller
  }
  return res
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/scans — Upload Scan
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/scans — Upload Scan', () => {

  // TC-SC-01 — FR-03
  test('TC-SC-01: should upload scan successfully and return 201 with scan doc', async () => {
    const { token } = await authAgent()
    const res = await uploadScan(token)

    expect(res.status).toBe(201)
    expect(res.body.scan).toBeDefined()
    expect(res.body.scan.scanId).toBeDefined()
    expect(res.body.scan.status).toBe('pending')
    expect(res.body.scan.storagePath).toBe('scans/test-mri.jpg')
  })

  

  // TC-SC-02 — FR-03 (negative)
  test('TC-SC-03: should return 400 when no file is attached', async () => {
    const { token } = await authAgent()
    const res = await request(app)
      .post('/api/scans')
      .set('Authorization', `Bearer ${token}`)
      .field('hasPatient', 'false')

    expect(res.status).toBe(400)
  })

  // TC-SC-03 — FR-03 (with patient data)
  test('TC-SC-04: should store patient data when hasPatient is true', async () => {
    const { token } = await authAgent()
    const res = await request(app)
      .post('/api/scans')
      .set('Authorization', `Bearer ${token}`)
      .attach('scan', DUMMY_JPEG_PATH)
      .field('hasPatient', 'true')
      .field('fullName', 'John Patient')
      .field('age', '72')
      .field('gender', 'Male')
      .field('gradCamEnabled', 'true')
      .field('reportEnabled', 'false')

    expect(res.status).toBe(201)
    expect(res.body.scan.hasPatient).toBe(true)
    expect(res.body.scan.patient.fullName).toBe('John Patient')
    expect(res.body.scan.patient.age).toBe(72)
  })

  // TC-SC-04 — Data isolation
  test('TC-SC-05: scan should be associated with the authenticated user', async () => {
    const { token, userId } = await authAgent()
    const res = await uploadScan(token)

    expect(res.body.scan.userId).toBe(userId)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/scans/analyse — Run ML Analysis
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/scans/analyse — ML Analysis', () => {

  // TC-AN-01 — FR-04
  test('TC-AN-01: should run analysis and return predictedClass + confidence', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({ scanId })

    expect(res.status).toBe(200)
    expect(res.body.analysis.predictedClass).toBe('NonDemented')
    expect(res.body.analysis.confidence).toBeCloseTo(0.9743, 3)
    expect(res.body.scan.status).toBe('complete')
  })

  // TC-AN-02 — FR-04
  test('TC-AN-02: should return all 4 class probabilities summing to ~1.0', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)

    const res = await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({ scanId: uploadRes.body.scan._id })

    const probs = res.body.analysis.probabilities
    const sum   = Object.values(probs).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 2)
    expect(probs).toHaveProperty('NonDemented')
    expect(probs).toHaveProperty('VeryMildDemented')
    expect(probs).toHaveProperty('MildDemented')
    expect(probs).toHaveProperty('ModerateDemented')
  })

  // TC-AN-03 — FR-04 (negative)
  test('TC-AN-03: should return 400 when scanId is missing', async () => {
    const { token } = await authAgent()
    const res = await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
  })

  // TC-AN-04 — FR-04 (negative)
  test('TC-AN-04: should return 409 when scan is already complete', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    // First analysis
    await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({ scanId })

    // Second analysis on same scan — should be rejected
    const res = await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({ scanId })

    expect(res.status).toBe(409)
  })

  // TC-AN-05 — Data isolation
  test('TC-AN-05: user cannot analyse another users scan', async () => {
    const user1 = await authAgent()
    const user2 = await authAgent()

    const uploadRes = await uploadScan(user1.token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ scanId })

    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/scans — List All Scans
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/scans — Retrieve Scans', () => {

  // TC-LS-01
  test('TC-LS-01: should return empty array when user has no scans', async () => {
    const { token } = await authAgent()
    const res = await request(app)
      .get('/api/scans')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.scans).toHaveLength(0)
  })

  // TC-LS-02
  test('TC-LS-02: should return only the authenticated users scans', async () => {
    const user1 = await authAgent()
    const user2 = await authAgent()

    await uploadScan(user1.token)
    await uploadScan(user1.token)
    await uploadScan(user2.token)

    const res = await request(app)
      .get('/api/scans')
      .set('Authorization', `Bearer ${user1.token}`)

    expect(res.body.scans).toHaveLength(2)
    res.body.scans.forEach(s => expect(s.userId).toBe(user1.userId))
  })

  // TC-LS-03
  test('TC-LS-03: should return 401 without authentication', async () => {
    const res = await request(app).get('/api/scans')
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/scans/:id — Get Scan By ID
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/scans/:id', () => {

  // TC-GS-01
  test('TC-GS-01: should return scan document with analysis populated', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    await request(app)
      .post('/api/scans/analyse')
      .set('Authorization', `Bearer ${token}`)
      .send({ scanId })

    const res = await request(app)
      .get(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.scan.analysisId).toBeDefined()
    expect(typeof res.body.scan.analysisId).toBe('object')
    expect(res.body.scan.analysisId.predictedClass).toBeDefined()
  })

  // TC-GS-02
  test('TC-GS-02: should return 404 for non-existent scan ID', async () => {
    const { token } = await authAgent()
    const res = await request(app)
      .get('/api/scans/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  // TC-GS-03 — Data isolation
  test('TC-GS-03: should return 404 when accessing another users scan', async () => {
    const user1 = await authAgent()
    const user2 = await authAgent()

    const uploadRes = await uploadScan(user1.token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .get(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${user2.token}`)

    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/scans/:id
// ═══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/scans/:id', () => {

  // TC-DS-01
  test('TC-DS-01: should delete scan and return 200', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .delete(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  // TC-DS-02
  test('TC-DS-02: scan should no longer be accessible after deletion', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    await request(app)
      .delete(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request(app)
      .get(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  // TC-DS-03 — Data isolation
  test('TC-DS-03: should not allow deleting another users scan', async () => {
    const user1 = await authAgent()
    const user2 = await authAgent()

    const uploadRes = await uploadScan(user1.token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .delete(`/api/scans/${scanId}`)
      .set('Authorization', `Bearer ${user2.token}`)

    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/scans/:id/report — PDF Download (authenticated via ?token=)
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/scans/:id/report — PDF Download', () => {

  // TC-PR-01 — FR-06
  test('TC-PR-01: should return 401 with no token at all', async () => {
    const res = await request(app)
      .get('/api/scans/507f1f77bcf86cd799439011/report')

    expect(res.status).toBe(401)
  })

  // TC-PR-02 — FR-06
  test('TC-PR-02: should return 404 when scan has no report generated', async () => {
    const { token } = await authAgent()
    const uploadRes = await uploadScan(token)
    const scanId    = uploadRes.body.scan._id

    const res = await request(app)
      .get(`/api/scans/${scanId}/report?token=${token}`)

    expect(res.status).toBe(404)
  })
})