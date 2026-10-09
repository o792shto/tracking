import numpy as np, json
from egg import solve_egg
from arms import inner_arm, nakayama_outer
from geom import end_pose, pose_at

def segs_to_json(sg):
    out=[]
    for k,L,t in sg:
        d={'type':'straight' if k=='str' else 'arc','length':round(float(L),2)}
        if k=='arc': d['turn_deg']=round(float(t),3); d['radius']=round(float(L/np.radians(abs(t))),1)
        out.append(d)
    return out
def seglen(sg): return float(sum(x[1] for x in sg))

def sample(pose,sg,step=5.0):
    L=seglen(sg); n=int(np.ceil(L/step)); res=[]
    for i in range(n+1):
        s=min(L,i*step); x,y,h=pose_at(pose,sg,s); res.append((round(s,1),round(x,2),round(y,2),round(float(np.degrees(h))%360,2)))
    return res

def elev(prof,s):
    xs=[p[0] for p in prof]; ys=[p[1] for p in prof]; return float(np.interp(s,xs,ys))

V={}
# ====================== TOKYO ======================
d='left'; sg=1; h0=0.0
T=solve_egg(2083.1,33,525.9,524.0,487,d); D=solve_egg(1899,39,501.6,458.4,441,d)
V['tokyo']=dict(name='東京', direction=d, h0=h0,
  loops={'turf':dict(surface='turf',segs=T['segs'],pose=(0,0,h0),lap=2083.1,straight=525.9),
         'dirt':dict(surface='dirt',segs=D['segs'],pose=(0,32,h0),lap=1899,straight=501.6)},
  layouts={'turf':[('turf',0,2083.1)], 'dirt':[('dirt',0,1899)]},
  starts=[('turf','turf',1400),('turf','turf',1600),('turf','turf',1800,'chute_t18'),('turf','turf',2000,'chute_t20'),
          ('turf','turf',2300),('turf','turf',2400),('turf','turf',2500),('turf','turf',2600),('turf','turf',3400),
          ('dirt','dirt',1300),('dirt','dirt',1400),('dirt','dirt',1600,'chute_d16'),('dirt','dirt',2100),('dirt','dirt',2400),('dirt','dirt',1200)],
  chutes={'chute_t18':dict(layout='turf',join_s=2083.1-1800+160,note='2コーナー奥（斜め）ポケット。最初の2コーナーまで約160m（umasiru）'),
          'chute_t20':dict(layout='turf',join_s=2083.1-2000+100,note='1〜2コーナー間の芝2000m専用ポケット。最初のコーナーまで約100m（umasiru）'),
          'chute_d16':dict(layout='dirt',join_s=39+D['C12'],note='ダート1600mの芝スタート。向正面延長上、2コーナー奥の芝（芝部分150〜180m、umasiru）')},
  elevation={'turf':[(0,2.7),(33,2.7),(754,0.8),(860,0.8),(1000,2.3),(1060,2.3),(1420,0.0),(1557.2,0.4),(1603.1,0.7),(1823.1,2.7),(2083.1,2.7)],
             'dirt':[(0,2.5),(39,2.5),(668,0.7),(760,0.7),(900,2.1),(960,2.1),(1250,0.0),(1449,0.1),(1699,2.5),(1899,2.5)]},
  corners={'turf':dict(C1=33,C2_exit=33+T['C12'],C3=33+T['C12']+T['BS'],C4_exit=2083.1-525.9),
           'dirt':dict(C1=39,C2_exit=39+D['C12'],C3=39+D['C12']+D['BS'],C4_exit=1899-501.6)},
  fit=dict(turf=T,dirt=D))

