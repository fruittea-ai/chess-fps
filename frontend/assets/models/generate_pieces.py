import numpy as np, trimesh, os, math
from shapely.geometry import Polygon
from trimesh.visual.material import PBRMaterial
SEG = 48
OUT = "/mnt/user-data/outputs/chess-pieces"

def normals_from(v, f):
    n = np.zeros_like(v)
    fn = np.cross(v[f[:,1]]-v[f[:,0]], v[f[:,2]]-v[f[:,0]])
    for i in range(3): np.add.at(n, f[:,i], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l==0]=1
    return n/l

def lathe(profile, center=(0,0,0), seg=SEG):
    """profile: (r, y[, sharp]) points from bottom axis to top axis. sharp => hard edge."""
    rings = []   # list of (r,y) ring per strip endpoint
    strips = []
    pts = [(p[0], p[1], len(p) > 2) for p in profile]
    verts, faces = [], []
    def add_ring(r, y):
        base = len(verts)
        for k in range(seg):
            a = 2*math.pi*k/seg
            verts.append((r*math.cos(a), y, r*math.sin(a)))
        return base
    ring_ids = {}  # (i,side)
    for i,(r,y,s) in enumerate(pts):
        ring_ids[(i,0)] = add_ring(r,y)
        ring_ids[(i,1)] = add_ring(r,y) if s else ring_ids[(i,0)]
    for i in range(len(pts)-1):
        a = ring_ids[(i,1)]; b = ring_ids[(i+1,0)]
        for k in range(seg):
            k2 = (k+1) % seg
            faces.append((a+k, b+k, b+k2)); faces.append((a+k, b+k2, a+k2))
    v = np.array(verts, float); f = np.array(faces)
    v = v + np.array(center)
    # outward-facing: ensure normals point away from axis on average
    n = normals_from(v - np.array(center) + 0, f)
    c = (v[f].mean(1) - np.array(center))
    fn = np.cross(v[f[:,1]]-v[f[:,0]], v[f[:,2]]-v[f[:,0]])
    if np.sum(fn[:,[0,2]]*c[:,[0,2]]) < 0:
        f = f[:, ::-1]
    return v, f

def sphere(r, center, rings=10):
    prof = [(0,-r)] + [(r*math.sin(t), -r*math.cos(t)) for t in np.linspace(0.15, math.pi-0.15, rings)] + [(0,r)]
    return lathe(prof, center, seg=20)

def box(size, center, rot_y=0):
    b = trimesh.creation.box(extents=size)
    b.apply_transform(trimesh.transformations.rotation_matrix(rot_y, [0,1,0]))
    b.apply_translation(center)
    v = np.asarray(b.vertices); f = np.asarray(b.faces)
    return v, f

def flat(parts):
    """un-weld every part (hard shading), except those marked smooth"""
    pass

def combine(parts):
    """parts: list of (v,f,smooth). Returns Trimesh with explicit normals."""
    V,F,N = [],[],[]
    off = 0
    for v,f,smooth in parts:
        if not smooth:   # flat shading: unweld
            v2 = v[f].reshape(-1,3); f2 = np.arange(len(v2)).reshape(-1,3)
            v, f = v2, f2
        n = normals_from(v, f)
        V.append(v); F.append(f+off); N.append(n); off += len(v)
    return np.vstack(V), np.vstack(F), np.vstack(N)

def base_profile(h=0.22):
    return [(0,0),(0.34,0,1),(0.34,0.06),(0.31,0.10,1),(0.28,0.13),(0.22,0.17,1),(0.19,h)]

# ---------- pieces ----------
def pawn():
    p = base_profile() + [(0.14,0.36),(0.12,0.50),(0.21,0.53,1),(0.21,0.58),(0.12,0.61,1),
         (0.17,0.68),(0.20,0.77),(0.19,0.86),(0.14,0.94),(0.06,0.98),(0,0.99)]
    return [(*lathe(p),True)]

