import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig(({mode})=>mode==='demo'?{build:{outDir:'dist-demo',rollupOptions:{input:fileURLToPath(new URL('./demo.html',import.meta.url))}}}:{});
