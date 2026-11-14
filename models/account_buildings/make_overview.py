"""Compose a numbered preview of the ten account buildings inside Blender."""

import bpy
import numpy as np
from pathlib import Path

root=Path('/Users/daniellee/Desktop/somethingcity/models/account_buildings')
tile=256; label_h=30; gap=16
width=5*tile+6*gap
height=2*(tile+label_h)+3*gap
canvas=np.zeros((height,width,4),dtype=np.float32)
canvas[:,:,:3]=(.009,.013,.029)
canvas[:,:,3]=1

digits={
 '0':['111','101','101','101','111'],
 '1':['010','110','010','010','111'],
 '2':['111','001','111','100','111'],
 '3':['111','001','111','001','111'],
 '4':['101','101','111','001','001'],
 '5':['111','100','111','001','111'],
 '6':['111','100','111','101','111'],
 '7':['111','001','001','001','001'],
 '8':['111','101','111','101','111'],
 '9':['111','101','111','001','111'],
}

for idx in range(10):
    path=root/f'account_building_{idx+1:02d}.png'
    img=bpy.data.images.load(str(path),check_existing=False)
    w,h=img.size
    pixels=np.empty(w*h*4,dtype=np.float32)
    img.pixels.foreach_get(pixels)
    source=pixels.reshape(h,w,4)
    yy=np.linspace(0,h-1,tile).astype(int)
    xx=np.linspace(0,w-1,tile).astype(int)
    thumb=source[yy[:,None],xx[None,:],:]
    x0=gap+(idx%5)*(tile+gap)
    y0=gap+(1-idx//5)*(tile+label_h+gap)
    canvas[y0+label_h:y0+label_h+tile,x0:x0+tile,:]=thumb
    canvas[y0:y0+label_h,x0:x0+tile,:3]=(.028,.036,.068)
    for digit_i,ch in enumerate(f'{idx+1:02d}'):
        for row,bits in enumerate(digits[ch]):
            for col,bit in enumerate(bits):
                if bit=='1':
                    dx=x0+13+digit_i*10+col*2
                    dy=y0+10+(4-row)*2
                    canvas[dy:dy+2,dx:dx+2,:3]=(.37,.99,.80)
    bpy.data.images.remove(img)

out=bpy.data.images.new('Account Buildings Overview',width=width,height=height,alpha=True)
out.pixels.foreach_set(canvas.ravel())
out.filepath_raw=str(root/'account_buildings_overview.png')
out.file_format='PNG'
out.save()
print('Overview saved:',width,'x',height)
