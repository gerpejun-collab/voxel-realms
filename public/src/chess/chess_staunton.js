/**
 * Grandmaster Chess - Procedural High-Poly Staunton 3D Pieces
 * 
 * Implements FIDE Staunton 1849 tournament-standard piece geometries in Three.js:
 * - Rotational pieces (Pawn, Rook, Bishop, Queen, King) via THREE.LatheGeometry (36 radial segments)
 * - Sculpted Knight horse bust via THREE.ExtrudeGeometry from authentic 2D vector spline silhouette with mane flairs and cheek plates
 * - Rook crenellated parapet with 4 precision merlons and embrasures
 * - Bishop bulbous mitre with 45° angled cross-cut mitre slit and golden finial bead
 * - Queen fluted torso, flared crown capital with 8-pointed crenellated coronet rim and royal gold orb
 * - King broad pedestal, tiered regal capital, arched dome, and 3D Cross Pattée finial
 * - Green baize felt base pads (MeshStandardMaterial roughness 0.95) on every piece
 * - Polished Boxwood/Ivory and Ebony PBR clearcoat materials with royal gold trim
 * - Shared geometry buffer caching across identical piece types for high mobile performance
 * 
 * Zero external downloaded 3D models or textures.
 */

import * as THREE_MODULE from 'three';

const THREE = typeof window !== 'undefined' && window.THREE ? window.THREE : THREE_MODULE;

export class StauntonGeometryFactory {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get or build cached geometry
     */
    getGeometry(key, builder) {
        if (!this.cache.has(key)) {
            this.cache.set(key, builder());
        }
        return this.cache.get(key);
    }

    /**
     * Classical Staunton Pedestal Base curve points (height 0.0 to 0.22)
     */
    getBasePoints(baseRadius = 0.42) {
        return [
            new THREE.Vector2(0.00, 0.00),
            new THREE.Vector2(baseRadius, 0.00),
            new THREE.Vector2(baseRadius, 0.06),
            new THREE.Vector2(baseRadius * 0.93, 0.10),
            new THREE.Vector2(baseRadius * 0.83, 0.12),
            new THREE.Vector2(baseRadius * 0.76, 0.16),
            new THREE.Vector2(baseRadius * 0.81, 0.18),
            new THREE.Vector2(baseRadius * 0.86, 0.20),
            new THREE.Vector2(baseRadius * 0.74, 0.22)
        ];
    }

    /**
     * Spec 71: Staunton Pawn Geometry (Height 1.11 units)
     * 24 spline points: weighted pedestal, tapered concave waist, neck ring, spherical head
     */
    getPawnGeometry() {
        return this.getGeometry('pawn', () => {
            const pts = this.getBasePoints(0.42);

            // Tapered concave waist
            pts.push(
                new THREE.Vector2(0.28, 0.25),
                new THREE.Vector2(0.24, 0.34),
                new THREE.Vector2(0.20, 0.44),
                new THREE.Vector2(0.17, 0.52),
                new THREE.Vector2(0.15, 0.60),
                new THREE.Vector2(0.18, 0.64),
                new THREE.Vector2(0.22, 0.66), // Neck collar lower bead
                new THREE.Vector2(0.24, 0.68), // Collar outer peak
                new THREE.Vector2(0.16, 0.70)  // Collar top notch
            );

            // Spherical head arc (radius 0.23, centered at y = 0.88)
            const headCenterY = 0.88;
            const headR = 0.23;
            const arcSteps = 10;
            const startAngle = -0.90; // rad
            const endAngle = Math.PI / 2; // top center

            for (let i = 1; i <= arcSteps; i++) {
                const u = i / arcSteps;
                const angle = startAngle + u * (endAngle - startAngle);
                const x = Math.max(0, headR * Math.cos(angle));
                const y = headCenterY + headR * Math.sin(angle);
                pts.push(new THREE.Vector2(x, y));
            }
            pts.push(new THREE.Vector2(0.00, 1.11));

            return new THREE.LatheGeometry(pts, 36);
        });
    }

