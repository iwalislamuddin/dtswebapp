import ContinuousTool from '../_continuous/ui'
import type { ToolUIProps } from '../registry'

export default function ContinuousBeam({ tab }: ToolUIProps) {
  return <ContinuousTool id="continuous-beam" elem="balok" tab={tab} />
}
