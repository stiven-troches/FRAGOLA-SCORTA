import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const file=path=>fileURLToPath(new URL(path,import.meta.url));
// SSR builds (tests) load the lazy views statically so renderToStaticMarkup never suspends.
const ssrAlias=[{find:/^\.\/lazy-views\.jsx$/,replacement:file('./src/lazy-views.ssr.jsx')}];
export default defineConfig(({mode,isSsrBuild})=>{
 if(isSsrBuild)return {resolve:{alias:ssrAlias}};
 if(mode==='demo')return {build:{outDir:'dist-demo',rollupOptions:{input:file('./demo.html')}}};
 // La app sigue en / (index.html); landing.html es la página de presentación.
 return {build:{rollupOptions:{input:{main:file('./index.html'),landing:file('./landing.html')}}}};
});