    /**
     * Spec 72, 73: Staunton Rook Geometry (Height 1.25 units)
     * Solid fluted rampart stem, flared capital, hollowed parapet rim + 4 merlons
     */
    getRookBodyGeometry() {
        return this.getGeometry('rook_body', () => {
            const pts = this.getBasePoints(0.42);

            // Fluted rampart stem
            pts.push(
                new THREE.Vector2(0.33, 0.24),
                new THREE.Vector2(0.31, 0.42),
                new THREE.Vector2(0.30, 0.60),
                new THREE.Vector2(0.31, 0.74),
                new THREE.Vector2(0.33, 0.82),
                // Flared capital
                new THREE.Vector2(0.36, 0.88),
                new THREE.Vector2(0.39, 0.96),
                new THREE.Vector2(0.42, 1.05),
                new THREE.Vector2(0.42, 1.14), // Outer parapet shelf
                new THREE.Vector2(0.34, 1.14), // Inner parapet shelf
                new THREE.Vector2(0.28, 1.05), // Hollowed basin wall
                new THREE.Vector2(0.00, 1.05)  // Basin floor center
            );

            return new THREE.LatheGeometry(pts, 36);
        });
    }

    getRookMerlonGeometry() {
        return this.getGeometry('rook_merlon', () => {
            // Merlon block: width 0.14, height 0.12, depth 0.09 with chamfered look
            const geo = new THREE.BoxGeometry(0.14, 0.12, 0.09);
            geo.translate(0, 0.06, 0);
            return geo;
        });
    }

    /**
     * Spec 74, 75, 76: Staunton Bishop Geometry (Height 1.68 units)
     * Slender waist, double torus bead collar, teardrop mitre, 45° mitre cut, gold finial bead
     */
    getBishopBodyGeometry() {
        return this.getGeometry('bishop_body', () => {
            const pts = this.getBasePoints(0.42);

            // Slender waist
            pts.push(
                new THREE.Vector2(0.28, 0.26),
                new THREE.Vector2(0.22, 0.42),
                new THREE.Vector2(0.18, 0.62),
                new THREE.Vector2(0.16, 0.76),
                // Double torus bead collar
                new THREE.Vector2(0.22, 0.80),
                new THREE.Vector2(0.25, 0.83),
                new THREE.Vector2(0.19, 0.86),
                new THREE.Vector2(0.26, 0.89),
                new THREE.Vector2(0.18, 0.92),
                // Bulbous teardrop mitre
                new THREE.Vector2(0.22, 0.98),
                new THREE.Vector2(0.28, 1.08),
                new THREE.Vector2(0.32, 1.18), // Widest bulge
                new THREE.Vector2(0.30, 1.30),
                new THREE.Vector2(0.24, 1.44),
                new THREE.Vector2(0.16, 1.55),
                new THREE.Vector2(0.06, 1.62),
                new THREE.Vector2(0.00, 1.64)
            );

            return new THREE.LatheGeometry(pts, 36);
        });
    }

    getBishopFinialGeometry() {
        return this.getGeometry('bishop_finial', () => {
            return new THREE.SphereGeometry(0.06, 16, 16);
        });
    }

    getBishopSlitGeometry() {
        return this.getGeometry('bishop_slit', () => {
            // 45° angled cross-cut slit groove (width 0.035, depth 0.14)
            const geo = new THREE.BoxGeometry(0.035, 0.22, 0.24);
            return geo;
        });
    }

    /**
     * Spec 77, 78: Staunton Queen Geometry (Height 1.76 units)
     * Fluted torso, flared crown capital, 8-pointed crenellated coronet rim, gold orb
     */
    getQueenBodyGeometry() {
        return this.getGeometry('queen_body', () => {
            const pts = this.getBasePoints(0.44);

            // Graceful fluted torso
            pts.push(
                new THREE.Vector2(0.30, 0.26),
                new THREE.Vector2(0.25, 0.48),
                new THREE.Vector2(0.22, 0.72),
                new THREE.Vector2(0.25, 0.98),
                new THREE.Vector2(0.22, 1.12),
                // Flared crown capital
                new THREE.Vector2(0.25, 1.18),
                new THREE.Vector2(0.30, 1.26),
                new THREE.Vector2(0.38, 1.36), // Outer coronet rim lip
                new THREE.Vector2(0.32, 1.35), // Inner shelf
                new THREE.Vector2(0.20, 1.28), // Basin wall
                new THREE.Vector2(0.00, 1.25)  // Basin floor
            );

            return new THREE.LatheGeometry(pts, 36);
        });
    }

