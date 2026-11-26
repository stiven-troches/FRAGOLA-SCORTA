import {defineConfig,devices} from '@playwright/test';
const ORIGIN='http://127.0.0.1:'+(process.env.SCORTA_UI_PORT||'19420');
export default defineConfig({
 testDir:'./browser-checks',testMatch:'**/*.spec.mjs',fullyParallel:false,workers:1,maxFailures:process.env.CI?3:undefined,
 timeout:45000,expect:{timeout:8000},outputDir:'test-results/platform-ui',
 reporter:process.env.CI?[['list'],['html',{open:'never',outputFolder:'playwright-report/platform'}],['junit',{outputFile:'playwright-report/platform-junit.xml'}]]:'list',
 use:{baseURL:ORIGIN,timezoneId:'America/Bogota',trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}},
 projects:[
  {name:'escritorio',use:{viewport:{width:1440,height:1000}}},
  {name:'movil',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}},
  {name:'movil-estrecho',use:{...devices['Pixel 7'],viewport:{width:360,height:780}}},
 ],
 webServer:{command:'node browser-checks/serve.mjs',url:ORIGIN,reuseExistingServer:false,timeout:20000},
});
