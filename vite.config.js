import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { configureHeaders } from './src/cloud-config.js'

export default defineConfig(({mode})=> {
const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
const headers = Object.fromEntries(configureHeaders(readFileSync(new URL('./public/_headers', import.meta.url), 'utf8'),env)
  .split('/sw.js')[0].split('\n').filter(line => /^\s+\S/.test(line))
  .map(line => { const index = line.indexOf(':'); return [line.slice(0,index).trim(), line.slice(index+1).trim()] }))

return {
  plugins: [react()],
  preview: { headers },
};
})
