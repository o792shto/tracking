import json, numpy as np, sys
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
plt.rcParams['font.family']='Noto Sans CJK JP'
from export import run
o=run(); json.dump(o,open('courses_geometry.json','w'),ensure_ascii=False)
COL={'turf':'#2e7d32','dirt':'#8d5524'}
for vn,v in o.items():
    fig=plt.figure(figsize=(14,10)); ax=fig.add_axes([0.04,0.30,0.92,0.66]); ae=fig.add_axes([0.06,0.05,0.9,0.2])
    for lay,L in v['layouts'].items():
        p=np.array(L['polyline_s_x_y_z']); surf='dirt' if lay.startswith('dirt') else 'turf'
        ls='--' if ('inner' in lay and vn in('kyoto','hanshin')) or ('outer' in lay and vn=='nakayama') else '-'
        ax.plot(p[:,1],p[:,2],ls,color=COL[surf],lw=2.2,label=f"{lay} ({L['length']}m)")
        ae.plot(p[:,0],p[:,3],ls,color=COL[surf],label=lay)
    for cid,c in v['chutes'].items():
        ax.plot([c['join_xy'][0],c['end_xy'][0]],[c['join_xy'][1],c['end_xy'][1]],':',color='k',lw=1.5)
        ax.annotate(cid,c['end_xy'],fontsize=7,color='k')
    for s in v['starts']:
        mk='o' if s['surface']=='turf' else 's'
        ax.plot(s['x'],s['y'],mk,color='red' if s['surface']=='turf' else 'orange',ms=5)
        lab=f"{'芝' if s['surface']=='turf' else 'ダ'}{s['distance']}"+('内' if 'inner' in s['layout'] and '->' not in s['layout'] else '外' if 'outer' in s['layout'] else '')
        ax.annotate(lab,(s['x'],s['y']),fontsize=7,xytext=(3,3),textcoords='offset points')
    ax.plot([0,0],[-20,60],'r-',lw=2); ax.annotate('ゴール',(0,-25),color='r')
    ax.set_aspect('equal'); ax.grid(alpha=.3); ax.legend(fontsize=8,loc='upper left'); ax.set_title(f"{v['name']}（{'左' if v['direction']=='left' else '右'}回り）推定形状 — 単位m、y+が内馬場側")
    ae.set_xlabel('ゴールからの走行距離 s (m)'); ae.set_ylabel('高さ(m)'); ae.grid(alpha=.3); ae.legend(fontsize=7)
    fig.savefig(f'preview_{vn}.png',dpi=75); plt.close(fig)
print('done')
