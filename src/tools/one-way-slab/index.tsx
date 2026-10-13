import ContinuousTool from '../_continuous/ui'
import type { ToolUIProps } from '../registry'

export default function OneWaySlab({ tab }: ToolUIProps) {
  return <ContinuousTool id="one-way-slab" elem="pelat" tab={tab} />
}
