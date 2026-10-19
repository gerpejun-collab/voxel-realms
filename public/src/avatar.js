// public/src/avatar.js
// 3D multiplayer humanoid voxel avatar with animated limbs, head rotation, and floating name tag
import * as THREE from 'three';

function createTrumpCanvasTexture(w, h, drawFn) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) {
      drawFn(ctx, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    }
  }
  return null;
}

function drawTrumpFrontFace(ctx, w, h) {
  // Warm peach-tan skin
  ctx.fillStyle = '#f5ad7a';
  ctx.fillRect(0, 0, w, h);

  // Tanned cheek shading
  ctx.fillStyle = '#e89f6d';
  ctx.fillRect(8, 60, 28, 30);
  ctx.fillRect(w - 36, 60, 28, 30);

  // Signature golden-yellow comb-over swoop on forehead (Y: 0..46)
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, w, 32);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(16, 24, w - 24, 14);
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(w - 12, 16);
  ctx.lineTo(w - 20, 44);
  ctx.lineTo(24, 46);
  ctx.closePath();
  ctx.fill();

  // Eyebrows: bushy blonde eyebrows
  ctx.fillStyle = '#fcd34d';
  ctx.fillRect(20, 50, 32, 8);
  ctx.fillRect(w - 52, 50, 32, 8);
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(22, 52, 28, 4);
  ctx.fillRect(w - 50, 52, 28, 4);

  // Squinting intense eyes:
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(24, 60, 26, 10);
  ctx.fillRect(w - 50, 60, 26, 10);
  // Sky-blue iris
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(32, 60, 12, 10);
  ctx.fillRect(w - 44, 60, 12, 10);
  // Dark pupil
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(36, 62, 6, 8);
  ctx.fillRect(w - 40, 62, 6, 8);
  // Eyelid / squint wrinkles
  ctx.fillStyle = '#c27b4b';
  ctx.fillRect(22, 58, 30, 3);
  ctx.fillRect(w - 52, 58, 30, 3);
  ctx.fillRect(24, 71, 26, 3);
  ctx.fillRect(w - 50, 71, 26, 3);

  // Nose: sculpted bridge and nostrils
  ctx.fillStyle = '#e5935c';
  ctx.fillRect(w / 2 - 8, 64, 16, 22);
  ctx.fillStyle = '#ca753b';
  ctx.fillRect(w / 2 - 12, 82, 6, 6);
  ctx.fillRect(w / 2 + 6, 82, 6, 6);

  // Mouth: signature coral-pink expressive lips
  ctx.fillStyle = '#dc5a46';
  ctx.fillRect(w / 2 - 20, 94, 40, 8);
  ctx.fillStyle = '#b93a26';
  ctx.fillRect(w / 2 - 16, 97, 32, 3);

  // Chin crease
  ctx.fillStyle = '#d9824c';
  ctx.fillRect(w / 2 - 12, 108, 24, 4);
}

function drawTrumpTopHair(ctx, w, h) {
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 4;
  for (let i = -w; i < w * 2; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 40, h);
    ctx.stroke();
  }
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  for (let i = -w + 6; i < w * 2; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 35, h);
    ctx.stroke();
  }
}

function drawTrumpSideHair(ctx, w, h, isLeft) {
  ctx.fillStyle = '#f5ad7a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 0, w, 24);
  const sbX = isLeft ? w - 24 : 6;
  ctx.fillStyle = '#facc15';
  ctx.fillRect(sbX, 50, 18, 30);
  const earX = isLeft ? 16 : w - 38;
  ctx.fillStyle = '#e89f6d';
  ctx.fillRect(earX, 60, 22, 28);
  ctx.fillStyle = '#ca753b';
  ctx.fillRect(earX + 5, 65, 12, 16);
}

function drawTrumpBackHair(ctx, w, h) {
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, w, h - 20);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 0, w, h - 40);
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(0, 0, w, 30);
  ctx.fillStyle = '#f5ad7a';
  ctx.fillRect(0, h - 20, w, 20);
}

function drawTrumpBottom(ctx, w, h) {
  ctx.fillStyle = '#f5ad7a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(16, h - 24, 32, 24);
  ctx.fillRect(w - 48, h - 24, 32, 24);
}

