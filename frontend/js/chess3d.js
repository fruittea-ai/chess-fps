const Chess3D = {
    scene: null,
    camera: null,
    controls: null,
    boardTiles: [],
    pieceMeshes: [],
    tileMap: {},
    selectedOrigin: null,

    init(domElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080a10);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 11);

        this.controls = new THREE.OrbitControls(this.camera, domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2.1;

        // Lighting
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
        dirLight.position.set(5, 12, 5);
        this.scene.add(dirLight);

        // Generate Board 8x8
        const files = ['a','b','c','d','e','f','g','h'];
        const ranks = ['1','2','3','4','5','6','7','8'];
        const tileGeo = new THREE.BoxGeometry(1, 0.2, 1);

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const isDark = (r + f) % 2 === 1;
                const baseColor = isDark ? 0x070b14 : 0x1e2738;
                const tileMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.3, metalness: 0.8 });
                const tile = new THREE.Mesh(tileGeo, tileMat);
                tile.position.set(f - 3.5, -0.1, 3.5 - r);

                const sq = files[f] + ranks[r];
                tile.userData = { square: sq, baseColor: baseColor };
                this.scene.add(tile);
                this.boardTiles.push(tile);
                this.tileMap[sq] = tile;
            }
        }
    },

    highlightTile(sq, on) {
        const tile = this.tileMap[sq];
        if (!tile) return;
        tile.material.color.setHex(on ? 0x00f0ff : tile.userData.baseColor);
        tile.material.emissive.setHex(on ? 0x005577 : 0x000000);
    },

    renderFromFEN(fen) {
        this.pieceMeshes.forEach(mesh => this.scene.remove(mesh));
        this.pieceMeshes.length = 0;

        const rows = fen.split(" ")[0].split("/");
        for (let r = 0; r < 8; r++) {
            let fileIdx = 0;
            for (let char of rows[r]) {
                if (!isNaN(char)) {
                    fileIdx += parseInt(char);
                } else {
                    const isWhite = char === char.toUpperCase();
                    const pGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.8, 16);
                    const pMat = new THREE.MeshStandardMaterial({
                        color: isWhite ? 0xffffff : 0xff0055,
                        metalness: 0.6,
                        roughness: 0.2
                    });
                    const mesh = new THREE.Mesh(pGeo, pMat);
                    mesh.position.set(fileIdx - 3.5, 0.4, r - 3.5);
                    this.scene.add(mesh);
                    this.pieceMeshes.push(mesh);
                    fileIdx++;
                }
            }
        }
    },

    setPerspective(color) {
        if (color === "black") {
            this.camera.position.set(0, 10, -11);
            this.controls.target.set(0, 0, 0);
        }
    }
};