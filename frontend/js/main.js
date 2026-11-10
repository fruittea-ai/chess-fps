const API_URL = "http://127.0.0.1:8000";
let socket = null;
let myColor = null;
let currentTurn = "white";
let roomId = null;
let playerId = null;
let battleInterval = null;
let currentFEN = "";
window.currentMode = "CHESS";

// Sistem Notifikasi In-Game (Menggantikan Alert)
function showToast(message, type = "info") {
    const container = document.getElementById("notification-box");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "ℹ️";
    if (type === "error") icon = "⚠️";
    if (type === "success") icon = "✅";

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// Inisialisasi Renderer
const container = document.getElementById("canvas-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Inisialisasi Modul 3D
Chess3D.init(renderer.domElement);

FPSGame.init(
    renderer.domElement,
    (origin, target) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: "fps_shoot", origin, target }));
        }
    },
    () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: "fps_hit" }));
        }
    }
);

// Pembaca bidak pada petak tertentu berdasarkan FEN
function getPieceAtSquare(sq) {
    if (!currentFEN) return null;
    const file = sq.charCodeAt(0) - 97; // 'a' -> 0
    const rank = parseInt(sq[1]) - 1;   // '1' -> 0
    const rows = currentFEN.split(" ")[0].split("/");
    const rowStr = rows[7 - rank];

    let currentFile = 0;
    for (let ch of rowStr) {
        if (!isNaN(ch)) {
            currentFile += parseInt(ch);
        } else {
            if (currentFile === file) {
                const isWhite = (ch === ch.toUpperCase());
                return { piece: ch, color: isWhite ? "white" : "black" };
            }
            currentFile++;
        }
    }
    return null;
}

// Logika Klik Papan yang Lebih Cerdas & Pemaaf
const raycasterChess = new THREE.Raycaster();
const mouseChess = new THREE.Vector2();

window.addEventListener('click', (event) => {
    if (window.currentMode !== "CHESS") return;
    if (event.clientX < 340 && event.clientY < 320) return; // Abaikan area menu UI
    
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    if (myColor !== currentTurn) {
        showToast("Tunggu giliran lawan selesai melangkah.", "error");
        return;
    }

    mouseChess.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseChess.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycasterChess.setFromCamera(mouseChess, Chess3D.camera);

    const intersects = raycasterChess.intersectObjects(Chess3D.boardTiles);
    if (intersects.length > 0) {
        const clickedSq = intersects[0].object.userData.square;
        const pieceOnClicked = getPieceAtSquare(clickedSq);

        // Jika belum ada bidak yang dipilih
        if (!Chess3D.selectedOrigin) {
            if (!pieceOnClicked) return; // Klik petak kosong diabaikan
            if (pieceOnClicked.color !== myColor) {
                showToast("Itu bukan bidak milik Anda!", "error");
                return;
            }
            Chess3D.selectedOrigin = clickedSq;
            Chess3D.highlightTile(clickedSq, true);
            document.getElementById("selected-square").innerText = clickedSq + " -> ...";
        } 
        // Jika sudah ada bidak yang dipilih sebelumnya
        else {
            // Kasus 1: Klik petak yang sama -> Batalkan pilihan
            if (Chess3D.selectedOrigin === clickedSq) {
                Chess3D.highlightTile(Chess3D.selectedOrigin, false);
                Chess3D.selectedOrigin = null;
                document.getElementById("selected-square").innerText = "-";
                return;
            }

            // Kasus 2: Klik bidak lain yang juga milik sendiri -> Ganti target pilihan tanpa error
            if (pieceOnClicked && pieceOnClicked.color === myColor) {
                Chess3D.highlightTile(Chess3D.selectedOrigin, false);
                Chess3D.selectedOrigin = clickedSq;
                Chess3D.highlightTile(clickedSq, true);
                document.getElementById("selected-square").innerText = clickedSq + " -> ...";
                return;
            }

            // Kasus 3: Memindahkan bidak ke petak tujuan
            const origin = Chess3D.selectedOrigin;
            Chess3D.highlightTile(origin, false);
            Chess3D.selectedOrigin = null;
            document.getElementById("selected-square").innerText = "-";
            sendMove(origin + clickedSq);
        }
    }
});