function drawTrumpSuitFront(ctx, w, h) {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 28, 0);
  ctx.lineTo(w / 2 + 28, 0);
  ctx.lineTo(w / 2 + 16, 75);
  ctx.lineTo(w / 2 - 16, 75);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 9, 8);
  ctx.lineTo(w / 2 + 9, 8);
  ctx.lineTo(w / 2 + 12, h - 4);
  ctx.lineTo(w / 2, h);
  ctx.lineTo(w / 2 - 12, h - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(w / 2 - 8, 4, 16, 12);
}

export class Avatar {
  constructor(id, name, scene, world = null) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.world = world;

    // Bounding box dimensions matching player physics exactly
    this.width = 0.6;
    this.height = 1.8;
    this.depth = 0.6;

    // Fall kinematics & ground detection state
    this.velY = 0;
    this.gravity = -26.0;
    this.onGround = true;

    this.group = new THREE.Group();
    this.targetPos = new THREE.Vector3(0, 30, 0);
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.action = 'idle';

    this.animTime = 0;
    this.swingProgress = 0;
    this.weaponsEnabled = false;
    this.buildModel();
    this.createNameTag();

    this.scene.add(this.group);
  }

  get currentPos() {
    return this.group.position;
  }

  set currentPos(val) {
    if (val && typeof val === 'object') {
      this.group.position.copy(val);
    }
  }

  buildModel() {
    // Distinctive color palettes based on player ID hash
    const hash = this.hashString(this.name);
    const shirtColor = new THREE.Color().setHSL((hash % 360) / 360, 0.75, 0.5);
    const pantsColor = new THREE.Color(0x2d3e50);
    const skinColor = new THREE.Color(0xe0ac69);
    const hairColor = new THREE.Color(0x4a2c11);

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

    const isTrump = (this.name === 'jsieiragerpe' || this.name === 'jsieiragerpe@gmail.com');
    this.isDonaldTrump = isTrump;

    // Torso (Minecraft proportions: 8x12x4 pixels -> 0.5 x 0.75 x 0.25 units, height 0.75 spans 0.75 to 1.50)
    const torsoGeom = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    if (isTrump) {
      // Donald Trump Presidential Suit: Dark Navy with crisp white shirt and vibrant red tie!
      const suitMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      const suitFrontTex = createTrumpCanvasTexture(128, 128, drawTrumpSuitFront);
      const suitFrontMat = suitFrontTex
        ? new THREE.MeshStandardMaterial({ map: suitFrontTex, roughness: 0.7 })
        : new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      // BoxGeometry faces: [+X, -X, +Y, -Y, +Z, -Z] (Face 5 is Front -Z)
      this.torso = new THREE.Mesh(torsoGeom, [suitMat, suitMat, suitMat, suitMat, suitMat, suitFrontMat]);
    } else {
      this.torso = new THREE.Mesh(torsoGeom, shirtMat);
    }
    this.torso.position.y = 1.125;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head group (pivot at neck y = 1.50, Minecraft: 8x8x8 pixels -> 0.5 x 0.5 x 0.5 units)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.50, 0);

    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);

    if (isTrump) {
      // Procedural Donald Trump 3D Cube Head Textures
      // BoxGeometry material array: 0:+X(Right), 1:-X(Left), 2:+Y(Top), 3:-Y(Bottom), 4:+Z(Back), 5:-Z(Front)
      const texRight = createTrumpCanvasTexture(128, 128, (ctx, w, h) => drawTrumpSideHair(ctx, w, h, false));
      const texLeft = createTrumpCanvasTexture(128, 128, (ctx, w, h) => drawTrumpSideHair(ctx, w, h, true));
      const texTop = createTrumpCanvasTexture(128, 128, drawTrumpTopHair);
      const texBottom = createTrumpCanvasTexture(128, 128, drawTrumpBottom);
      const texBack = createTrumpCanvasTexture(128, 128, drawTrumpBackHair);
      const texFront = createTrumpCanvasTexture(128, 128, drawTrumpFrontFace);

      const trumpHeadMats = [
        texRight ? new THREE.MeshStandardMaterial({ map: texRight, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 }),
        texLeft ? new THREE.MeshStandardMaterial({ map: texLeft, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 }),
        texTop ? new THREE.MeshStandardMaterial({ map: texTop, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 }),
        texBottom ? new THREE.MeshStandardMaterial({ map: texBottom, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0xf5ad7a, roughness: 0.8 }),
        texBack ? new THREE.MeshStandardMaterial({ map: texBack, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 }),
        texFront ? new THREE.MeshStandardMaterial({ map: texFront, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0xf5ad7a, roughness: 0.8 })
      ];

      this.head = new THREE.Mesh(headGeom, trumpHeadMats);
      this.head.position.y = 0.25;
      this.head.castShadow = true;
      this.head.isDonaldTrumpHead = true;
      this.headGroup.add(this.head);

      // Distinctive 3D comb-over hair crest cap over top of cube
      const trumpHairGeom = new THREE.BoxGeometry(0.53, 0.16, 0.53);
      const trumpHairMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.75 });
      const trumpHairMesh = new THREE.Mesh(trumpHairGeom, trumpHairMat);
      trumpHairMesh.position.set(0.01, 0.44, -0.01);
      this.headGroup.add(trumpHairMesh);
    } else {
      this.head = new THREE.Mesh(headGeom, skinMat);
      this.head.position.y = 0.25;
      this.head.castShadow = true;
      this.headGroup.add(this.head);

      // Hair cap layer
      const hairGeom = new THREE.BoxGeometry(0.52, 0.18, 0.52);
      const hair = new THREE.Mesh(hairGeom, hairMat);
      hair.position.y = 0.42;
      this.headGroup.add(hair);

      // Authentic Minecraft Face details on front face (-Z)
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2563eb }); // Classic blue eyes
      const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7c2d12 });

      // Eye Whites
      const scleraGeom = new THREE.BoxGeometry(0.08, 0.06, 0.02);
      const scleraL = new THREE.Mesh(scleraGeom, whiteMat);
      scleraL.position.set(-0.13, 0.24, -0.252);
      const scleraR = new THREE.Mesh(scleraGeom, whiteMat);
      scleraR.position.set(0.13, 0.24, -0.252);
      this.headGroup.add(scleraL);
      this.headGroup.add(scleraR);

      // Blue Pupils
      const pupilGeom = new THREE.BoxGeometry(0.045, 0.06, 0.022);
      const pupilL = new THREE.Mesh(pupilGeom, eyeMat);
      pupilL.position.set(-0.15, 0.24, -0.253);
      const pupilR = new THREE.Mesh(pupilGeom, eyeMat);
      pupilR.position.set(0.11, 0.24, -0.253);
      this.headGroup.add(pupilL);
      this.headGroup.add(pupilR);

      // Mouth
      const mouthGeom = new THREE.BoxGeometry(0.14, 0.035, 0.02);
      const mouth = new THREE.Mesh(mouthGeom, mouthMat);
      mouth.position.set(0, 0.10, -0.252);
      this.headGroup.add(mouth);

      // Front Hair Bangs
      const bangsGeom = new THREE.BoxGeometry(0.50, 0.08, 0.04);
      const bangs = new THREE.Mesh(bangsGeom, hairMat);
      bangs.position.set(0, 0.44, -0.245);
      this.headGroup.add(bangs);
    }

    this.group.add(this.headGroup);

    // Left Arm (pivot at shoulder y = 1.375, Minecraft: 4x12x4 pixels -> 0.25 x 0.75 x 0.25 units)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.375, 1.375, 0);
    const armGeom = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const leftArmMesh = new THREE.Mesh(armGeom, shirtMat);
    leftArmMesh.position.y = -0.375;
    leftArmMesh.castShadow = true;
    this.leftArmPivot.add(leftArmMesh);
    this.group.add(this.leftArmPivot);

    // Right Arm (pivot at shoulder y = 1.375)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.375, 1.375, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, skinMat);
    rightArmMesh.position.y = -0.375;
    rightArmMesh.castShadow = true;
    this.rightArmPivot.add(rightArmMesh);

    // 3D Sniper Rifle model held in right hand
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0, -0.55, -0.22);
    this.weaponGroup.visible = false;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.35, metalness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
    const blueLensMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Gun receiver / chamber
    const bodyGeom = new THREE.BoxGeometry(0.08, 0.12, 0.42);
    const bodyMesh = new THREE.Mesh(bodyGeom, metalMat);
    this.weaponGroup.add(bodyMesh);

    // Wooden stock
    const stockGeom = new THREE.BoxGeometry(0.07, 0.10, 0.28);
    const stockMesh = new THREE.Mesh(stockGeom, woodMat);
    stockMesh.position.set(0, -0.02, 0.30);
    this.weaponGroup.add(stockMesh);

    // Barrel
    const barrelGeom = new THREE.BoxGeometry(0.045, 0.045, 0.50);
    const barrelMesh = new THREE.Mesh(barrelGeom, metalMat);
    barrelMesh.position.set(0, 0.02, -0.42);
    this.weaponGroup.add(barrelMesh);

    // Sniper optical scope
    const scopeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.24);
    const scopeMesh = new THREE.Mesh(scopeGeom, metalMat);
    scopeMesh.position.set(0, 0.09, -0.05);
    this.weaponGroup.add(scopeMesh);

    // Front scope lens
    const lensGeom = new THREE.BoxGeometry(0.045, 0.045, 0.015);
    const lensMesh = new THREE.Mesh(lensGeom, blueLensMat);
    lensMesh.position.set(0, 0.09, -0.175);
    this.weaponGroup.add(lensMesh);

    this.rightArmPivot.add(this.weaponGroup);
    this.group.add(this.rightArmPivot);

    // Left Leg (pivot at hip y = 0.75, Minecraft: 4x12x4 pixels -> 0.25 x 0.75 x 0.25 units, feet bottom aligns exactly at Y = 0.0)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.125, 0.75, 0);
    const legGeom = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = -0.375;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.group.add(this.leftLegPivot);

    // Right Leg (pivot at hip y = 0.75)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.125, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, pantsMat);
    rightLegMesh.position.y = -0.375;
    rightLegMesh.castShadow = true;
    this.rightLegPivot.add(rightLegMesh);
    this.group.add(this.rightLegPivot);
  }

  createNameTag() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Rounded background pill (with fallback for browsers lacking roundRect)
    ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(10, 8, 236, 48, 16);
    } else {
      ctx.rect(10, 8, 236, 48);
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player name text
    ctx.font = 'bold 26px "Segoe UI", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });

    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.set(0, 2.25, 0);
    this.nameSprite.scale.set(1.5, 0.375, 1);
    this.group.add(this.nameSprite);
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  /**
   * Calculates the authoritative solid ground height under the avatar's bounding box
   */
  getGroundHeight(x = this.group.position.x, z = this.group.position.z, startY = this.group.position.y) {
    if (!this.world) return 24;

    const halfW = (this.width || 0.6) * 0.5;
    const halfD = (this.depth || 0.6) * 0.5;
    const minX = Math.floor(x - halfW + 0.001);
    const maxX = Math.floor(x + halfW - 0.001);
    const minZ = Math.floor(z - halfD + 0.001);
    const maxZ = Math.floor(z + halfD - 0.001);
    const baseStartY = Math.max(
      startY !== undefined ? startY : this.group.position.y,
      this.targetPos ? this.targetPos.y : 0,
      this.group.position ? this.group.position.y : 0
    );
    const checkStartY = Math.min(63, Math.max(0, Math.floor(baseStartY) + 1));

    // 1. Check voxel terrain if getBlock is available
    if (typeof this.world.getBlock === 'function') {
      for (let y = checkStartY; y >= 0; y--) {
        let hasSolid = false;
        for (let bx = minX; bx <= maxX; bx++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            const block = this.world.getBlock(bx, y, bz);
            if (block !== 0 && block !== 11) { // 0 = AIR, 11 = WATER
              hasSolid = true;
              break;
            }
          }
          if (hasSolid) break;
        }
        if (hasSolid) {
          return y + 1.0;
        }
      }
    }

    // 2. Fallback to world.getHeightAt if no solid voxels found in loaded chunks
    if (typeof this.world.getHeightAt === 'function') {
      return this.world.getHeightAt(x, z);
    }

    return 24;
  }

  getGroundY(x, z, startY) {
    return this.getGroundHeight(x, z, startY);
  }

  /**
   * Checks whether the specified block coordinates lie directly beneath this avatar's bounding box
   */
  isSupportedByBlock(bx, by, bz) {
    const halfW = (this.width || 0.6) * 0.5;
    const halfD = (this.depth || 0.6) * 0.5;

    // Check against both current rendered position and target position
    const positions = [this.group.position, this.targetPos];
    for (const pos of positions) {
      const minX = Math.floor(pos.x - halfW + 0.001);
      const maxX = Math.floor(pos.x + halfW - 0.001);
      const minZ = Math.floor(pos.z - halfD + 0.001);
      const maxZ = Math.floor(pos.z + halfD - 0.001);

      if (bx >= minX && bx <= maxX && bz >= minZ && bz <= maxZ) {
        const feetBlockY = Math.floor(pos.y - 0.05);
        if (Math.abs(by - feetBlockY) <= 1 || (by < pos.y && by >= pos.y - 1.5)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Immediately updates ground detection when supporting block is removed.
   * Model falls naturally and stands firmly on the newly exposed floor.
   */
  updateGroundDetection(world = this.world) {
    if (this.action === 'driving') return 25;
    if (world) this.world = world;
    const px = this.group.position.x;
    const pz = this.group.position.z;
    const py = this.group.position.y;
    const groundY = this.getGroundHeight(px, pz, py);

    // Update targetPos.y to newly exposed floor
    this.targetPos.y = groundY;

    if (this.group.position.y < groundY) {
      // Sinking/burying prevention: snap up to ground
      this.group.position.y = groundY;
      this.velY = 0;
      this.onGround = true;
    } else if (this.group.position.y > groundY) {
      this.onGround = false;
      if (this.velY >= 0) {
        this.velY = -2.0; // Start falling naturally immediately
      }
    } else {
      this.onGround = true;
      this.velY = 0;
    }

    return groundY;
  }

  /**
   * Validates supporting voxel at Math.floor(x), Math.floor(y - 0.05), Math.floor(z).
   * If BLOCKS.AIR, sets onGround = false and applies downward gravitational velocity.
   */
  updateGroundSupport(world = this.world) {
    if (this.action === 'driving') return true;
    if (world) this.world = world;
    if (!this.world) return false;

    const px = this.group.position.x;
    const py = this.group.position.y;
    const pz = this.group.position.z;

    const bx = Math.floor(px);
    const by = Math.floor(py - 0.05);
    const bz = Math.floor(pz);

    const block = typeof this.world.getBlock === 'function' ? this.world.getBlock(bx, by, bz) : 0;
    // 0 = BLOCKS.AIR, 11 = BLOCKS.WATER
    if (block === 0 || block === 11) {
      this.onGround = false;
      if (this.velY >= 0) {
        this.velY = -2.0; // Apply downward gravitational velocity
      }
      this.updateGroundDetection(this.world);
      return false;
    } else {
      this.onGround = true;
      this.velY = 0;
      return true;
    }
  }

  onSupportingBlockRemoved(bx, by, bz) {
    if (bx !== undefined && by !== undefined && bz !== undefined) {
      if (!this.isSupportedByBlock(bx, by, bz)) {
        return;
      }
    }
    this.updateGroundSupport(this.world);
  }

  setWeaponsEnabled(enabled) {
    this.weaponsEnabled = Boolean(enabled);
    if (this.weaponGroup) {
      this.weaponGroup.visible = this.weaponsEnabled;
    }
  }

  setTargetState(pos, rot, action, weaponsEnabled) {
    if (action) {
      this.action = action;
    }
    if (typeof weaponsEnabled === 'boolean') {
      this.setWeaponsEnabled(weaponsEnabled);
    }
    if (pos) {
      const px = pos[0];
      let py = pos[1];
      const pz = pos[2];

      if (this.world && this.action !== 'driving') {
        const groundY = this.getGroundHeight(px, pz, py);
        // Eliminate burying or sinking glitch: player model must never sink below true voxel ground
        if (py < groundY) {
          py = groundY;
        } else if (this.action !== 'jumping') {
          // If not actively jumping and the supporting block was excavated, stay grounded on exposed floor
          const feetBlockY = Math.floor(py - 0.05);
          const hasSupport = typeof this.world.getBlock === 'function' ?
            (this.world.getBlock(Math.floor(px), feetBlockY, Math.floor(pz)) !== 0) : true;
          if (!hasSupport && Math.abs(py - groundY) <= 1.05) {
            py = groundY;
          }
        }
      }

      this.targetPos.set(px, py, pz);
    }
    if (rot) {
      this.targetYaw = rot[0];
      this.targetPitch = rot[1];
    }
    if (this.action === 'driving') {
      this.group.position.copy(this.targetPos);
      this.group.rotation.y = this.targetYaw;
      this.velY = 0;
      this.onGround = true;
    }
  }

  triggerSwing() {
    this.swingProgress = 1.0;
  }

  update(dt) {
    // Distance snap if teleported/respawned or if seated inside a car
    const distSq = this.group.position.distanceToSquared(this.targetPos);
    if (this.action === 'driving') {
      // Snap directly to cockpit seat position so avatar never lags behind the moving car
      this.group.position.copy(this.targetPos);
      this.group.rotation.y = this.targetYaw;
      this.velY = 0;
      this.onGround = true;
    } else if (distSq > 100) {
      this.group.position.copy(this.targetPos);
      this.velY = 0;
      this.onGround = true;
    } else {
      // Horizontal smooth interpolation (lerp)
      const horizLerp = Math.min(1.0, dt * 14.0);
      this.group.position.x += (this.targetPos.x - this.group.position.x) * horizLerp;
      this.group.position.z += (this.targetPos.z - this.group.position.z) * horizLerp;

      // Vertical movement & natural fall physics
      const groundY = this.getGroundHeight(this.group.position.x, this.group.position.z, this.group.position.y);

      if (this.group.position.y > this.targetPos.y) {
        // Fall naturally using gravity
        this.velY = (this.velY || 0) + (this.gravity || -26.0) * dt;
        this.group.position.y += this.velY * dt;
        if (this.group.position.y <= this.targetPos.y) {
          this.group.position.y = this.targetPos.y;
          this.velY = 0;
          this.onGround = true;
        } else {
          this.onGround = false;
        }
      } else if (this.group.position.y < this.targetPos.y) {
        // Ascending (e.g. jump or step up)
        this.group.position.y += (this.targetPos.y - this.group.position.y) * Math.min(1.0, dt * 14.0);
        this.velY = 0;
      }

      // Eliminate burying or sinking glitch: clamp strictly to true ground floor
      if (this.group.position.y < groundY) {
        this.group.position.y = groundY;
        this.velY = 0;
        this.onGround = true;
      }
    }

    // Smooth yaw rotation (instant lock when driving so avatar rotates with car chassis)
    if (this.action === 'driving') {
      this.group.rotation.y = this.targetYaw;
    } else {
      let angleDiff = this.targetYaw - this.group.rotation.y;
      // Normalize angle difference to [-PI, PI]
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      this.group.rotation.y += angleDiff * Math.min(1.0, dt * 14.0);
    }

    // Head pitch
    this.headGroup.rotation.x = this.targetPitch;

    // Limb animations based on action
    const isMoving = (this.action === 'walking' || this.action === 'running');
    const animSpeed = (this.action === 'running') ? 14.0 : 8.0;
    const swingAmp = (this.action === 'running') ? 0.75 : 0.45;

    // Sprint lean / tilt forward
    const isRunning = (this.action === 'running');
    const targetTorsoTilt = isRunning ? 0.22 : 0;
    this.torso.rotation.x += (targetTorsoTilt - this.torso.rotation.x) * Math.min(1.0, dt * 10.0);

    if (this.action === 'driving') {
      // Seated driving pose inside racing car cockpit
      this.torso.position.y = 0.65;
      this.torso.rotation.x = 0.08;
      this.headGroup.position.y = 1.02;
      this.leftArmPivot.position.y = 0.92;
      this.rightArmPivot.position.y = 0.92;
      this.leftLegPivot.position.y = 0.35;
      this.rightLegPivot.position.y = 0.35;
      // Arms gripping steering wheel forward
      this.leftArmPivot.rotation.x = -1.15;
      this.leftArmPivot.rotation.y = 0.28;
      this.leftArmPivot.rotation.z = 0.15;
      this.rightArmPivot.rotation.x = -1.15;
      this.rightArmPivot.rotation.y = -0.28;
      this.rightArmPivot.rotation.z = -0.15;
      // Legs bent forward at 90 degrees inside cockpit tub
      this.leftLegPivot.rotation.x = -1.48;
      this.leftLegPivot.rotation.y = 0.08;
      this.leftLegPivot.rotation.z = 0.05;
      this.rightLegPivot.rotation.x = -1.48;
      this.rightLegPivot.rotation.y = -0.08;
      this.rightLegPivot.rotation.z = -0.05;
    } else {
      this.torso.position.y = 1.125;
      this.headGroup.position.y = 1.50;
      this.leftArmPivot.position.y = 1.375;
      this.rightArmPivot.position.y = 1.375;
      this.leftLegPivot.position.y = 0.75;
      this.rightLegPivot.position.y = 0.75;

      if (this.weaponsEnabled) {
        // Two-handed tactical rifle aim pose
        const pitchAngle = Math.max(-1.0, Math.min(1.0, this.targetPitch || 0));
        this.rightArmPivot.rotation.x = -1.25 + pitchAngle * 0.7;
        this.rightArmPivot.rotation.y = -0.22;
        this.rightArmPivot.rotation.z = -0.05;

        this.leftArmPivot.rotation.x = -1.15 + pitchAngle * 0.6;
        this.leftArmPivot.rotation.y = 0.35;
        this.leftArmPivot.rotation.z = 0.12;

        if (isMoving) {
          this.animTime += dt * animSpeed;
          const legSwing = Math.sin(this.animTime) * swingAmp;
          this.leftLegPivot.rotation.x = -legSwing;
          this.rightLegPivot.rotation.x = legSwing;
        } else {
          this.leftLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
          this.rightLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        }
      } else if (this.action === 'swimming') {
        this.animTime += dt * 6.0;
        const stroke = Math.sin(this.animTime);
        this.leftArmPivot.rotation.x = -1.2 + stroke * 0.4;
        this.rightArmPivot.rotation.x = -1.2 - stroke * 0.4;
        this.leftArmPivot.rotation.z = -0.3 + stroke * 0.2;
        this.rightArmPivot.rotation.z = 0.3 - stroke * 0.2;
        this.leftLegPivot.rotation.x = stroke * 0.35;
        this.rightLegPivot.rotation.x = -stroke * 0.35;
      } else if (isMoving) {
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.animTime += dt * animSpeed;
        const swing = Math.sin(this.animTime) * swingAmp;

        // Minecraft opposing sinusoidal swing
        this.leftArmPivot.rotation.x = swing;
        this.rightArmPivot.rotation.x = -swing;
        this.leftLegPivot.rotation.x = -swing;
        this.rightLegPivot.rotation.x = swing;
      } else if (this.action === 'jumping') {
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.leftArmPivot.rotation.x = -0.6;
        this.rightArmPivot.rotation.x = -0.6;
        this.leftLegPivot.rotation.x = 0.35;
        this.rightLegPivot.rotation.x = -0.35;
      } else {
        // Idle: smoothly return to neutral
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.leftArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.rightArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.leftLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.rightLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
      }
    }

    // Apply punch / block interaction swing to right arm
    if (this.swingProgress > 0) {
      this.swingProgress -= dt * 5.0;
      if (this.swingProgress < 0) this.swingProgress = 0;
      const punch = Math.sin((1.0 - this.swingProgress) * Math.PI) * 1.35;
      this.rightArmPivot.rotation.x -= punch;
      this.rightArmPivot.rotation.y = -punch * 0.25;
    } else {
      this.rightArmPivot.rotation.y *= Math.max(0, 1.0 - dt * 10);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
  }
}
