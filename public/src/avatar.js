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

    // Torso (center at y = 1.05)
    const torsoGeom = new THREE.BoxGeometry(0.5, 0.65, 0.3);
    this.torso = new THREE.Mesh(torsoGeom, shirtMat);
    this.torso.position.y = 1.075;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head group (pivot at neck y = 1.4)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.4, 0);

    const headGeom = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    this.head = new THREE.Mesh(headGeom, skinMat);
    this.head.position.y = 0.21;
    this.head.castShadow = true;
    this.headGroup.add(this.head);

    // Hair cap
    const hairGeom = new THREE.BoxGeometry(0.44, 0.16, 0.44);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.y = 0.36;
    this.headGroup.add(hair);

    this.group.add(this.headGroup);

    // Left Arm (pivot at shoulder)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.35, 1.35, 0);
    const armGeom = new THREE.BoxGeometry(0.18, 0.6, 0.18);
    const leftArmMesh = new THREE.Mesh(armGeom, skinMat);
    leftArmMesh.position.y = -0.28;
    leftArmMesh.castShadow = true;
    this.leftArmPivot.add(leftArmMesh);
    this.group.add(this.leftArmPivot);

    // Right Arm (pivot at shoulder)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.35, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, skinMat);
    rightArmMesh.position.y = -0.28;
    rightArmMesh.castShadow = true;
    this.rightArmPivot.add(rightArmMesh);
    this.group.add(this.rightArmPivot);

    // Left Leg (pivot at hip)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.14, 0.75, 0);
    const legGeom = new THREE.BoxGeometry(0.2, 0.75, 0.22);
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = -0.375;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.group.add(this.leftLegPivot);

    // Right Leg (pivot at hip)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.14, 0.75, 0);
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

    // Rounded background pill
    ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
    ctx.beginPath();
    ctx.roundRect(10, 8, 236, 48, 16);
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

    if (isMoving) {
      this.animTime += dt * animSpeed;
      const swing = Math.sin(this.animTime) * swingAmp;

      this.leftArmPivot.rotation.x = swing;
      this.rightArmPivot.rotation.x = -swing;
      this.leftLegPivot.rotation.x = -swing;
      this.rightLegPivot.rotation.x = swing;
    } else if (this.action === 'jumping') {
      this.leftArmPivot.rotation.x = -0.5;
      this.rightArmPivot.rotation.x = -0.5;
      this.leftLegPivot.rotation.x = 0.3;
      this.rightLegPivot.rotation.x = -0.3;
    } else {
      // Idle: smoothly return to neutral
      this.leftArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
      this.rightArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
      this.leftLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
      this.rightLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.nameSprite && this.nameSprite.material.map) {
      this.nameSprite.material.map.dispose();
      this.nameSprite.material.dispose();
    }
  }
}