def rook():
    p = base_profile() + [(0.17,0.40),(0.17,0.62),(0.27,0.68,1),(0.27,0.76),(0.30,0.78,1),
         (0.30,1.00,1),(0.21,1.00,1),(0.21,0.92,1),(0.0,0.92)]
    parts = [(*lathe(p),True)]
    for k in range(4):
        a = k*math.pi/2 + math.pi/4
        c = (0.255*math.cos(a), 1.06, -0.255*math.sin(a))
        # place merlons on rim, rotated tangentially
        parts.append((*box((0.09,0.12,0.18), c, a),False))
    return parts

def bishop():
    p = base_profile() + [(0.14,0.38),(0.11,0.55),(0.20,0.58,1),(0.20,0.63),(0.11,0.66,1),
         (0.19,0.78),(0.21,0.92),(0.18,1.10),(0.12,1.22),(0.06,1.28),(0.09,1.30,1),(0.09,1.34),(0.05,1.37),(0,1.38)]
    return [(*lathe(p),True)]

def queen():
    p = base_profile() + [(0.15,0.45),(0.11,0.75),(0.09,0.95),(0.22,1.00,1),(0.22,1.06),(0.12,1.10,1),
         (0.19,1.22),(0.27,1.42),(0.28,1.50,1),(0.28,1.54),(0.18,1.56,1),(0.0,1.56)]
    parts = [(*lathe(p),True)]
    for k in range(8):
        a = k*2*math.pi/8
        parts.append((*sphere(0.045,(0.235*math.cos(a),1.58,0.235*math.sin(a))),True))
    parts.append((*sphere(0.085,(0,1.64,0)),True))
    return parts

def king():
    p = base_profile() + [(0.15,0.45),(0.11,0.75),(0.09,0.95),(0.22,1.00,1),(0.22,1.06),(0.12,1.10,1),
         (0.19,1.22),(0.26,1.42),(0.27,1.52,1),(0.27,1.56),(0.17,1.58,1),(0.0,1.58)]
    parts = [(*lathe(p),True)]
    parts.append((*box((0.09,0.34,0.09),(0,1.76,0)),False))
    parts.append((*box((0.26,0.09,0.09),(0,1.78,0)),False))
    return parts

def knight():
    p = base_profile(0.24) + [(0.30,0.24,1),(0.0,0.24)]
    parts = [(*lathe(base_profile(0.24)+[(0.0,0.24)]),True)]
    sil = [(-0.27,0),(0.29,0),(0.27,0.18),(0.19,0.36),(0.42,0.46),(0.47,0.58),(0.39,0.66),
           (0.24,0.82),(0.17,0.96),(0.09,1.04),(0.03,0.94),(-0.05,1.0),(-0.12,0.84),
           (-0.25,0.58),(-0.31,0.30)]
    poly = Polygon(sil)
    m = trimesh.creation.extrude_polygon(poly, 0.30)
    v = np.asarray(m.vertices).copy(); f = np.asarray(m.faces)
    v[:,2] -= 0.15; v[:,1] += 0.22
    parts.append((v,f,False))
    return parts

PIECES = dict(pawn=pawn, rook=rook, knight=knight, bishop=bishop, queen=queen, king=king)
COLORS = dict(white=[0.93,0.90,0.82,1], black=[0.09,0.09,0.11,1])

def build(name, color):
    v,f,n = combine(PIECES[name]())
    m = trimesh.Trimesh(v, f, vertex_normals=n, process=False)
    m.visual = trimesh.visual.TextureVisuals(material=PBRMaterial(
        name=f"{color}_{name}", baseColorFactor=COLORS[color], metallicFactor=0.0, roughnessFactor=0.35))
    return m

if __name__ == "__main__":
    for c in COLORS:
        for n in PIECES:
            m = build(n,c)
            m.export(f"{OUT}/{c}_{n}.glb")
            print(c,n,len(m.faces),"tris", np.round(m.bounds[1]-m.bounds[0],2))
