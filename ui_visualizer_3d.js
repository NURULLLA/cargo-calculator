// import * as THREE from 'three';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class LowerDeckViz {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);
        this.scene.fog = new THREE.Fog(0x0f172a, 1000, 4000);

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
        this.camera.position.set(0, 800, 1500);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        const ambLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(500, 1000, 500);
        this.scene.add(dirLight);

        const grid = new THREE.GridHelper(4000, 40, 0x334155, 0x1e293b);
        grid.position.y = -50;
        this.scene.add(grid);

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    onResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    update(results) {
        // Clear old groups
        this.scene.children = this.scene.children.filter(c => c.type !== 'Group');

        // Define Compartments with usable dimensions for cargo placement
        // NOTE: C4 has a 238cm structural obstacle at the START (nose side),
        // so cargo only fits in the remaining space: 608 - 238 = 370 cm
        const COMP_GEOS = [
            {
                id: "C1", pos_x: -905, length: 295, h: 108, w_floor: 120, w_top: 247,
                // Obstacle at END (tail side), so cargo fills from start
                cargo_start_offset: 0, cargo_usable_length: 295 - 140,
                obs: [{ l: 140, w: 72, h: 134, x_align: 'end', z_align: 'right', z_offset: 40 }]
            },
            {
                id: "C2", pos_x: -560, length: 560, h: 108, w_floor: 120, w_top: 247,
                cargo_start_offset: 0, cargo_usable_length: 560,
                obs: [{ l: 97, w: 70, h: 27, y_align: 'top', z_align: 'right', x_align: 'end' }]
            },
            {
                id: "C3", pos_x: 100, length: 440, h: 112, w_floor: 90, w_top: 247,
                cargo_start_offset: 0, cargo_usable_length: 440,
                obs: []
            },
            {
                id: "C4", pos_x: 540, length: 608, h: 112, w_floor: 90, w_top: 247,
                // Obstacle is 238cm at START (nose side) — cargo starts AFTER it
                cargo_start_offset: 238, cargo_usable_length: 608 - 238,
                obs: [{ l: 238, w: 72, h: 134, x_align: 'start', z_align: 'right', z_offset: 40 }],
                tech_kit: true  // Reserved 300kg tech kit (spare wheels + jack)
            }
        ];

        COMP_GEOS.forEach(geo => {
            const group = new THREE.Group();
            group.position.x = geo.pos_x + (geo.length / 2);
            group.position.y = geo.h / 2;

            // Hull
            const hull = this.createHullMesh(geo.length, geo.w_floor, geo.w_top, geo.h);
            group.add(hull);

            // Obstacles (structural blocks)
            geo.obs.forEach(o => {
                const obsMesh = this.createObstacle(o, geo);
                group.add(obsMesh);
            });

            // Tech kit visual block for C4 — represents the 300 kg spare wheels + jack
            if (geo.tech_kit) {
                const tkW = 80, tkH = 60, tkL = 180;
                const tkGeom = new THREE.BoxGeometry(tkL, tkH, tkW);
                const tkMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
                const tkMesh = new THREE.Mesh(tkGeom, tkMat);
                // Place at end of compartment (tail side), on the floor
                tkMesh.position.set(
                    (geo.length / 2) - (tkL / 2) - 5,  // near tail end
                    -(geo.h / 2) + (tkH / 2),           // on floor
                    0
                );
                // Orange edges
                const tkEdges = new THREE.EdgesGeometry(tkGeom);
                const tkLine = new THREE.LineSegments(tkEdges, new THREE.LineBasicMaterial({ color: 0xfbbf24 }));
                tkMesh.add(tkLine);
                group.add(tkMesh);

                // Canvas label "Tech Kit 300kg"
                const tkLabel = this._makeTextSprite('Tech Kit 300 kg', '#fbbf24');
                tkLabel.position.set(
                    (geo.length / 2) - (tkL / 2) - 5,
                    -(geo.h / 2) + tkH + 30,
                    0
                );
                tkLabel.scale.set(200, 80, 1);
                group.add(tkLabel);
            }

            // Boxes — placed in the usable zone only
            const resultComp = results.lowerDeck.flatMap(h => h.compartments).find(c => c.id === geo.id);
            if (resultComp) {
                // startX is relative to the group center (which is at geo.pos_x + length/2)
                // Group local X=0 is the center of the compartment
                // So local X range: [-length/2 .. +length/2]
                const usableStart = -(geo.length / 2) + geo.cargo_start_offset;
                const usableEnd   = usableStart + geo.cargo_usable_length;

                let curX = 0; // offset from usableStart
                let curY = 0;
                let curZ = 0;
                let rowMaxH = 0;
                let sliceMaxL = 0;

                resultComp.items.forEach(itemBatch => {
                    const bL = itemBatch.l || 50;
                    const bH = itemBatch.h || 50;
                    const bW = itemBatch.w || 50;

                    for (let i = 0; i < itemBatch.count; i++) {
                        // Advance Z (width) row
                        if (curZ + bW > geo.w_floor) {
                            curZ = 0;
                            curY += rowMaxH + 2;
                            rowMaxH = 0;
                        }
                        // Advance Y (height) — new X slice
                        if (curY + bH > geo.h) {
                            curY = 0;
                            curZ = 0;
                            curX += sliceMaxL + 5;
                            sliceMaxL = 0;
                            rowMaxH = 0;
                        }
                        // BOUNDARY CLAMP: never place boxes beyond usable length
                        if (usableStart + curX + bL > usableEnd) break;

                        const xPos = usableStart + curX + (bL / 2);
                        const yPos = -(geo.h / 2) + curY + (bH / 2);
                        const zPos = -(geo.w_floor / 2) + curZ + (bW / 2);

                        const box = this.createBox(bL, bH, bW);
                        box.position.set(xPos, yPos, zPos);
                        group.add(box);

                        curZ += bW + 2;
                        if (bH > rowMaxH) rowMaxH = bH;
                        if (bL > sliceMaxL) sliceMaxL = bL;
                    }
                });
            }

            this.scene.add(group);
        });

        this.addIndicators();
    }

    _makeTextSprite(text, color) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512; canvas.height = 128;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color;
        ctx.font = 'bold 52px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        return new THREE.Sprite(mat);
    }

    addIndicators() {
        // Create canvas for text
        const createTextLabel = (text, color) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 128;
            ctx.fillStyle = color;
            ctx.font = 'bold 80px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 128, 64);

            const texture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(400, 200, 1);
            return sprite;
        };

        const nose = createTextLabel('NOSE', '#38bdf8');
        nose.position.set(-1100, 200, 0); // Front of plane (negative X)
        this.scene.add(nose);

        const tail = createTextLabel('TAIL', '#f43f5e');
        tail.position.set(1300, 200, 0); // Back of plane (positive X)
        this.scene.add(tail);

        // Add arrows
        const arrowHelperNose = new THREE.ArrowHelper(
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(-950, 200, 0),
            100,
            0x38bdf8
        );
        this.scene.add(arrowHelperNose);

        const arrowHelperTail = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(1150, 200, 0),
            100,
            0xf43f5e
        );
        this.scene.add(arrowHelperTail);
    }

    createHullMesh(l, wf, wt, h) {
        const shape = new THREE.Shape();
        shape.moveTo(-wf / 2, 0);
        shape.lineTo(wf / 2, 0);
        shape.bezierCurveTo(wf / 2 + 20, h * 0.3, wt / 2, h * 0.8, wt / 2, h);
        shape.lineTo(-wt / 2, h);
        shape.bezierCurveTo(-wt / 2, h * 0.8, -wf / 2 - 20, h * 0.3, -wf / 2, 0);

        const geom = new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false });
        geom.center();
        geom.rotateY(Math.PI / 2);

        const mat = new THREE.MeshPhongMaterial({ color: 0x334155, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        return new THREE.Mesh(geom, mat);
    }

    createObstacle(o, geo) {
        const geom = new THREE.BoxGeometry(o.l, o.h, o.w);
        const mat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
        const mesh = new THREE.Mesh(geom, mat);

        let lx = 0, ly = 0, lz = 0;
        if (o.x_align === 'end') lx = (geo.length / 2) - (o.l / 2);
        else if (o.x_align === 'start') lx = -(geo.length / 2) + (o.l / 2);
        else lx = -(geo.length / 2) + (o.l / 2);

        if (o.y_align === 'top') ly = (geo.h / 2) - (o.h / 2);
        else ly = -(geo.h / 2) + (o.h / 2);

        if (o.z_align === 'right') lz = 60 - (o.w / 2);
        else if (o.z_align === 'left') lz = -60 + (o.w / 2);
        if (o.z_offset) lz += o.z_offset;

        mesh.position.set(lx, ly, lz);
        return mesh;
    }

    createBox(l, h, w) {
        const geom = new THREE.BoxGeometry(l, h, w);
        const mat = new THREE.MeshLambertMaterial({ color: 0x22c55e });
        const mesh = new THREE.Mesh(geom, mat);
        // Position will be set by caller

        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x14532d }));
        mesh.add(line);
        return mesh;
    }
}
