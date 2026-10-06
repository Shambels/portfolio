import { bakeNoise } from './noiseBake'

/**
 * Bakes `noise.ts`'s texture off the main thread — a tenth of a second on a
 * laptop and several on an old phone's, during the load, when the main thread
 * has models to parse. Told the size and period, answers with the bytes,
 * transferred rather than copied.
 */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ size: number; period: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
scope.onmessage = (e) => {
  const bytes = bakeNoise(e.data.size, e.data.period)
  scope.postMessage(bytes, [bytes.buffer])
}
