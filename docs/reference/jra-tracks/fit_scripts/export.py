import numpy as np, json, math
from build import V, seglen, segs_to_json, elev
from geom import pose_at

def loop_pose(v,lid,s):
    lp=v['loops'][lid]
    if 'pose' in lp: base=lp['pose']
    else:
        pl,ps=lp['attach']; base=loop_pose(v,pl,ps)
    return pose_at(base,lp['segs'],s)

def layout_len(v,lay): return sum(b-a for _,a,b in v['layouts'][lay])
def layout_pose(v,lay,s):
    acc=0.0; L=layout_len(v,lay); s=s%L if s!=L else s
    for lid,a,b in v['layouts'][lay]:
        if s<=acc+(b-a)+1e-9: return loop_pose(v,lid,a+(s-acc))
        acc+=b-a
    return loop_pose(v,*v['layouts'][lay][-1][:1],v['layouts'][lay][-1][2])

def seg_kind_at(v,lay,s):
    acc=0.0
    for lid,a,b in v['layouts'][lay]:
        if s<=acc+(b-a)+1e-9:
            t=a+(s-acc); c=0
            for k,L,_ in v['loops'][lid]['segs']:
                if t<=c+L+1e-9: return k
                c+=L
        acc+=b-a
    return 'str'

SPECIAL={ # (venue,layout,D): (start_layout, extra_layout)
 ('nakayama','turf_inner',2500):('turf_outer','turf_inner'),
 ('nakayama','turf_outer->inner',3200):('turf_outer','turf_inner'),
 ('hanshin','turf_inner',2200):('turf_outer','turf_inner'),
 ('hanshin','turf_outer->inner',3200):('turf_outer','turf_inner'),
}
def resolve_start(vn,v,st):
    surf,lay,D=st[:3]; chute=st[3] if len(st)>3 else None
    if (vn,lay,D) in SPECIAL:
        slay,xlay=SPECIAL[(vn,lay,D)]; d=D-layout_len(v,xlay)
        if chute and chute.startswith('chute'): pass
        elif chute: chute=None
    else:
        slay=lay; Lay=layout_len(v,lay); d=D
    Lay=layout_len(v,slay)
    if chute and chute in v['chutes']:
        ch=v['chutes'][chute]; js=ch['join_s']
        p0=v['layouts'][slay][0]; c0=v['layouts'][ch['layout']][0]
        if p0[0]==c0[0] and js<=min(p0[2],c0[2]):   # ゴール→分岐点までの共通区間上
            to_goal=Lay-js
        else:                                         # 合流点→ゴールの共通区間上
            to_goal=layout_len(v,ch['layout'])-js
        while to_goal+Lay<=d: to_goal+=Lay
        c=d-to_goal
        x,y,h=layout_pose(v,ch['layout'],js); sx,sy=x-c*math.cos(h),y-c*math.sin(h)
        return dict(surface=surf,layout=lay,distance=D,start_on='chute',chute=chute,chute_back_m=round(c,1),x=round(sx,1),y=round(sy,1),heading_deg=round(math.degrees(h)%360,1),
                    first_layout=slay)
    s=(Lay-(d%Lay))%Lay
    x,y,h=layout_pose(v,slay,s); kind=seg_kind_at(v,slay,s)
    return dict(surface=surf,layout=lay,distance=D,start_on='loop',first_layout=slay,s_from_goal_forward=round(s,1),dist_to_goal_first_pass=round(Lay-s if s>0 else 0,1),
                x=round(x,1),y=round(y,1),heading_deg=round(math.degrees(h)%360,1),on_curve=(kind=='arc'))

def run():
    out={}
    for vn,v in V.items():
        L={}
        for lid,lp in v['loops'].items():
            e=dict(surface=lp['surface'],segments=segs_to_json(lp['segs']),length=round(seglen(lp['segs']),1))
            if 'pose' in lp: e['start_pose']=dict(x=lp['pose'][0],y=lp['pose'][1],heading_deg=round(math.degrees(lp['pose'][2])%360,1),note='ゴール地点。ここから走行方向に積分')
            else:
                e['branch_from']=dict(loop=lp['attach'][0],s=round(lp['attach'][1],1)); e['rejoin_to']=dict(loop=lp['detach'][0],s=round(lp['detach'][1],1))
            L[lid]=e
        lays={}
        for lay,pieces in v['layouts'].items():
            Lay=layout_len(v,lay)
            pts=[]; n=int(Lay//5)
            for i in range(n+1):
                s=min(Lay,i*5.0); x,y,h=layout_pose(v,lay,s)
                pts.append([round(s,1),round(x,2),round(y,2),round(elev(v['elevation'][lay],s),2)])
            lays[lay]=dict(length=round(Lay,1),pieces=[dict(loop=a,s_from=round(b,1),s_to=round(c,1)) for a,b,c in pieces],
                           elevation_profile=[[round(a,1),b] for a,b in v['elevation'][lay]],polyline_s_x_y_z=pts)
        starts=[resolve_start(vn,v,st) for st in v['starts']]
        chutes={}
        for cid,ch in v['chutes'].items():
            x,y,h=layout_pose(v,ch['layout'],ch['join_s'])
            used=[s for s in starts if s.get('chute')==cid]; back=max([s['chute_back_m'] for s in used] or [0])+20
            chutes[cid]=dict(layout=ch['layout'],join_s=round(ch['join_s'],1),join_xy=[round(x,1),round(y,1)],heading_deg=round(math.degrees(h)%360,1),
                             length_m=round(back,1),end_xy=[round(x-back*math.cos(h),1),round(y-back*math.sin(h),1)],used_by=[f"{s['layout']} {s['distance']}m" for s in used],note=ch['note'])
        out[vn]=dict(name=v['name'],direction=v['direction'],loops=L,layouts=lays,chutes=chutes,starts=starts)
    return out
if __name__=='__main__':
    o=run(); json.dump(o,open('courses_geometry.json','w'),ensure_ascii=False)
    for vn,v in o.items():
        print('==',vn)
        for s in v['starts']:
            print('  ',s['layout'],s['distance'],s['start_on'],s.get('s_from_goal_forward',''),'curve' if s.get('on_curve') else '',s.get('chute',''),s.get('chute_back_m',''))