    getQueenOrbGeometry() {
        return this.getGeometry('queen_orb', () => {
            return new THREE.SphereGeometry(0.08, 16, 16);
        });
    }

    getQueenPointGeometry() {
        return this.getGeometry('queen_point', () => {
            return new THREE.SphereGeometry(0.035, 10, 10);
        });
    }

    /**
     * Spec 79, 80: Staunton King Geometry (Height 1.92 units)
     * Broad pedestal (radius 0.46), tiered regal capital, arched dome, 3D Cross Pattée
     */
    getKingBodyGeometry() {
        return this.getGeometry('king_body', () => {
            const pts = this.getBasePoints(0.46);

            // Imposing towering torso
            pts.push(
                new THREE.Vector2(0.35, 0.28),
                new THREE.Vector2(0.30, 0.58),
                new THREE.Vector2(0.28, 0.88),
                new THREE.Vector2(0.32, 1.10),
                new THREE.Vector2(0.28, 1.24),
                // Tiered regal capital
                new THREE.Vector2(0.33, 1.30),
                new THREE.Vector2(0.40, 1.38),
                new THREE.Vector2(0.42, 1.46), // Regal crown rim
                new THREE.Vector2(0.34, 1.52),
                new THREE.Vector2(0.24, 1.58),
                // Arched dome
                new THREE.Vector2(0.18, 1.63),
                new THREE.Vector2(0.00, 1.66)
            );

            return new THREE.LatheGeometry(pts, 36);
        });
    }

    getKingCrossGeometry() {
        return this.getGeometry('king_cross', () => {
            // 3D Cross Pattée with flared arms
            const shape = new THREE.Shape();
            const w1 = 0.03; // hub half-width
            const w2 = 0.08; // flared outer half-width
            const h = 0.26;  // total height
            const arm = 0.12;// horizontal arm half-span

            // Start bottom center mount
            shape.moveTo(-w1, 0.0);
            shape.lineTo(w1, 0.0);
            // Rise to center hub
            shape.lineTo(w1, 0.10);
            // Right horizontal arm
            shape.lineTo(arm, 0.06);
            shape.lineTo(arm + 0.02, 0.13);
            shape.lineTo(arm, 0.20);
            shape.lineTo(w1, 0.16);
            // Top vertical arm
            shape.lineTo(w2, h);
            shape.lineTo(-w2, h);
            shape.lineTo(-w1, 0.16);
            // Left horizontal arm
            shape.lineTo(-arm, 0.20);
            shape.lineTo(-arm - 0.02, 0.13);
            shape.lineTo(-arm, 0.06);
            shape.lineTo(-w1, 0.10);
            shape.closePath();

            const extrudeSettings = {
                depth: 0.045,
                bevelEnabled: true,
                bevelSegments: 3,
                bevelSize: 0.015,
                bevelThickness: 0.015
            };

            const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geo.center();
            return geo;
        });
    }

