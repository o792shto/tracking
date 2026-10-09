import numpy as np
from scipy.optimize import least_squares
from geom import end_pose, pose_at

def seglen(sg): return sum(x[1] for x in sg)

def inner_arm(main_sg, h0, sign, L_main, L_inner, s_split0, b_merge, thB_deg):
    """Two-arc arm leaving main straight at s_split, rejoining main home straight at b_merge from goal."""
    s_merge=L_main-b_merge; pm=pose_at((0,0,h0),main_sg,s_merge)
    thB=np.radians(thB_deg)
    def build(x):
        ss,th3,R3,R4=x
        return ss,[('arc',R3*th3,sign*np.degrees(th3)),('arc',R4*(thB-th3),sign*np.degrees(thB-th3))]
    def res(x):
        ss,arm=build(x); ps=pose_at((0,0,h0),main_sg,ss)
        ex,ey,eh=end_pose(ps,arm)
        Lin=ss+seglen(arm)+b_merge
        return [ (ex-pm[0])*100,(ey-pm[1])*100,(Lin-L_inner)*100,(ss-s_split0)/30,(x[2]-x[3])/150]
    x0=[s_split0,thB/2,150,150]
    s=least_squares(res,x0,bounds=([s_split0-300,0.2,40,40],[s_split0+300,thB-0.2,800,800]),xtol=1e-14,ftol=1e-14)
    ss,arm=build(s.x)
    return dict(s_split=ss,s_merge=s_merge,arm=arm,R3=s.x[2],R4=s.x[3],th3=np.degrees(s.x[1]),resid=s.fun[:3].tolist())

def nakayama_outer(main_sg,h0,sign,R_in,s_c1,L_inner,L_outer,s_c34,priors):
    """outer arm: branch inside inner 1-2 corner (arc radius R_in starting at s_c1),
    O2 arc(R2,a2) -> OBS straight -> O3 arc(R3) merging tangentially into inner 3-4 corner arc."""
    def build(x):
        phi,a2,R2,obs,R3,sm=x
        sb=s_c1+R_in*phi
        pm=pose_at((0,0,h0),main_sg,sm); pb=pose_at((0,0,h0),main_sg,sb)
        turn_total=(pm[2]-pb[2])*sign  # radians remaining turn
        a3=turn_total-a2
        arm=[('arc',R2*a2,sign*np.degrees(a2)),('str',obs,0),('arc',R3*a3,sign*np.degrees(a3))]
        return sb,sm,pb,pm,arm,a3
    def res(x):
        sb,sm,pb,pm,arm,a3=build(x)
        ex,ey,eh=end_pose(pb,arm)
        Lout=sb+seglen(arm)+(L_inner-sm)
        r=[(ex-pm[0])*100,(ey-pm[1])*100,(Lout-L_outer)*100, min(0,a3)*1000]
        r+=[(x[i]-v)/sd for i,(v,sd) in priors.items()]
        return r
    x0=[v for v,_ in [priors[i] for i in range(6)]]
    s=least_squares(res,x0,bounds=([0.05,0.0,50,0,50,s_c34],[3.1,3.0,2000,1500,1500,s_c34+R_in*np.pi]),xtol=1e-14,ftol=1e-14)
    sb,sm,pb,pm,arm,a3=build(s.x)
    return dict(s_branch=sb,s_merge=sm,arm=arm,params=dict(zip(['phi','a2','R2','OBS','R3','s_merge'],s.x)),resid=s.fun[:4].tolist())
