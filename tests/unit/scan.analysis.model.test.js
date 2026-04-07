

require('../setup')
const mongoose = require('mongoose')
const Scan     = require('../../models/Scan')
const Analysis = require('../../models/Analysis')
const User     = require('../../models/User')

let testUserId

beforeEach(async () => {
  const user = await User.create({
    firstName:    'Test',
    lastName:     'User',
    email:        'scan.test@neurovision.test',
    passwordHash: 'TestPass123',
    role:         'Radiologist'
  })
  testUserId = user._id
})

//  Scan model factory 
const makeScan = (overrides = {}) => ({
  userId:           testUserId,
  scanId:           `SC-TEST-${Date.now()}`,
  originalFilename: 'brain_mri.jpg',
  storagePath:      'scans/brain_mri.jpg',
  fileFormat:       'JPG',
  fileSizeBytes:    524288,
  ...overrides
})

//  Analysis factory 
const makeAnalysis = (scanId, overrides = {}) => ({
  scanId,
  userId:        testUserId,
  predictedClass:'NonDemented',
  confidence:    0.9743,
  probabilities: {
    NonDemented:      0.9743,
    VeryMildDemented: 0.0152,
    MildDemented:     0.0073,
    ModerateDemented: 0.0032
  },
  ...overrides
})


describe('Scan Model — Schema Validation', () => {

  // TC-SM-01
  test('TC-SM-01: should create a valid scan with required fields', async () => {
    const scan = await Scan.create(makeScan())
    expect(scan._id).toBeDefined()
    expect(scan.status).toBe('pending')
    expect(scan.gradCamEnabled).toBe(true)
    expect(scan.reportEnabled).toBe(false)
    expect(scan.hasPatient).toBe(false)
  })

  // TC-SM-02
  test('TC-SM-02: should reject scan without userId', async () => {
    const { userId, ...data } = makeScan()
    await expect(Scan.create(data)).rejects.toThrow()
  })

  // TC-SM-03
  test('TC-SM-03: should reject scan without originalFilename', async () => {
    const { originalFilename, ...data } = makeScan()
    await expect(Scan.create(data)).rejects.toThrow()
  })

  // TC-SM-04
  test('TC-SM-04: should reject invalid status enum value', async () => {
    await expect(Scan.create(makeScan({ status: 'invalid_status' })))
      .rejects.toThrow()
  })

  // TC-SM-05
  test('TC-SM-05: should accept all valid status enum values', async () => {
    const statuses = ['pending', 'processing', 'complete', 'failed']
    for (const status of statuses) {
      const scan = await Scan.create(makeScan({
        scanId: `SC-${status}-${Date.now()}`,
        status
      }))
      expect(scan.status).toBe(status)
    }
  })

  // TC-SM-06
  test('TC-SM-06: should reject duplicate scanId (unique constraint)', async () => {
    const scanId = `SC-DUP-${Date.now()}`
    await Scan.create(makeScan({ scanId }))
    await expect(Scan.create(makeScan({ scanId }))).rejects.toThrow()
  })

  // TC-SM-07
  test('TC-SM-07: should store patient data when hasPatient is true', async () => {
    const scan = await Scan.create(makeScan({
      hasPatient: true,
      patient: {
        fullName:  'John Patient',
        age:       72,
        gender:    'Male',
        patientId: 'PT-001'
      }
    }))
    expect(scan.hasPatient).toBe(true)
    expect(scan.patient.fullName).toBe('John Patient')
    expect(scan.patient.age).toBe(72)
    expect(scan.patient.gender).toBe('Male')
  })

  // TC-SM-08
  test('TC-SM-08: should reject invalid patient gender enum', async () => {
    await expect(Scan.create(makeScan({
      hasPatient: true,
      patient: { fullName: 'Test', age: 50, gender: 'Unknown' }
    }))).rejects.toThrow()
  })

  // TC-SM-09
  test('TC-SM-09: should default gradCamEnabled to true', async () => {
    const scan = await Scan.create(makeScan())
    expect(scan.gradCamEnabled).toBe(true)
  })

  // TC-SM-10
  test('TC-SM-10: should store reportUrl and reportGeneratedAt when set', async () => {
    const now  = new Date()
    const scan = await Scan.create(makeScan({
      reportEnabled:     true,
      reportUrl:         '/uploads/reports/test.pdf',
      reportPath:        '/app/uploads/reports/test.pdf',
      reportGeneratedAt: now
    }))
    expect(scan.reportUrl).toBe('/uploads/reports/test.pdf')
    expect(scan.reportGeneratedAt.toISOString()).toBe(now.toISOString())
  })
})

describe('Analysis Model — Schema Validation', () => {

  let testScanId

  beforeEach(async () => {
    const scan   = await Scan.create(makeScan())
    testScanId   = scan._id
  })

  // TC-AM-01
  test('TC-AM-01: should create a valid analysis document', async () => {
    const analysis = await Analysis.create(makeAnalysis(testScanId))
    expect(analysis._id).toBeDefined()
    expect(analysis.predictedClass).toBe('NonDemented')
    expect(analysis.confidence).toBeCloseTo(0.9743, 4)
    expect(analysis.probabilities.NonDemented).toBeCloseTo(0.9743, 4)
  })

  // TC-AM-02
  test('TC-AM-02: should reject invalid predictedClass enum value', async () => {
    await expect(Analysis.create(makeAnalysis(testScanId, {
      predictedClass: 'SeverelyDemented'
    }))).rejects.toThrow()
  })

  // TC-AM-03
  test('TC-AM-03: should accept all four valid predictedClass values', async () => {
    const classes = ['NonDemented', 'VeryMildDemented', 'MildDemented', 'ModerateDemented']
    for (const cls of classes) {
      const scan = await Scan.create(makeScan({ scanId: `SC-CLS-${cls}-${Date.now()}` }))
      const a    = await Analysis.create(makeAnalysis(scan._id, { predictedClass: cls }))
      expect(a.predictedClass).toBe(cls)
    }
  })

  // TC-AM-04
  test('TC-AM-04: should reject confidence below 0', async () => {
    await expect(Analysis.create(makeAnalysis(testScanId, { confidence: -0.1 }))).rejects.toThrow()
  })

  // TC-AM-05
  test('TC-AM-05: should reject confidence above 1', async () => {
    await expect(Analysis.create(makeAnalysis(testScanId, { confidence: 1.1 }))).rejects.toThrow()
  })

  // TC-AM-06
  test('TC-AM-06: should enforce unique scanId (one analysis per scan)', async () => {
    await Analysis.create(makeAnalysis(testScanId))
    await expect(Analysis.create(makeAnalysis(testScanId))).rejects.toThrow()
  })

  // TC-AM-07
  test('TC-AM-07: should store gradCamUrl when provided', async () => {
    const url      = '/uploads/gradcam/gradcam_test_123.png'
    const analysis = await Analysis.create(makeAnalysis(testScanId, {
      gradCamUrl:  url,
      gradCamPath: '/app/uploads/gradcam/gradcam_test_123.png'
    }))
    expect(analysis.gradCamUrl).toBe(url)
  })

  // TC-AM-08
  test('TC-AM-08: probabilities should sum to approximately 1.0', async () => {
    const analysis = await Analysis.create(makeAnalysis(testScanId))
    const sum = Object.values(analysis.probabilities).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 2)
  })
})