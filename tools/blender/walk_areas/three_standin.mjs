// A stand-in for the two three.js classes that the viewer's spawn.ts and portals.ts import: Vector3 and Object3D
// (with the column-major Matrix4 three uses). It lets check_areas.mjs run those two files as they are, without
// installing three.js. It is NOT three.js: it has only what findSpawns, findPortals, resolvePortal, pickSpawn and
// PortalTrigger call. Pass --three <path to the three package> to check_areas.mjs to use the real library instead.
export class Matrix4 {
  constructor() {
    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
  copy(m) {
    this.elements = m.elements.slice();
    return this;
  }
  compose(p, q, s) {
    const x = q.x,
      y = q.y,
      z = q.z,
      w = q.w;
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    this.elements = [
      (1 - (yy + zz)) * s.x,
      (xy + wz) * s.x,
      (xz - wy) * s.x,
      0,
      (xy - wz) * s.y,
      (1 - (xx + zz)) * s.y,
      (yz + wx) * s.y,
      0,
      (xz + wy) * s.z,
      (yz - wx) * s.z,
      (1 - (xx + yy)) * s.z,
      0,
      p.x,
      p.y,
      p.z,
      1,
    ];
    return this;
  }
  multiplyMatrices(a, b) {
    const ae = a.elements,
      be = b.elements,
      te = new Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += ae[k * 4 + r] * be[c * 4 + k];
        te[c * 4 + r] = sum;
      }
    this.elements = te;
    return this;
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }
  transformDirection(m) {
    const x = this.x,
      y = this.y,
      z = this.z,
      e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
}

export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}

export class Object3D {
  constructor() {
    this.name = '';
    this.userData = {};
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
  }
  add(o) {
    o.parent = this;
    this.children.push(o);
    return this;
  }
  traverse(fn) {
    fn(this);
    for (const c of this.children) c.traverse(fn);
  }
  updateWorldMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
    for (const c of this.children) c.updateWorldMatrix();
    return this;
  }
  getWorldPosition(v) {
    return v.setFromMatrixPosition(this.matrixWorld);
  }
}
