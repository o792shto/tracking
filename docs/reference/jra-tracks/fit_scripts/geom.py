"""Turtle geometry + least-squares fitter for racecourse centerlines.
Units: meters, degrees. Turn sign: +left(CCW), -right(CW)."""
import numpy as np
from scipy.optimize import least_squares

def integrate(pose, segs, step=1.0):
    """pose=(x,y,heading_rad). segs=[(kind,len,turn_deg)]. returns list of (s,x,y,h) samples and end pose"""
    x,y,h = pose; s=0.0; pts=[(0.0,x,y,h)]
    for kind,L,turn in segs:
        n=max(1,int(np.ceil(L/step))); dl=L/n
        k = np.radians(turn)/L if kind=='arc' else 0.0
        for _ in range(n):
            if k==0: x+=dl*np.cos(h); y+=dl*np.sin(h)
            else:
                h2=h+k*dl; r=1/k
                x+= r*(np.sin(h2)-np.sin(h)); y+= -r*(np.cos(h2)-np.cos(h)); h=h2
            s+=dl; pts.append((s,x,y,h))
    return pts,(x,y,h)

def end_pose(pose, segs):
    x,y,h=pose
    for kind,L,turn in segs:
        if kind=='str': x+=L*np.cos(h); y+=L*np.sin(h)
        else:
            t=np.radians(turn); r=L/t; h2=h+t
            x+= r*(np.sin(h2)-np.sin(h)); y+= -r*(np.cos(h2)-np.cos(h)); h=h2
    return x,y,h

def pose_at(pose, segs, s):
    """pose at distance s along segs"""
    acc=0.0; cur=pose
    for kind,L,turn in segs:
        if s<=acc+L+1e-9:
            part=s-acc
            sub=(kind,part,turn*part/L if kind=='arc' else 0.0)
            return end_pose(cur,[sub]) if part>0 else cur
        cur=end_pose(cur,[(kind,L,turn)]); acc+=L
    return cur