# ====================== NAKAYAMA ======================
d='right'; h0=np.pi
I=solve_egg(1667.1,70,310,453.6,453.6,d); D=solve_egg(1493,68,308,390,370,d)
s_c34=70+I['C12']+I['BS']
pri={0:(2.5,0.1),1:(0.1,0.1),2:(250,200),3:(400,300),4:(210,20),5:(1200,60)}
O=nakayama_outer(I['segs'],h0,-1,I['Ra'],70,1667.1,1839.7,s_c34,pri)
sb,sm=O['s_branch'],O['s_merge']; armL=seglen(O['arm']); Lout=sb+armL+(1667.1-sm)
V['nakayama']=dict(name='中山',direction=d,h0=h0,
  loops={'turf_inner':dict(surface='turf',segs=I['segs'],pose=(0,0,h0),lap=1667.1,straight=310),
         'turf_outer_arm':dict(surface='turf',segs=O['arm'],attach=('turf_inner',sb),detach=('turf_inner',sm)),
         'dirt':dict(surface='dirt',segs=D['segs'],pose=(0,26,h0),lap=1493,straight=308)},
  layouts={'turf_inner':[('turf_inner',0,1667.1)],
           'turf_outer':[('turf_inner',0,sb),('turf_outer_arm',0,armL),('turf_inner',sm,1667.1)],
           'dirt':[('dirt',0,1493)]},
  starts=[('turf','turf_outer',1200),('turf','turf_outer',1600,'chute_t16'),('turf','turf_inner',1800),('turf','turf_inner',2000,'chute_t4c'),
          ('turf','turf_outer',2200,'chute_t4c'),('turf','turf_inner',2500),('turf','turf_outer',2600),('turf','turf_inner',3600),('turf','turf_outer',4000,'chute_t4c'),
          ('turf','turf_outer->inner',3200),
          ('dirt','dirt',1000),('dirt','dirt',1200,'chute_d12'),('dirt','dirt',1700),('dirt','dirt',1800),('dirt','dirt',2400),('dirt','dirt',2500)],
  chutes={'chute_t16':dict(layout='turf_outer',join_s=sb,note='1コーナー横のポケット。2コーナーまで約240m（umasiru）。モデルでは外回り分岐点で接線合流'),
          'chute_t4c':dict(layout='turf_inner',join_s=1667.1-310,note='4コーナー出口（ホームストレッチ）の延長。内2000m・外2200m・外4000mのゲート位置を直線上に置くための推定ポケット'),
          'chute_d12':dict(layout='dirt',join_s=68+D['C12'],note='ダート1200mの芝スタート。2コーナー奥ポケット（3コーナーまで約502m、umasiru）')},
  elevation={'turf_inner':[(0,2.2),(296.8,5.3),(523.6,4.4),(713,2.4),(903.6,2.2),(1130,2.0),(1357.1,0.6),(1487.1,0.0),(1597.1,2.2),(1667.1,2.2)],
             'dirt':[(0,2.0),(250,4.5),(419,3.8),(607,2.0),(795,1.8),(1185,0.5),(1293,0.0),(1413,2.0),(1493,2.0)]},
  fit=dict(inner=I,outer=O,dirt=D,outer_lap=Lout))
# outer elevation: common part from inner, arm values interpolated
ei=V['nakayama']['elevation']['turf_inner']
hb=elev(ei,sb); hm=elev(ei,sm)
V['nakayama']['elevation']['turf_outer']=[(p,h) for p,h in ei if p<sb]+[(sb,hb),(sb+O['arm'][0][1],4.2),(sb+O['arm'][0][1]+O['arm'][1][1],2.2),(sb+armL,hm)]+[(sb+armL+(p-sm),h) for p,h in ei if p>sm]

# ====================== KYOTO ======================
K=solve_egg(1894.3,91,403.7,476.6,403,d); D=solve_egg(1607.6,91,329.1,466.5,309,d,thA_prior=(177,1),c34_sigma=60)
A=inner_arm(K['segs'],h0,-1,1894.3,1782.8,903,328.4,K['thB'])
ss,smg=A['s_split'],A['s_merge']; aL=seglen(A['arm'])
c2x=91+K['C12']
V['kyoto']=dict(name='京都',direction=d,h0=h0,
  loops={'turf_outer':dict(surface='turf',segs=K['segs'],pose=(0,0,h0),lap=1894.3,straight=403.7),
         'turf_inner_arm':dict(surface='turf',segs=A['arm'],attach=('turf_outer',ss),detach=('turf_outer',smg)),
         'dirt':dict(surface='dirt',segs=D['segs'],pose=(0,30,h0),lap=1607.6,straight=329.1)},
  layouts={'turf_outer':[('turf_outer',0,1894.3)],
           'turf_inner':[('turf_outer',0,ss),('turf_inner_arm',0,aL),('turf_outer',smg,1894.3)],
           'dirt':[('dirt',0,1607.6)]},
  starts=[('turf','turf_inner',1100),('turf','turf_inner',1200),('turf','turf_inner',1400,'chute_t2c'),('turf','turf_outer',1400,'chute_t2c'),
          ('turf','turf_inner',1600,'chute_t2c'),('turf','turf_outer',1600,'chute_t2c'),('turf','turf_outer',1800,'chute_t2c'),
          ('turf','turf_inner',2000),('turf','turf_outer',2000),('turf','turf_outer',2200),('turf','turf_outer',2400,'chute_t4c'),
          ('turf','turf_outer',3000),('turf','turf_outer',3200),
          ('dirt','dirt',1000),('dirt','dirt',1100),('dirt','dirt',1200,'chute_d14'),('dirt','dirt',1400,'chute_d14'),('dirt','dirt',1800),('dirt','dirt',1900),('dirt','dirt',2600)],
  chutes={'chute_t2c':dict(layout='turf_outer',join_s=c2x,note='2コーナー奥の長い引き込み線（向正面の延長）。1990年に約200m延長（Wikipedia）。外1800mは最奥から'),
          'chute_t4c':dict(layout='turf_outer',join_s=1894.3-403.7,note='4コーナー奥ポケット（ホームストレッチの延長）。外2400m用'),
          'chute_d14':dict(layout='dirt',join_s=91+D['C12'],note='ダート1400mの芝スタート。2コーナー奥ポケット（芝部分約200m、umasiru）')},
  elevation={'turf_outer':[(0,0),(760,0),(1094.3,4.3),(1274.3,0),(1894.3,0)],
             'turf_inner':[(0,0),(760,0),(ss,elev([(760,0),(1094.3,4.3)],ss)),(1000,3.1),(1200,0),(1782.8,0)],
             'dirt':[(0,0),(600,0),(830,3.0),(1000,0),(1607.6,0)]},
  fit=dict(outer=K,inner=A,dirt=D))

