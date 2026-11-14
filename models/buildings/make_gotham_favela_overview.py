"""Compose the original Gotham favela and three dirtier variants in Blender."""

import bpy
import numpy as np
from pathlib import Path

root=Path('/Users/daniellee/Desktop/somethingcity/models/buildings')
names=['gotham_favela_8bit','gotham_favela_02_8bit',
       'gotham_favela_03_8bit','gotham_favela_04_8bit']
tile=420;gap=18;label=32
width=2*tile+3*gap
height=2*(tile+label)+3*gap
canvas=np.zeros((height,width,4),dtype=np.float32)
canvas[:,:,:3]=(.009,.013,.028);canvas[:,:,3]=1
digits={
 '0':['111','101','101','101','111'],
 '1':['010','110','010','010','111'],
 '2':['111','001','111','100','111'],
 '3':['111','001','111','001','111'],
 '4':['101','101','111','001','001'],
}

for idx,name in enumerate(names):
    img=bpy.data.images.load(str(root/(name+'.png')),check_existing=False)
    w,h=img.size
    arr=np.empty(w*h*4,dtype=np.float32);img.pixels.foreach_get(arr)
    arr=arr.reshape(h,w,4)
    yy=np.linspace(0,h-1,tile).astype(int)
    xx=np.linspace(0,w-1,tile).astype(int)
    thumb=arr[yy[:,None],xx[None,:],:]
    x0=gap+(idx%2)*(tile+gap)
    y0=gap+(1-idx//2)*(tile+label+gap)
    canvas[y0+label:y0+label+tile,x0:x0+tile,:]=thumb
    canvas[y0:y0+label,x0:x0+tile,:3]=(.028,.036,.066)
    for di,ch in enumerate(f'{idx+1:02d}'):
        for row,bits in enumerate(digits[ch]):
            for col,bit in enumerate(bits):
                if bit=='1':
                    x=x0+15+di*12+col*2
                    y=y0+11+(4-row)*2
                    canvas[y:y+2,x:x+2,:3]=(.43,.96,.77)
    bpy.data.images.remove(img)

out=bpy.data.images.new('Gotham Favela Variants',width=width,height=height,alpha=True)
out.pixels.foreach_set(canvas.ravel())
out.filepath_raw=str(root/'gotham_favela_variants.png')
out.file_format='PNG';out.save()
print('Favela overview saved:',width,'x',height)
