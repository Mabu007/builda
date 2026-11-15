/* Deterministic PNG/ICO production assets, using only Node built-ins. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
const out = join(process.cwd(), 'public');
mkdirSync(out, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c=n; for(let j=0;j<8;j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {let v=0xffffffff;for(const b of buf)v=crcTable[(v ^ b)&255] ^ (v>>>8);return (v ^ 0xffffffff)>>>0;};
function chunk(name, data) {
  const label=Buffer.from(name), size=Buffer.alloc(4), check=Buffer.alloc(4);
  size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([label,data])));
  return Buffer.concat([size,label,data,check]);
}
function insideRounded(x,y,s,r) {
  const cx=Math.max(r,Math.min(s-r,x)),cy=Math.max(r,Math.min(s-r,y));
  return Math.hypot(x-cx,y-cy)<=r;
}
function png(size) {
  const raw=Buffer.alloc((size*4+1)*size);
  const put=(x,y,color)=>{const offset=y*(size*4+1)+1+x*4;raw[offset]=color[0];raw[offset+1]=color[1];raw[offset+2]=color[2];raw[offset+3]=color[3];};
  const gold=[224,190,140,255], bg=[22,48,47,255];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const xx=(x+.5)/size,yy=(y+.5)/size;
    const backdrop=insideRounded(xx,yy,1,.22);
    let p=backdrop?bg:[0,0,0,0];
    const stem=xx>=.23&&xx<=.345&&yy>=.18&&yy<=.77;
    const ring=Math.hypot((xx-.52)/.265,(yy-.545)/.255);
    const bowl=ring<=1 && ring>=.56 && xx>=.32;
    const dot=Math.hypot(xx-.785,yy-.785)<.048;
    if(backdrop&&(stem||bowl||dot))p=gold;
    put(x,y,p);
  }
  const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
for(const size of [192,512])writeFileSync(join(out,'icon-'+size+'.png'),png(size));
const small=png(32), ico=Buffer.alloc(22);
ico.writeUInt16LE(0,0);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);
ico[6]=32;ico[7]=32;ico[8]=0;ico[9]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(small.length,14);ico.writeUInt32LE(22,18);
writeFileSync(join(out,'favicon.ico'),Buffer.concat([ico,small]));
console.log('Created BUILDA PWA icons and favicon.');