# ====================== HANSHIN ======================
H=solve_egg(2089,18,473.6,671.4,360,d); D=solve_egg(1517.6,21,352.7,504.9,279,d)
A=inner_arm(H['segs'],h0,-1,2089,1689,735,356.5,H['thB'])
ss,smg=A['s_split'],A['s_merge']; aL=seglen(A['arm'])
c2x=18+H['C12']
V['hanshin']=dict(name='阪神',direction=d,h0=h0,
  loops={'turf_outer':dict(surface='turf',segs=H['segs'],pose=(0,0,h0),lap=2089,straight=473.6),
         'turf_inner_arm':dict(surface='turf',segs=A['arm'],attach=('turf_outer',ss),detach=('turf_outer',smg)),
         'dirt':dict(surface='dirt',segs=D['segs'],pose=(0,28,h0),lap=1517.6,straight=352.7)},
  layouts={'turf_outer':[('turf_outer',0,2089)],
           'turf_inner':[('turf_outer',0,ss),('turf_inner_arm',0,aL),('turf_outer',smg,2089)],
           'dirt':[('dirt',0,1517.6)]},
  starts=[('turf','turf_inner',1200),('turf','turf_inner',1400,'chute_t2c'),('turf','turf_outer',1400),('turf','turf_outer',1600),
          ('turf','turf_outer',1800,'chute_t2c'),('turf','turf_inner',2000),('turf','turf_inner',2200,'chute_t4c'),
          ('turf','turf_outer',2400),('turf','turf_outer',2600,'chute_t4c'),('turf','turf_inner',3000,'chute_t2c'),('turf','turf_outer->inner',3200),
          ('dirt','dirt',1200),('dirt','dirt',1400,'chute_d14'),('dirt','dirt',1800),('dirt','dirt',2000,'chute_d20'),('dirt','dirt',2600)],
  chutes={'chute_t2c':dict(layout='turf_outer',join_s=c2x,note='2コーナー奥ポケット（向正面の延長）。外1800m・内1400m・内3000m'),
          'chute_t4c':dict(layout='turf_outer',join_s=2089-473.6,note='外回り4コーナー出口付近（ホームストレッチの延長）。内2200m・外2600m'),
          'chute_d14':dict(layout='dirt',join_s=21+D['C12'],note='ダート1400mの芝スタート（2コーナー奥ポケット、umasiru）'),
          'chute_d20':dict(layout='dirt',join_s=1517.6-352.7,note='ダート2000mの芝スタート（芝外回り4コーナー出口付近、umasiru）')},
  elevation={'turf_outer':[(0,1.8),(760,1.8),(944,2.4),(1489,2.3),(1889,0.0),(2009,1.8),(2089,1.8)],
             'turf_inner':[(0,1.8),(ss,1.8),(889,1.9),(1489,0.0),(1609,1.8),(1689,1.8)],
             'dirt':[(0,1.6),(617.6,1.6),(1317.6,0.0),(1437.6,1.6),(1517.6,1.6)]},
  fit=dict(outer=H,inner=A,dirt=D))
