import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class LowerDeckViz {
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

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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

        // Define Compartments (Static Geo data from previous visualizer)
        const COMP_GEOS = [
            { id: "C1", pos_x: -905, length: 295, h: 108, w_floor: 120, w_top: 247, obs: [{ l: 140, w: 72, h: 134, x_align: 'end', z_align: 'right', z_offset: 40 }] },
            { id: "C2", pos_x: -560, length: 560, h: 108, w_floor: 120, w_top: 247, obs: [{ l: 97, w: 70, h: 27, y_align: 'top', z_align: 'right', x_align: 'end' }] },
            { id: "C3", pos_x: 100, length: 440, h: 112, w_floor: 90, w_top: 247, obs: [] },
            { id: "C4", pos_x: 540, length: 608, h: 112, w_floor: 90, w_top: 247, obs: [{ l: 238, w: 72, h: 134, x_align: 'start', z_align: 'right', z_offset: 40 }] }
        ];

        COMP_GEOS.forEach(geo => {
            const group = new THREE.Group();
            group.position.x = geo.pos_x + (geo.length / 2);
            group.position.y = geo.h / 2;

            // Hull
            const hull = this.createHullMesh(geo.length, geo.w_floor, geo.w_top, geo.h);
            group.add(hull);

            // Obstacles
            geo.obs.forEach(o => {
                const obsMesh = this.createObstacle(o, geo);
                group.add(obsMesh);
            });

            // Boxes
            const resultComp = results.lowerDeck.flatMap(h => h.compartments).find(c => c.id === geo.id);
            if (resultComp) {
                let currentX = -(geo.length / 2);
                // Obstacle adjustments (simplified)
                if (geo.id === "C4") currentX += 238;

                resultComp.items.forEach(itemBatch => {
                    const bL = itemBatch.l || 50;
                    const bH = itemBatch.h || 50;
                    const bW = itemBatch.w || 50;

                    // Capacity calc
                    const colsZ = Math.floor(geo.w_floor / bW) || 1;
                    const rowsY = Math.floor(geo.h / bH) || 1;
                    const sliceCount = colsZ * rowsY;

                    for (let i = 0; i < itemBatch.count; i++) {
                        // Calculate relative position in current slice or new slice
                        const sliceIndex = i % sliceCount; // 0 to sliceCount-1
                        const longIndex = Math.floor(i / sliceCount); // 0, 1, 2...

                        // In Slice Position
                        const colZ = sliceIndex % colsZ;
                        const rowY = Math.floor(sliceIndex / colsZ);

                        const xPos = currentX + (longIndex * bL) + (bL / 2);
                        const yPos = -(geo.h / 2) + (rowY * bH) + (bH / 2);

                        // Centering Logic
                        const usedW = colsZ * bW;
                        const startOffset = (geo.w_floor - usedW) / 2;
                        const zPos = -(geo.w_floor / 2) + startOffset + (colZ * bW) + (bW / 2);

                        const box = this.createBox(bL, bH, bW);
                        box.position.set(xPos, yPos, zPos);
                        group.add(box);
                    }
                    // Advance X for next batch
                    const totalSlices = Math.ceil(itemBatch.count / sliceCount);
                    currentX += totalSlices * bL + 5; // Gap
                });
            }

            this.scene.add(group);
        });
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
