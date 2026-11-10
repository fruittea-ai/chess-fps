const FPSGame = {
    scene: null,
    camera: null,
    enemyMesh: null,
    enemyBody: null,
    isPointerLocked: false,
    keys: {},
    yaw: 0,
    pitch: 0,
    onShootCallback: null,
    onHitCallback: null,

    init(domElement, onShoot, onHit) {
        this.onShootCallback = onShoot;
        this.onHitCallback = onHit;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x030508);
        this.scene.fog = new THREE.FogExp2(0x030508, 0.035);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        const fpsLight = new THREE.PointLight(0x00f0ff, 2, 40);
        fpsLight.position.set(0, 5, 0);
        this.scene.add(fpsLight);

        // Floor
        const arenaFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(40, 40),
            new THREE.MeshStandardMaterial({ color: 0x101520, roughness: 0.5, metalness: 0.8 })
        );
        arenaFloor.rotation.x = -Math.PI / 2;
        this.scene.add(arenaFloor);

        // Pillars
        const pillarGeo = new THREE.BoxGeometry(2, 4, 2);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a2333, metalness: 0.7 });
        for (let [px, pz] of [[-5, -5], [5, 5], [-5, 5], [5, -5], [0, 0]]) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(px, 2, pz);
            this.scene.add(pillar);
        }

        // Enemy Mesh
        this.enemyMesh = new THREE.Group();
        this.enemyBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16),
            new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0x330011 })
        );
        this.enemyBody.position.y = 0.9;
        this.enemyMesh.add(this.enemyBody);
        this.enemyMesh.position.set(0, 0, -10);
        this.scene.add(this.enemyMesh);

        // Event Listeners
        document.addEventListener('keydown', (e) => this.keys[e.code] = true);
        document.addEventListener('keyup', (e) => this.keys[e.code] = false);

        domElement.addEventListener('click', () => {
            if (window.currentMode === "FPS" && !this.isPointerLocked) {
                domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === domElement);
            document.getElementById("fps-instructions").style.display = this.isPointerLocked ? "none" : "block";
        });

        document.addEventListener('mousemove', (e) => {
            if (window.currentMode !== "FPS" || !this.isPointerLocked) return;
            this.yaw -= e.movementX * 0.0025;
            this.pitch -= e.movementY * 0.0025;
            this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
        });

        window.addEventListener('mousedown', (e) => {
            if (window.currentMode !== "FPS" || !this.isPointerLocked || e.button !== 0) return;
            this.fire();
        });
    },

    fire() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObject(this.enemyBody);

        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const laserEnd = this.camera.position.clone().add(dir.multiplyScalar(30));

        this.createLaserBeam(this.camera.position.clone().add(new THREE.Vector3(0, -0.2, 0)), laserEnd, 0x00f0ff);

        if (this.onShootCallback) {
            this.onShootCallback(this.camera.position, laserEnd);
        }

        if (intersects.length > 0 && this.onHitCallback) {
            this.onHitCallback();
        }
    },

    createLaserBeam(from, to, color) {
        const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
        const mat = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
        const line = new THREE.Line(geom, mat);
        this.scene.add(line);
        setTimeout(() => this.scene.remove(line), 80);
    },

    enter(myColor, attacker) {
        document.getElementById("my-role").innerText = (myColor === attacker ? "ATTACKER" : "DEFENDER");
        document.getElementById("my-hp").style.width = "100%";
        document.getElementById("enemy-hp").style.width = "100%";

        if (myColor === attacker) {
            this.camera.position.set(0, 1.6, 12);
            this.yaw = 0; this.pitch = 0;
        } else {
            this.camera.position.set(0, 1.6, -12);
            this.yaw = Math.PI; this.pitch = 0;
        }
    },

    update(onSyncPos) {
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);

        const moveDir = new THREE.Vector3();
        if (this.keys['KeyW']) moveDir.z -= 1;
        if (this.keys['KeyS']) moveDir.z += 1;
        if (this.keys['KeyA']) moveDir.x -= 1;
        if (this.keys['KeyD']) moveDir.x += 1;
        moveDir.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

        this.camera.position.addScaledVector(forward, -moveDir.z * 0.12);
        this.camera.position.addScaledVector(right, moveDir.x * 0.12);

        this.camera.position.x = Math.max(-18, Math.min(18, this.camera.position.x));
        this.camera.position.z = Math.max(-18, Math.min(18, this.camera.position.z));
        this.camera.position.y = 1.6;

        if (onSyncPos) {
            onSyncPos(this.camera.position.x, this.camera.position.z);
        }
    }
};