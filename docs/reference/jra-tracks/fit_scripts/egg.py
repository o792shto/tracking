"""Deterministic course model: 'egg' loop = S0 straight, arc A (1-2角), back straight, arc B (3-4角), home straight.
Solve unknowns (thetaA, Ra, Rb, BS) from closure(x,y), lap length, and 3-4 corner arc length."""
import numpy as np
from scipy.optimize import least_squares
from geom import end_pose

def egg_segs(S0,Ra,thA,BS,Rb,HS,sign):
    thB=2*np.pi-thA
    return [('str',S0,0),('arc',Ra*thA,sign*np.degrees(thA)),('str',BS,0),('arc',Rb*thB,sign*np.degrees(thB)),('str',HS,0)]

def solve_egg(L,S0,HS,C34,C12_guess,direction,BS_guess=None,thA_prior=None,c34_sigma=None):
    sign=1 if direction=='left' else -1; h0=0.0 if direction=='left' else np.pi
    BS_guess = BS_guess or (L-S0-HS-C34-C12_guess)
    def res(x):
        thA,Ra,Rb,BS=x
        sg=egg_segs(S0,Ra,thA,BS,Rb,HS,sign)
        ex,ey,eh=end_pose((0,0,h0),sg)
        r=[ex*100,ey*100, ((S0+Ra*thA+BS+Rb*(2*np.pi-thA)+HS)-L)*100]
        r.append((Rb*(2*np.pi-thA)-C34)*(100 if c34_sigma is None else 1/c34_sigma))
        if thA_prior: r.append((np.degrees(thA)-thA_prior[0])/thA_prior[1])
        return r
    x0=[np.pi, C12_guess/np.pi, C34/np.pi, BS_guess]
    s=least_squares(res,x0,bounds=([0.5,30,30,10],[5.8,1000,1000,2000]),xtol=1e-14,ftol=1e-14)
    thA,Ra,Rb,BS=s.x
    return dict(thA=np.degrees(thA),Ra=Ra,Rb=Rb,BS=BS,C12=Ra*thA,thB=360-np.degrees(thA),resid=float(np.max(np.abs(s.fun[:3])))/100,
                segs=egg_segs(S0,Ra,thA,BS,Rb,HS,sign))