    /**
     * Spec 81, 82, 83: Procedural Sculpted Knight Horse Bust
     * THREE.ExtrudeGeometry from authentic 2D spline silhouette + anatomical cheek plates
     */
    getKnightBustGeometry() {
        return this.getGeometry('knight_bust', () => {
            const shape = new THREE.Shape();

            // Silhouette in X-Y plane (head facing right, +X)
            // Start at back base of neck
            shape.moveTo(0.24, 0.22);

            // Arched dorsal neck curve with 3 stylized mane curls
            shape.quadraticCurveTo(0.22, 0.38, 0.25, 0.48);
            shape.lineTo(0.20, 0.52); // Mane curl 1 notch
            shape.quadraticCurveTo(0.24, 0.68, 0.26, 0.76);
            shape.lineTo(0.19, 0.80); // Mane curl 2 notch
            shape.quadraticCurveTo(0.22, 0.94, 0.22, 1.02);
            shape.lineTo(0.15, 1.06); // Mane curl 3 notch

            // Poll & Ears
            shape.lineTo(0.08, 1.16); // Poll crest
            shape.lineTo(0.06, 1.26); // Ear tip back
            shape.lineTo(0.02, 1.28); // Ear peak
            shape.lineTo(-0.02, 1.18); // Ear front base

            // Forehead & Muzzle
            shape.quadraticCurveTo(-0.12, 1.10, -0.20, 0.95); // Forehead slope
            shape.quadraticCurveTo(-0.28, 0.84, -0.34, 0.78); // Bridge to muzzle
            shape.quadraticCurveTo(-0.35, 0.72, -0.31, 0.68); // Nostril & upper lip
            shape.lineTo(-0.25, 0.66); // Mouth indentation
            shape.quadraticCurveTo(-0.28, 0.62, -0.22, 0.60); // Chin / lower jaw

            // Throat & Breast
            shape.quadraticCurveTo(-0.12, 0.50, -0.06, 0.38); // Throat under-curve
            shape.quadraticCurveTo(-0.02, 0.28, 0.00, 0.22);  // Breast to base

            // Base seal
            shape.lineTo(0.24, 0.22);
            shape.closePath();

            const extrudeSettings = {
                depth: 0.26,
                bevelEnabled: true,
                bevelSegments: 4,
                bevelSize: 0.03,
                bevelThickness: 0.04
            };

            const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            // Center along Z axis
            geo.translate(0, 0, -0.13);
            return geo;
        });
    }

    getKnightBaseGeometry() {
        return this.getGeometry('knight_base', () => {
            const pts = this.getBasePoints(0.42);
            return new THREE.LatheGeometry(pts, 36);
        });
    }

    getKnightCheekGeometry() {
        return this.getGeometry('knight_cheek', () => {
            const geo = new THREE.SphereGeometry(0.15, 16, 12);
            geo.scale(1.0, 1.5, 0.55);
            return geo;
        });
    }

    /**
     * Spec 70: Green Baize Felt Base Pad
     */
    getFeltGeometry(radius = 0.40) {
        const key = `felt_${radius.toFixed(2)}`;
        return this.getGeometry(key, () => {
            const geo = new THREE.CircleGeometry(radius * 0.96, 24);
            geo.rotateX(-Math.PI / 2);
            return geo;
        });
    }

    /**
     * Factory method: Assembles complete Staunton piece mesh group
     */
    createPieceMesh(type, color, materials) {
        const group = new THREE.Group();
        const mat = color === 'w' ? materials.whitePiece : materials.blackPiece;
        const gold = materials.goldTrim;
        const feltMat = materials.feltPad || new THREE.MeshStandardMaterial({
            color: 0x1b4332,
            roughness: 0.95,
            metalness: 0.0
        });

        const isWhite = color === 'w';

        // Underside green baize felt pad
        const baseRadius = type === 'k' ? 0.44 : 0.40;
        const feltGeo = this.getFeltGeometry(baseRadius);
        const feltMesh = new THREE.Mesh(feltGeo, feltMat);
        feltMesh.position.y = 0.002;
        group.add(feltMesh);

        switch (type) {
            case 'p': { // Pawn
                const pawnMesh = new THREE.Mesh(this.getPawnGeometry(), mat);
                pawnMesh.castShadow = true;
                pawnMesh.receiveShadow = true;
                group.add(pawnMesh);
                break;
            }

            case 'r': { // Rook
                const bodyMesh = new THREE.Mesh(this.getRookBodyGeometry(), mat);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                group.add(bodyMesh);

                // 4 precision crenellated merlons
                const merlonGeo = this.getRookMerlonGeometry();
                const merlonRadius = 0.35;
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI) / 2;
                    const merlon = new THREE.Mesh(merlonGeo, mat);
                    merlon.position.set(
                        Math.cos(angle) * merlonRadius,
                        1.14,
                        Math.sin(angle) * merlonRadius
                    );
                    merlon.rotation.y = -angle;
                    merlon.castShadow = true;
                    merlon.receiveShadow = true;
                    group.add(merlon);
                }
                break;
            }

