import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

// Generate first-party raster icons without requiring external image services.
// The image contains no identifying account information.
const DEST = path.resolve("client/public/icons");
mkdirSync(DEST, { recursive: true });

const DARK=[23,54,45,255], LIGHT=[247,246,241,255], ACCENT=[162,203,170,255];
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer) {
    crc^=byte;
    for(let i=0;i<8;i++) crc=(crc>>>1) ^ (crc&1?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(kind,data) {
  const name=Buffer.from(kind);
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,data])),0);
  return Buffer.concat([len,name,data,crc]);
}
function rounded(x,y,left,top,right,bottom,r) {
  if(x<left||x>=right||y<top||y>=bottom)return false;
  const cx=x<left+r?left+r:(x>right-r?right-r:x);
  const cy=y<top+r?top+r:(y>bottom-r?bottom-r:y);
  return (x-cx)**2+(y-cy)**2<=r*r;
}
function draw(size,maskable=false) {
  const rgba=Buffer.alloc(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    let color=maskable?DARK:LIGHT;
    if(!maskable&&rounded(x,y,.10*size,.10*size,.90*size,.90*size,.17*size))color=DARK;
    if(maskable&&rounded(x,y,.19*size,.19*size,.81*size,.81*size,.12*size))color=DARK;
    const left=.35*size,right=.65*size,top=.28*size,bottom=.72*size;
    // Bookmark silhouette: a centered ribbon with a V-shaped end.
    const ribbon=x>=left&&x<=right&&y>=top&&y<bottom-.12*size;
    const lower=x>=left&&x<=right&&y>=bottom-.12*size && y<=bottom && (
      y<bottom-.12*size+Math.abs(x-.50*size)*.85
    );
    if(ribbon||lower)color=LIGHT;
    const lineWidth=.14*size;
    if(y>=.41*size&&y<.427*size && x>.43*size&&x<.43*size+lineWidth)color=ACCENT;
    if(y>=.48*size&&y<.497*size && x>.43*size&&x<.43*size+lineWidth)color=ACCENT;
    const index=(y*size+x)*4;
    rgba[index]=color[0];rgba[index+1]=color[1];rgba[index+2]=color[2];rgba[index+3]=color[3];
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;rgba.copy(raw,y*(size*4+1)+1,y*size*4,(y+1)*size*4);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}
for(const [name,size,maskable] of [["fihrist-192.png",192,false],["fihrist-512.png",512,false],["fihrist-maskable-512.png",512,true]]){
  const file=path.join(DEST,name);writeFileSync(file,draw(size,maskable));console.log("Icon generated",name);
}
