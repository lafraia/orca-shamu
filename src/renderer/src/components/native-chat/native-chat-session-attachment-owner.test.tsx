// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import { useNativeChatExternalAttachments } from './use-native-chat-external-attachments'

afterEach(() => {
  cleanup()
  replaceRuntimeEnvironmentRevisions([])
})

it('routes bot attachments to their paired session without a registered workspace tab', () => {
  replaceRuntimeEnvironmentRevisions([{ id: 'paired-host', createdAt: 1, pairingRevision: 7 }])
  const { result } = renderHook(() =>
    useNativeChatExternalAttachments({
      terminalTabId: 'bot-tab',
      structuredSession: { sessionId: 'bot-session', runtimeEnvironmentId: 'paired-host' },
      disabled: false,
      attachResolvedPaths: () => {},
      pendingChips: {
        begin: () => null,
        resolve: () => false,
        drop: () => false,
        attachReferences: () => false
      },
      setNotice: () => {}
    })
  )

  expect(result.current.resolveAttachmentOwner()).toEqual({
    kind: 'runtime-session',
    environmentId: 'paired-host',
    pairingRevision: 7,
    sessionId: 'bot-session'
  })
})