            case 'n': { // Knight
                // Classical pedestal
                const baseMesh = new THREE.Mesh(this.getKnightBaseGeometry(), mat);
                baseMesh.castShadow = true;
                baseMesh.receiveShadow = true;
                group.add(baseMesh);

                // Sculpted horse bust
                const bustMesh = new THREE.Mesh(this.getKnightBustGeometry(), mat);
                bustMesh.castShadow = true;
                bustMesh.receiveShadow = true;

                // Anatomical lateral cheek flairs
                const cheekGeo = this.getKnightCheekGeometry();
                const leftCheek = new THREE.Mesh(cheekGeo, mat);
                leftCheek.position.set(-0.10, 0.78, 0.11);
                leftCheek.castShadow = true;
                group.add(leftCheek);

                const rightCheek = new THREE.Mesh(cheekGeo, mat);
                rightCheek.position.set(-0.10, 0.78, -0.11);
                rightCheek.castShadow = true;
                group.add(rightCheek);

                // Knight bust orientation: White faces -Z, Black faces +Z
                const bustGroup = new THREE.Group();
                bustGroup.add(bustMesh);
                bustGroup.rotation.y = isWhite ? -Math.PI / 2 : Math.PI / 2;
                leftCheek.rotation.y = isWhite ? -Math.PI / 2 : Math.PI / 2;
                rightCheek.rotation.y = isWhite ? -Math.PI / 2 : Math.PI / 2;
                group.add(bustGroup);
                break;
            }

            case 'b': { // Bishop
                const bodyMesh = new THREE.Mesh(this.getBishopBodyGeometry(), mat);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                group.add(bodyMesh);

                // 45° angled cross-cut mitre slit
                const slitMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
                const slitMesh = new THREE.Mesh(this.getBishopSlitGeometry(), slitMat);
                slitMesh.position.set(0.16, 1.34, 0);
                slitMesh.rotation.z = Math.PI * 0.25; // 45 degrees
                group.add(slitMesh);

                // Royal gold finial bead
                const finialMesh = new THREE.Mesh(this.getBishopFinialGeometry(), gold);
                finialMesh.position.y = 1.68;
                finialMesh.castShadow = true;
                group.add(finialMesh);
                break;
            }

            case 'q': { // Queen
                const bodyMesh = new THREE.Mesh(this.getQueenBodyGeometry(), mat);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                group.add(bodyMesh);

                // 8-pointed crenellated coronet rim points
                const pointGeo = this.getQueenPointGeometry();
                const coronetRadius = 0.36;
                for (let i = 0; i < 8; i++) {
                    const angle = (i * Math.PI) / 4;
                    const ptMesh = new THREE.Mesh(pointGeo, mat);
                    ptMesh.position.set(
                        Math.cos(angle) * coronetRadius,
                        1.36,
                        Math.sin(angle) * coronetRadius
                    );
                    ptMesh.castShadow = true;
                    group.add(ptMesh);
                }

                // Royal golden orb summit
                const orbMesh = new THREE.Mesh(this.getQueenOrbGeometry(), gold);
                orbMesh.position.y = 1.46;
                orbMesh.castShadow = true;
                group.add(orbMesh);
                break;
            }

            case 'k': { // King
                const bodyMesh = new THREE.Mesh(this.getKingBodyGeometry(), mat);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                group.add(bodyMesh);

                // 3D Beveled Cross Pattée Finial
                const crossMesh = new THREE.Mesh(this.getKingCrossGeometry(), gold);
                crossMesh.position.set(0, 1.78, 0);
                crossMesh.castShadow = true;
                crossMesh.receiveShadow = true;
                group.add(crossMesh);
                break;
            }
        }

        return group;
    }
}
