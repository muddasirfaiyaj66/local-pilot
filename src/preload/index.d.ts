import type { LocalPilotApi } from '../shared/ipc'

declare global {
  interface Window {
    localpilot: LocalPilotApi
  }
}

export {}
