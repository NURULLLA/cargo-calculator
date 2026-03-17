import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class MainDeckViz {
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

        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 500;

        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
        this.camera.position.set(0, 1500, 3000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight.position.set(1000, 2000, 1000);
        this.scene.add(dirLight);

        const grid = new THREE.GridHelper(5000, 50, 0x334155, 0x1e293b);
        grid.position.y = -50;
        this.scene.add(grid);

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    onResize() {
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
        // Clear previous
        this.scene.children = this.scene.children.filter(c => c.type !== 'Group');

        if (!results || !results.pallets) return;

        const gap = 40; // Gap between pallets
        let currentX = -(results.pallets.length * 250) / 2;

        results.pallets.forEach(p => {
            const group = new THREE.Group();
            group.position.x = currentX;

            // Pallet Base
            const baseGeom = new THREE.BoxGeometry(p.config.width_long, 5, p.config.length_cross);
            const baseMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
            const baseMesh = new THREE.Mesh(baseGeom, baseMat);
            group.add(baseMesh);

            // Layers
            p.layers.forEach(layer => {
                const layerY = layer.z_start + (layer.height / 2);

                // New logic utilizing packer.js dim_cross (Z) and dim_long (X)
                // If dimensions are missing (old packer version), fallback to block
                if (!layer.dim_cross || !layer.dim_long) {
                    const lGeom = new THREE.BoxGeometry(p.config.width_long * 0.95, layer.height, p.config.length_cross * 0.9);
                    const lMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
                    const lMesh = new THREE.Mesh(lGeom, lMat);
                    lMesh.position.y = layerY + 2.5;
                    const edges = new THREE.EdgesGeometry(lGeom);
                    lMesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x0369a1 })));
                    group.add(lMesh);
                    return;
                }

                const dimZ = layer.dim_cross;
                const dimX = layer.dim_long;
                const colsZ = layer.meta.main.r; // Items along Z
                const rowsX = layer.meta.main.c; // Items along X

                const paletteWidthZ = p.config.length_cross;
                const paletteLengthX = p.config.width_long;

                const startZ = -(paletteWidthZ / 2);
                const startX = -(paletteLengthX / 2);

                const boxGeom = new THREE.BoxGeometry(dimX - 1, layer.height - 1, dimZ - 1);
                const boxMat = new THREE.MeshLambertMaterial({ color: 0x0ea5e9 });
                const boxEdges = new THREE.EdgesGeometry(boxGeom);
                const edgeMat = new THREE.LineBasicMaterial({ color: 0x0c4a6e });

                // Draw Main Block
                for (let r = 0; r < rowsX; r++) {
                    for (let c = 0; c < colsZ; c++) {
                        const mesh = new THREE.Mesh(boxGeom, boxMat.clone());
                        mesh.add(new THREE.LineSegments(boxEdges, edgeMat));

                        const posX = startX + (r * dimX) + (dimX / 2);
                        const posZ = startZ + (c * dimZ) + (dimZ / 2);

                        mesh.position.set(posX, layerY + 2.5, posZ);
                        group.add(mesh);
                    }
                }

                // Draw Side Block (if exists)
                if (layer.meta.side) {
                    // Logic from packer.js:
                    // remCross = availCross - (cols * dimCross)
                    // sCols = floor(remCross / dimLong)  -> Items along Z (but using 'long' dim) ??
                    // sRows = floor(availLong / dimCross) -> Items along X (but using 'cross' dim) ??

                    // Actually, let's look at tryOrientation again:
                    // if (remCross >= dimLong && availLong >= dimCross) ...
                    // Side block is rotated 90 degrees?
                    // Usually side block fills the remaining width (Z).
                    // So items in side block are rotated relative to main block?
                    // Main: dimCross (Z), dimLong (X)
                    // Side: uses dimLong for fit in Z, dimCross for fit in X ??
                    // Packer: sCols = floor(remCross / dimLong) -> fit dimLongs into remaining Z.
                    // So Side Item Z-dim = dimLong. Side Item X-dim = dimCross.
                    // Yes, rotated.

                    const sDimZ = dimX; // dimLong
                    const sDimX = dimZ; // dimCross
                    const sColsZ = layer.meta.side.r;
                    const sRowsX = layer.meta.side.c;

                    const sideStartZ = startZ + (colsZ * dimZ);
                    // Side block starts after the main block in Z axis

                    const sBoxGeom = new THREE.BoxGeometry(sDimX - 1, layer.height - 1, sDimZ - 1);
                    const sBoxEdges = new THREE.EdgesGeometry(sBoxGeom);

                    for (let r = 0; r < sRowsX; r++) {
                        for (let c = 0; c < sColsZ; c++) {
                            const mesh = new THREE.Mesh(sBoxGeom, boxMat.clone());
                            mesh.add(new THREE.LineSegments(sBoxEdges, edgeMat));

                            const posX = startX + (r * sDimX) + (sDimX / 2);
                            const posZ = sideStartZ + (c * sDimZ) + (sDimZ / 2);

                            mesh.position.set(posX, layerY + 2.5, posZ);
                            group.add(mesh);
                        }
                    }
                }
            });

            this.scene.add(group);
            currentX += p.config.width_long + gap;
        });
    }
}
