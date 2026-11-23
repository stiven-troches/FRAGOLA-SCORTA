// Codificador QR mínimo (ISO/IEC 18004) sin dependencias: modo byte (UTF-8), corrección
// de errores M, versiones 1 a 20 (hasta 666 bytes) y la máscara de menor penalización.
// Se usa para mostrar la URI otpauth:// de la verificación en dos pasos.

// Nivel M: codewords de corrección por bloque y número de bloques, índice = versión.
const ECC_PER_BLOCK=[0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26];
const BLOCKS=[0,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16];
export const QR_MAX_VERSION=20;
const FORMAT_M=0; // bits de nivel en el formato: L=01, M=00, Q=11, H=10

// ---- Reed-Solomon sobre GF(256), polinomio 0x11D ----
function gfMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z&255;}
export function rsGenerator(degree){
  const result=new Array(degree).fill(0);result[degree-1]=1;let root=1;
  for(let i=0;i<degree;i++){for(let j=0;j<result.length;j++){result[j]=gfMul(result[j],root);if(j+1<result.length)result[j]^=result[j+1];}root=gfMul(root,2);}
  return result;
}
export function rsRemainder(data,generator){
  const result=new Array(generator.length).fill(0);
  for(const b of data){const factor=b^result.shift();result.push(0);generator.forEach((coef,i)=>{result[i]^=gfMul(coef,factor);});}
  return result;
}

// ---- Capacidad ----
export function rawDataModules(version){
  let result=(16*version+128)*version+64;
  if(version>=2){const n=Math.floor(version/7)+2;result-=(25*n-10)*n-55;if(version>=7)result-=36;}
  return result;
}
export const dataCodewords=version=>Math.floor(rawDataModules(version)/8)-ECC_PER_BLOCK[version]*BLOCKS[version];
export function alignmentPositions(version){
  if(version===1)return [];
  const n=Math.floor(version/7)+2,step=Math.floor((version*8+n*3+5)/(n*4-4))*2,result=[6];
  for(let pos=version*4+17-7;result.length<n;pos-=step)result.splice(1,0,pos);
  return result;
}
// BCH(15,5) del formato y BCH(18,6) de la versión.
export function formatBits(mask,ecl=FORMAT_M){const data=ecl<<3|mask;let rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);return (data<<10|rem)^0x5412;}
export function versionBits(version){let rem=version;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);return version<<12|rem;}

const utf8=text=>Array.from(new TextEncoder().encode(String(text)));

function encodeData(bytes){
  for(let version=1;version<=QR_MAX_VERSION;version++){
    const capacity=dataCodewords(version)*8,countBits=version<=9?8:16;
    if(4+countBits+bytes.length*8>capacity)continue;
    const bits=[];const push=(value,length)=>{for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1);};
    push(4,4);push(bytes.length,countBits);for(const b of bytes)push(b,8);
    push(0,Math.min(4,capacity-bits.length));push(0,(8-bits.length%8)%8);
    for(let pad=0xEC;bits.length<capacity;pad^=0xEC^0x11)push(pad,8);
    const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((n,b)=>n<<1|b,0));
    return {version,data};
  }
  throw Error('El texto es demasiado largo para el código QR');
}
function interleave(version,data){
  const blocks=BLOCKS[version],ecc=ECC_PER_BLOCK[version],raw=Math.floor(rawDataModules(version)/8),shortLen=Math.floor(raw/blocks),shortBlocks=blocks-raw%blocks;
  const generator=rsGenerator(ecc),parts=[];
  for(let i=0,k=0;i<blocks;i++){const len=shortLen-ecc+(i<shortBlocks?0:1),block=data.slice(k,k+len);k+=len;parts.push({data:block,ecc:rsRemainder(block,generator)});}
  const result=[];
  for(let i=0;i<shortLen-ecc+1;i++)for(const p of parts)if(i<p.data.length)result.push(p.data[i]);
  for(let i=0;i<ecc;i++)for(const p of parts)result.push(p.ecc[i]);
  return result;
}

