/// <reference types="vite/client" />

import type { QianchuanBridge } from '../shared/contracts/bridge'

declare global {
  interface Window {
    qianchuan?: QianchuanBridge
  }
}

export {}
