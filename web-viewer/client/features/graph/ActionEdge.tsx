// Render Dagre routes so parallel transitions and self-loops remain distinct.
import { BaseEdge, type EdgeProps } from '@xyflow/react'
import type { RoutedEdge } from './layout.js'
export function ActionEdge({ id, data, markerEnd, selected }: EdgeProps<RoutedEdge>) {
  if (!data?.points.length) return null
  const middle = data.points[Math.floor(data.points.length / 2)]!
  const path = data.points
    .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
    .join(' ')
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      label={`${data.pathSteps?.length ? data.pathSteps.join(', ') + ' · ' : ''}${data.label.length > 45 ? data.label.slice(0, 42) + '…' : data.label}${data.flowCount !== undefined ? ` · ${data.flowCount} flows` : ''}`}
      labelX={middle.x}
      labelY={middle.y}
      style={{
        stroke: data.current
          ? '#b96b11'
          : data.pathSteps?.length || selected || data.flowCount
            ? '#146b43'
            : '#8a9e94',
        strokeWidth: data.current
          ? 4
          : data.pathSteps?.length || selected || data.flowCount
            ? 3
            : 1.5,
        strokeDasharray: data.flowCount === 0 ? '5 4' : undefined,
      }}
      labelStyle={{ fill: '#234536', fontSize: 11 }}
      labelBgStyle={{ fill: '#f4f8f5' }}
    />
  )
}
