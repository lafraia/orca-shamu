import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { AgentHibernationGate } from '../components/AgentHibernationGate'
import { AiVaultTabTitleSyncGate } from '../components/AiVaultTabTitleSyncGate'
import RetainedAgentsSyncGate from '../components/dashboard/RetainedAgentsSyncGate'
import { WorkspacePortScanner } from '../components/ports/WorkspacePortScanner'
import { SavedHostScopeWidenGate } from '../components/sidebar/SavedHostScopeWidenGate'
import { MacosTccPromptNoticeHost } from '../hooks/MacosTccPromptNoticeHost'
import { useAppStore } from '../store'
import { ActiveWorkspaceSyncGate } from './ActiveWorkspaceSyncGate'
import { StructuredAgentSessionAttentionBridge } from '../components/native-chat/StructuredAgentSessionAttentionBridge'
import { StructuredAgentSessionStatusBridge } from '../components/native-chat/StructuredAgentSessionStatusBridge'
import { useShamuClient } from '../components/shamu/shamu-client-state'

const DashboardPopoutBridge = lazy(() => import('../components/dashboard/DashboardPopoutBridge'))

/** Isolate high-churn subscriptions from App rendering; services outlive their consuming surfaces. */
export function AppBackgroundServices(): React.JSX.Element {
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const isShamuClient = useShamuClient((state) => state.enabled)
  const dashboardPopoutEnabled = useAppStore(
    (s) => s.settings?.experimentalAgentDashboardPopout === true
  )

  return (
    <>
      <WorkspacePortScanner enabled={workspaceSessionReady} />
      <ActiveWorkspaceSyncGate />
      {/* Keep permission notices available across app surfaces. */}
      <MacosTccPromptNoticeHost />
      {/* Keep agent-status retention subscriptions out of the App render tree. */}
      <RetainedAgentsSyncGate />
      <AiVaultTabTitleSyncGate />
      <SavedHostScopeWidenGate />
      {dashboardPopoutEnabled ? (
        <Suspense fallback={null}>
          <DashboardPopoutBridge />
        </Suspense>
      ) : null}
      {!isShamuClient ? <AgentHibernationGate /> : null}
      <StructuredAgentSessionStatusBridge />
      {/* Background chats have no mounted pane but still need completion attention. */}
      <StructuredAgentSessionAttentionBridge />
    </>
  )
}
