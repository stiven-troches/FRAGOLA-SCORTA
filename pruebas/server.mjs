// Servidor local de desarrollo.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.data':'application/octet-stream','.gz':'application/gzip','.sql':'text/plain; charset=utf-8','.png':'image/png'};
export const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
  let target;
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.includes('\0')||pathname.includes('\\'))throw new Error();
    target=resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
    const rel=relative(ROOT,target);if(rel.startsWith('..')||isAbsolute(rel))throw new Error();
  }catch{res.writeHead(400);return res.end('Solicitud inválida');}
  try{const body=await readFile(target);res.writeHead(200,{'Content-Type':TYPES[extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);}
  catch{res.writeHead(404);res.end('No encontrado');}
});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||8765),'127.0.0.1',()=>console.log(`FRAGOLA: http://127.0.0.1:${server.address().port}`));
