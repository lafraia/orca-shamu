import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  resetWindowsSecurityLoadForTests,
  setWindowsSecurityForTests
} from '../../shared/windows-security-addon'
import {
  createFakeWindowsSecurity,
  FAKE_USER_SID,
  INHERITED_SDDL,
  type FakeWindowsSecurity
} from '../../shared/windows-security-addon.test-fixture'
import { vaultFixture, TEST_PASSWORD } from './vault-fixture.test-support'

let fixture: ReturnType<typeof vaultFixture>
let security: FakeWindowsSecurity
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
beforeEach(async () => {
  fixture = vaultFixture()
  await fixture.store.create('alpha', TEST_PASSWORD)
  fixture.store.lock()
  security = createFakeWindowsSecurity()
  resetWindowsSecurityLoadForTests()
  setWindowsSecurityForTests(security)
  security.dacls.set(fixture.file.file, `D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;${FAKE_USER_SID})`)
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
})
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  setWindowsSecurityForTests(null)
  resetWindowsSecurityLoadForTests()
  fixture.dispose()
})

it('refuses an exposed directory until asynchronous hardening finishes', async () => {
  security.holdAsync = true
  const opening = fixture.file.prepare()
  expect(() => fixture.file.read()).toThrow('opened safely')
  security.holdAsync = false
  security.releaseAsync()
  await opening
  expect(fixture.file.read()?.envelope.version).toBe(1)
})

it('refuses exposed credential files without changing their ciphertext or permissions', async () => {
  await fixture.file.prepare()
  const original = readFileSync(fixture.file.file)
  security.dacls.set(fixture.file.file, INHERITED_SDDL)
  expect(() => fixture.file.read()).toThrow('permissions could not be secured')
  expect(readFileSync(fixture.file.file)).toEqual(original)
  expect(security.dacls.get(fixture.file.file)).toBe(INHERITED_SDDL)
  security.failing.add(dirname(fixture.file.file))
  security.dacls.set(dirname(fixture.file.file), INHERITED_SDDL)
  await expect(fixture.file.prepare()).rejects.toThrow('opened safely')
})
