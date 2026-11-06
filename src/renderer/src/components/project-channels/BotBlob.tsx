import { useId, useMemo, type CSSProperties } from 'react'
import type { BotIdentity } from '../../../../shared/bot-identity'
import { blobBodyPath, blobEyeTransforms } from './bot-blob-geometry'

export function BotBlob({
  identity,
  activity = 'idle'
}: {
  identity: BotIdentity
  activity?: 'idle' | 'working' | 'waiting'
}): React.JSX.Element {
  const mask = `bot-eyes-${useId().replaceAll(':', '')}`
  const shape = identity.shape ?? 'circle'
  const paths = useMemo(
    () => [blobBodyPath(shape), blobBodyPath(shape, 1), blobBodyPath(shape, -1)],
    [shape]
  )
  const eyes = blobEyeTransforms(identity.expression)
  const style: CSSProperties &
    Record<'--bot-blob-rest' | '--bot-blob-wave' | '--bot-blob-back', string> = {
    '--bot-blob-rest': `path("${paths[0]}")`,
    '--bot-blob-wave': `path("${paths[1]}")`,
    '--bot-blob-back': `path("${paths[2]}")`
  }
  return (
    <svg
      viewBox="0 0 100 100"
      className="bot-blob size-full"
      style={style}
      data-activity={activity}
      aria-hidden="true"
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="var(--color-white)" />
          <g className="bot-blob-gaze" fill="var(--color-black)">
            {eyes.map((transform, index) => (
              <g key={index} transform={transform}>
                <rect
                  className="bot-blob-eye"
                  x="-4"
                  y={identity.expression === 'happy' ? '-4' : '-9'}
                  width="8"
                  height={identity.expression === 'happy' ? '8' : '18'}
                  rx="4"
                />
              </g>
            ))}
          </g>
        </mask>
      </defs>
      <path className="bot-blob-body" d={paths[0]} fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  )
}