// WebSocket Connection & Messages
function connectWS(rId, pId) {
    socket = new WebSocket(`ws://127.0.0.1:8000/ws/${rId}/${pId}`);

    socket.onopen = () => {
        document.getElementById("status-text").innerText = "Tersambung ke Room";
        showToast("Terhubung ke server multiplayer.", "success");
    };

    socket.onerror = () => {
        showToast("Gagal tersambung ke jaringan WebSocket.", "error");
    };

    socket.onclose = () => {
        document.getElementById("status-text").innerText = "Terputus";
        showToast("Koneksi ke room terputus.", "error");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "INIT_STATE") {
            myColor = data.color;
            currentTurn = data.turn;
            currentFEN = data.fen;
            document.getElementById("player-color").innerText = myColor.toUpperCase();
            document.getElementById("turn-text").innerText = currentTurn.toUpperCase();
            Chess3D.setPerspective(myColor);
            Chess3D.renderFromFEN(data.fen);
        } 
        else if (data.type === "PLAYER_JOINED") {
            if (data.message) showToast(data.message, "info");
            document.getElementById("status-text").innerText = "Pertandingan Aktif";
        }
        else if (data.type === "MOVE_MADE") {
            currentTurn = data.turn;
            currentFEN = data.fen;
            document.getElementById("turn-text").innerText = currentTurn.toUpperCase();
            Chess3D.renderFromFEN(data.fen);

            if (data.is_checkmate) {
                showToast("SKAKMAT! Permainan catur selesai.", "success");
            }
        } 
        else if (data.type === "START_FPS_BATTLE") {
            window.currentMode = "FPS";
            document.getElementById("ui-layer").style.display = "none";
            document.getElementById("fps-hud").style.display = "block";
            FPSGame.enter(myColor, data.attacker);

            let timeLeft = data.duration || 45;
            const timerElem = document.getElementById("fps-timer");
            timerElem.innerText = timeLeft + "s";
            
            clearInterval(battleInterval);
            battleInterval = setInterval(() => {
                timeLeft--;
                if (timeLeft >= 0) {
                    timerElem.innerText = timeLeft + "s";
                } else {
                    clearInterval(battleInterval);
                }
            }, 1000);

            showToast("BATTLE MEMULAI! Kalahkan musuh untuk merebut bidak.", "info");
        }
        else if (data.type === "ENEMY_POS") {
            FPSGame.enemyMesh.position.set(data.pos.x, 0, data.pos.z);
        }
        else if (data.type === "ENEMY_SHOOT") {
            FPSGame.createLaserBeam(data.origin, data.target, 0xff0055);
        }
        else if (data.type === "HP_UPDATE") {
            const myHpVal = data.hp[myColor];
            const oppColor = myColor === "white" ? "black" : "white";
            document.getElementById("my-hp").style.width = myHpVal + "%";
            document.getElementById("enemy-hp").style.width = data.hp[oppColor] + "%";
        }
        else if (data.type === "BATTLE_END") {
            clearInterval(battleInterval);
            if (document.exitPointerLock) document.exitPointerLock();
            window.currentMode = "CHESS";
            document.getElementById("fps-hud").style.display = "none";
            document.getElementById("ui-layer").style.display = "block";

            currentTurn = data.turn;
            currentFEN = data.fen;
            document.getElementById("turn-text").innerText = currentTurn.toUpperCase();
            Chess3D.renderFromFEN(data.fen);
            showToast(data.message, "success");
        }
        else if (data.type === "PLAYER_LEFT") {
            showToast(data.message, "error");
        }
        else if (data.type === "ERROR") {
            showToast(data.message, "error");
        }
    };
}

function sendMove(uci) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: "move", move: uci }));
    }
}

// UI Buttons dengan Error Handling Jaringan
document.getElementById("btn-create").addEventListener("click", async () => {
    try {
        const res = await fetch(`${API_URL}/rooms`, { method: "POST" });
        if (!res.ok) throw new Error("Gagal membuat room di server.");
        const data = await res.json();
        roomId = data.room_id;
        playerId = data.player_id;
        document.getElementById("room-code-input").value = roomId;
        connectWS(roomId, playerId);
    } catch (err) {
        showToast("Server backend offline atau tidak terjangkau.", "error");
    }
});

document.getElementById("btn-join").addEventListener("click", async () => {
    const code = document.getElementById("room-code-input").value.trim();
    if (!code) {
        showToast("Masukkan kode room terlebih dahulu!", "error");
        return;
    }
    try {
        const res = await fetch(`${API_URL}/rooms/${code}/join`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.detail || "Room tidak ditemukan.", "error");
            return;
        }
        roomId = data.room_id;
        playerId = data.player_id;
        connectWS(roomId, playerId);
    } catch (err) {
        showToast("Gagal menghubungi server backend.", "error");
    }
});

// Render Loop
let lastSyncTime = 0;

function animate(timestamp) {
    requestAnimationFrame(animate);

    if (window.currentMode === "CHESS") {
        Chess3D.controls.update();
        renderer.render(Chess3D.scene, Chess3D.camera);
    } else {
        FPSGame.update((posX, posZ) => {
            if (timestamp - lastSyncTime > 50) {
                lastSyncTime = timestamp;
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        action: "fps_pos",
                        pos: { x: posX, z: posZ }
                    }));
                }
            }
        });
        renderer.render(FPSGame.scene, FPSGame.camera);
    }
}
animate(0);

window.addEventListener('resize', () => {
    Chess3D.camera.aspect = window.innerWidth / window.innerHeight;
    Chess3D.camera.updateProjectionMatrix();
    FPSGame.camera.aspect = window.innerWidth / window.innerHeight;
    FPSGame.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});