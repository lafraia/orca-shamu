import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'

/** Mount children only while open or closing; keep open-only work inside a child component. */
export function NativeChatExpandable({
  open,
  animation = 'height',
  children
}: {
  open: boolean
  animation?: React.ComponentProps<typeof CollapsibleContent>['animation']
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Collapsible open={open}>
      <CollapsibleContent animation={animation} data-native-chat-member-detail>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
