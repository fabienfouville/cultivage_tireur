import { useEffect, useState } from 'react'
import { MODULES, getModule } from '../modules'
import type { ModuleKey } from '../types'

/** Roue qui tire un module au hasard (affichée sur l'écran projeté) */
export function Wheel({ result, at }: { result?: ModuleKey; at?: number }) {
  const [i, setI] = useState(0)
  const [done, setDone] = useState(true)

  useEffect(() => {
    if (!result || !at || Date.now() - at > 8000) {
      setDone(true)
      return
    }
    setDone(false)
    let step = 0
    let delay = 60
    let t: ReturnType<typeof setTimeout>
    const target = MODULES.findIndex((m) => m.key === result)
    const total = MODULES.length * 3 + target
    const tick = () => {
      step++
      setI(step % MODULES.length)
      if (step >= total) {
        setDone(true)
        return
      }
      delay = step > total - 8 ? delay * 1.35 : delay
      t = setTimeout(tick, delay)
    }
    t = setTimeout(tick, delay)
    return () => clearTimeout(t)
  }, [result, at])

  const shown = done && result ? getModule(result) : MODULES[i]
  return (
    <div className={'wheel' + (done && result ? ' wheel-done' : '')}>
      <div className="wheel-icon">{shown.icon}</div>
      <div className="wheel-name">{shown.name}</div>
      <div className="wheel-tag muted">{shown.tagline}</div>
    </div>
  )
}
