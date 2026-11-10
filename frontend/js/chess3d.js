const Chess3D = {
  scene: null,
  camera: null,
  controls: null,
  boardTiles: [],
  pieceMeshes: [],
  tileMap: {},
  selectedOrigin: null,

  // Tempat menyimpan 12 template model 3D
  models: {},
  isLoaded: false,

  init(domElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080a10);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 11);

    this.controls = new THREE.OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.1;

    // Pencahayaan
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    dirLight.position.set(5, 12, 5);
    this.scene.add(dirLight);

    // Buat Grid Papan Catur 8x8
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];
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

    // Muat seluruh aset model GLB
    this.loadPieceModels();
  },

  loadPieceModels() {
    const loader = new THREE.GLTFLoader();
    const colors = ["white", "black"];
    const types = ["pawn", "rook", "knight", "bishop", "queen", "king"];

    let totalModels = colors.length * types.length; // 12 model
    let loadedCount = 0;

    colors.forEach((color) => {
      types.forEach((type) => {
        const modelKey = `${color}_${type}`;
        const filePath = `assets/models/${modelKey}.glb`;

        loader.load(
          filePath,
          (gltf) => {
            const model = gltf.scene;

            // Skalakan ukuran model agar proporsional di petak 1x1
            model.scale.set(1.1, 1.1, 1.1);

            // Aktifkan bayangan mesh
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            this.models[modelKey] = model;
            loadedCount++;

            if (loadedCount === totalModels) {
              this.isLoaded = true;
              if (window.currentFEN) {
                this.renderFromFEN(window.currentFEN);
              }
            }
          },
          undefined,
          (err) => {
            console.warn(`Gagal memuat ${filePath}, menggunakan fallback.`);
          },
        );
      });
    });
  },

  highlightTile(sq, on) {
    const tile = this.tileMap[sq];
    if (!tile) return;
    tile.material.color.setHex(on ? 0x00f0ff : tile.userData.baseColor);
    tile.material.emissive.setHex(on ? 0x005577 : 0x000000);
  },

  renderFromFEN(fen) {
    window.currentFEN = fen;
    this.pieceMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.pieceMeshes.length = 0;

    const pieceTypeMap = {
      p: "pawn",
      r: "rook",
      n: "knight",
      b: "bishop",
      q: "queen",
      k: "king",
    };

    const rows = fen.split(" ")[0].split("/");
    for (let r = 0; r < 8; r++) {
      let fileIdx = 0;
      for (let char of rows[r]) {
        if (!isNaN(char)) {
          fileIdx += parseInt(char);
        } else {
          const isWhite = char === char.toUpperCase();
          const colorPrefix = isWhite ? "white" : "black";
          const typeName = pieceTypeMap[char.toLowerCase()];
          const modelKey = `${colorPrefix}_${typeName}`;

          let pieceObj;

          // Gunakan model 3D GLB jika sudah selesai di-load
          if (this.models[modelKey]) {
            pieceObj = this.models[modelKey].clone();

            // Hadapkan kuda hitam ke arah sebaliknya agar kedua kuda saling berhadapan
            if (typeName === "knight" && !isWhite) {
              pieceObj.rotation.y = Math.PI;
            }
          } else {
            // Fallback bentuk geometri sederhana jika file GLB belum siap
            pieceObj = this.createFallbackPiece(typeName, isWhite);
          }

          pieceObj.position.set(fileIdx - 3.5, 0.1, r - 3.5);
          this.scene.add(pieceObj);
          this.pieceMeshes.push(pieceObj);
          fileIdx++;
        }
      }
    }
  },

  createFallbackPiece(type, isWhite) {
    const color = isWhite ? 0xffffff : 0xff0055;
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.2 });
    let geo;

    switch (type) {
      case "pawn":
        geo = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 12);
        break;
      case "rook":
        geo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
        break;
      case "knight":
        geo = new THREE.ConeGeometry(0.35, 0.9, 5);
        break;
      case "bishop":
        geo = new THREE.ConeGeometry(0.3, 1.0, 16);
        break;
      case "queen":
        geo = new THREE.CylinderGeometry(0.35, 0.2, 1.2, 8);
        break;
      case "king":
        geo = new THREE.CylinderGeometry(0.4, 0.4, 1.3, 16);
        break;
      default:
        geo = new THREE.CylinderGeometry(0.28, 0.38, 0.8, 16);
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.4;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  },

  setPerspective(color) {
    if (color === "black") {
      this.camera.position.set(0, 10, -11);
      this.controls.target.set(0, 0, 0);
    }
  },
};
