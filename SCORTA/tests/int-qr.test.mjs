import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qrMatrix,qrSvg,formatBits,versionBits,rsGenerator,rsRemainder,dataCodewords,QR_MAX_VERSION} from '../src/qr.mjs';
import {otpauthUri,generateTotpSecret} from '../totp.mjs';

// ---- Decodificador independiente (tablas log/antilog propias, sin reutilizar el codificador) ----
const EXP=new Array(512),LOG=new Array(256);
{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11D;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];}
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
// Formatos publicados para nivel M (máscaras 0 a 7), ya con la máscara 101010000010010.
const FORMAT_M=['101010000010010','101000100100101','101111001111100','101101101001011','100010111111001','100000011001110','100111110010111','100101010100000'].map(v=>parseInt(v,2));
const ECC_M=[0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26],BLOCKS_M=[0,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16];
function isFunction(version,size,x,y){
  if((x<9&&y<9)||(x>=size-8&&y<9)||(x<9&&y>=size-8))return true;
  if(x===6||y===6)return true;
  if(version>=7&&((x>=size-11&&x<size-8&&y<6)||(y>=size-11&&y<size-8&&x<6)))return true;
  if(version>=2){
    const table={2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50],11:[6,30,54],12:[6,32,58],13:[6,34,62],14:[6,26,46,66],15:[6,26,48,70],16:[6,26,50,74],17:[6,30,54,78],18:[6,30,56,82],19:[6,30,58,86],20:[6,34,62,90]}[version];
    for(const ay of table)for(const ax of table){if((ax===6&&ay===6)||(ax===6&&ay===size-7)||(ax===size-7&&ay===6))continue;if(Math.abs(x-ax)<=2&&Math.abs(y-ay)<=2)return true;}
  }
  return false;
}
const MASK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,x=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(y/2)+Math.floor(x/3))%2===0,(x,y)=>(x*y)%2+(x*y)%3===0,(x,y)=>((x*y)%2+(x*y)%3)%2===0,(x,y)=>((x+y)%2+(x*y)%3)%2===0];
function decode(modules){
  const size=modules.length,version=(size-17)/4,bit=(x,y)=>modules[y][x]?1:0;
  // Primera copia del formato: (8,0..5),(8,7),(8,8),(7,8),(5..0,8); bit 14 primero.
  const coords=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const format=coords.reduce((n,[x,y],i)=>n|bit(x,y)<<i,0),mask=FORMAT_M.indexOf(format);
  assert.ok(mask>=0,'formato de nivel M reconocido');
  const second=[...Array(8)].map((_,i)=>[size-1-i,8]).concat([...Array(7)].map((_,i)=>[8,size-7+i])).reduce((n,[x,y],i)=>n|bit(x,y)<<i,0);
  assert.equal(second,format,'las dos copias del formato coinciden');
  assert.equal(bit(8,size-8),1,'módulo oscuro fijo');
  const bits=[];
  // Recorrido zigzag: pares de columnas desde la derecha, alternando subida y bajada.
  let upward=true;
  for(let col=size-1;col>0;col-=2){
    if(col===6)col=5;
    for(let k=0;k<size;k++){const y=upward?size-1-k:k;for(const x of [col,col-1]){if(isFunction(version,size,x,y))continue;bits.push(bit(x,y)^(MASK[mask](x,y)?1:0));}}
    upward=!upward;
  }
  const total=Math.floor(bits.length/8),cw=[];for(let i=0;i<total;i++)cw.push(bits.slice(i*8,i*8+8).reduce((n,b)=>n*2+b,0));
  const blocks=BLOCKS_M[version],ecc=ECC_M[version],shortLen=Math.floor(total/blocks),shortBlocks=blocks-total%blocks;
  const lens=[...Array(blocks)].map((_,i)=>shortLen+(i<shortBlocks?0:1)),parts=lens.map(()=>[]);let k=0;
  const maxData=shortLen-ecc+1;
  for(let i=0;i<maxData;i++)for(let b=0;b<blocks;b++)if(i<lens[b]-ecc)parts[b].push(cw[k++]);
  for(let i=0;i<ecc;i++)for(let b=0;b<blocks;b++)parts[b].push(cw[k++]);
  const data=[];
  for(const block of parts){
    // Síndromes: el bloque es un polinomio múltiplo del generador si se anula en α^0..α^(ecc-1).
    for(let s=0;s<ecc;s++){let v=0;for(const c of block)v=mul(v,EXP[s])^c;assert.equal(v,0,'síndrome nulo: bloque sin errores');}
    data.push(...block.slice(0,block.length-ecc));
  }
  const stream=data.flatMap(b=>[...Array(8)].map((_,i)=>(b>>(7-i))&1));let p=0;const read=n=>{let v=0;for(let i=0;i<n;i++)v=v*2+stream[p++];return v;};
  assert.equal(read(4),4,'modo byte');
  const length=read(version<=9?8:16),bytes=[];for(let i=0;i<length;i++)bytes.push(read(8));
  return {version,mask,text:new TextDecoder().decode(Uint8Array.from(bytes))};
}

test('QR: vectores conocidos de formato (nivel M), versión 7 y Reed-Solomon de HELLO WORLD 1-M',()=>{
  for(let m=0;m<8;m++)assert.equal(formatBits(m),FORMAT_M[m],'formato M máscara '+m);
  assert.equal(versionBits(7),0x07C94);assert.equal(versionBits(10),0x0A4D3);
  const data=[32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17];
  assert.deepEqual(rsRemainder(data,rsGenerator(10)),[196,35,39,119,235,215,231,226,93,23]);
  assert.equal(dataCodewords(1),16);assert.equal(dataCodewords(7),124);assert.equal(dataCodewords(10),216);
});

test('QR: el decodificador independiente recupera el texto en todas las máscaras y en varias versiones',()=>{
  const samples=['A','https://scorta.example/receipt/abc','Ñandú · ñ €',otpauthUri(generateTotpSecret(),'Fragola:Steven'),'x'.repeat(300),'y'.repeat(600)];
  for(const text of samples){
    const auto=qrMatrix(text),result=decode(auto.modules);
    assert.equal(result.text,text);assert.equal(result.version,auto.version);assert.equal(result.mask,auto.mask);
    for(let mask=0;mask<8;mask++)assert.equal(decode(qrMatrix(text,{mask}).modules).text,text,`máscara ${mask}`);
  }
  assert.ok(qrMatrix('y'.repeat(600)).version>=10,'cubre conteo de 16 bits y bloques mixtos');
  assert.throws(()=>qrMatrix('z'.repeat(2000)),/demasiado largo/);assert.equal(QR_MAX_VERSION,20);
});

test('QR: la URI otpauth típica cabe y el SVG es un único trazado escapado',()=>{
  const uri=otpauthUri('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP','Fragola:Steven');
  const matrix=qrMatrix(uri);assert.ok(matrix.version<=10);
  const svg=qrSvg(uri,{title:'QR <prueba>'});
  assert.match(svg,/^<svg [^>]*viewBox="0 0 (\d+) \1"/);assert.equal((svg.match(/<path /g)||[]).length,1);
  assert.ok(svg.includes('QR &lt;prueba&gt;'));assert.ok(!svg.includes(uri),'la URI con el secreto no se copia al SVG');
});
