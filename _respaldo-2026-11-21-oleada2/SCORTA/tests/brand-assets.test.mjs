import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const assets=new URL('../src/assets/',import.meta.url),metadata=JSON.parse(readFileSync(new URL('brand-variants.json',assets),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('marca: el archivo original aprobado sigue íntegro y separado de sus derivados',()=>{
 const source=readFileSync(new URL(metadata.source.file,assets));
 assert.equal(sha(source),'92ae7c9e238bc03528506dd2225c8af75b66ae10022afe0c4790d5d60bb46c2d');
 assert.equal(source.length,1489083);assert.equal(sha(source),metadata.source.sha256);
 assert.equal(source.readUInt32BE(16),metadata.source.width);assert.equal(source.readUInt32BE(20),metadata.source.height);
});

test('marca: variantes verificadas conservan proporción y hashes, y reducen transferencia',()=>{
 assert.equal(metadata.variants.length,6);
 for(const item of metadata.variants){
  const bytes=readFileSync(new URL(item.file,assets));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);
  assert.equal(item.height,Math.round(item.width*metadata.source.height/metadata.source.width));assert.equal(item.rgbaMatchesReferenceResize,true);
  assert.ok(bytes.length<metadata.source.bytes);
  if(item.file.endsWith('.png')){assert.equal(bytes.readUInt32BE(16),item.width);assert.equal(bytes.readUInt32BE(20),item.height)}
 }
 const retina=metadata.variants.find(item=>item.file==='fragola-scorta-logo-320.webp');assert.ok(retina.bytes<metadata.source.bytes/5);
});
