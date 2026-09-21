import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      // Keep unit tests runnable outside the Electron runtime / on CI Node
      electron: resolve(__dirname, 'src/test/mocks/electron.ts'),
      '@nut-tree-fork/nut-js': resolve(__dirname, 'src/test/mocks/nut-js.ts')
    }
  }
})