/** Marca los módulos reservados (patrones de función) de una versión. */
export function functionModules(version){
  const size=version*4+17,fn=Array.from({length:size},()=>new Array(size).fill(false));
  const mark=(x,y)=>{if(x>=0&&y>=0&&x<size&&y<size)fn[y][x]=true;};
  for(let i=0;i<size;i++){mark(6,i);mark(i,6);}
  for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)mark(cx+dx,cy+dy);
  const align=alignmentPositions(version);
  for(const ay of align)for(const ax of align){if((ax===6&&ay===6)||(ax===6&&ay===size-7)||(ax===size-7&&ay===6))continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)mark(ax+dx,ay+dy);}
  for(let i=0;i<9;i++){mark(8,i);mark(i,8);}for(let i=0;i<8;i++){mark(size-1-i,8);mark(8,size-1-i);}
  if(version>=7)for(let i=0;i<18;i++){mark(size-11+i%3,Math.floor(i/3));mark(Math.floor(i/3),size-11+i%3);}
  return fn;
}
/** Orden de lectura en zigzag de los módulos de datos: [[x,y],...]. */
export function dataOrder(version){
  const fn=functionModules(version),size=fn.length,order=[];
  for(let right=size-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
      const x=right-j,upward=((right+1)&2)===0,y=upward?size-1-vert:vert;
      if(!fn[y][x])order.push([x,y]);
    }
  }
  return order;
}
export const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,x=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];

function drawFunctions(version,m,mask){
  const size=m.length,set=(x,y,v)=>{if(x>=0&&y>=0&&x<size&&y<size)m[y][x]=v;};
  for(let i=0;i<size;i++){m[6][i]=i%2===0;m[i][6]=i%2===0;}
  for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,d!==2&&d!==4);}
  const align=alignmentPositions(version);
  for(const ay of align)for(const ax of align){if((ax===6&&ay===6)||(ax===6&&ay===size-7)||(ax===size-7&&ay===6))continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)m[ay+dy][ax+dx]=Math.max(Math.abs(dx),Math.abs(dy))!==1;}
  const f=formatBits(mask),bit=i=>((f>>>i)&1)===1;
  for(let i=0;i<=5;i++)m[i][8]=bit(i);m[7][8]=bit(6);m[8][8]=bit(7);m[8][7]=bit(8);for(let i=9;i<15;i++)m[8][14-i]=bit(i);
  for(let i=0;i<8;i++)m[8][size-1-i]=bit(i);for(let i=8;i<15;i++)m[size-15+i][8]=bit(i);m[size-8][8]=true;
  if(version>=7){const v=versionBits(version);for(let i=0;i<18;i++){const b=((v>>>i)&1)===1,a=size-11+i%3,c=Math.floor(i/3);m[c][a]=b;m[a][c]=b;}}
}
function penalty(m){
  const size=m.length;let score=0;
  const lines=[...m,...m[0].map((_,x)=>m.map(row=>row[x]))];
  for(const line of lines){
    let run=1;for(let i=1;i<=size;i++){if(i<size&&line[i]===line[i-1])run++;else{if(run>=5)score+=run-2;run=1;}}
    const s=line.map(v=>v?1:0).join('');for(const p of ['10111010000','00001011101'])for(let i=s.indexOf(p);i>=0;i=s.indexOf(p,i+1))score+=40;
  }
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])score+=3;}
  const dark=m.flat().filter(Boolean).length,total=size*size;score+=Math.floor(Math.abs(dark*20-total*10)/total)*10;
  return score;
}

/** Devuelve {version,mask,size,modules} donde modules[y][x] es true para un módulo oscuro. */
export function qrMatrix(text,{mask:forcedMask}={}){
  const {version,data}=encodeData(utf8(text)),codewords=interleave(version,data),size=version*4+17,order=dataOrder(version);
  const base=Array.from({length:size},()=>new Array(size).fill(false));
  order.forEach(([x,y],i)=>{base[y][x]=i<codewords.length*8&&((codewords[i>>>3]>>>(7-(i&7)))&1)===1;});
  let best=null;
  for(let mask=0;mask<8;mask++){
    if(forcedMask!=null&&mask!==forcedMask)continue;
    const m=base.map(row=>row.slice());for(const [x,y] of order)if(MASKS[mask](x,y))m[y][x]=!m[y][x];
    drawFunctions(version,m,mask);const score=penalty(m);
    if(!best||score<best.score)best={score,mask,modules:m};
  }
  return {version,mask:best.mask,size,modules:best.modules};
}
/** Trazado SVG (un único path) con margen de 4 módulos. */
export function qrSvgPath({modules},border=4){
  let d='';modules.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)d+=`M${x+border} ${y+border}h1v1h-1z`;}));return d;
}
export function qrSvg(text,{border=4,title='Código QR'}={}){
  const matrix=qrMatrix(text),n=matrix.size+border*2,esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}"><rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${qrSvgPath(matrix,border)}"/></svg>`;
}
