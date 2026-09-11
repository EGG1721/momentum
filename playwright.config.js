import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', workers:1,
  use:{baseURL:'http://localhost:4183',viewport:{width:390,height:844}, timezoneId:'America/El_Salvador', launchOptions:process.env.MOMENTUM_BROWSER ? {executablePath:process.env.MOMENTUM_BROWSER} : {}},
  webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4183',url:'http://localhost:4183',reuseExistingServer:false},
});

