import assert from 'node:assert/strict';
import {server} from './server.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(base)).status,200);
  assert.equal((await fetch(base+'/config.js')).headers.get('x-content-type-options'),'nosniff');
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/%xx')).status,400);
  assert.equal((await fetch(base+'/%00')).status,400);
  assert.equal((await fetch(base+'/%5c..%5cpackage.json')).status,400);
  assert.equal((await fetch(base,{method:'POST'})).status,405);
  assert.equal(await (await fetch(base,{method:'HEAD'})).text(),'');
  console.log('SERVIDOR: 8 comprobaciones OK');
} finally {await new Promise(r=>server.close(r));}
