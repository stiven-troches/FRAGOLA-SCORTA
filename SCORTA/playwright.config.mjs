import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./browser-checks',
 fullyParallel:false,
 workers:1,
 timeout:30000,
 expect:{timeout:5000},
 outputDir:'test-results',
 reporter:'list',
 use:{baseURL:'http://127.0.0.1:19420',trace:'retain-on-failure',launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}},
 projects:[{name:'escritorio',use:{viewport:{width:1440,height:1000}}},{name:'movil',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}}],
 webServer:{command:'node browser-checks/serve.mjs',url:'http://127.0.0.1:19420',reuseExistingServer:false,timeout:10000}
});
