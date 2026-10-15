// public/src/avatar.js
// 3D multiplayer humanoid voxel avatar with animated limbs, head rotation, and floating name tag
import * as THREE from 'three';

export class Avatar {
  constructor(id, name, scene) {
    this.id = id;
    this.name = name;
    this.scene = scene;

    this.group = new THREE.Group();
    this.targetPos = new THREE.Vector3(0, 30, 0);
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.action = 'idle';

    this.animTime = 0;
    this.swingProgress = 0;
    this.buildModel();
    this.createNameTag();

    this.scene.add(this.group);
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

    // Torso (Minecraft proportions: 8x12x4 pixels -> 0.5 x 0.75 x 0.25 units)
    const torsoGeom = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    this.torso = new THREE.Mesh(torsoGeom, shirtMat);
    this.torso.position.y = 1.0;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head group (pivot at neck y = 1.375, Minecraft: 8x8x8 pixels -> 0.5 x 0.5 x 0.5 units)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.375, 0);

    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
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
    this.group.add(this.rightArmPivot);

    // Left Leg (pivot at hip y = 0.625, Minecraft: 4x12x4 pixels -> 0.25 x 0.75 x 0.25 units)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.125, 0.625, 0);
    const legGeom = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = -0.375;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.group.add(this.leftLegPivot);

    // Right Leg (pivot at hip y = 0.625)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.125, 0.625, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, pantsMat);
    rightLegMesh.position.y = -0.375;
    rightLegMesh.castShadow = true;
    this.rightLegPivot.add(rightLegMesh);
    this.group.add(this.rightLegPivot);
  }

  createNameTag() {
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
    this.nameSprite.position.set(0, 2.15, 0);
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

  setTargetState(pos, rot, action) {
    if (pos) {
      this.targetPos.set(pos[0], pos[1], pos[2]);
    }
    if (rot) {
      this.targetYaw = rot[0];
      this.targetPitch = rot[1];
    }
    if (action) {
      this.action = action;
    }
  }

  triggerSwing() {
    this.swingProgress = 1.0;
  }

  update(dt) {
    // Distance snap if teleported/respawned
    const distSq = this.group.position.distanceToSquared(this.targetPos);
    if (distSq > 100) {
      this.group.position.copy(this.targetPos);
    } else {
      // Smooth movement interpolation (lerp)
      this.group.position.lerp(this.targetPos, Math.min(1.0, dt * 14.0));
    }

    // Smooth yaw rotation
    let angleDiff = this.targetYaw - this.group.rotation.y;
    // Normalize angle difference to [-PI, PI]
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.group.rotation.y += angleDiff * Math.min(1.0, dt * 14.0);

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

    if (this.action === 'swimming') {
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
