let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  audioCtx = audioCtx ?? new AC()
  return audioCtx
}

export function unlockAudio() {
  try {
    const ctx = getAudioContext()
    if (ctx?.state === 'suspended') void ctx.resume()
  } catch {
    /* ignore */
  }
}

export function restFinishedCue() {
  try {
    navigator.vibrate?.([160, 70, 160, 70, 220])
  } catch {
    /* ignore */
  }
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    for (const offset of [0, 0.2]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.16)
    }
  } catch {
    /* ignore */
  }
}
