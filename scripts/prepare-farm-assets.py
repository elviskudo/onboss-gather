"""Deterministic slicing/alpha normalization of the user-supplied JPEG atlas."""
from PIL import Image,ImageDraw
from pathlib import Path
import json,collections,hashlib
source=Path('assets/source/farm-atlas.jpeg')
im=Image.open(source).convert('RGB');out=Path('public/assets/farm');out.mkdir(parents=True,exist_ok=True)
rects={
'cottage':(718,5,975,255),'barn':(976,2,1253,252),'coop':(720,261,881,427),'workshop':(882,265,1080,428),'well':(1093,269,1252,428),'greenhouse':(720,430,882,593),'mailbox':(877,464,945,578),'crate':(957,486,1037,580),'stable':(1068,443,1252,594),
'fence':(737,609,841,684),'gate':(841,609,948,684),'picket':(949,609,1048,684),'stonewall':(1048,609,1155,684),
'oak':(8,586,132,737),'apple':(132,586,246,737),'pine':(246,590,365,737),'stump':(383,628,469,739),
'cow':(4,986,143,1085),'sheep':(147,990,263,1082),'chicken':(268,1010,327,1084),'chick':(372,1016,424,1084),'horse':(440,980,577,1086),'dog':(578,992,682,1084),'cat':(689,998,765,1085),
'carrot':(1046,744,1118,824),'turnip':(234,748,299,822),'tomato':(589,825,655,908),'corn':(1040,818,1111,910),'pumpkin':(217,914,311,989),'flower':(648,921,712,988),'sunflower':(927,903,1004,991),
'pink-tree':(843,1063,947,1178),'autumn-tree':(1044,1059,1151,1179),
'grass':(20,1180,74,1235),'dirt':(91,1180,145,1235),'soil':(162,1180,216,1235),'paving':(233,1180,287,1235),'water':(303,1180,357,1235)}
manifest=[]
for name,rect in rects.items():
 img=im.crop(rect).convert('RGBA')
 if name not in ['grass','dirt','soil','paving','water']:
  pix=img.load();w,h=img.size;seen=set();q=collections.deque([(x,y) for x in range(w) for y in [0,h-1]]+[(x,y) for y in range(h) for x in [0,w-1]])
  while q:
   x,y=q.popleft()
   if (x,y) in seen or not(0<=x<w and 0<=y<h):continue
   seen.add((x,y));r,g,b,a=pix[x,y]
   if min(r,g,b)<213 or max(r,g,b)-min(r,g,b)>26:continue
   pix[x,y]=(r,g,b,0);q.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])
 img.save(out/(name+'.png'),optimize=True)
 manifest.append({'id':name,'file':f'/assets/farm/{name}.png','source_rect':rect,'size':img.size,'alpha':img.getextrema()[3][0]==0,'pivot':'bottom-center','filter':'nearest','source':'user-upload-image-2','license':'User supplied for this project; upstream license not provided.'})
Path('docs/art/space-2-assets.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'assets':manifest},indent=2))
thumb=Image.new('RGB',(800,((len(rects)+5)//6)*140),'#b2c28b');d=ImageDraw.Draw(thumb)
for i,name in enumerate(rects):
 img=Image.open(out/(name+'.png'));img.thumbnail((118,110),Image.Resampling.NEAREST);x=(i%6)*133;y=(i//6)*140;thumb.paste(img,(x,y),img);d.text((x,y+115),name,fill='black')
thumb.save('docs/art/space-2-contact-sheet.png')
print(f'{len(rects)} atlas assets normalized')
