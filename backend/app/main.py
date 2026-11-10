import uuid
import asyncio
import chess
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict

app = FastAPI(title="3D Chess FPS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms: Dict[str, dict] = {}

class RoomResponse(BaseModel):
    room_id: str
    player_id: str
    color: str

@app.get("/")
def read_root():
    return {"name": "3D Chess FPS API", "status": "running"}

@app.post("/rooms", response_model=RoomResponse)
def create_room():
    room_id = str(uuid.uuid4())[:6].upper()
    player_id = str(uuid.uuid4())[:8]
    
    rooms[room_id] = {
        "board": chess.Board(),
        "players": {player_id: "white"},
        "connections": {},
        "status": "waiting",
        "battle": None
    }
    return RoomResponse(room_id=room_id, player_id=player_id, color="white")

@app.post("/rooms/{room_id}/join", response_model=RoomResponse)
def join_room(room_id: str):
    room_id = room_id.upper()
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room tidak ditemukan!")
    
    room = rooms[room_id]
    if len(room["players"]) >= 2:
        raise HTTPException(status_code=400, detail="Room sudah penuh!")
    
    player_id = str(uuid.uuid4())[:8]
    room["players"][player_id] = "black"
    room["status"] = "playing"
    
    return RoomResponse(room_id=room_id, player_id=player_id, color="black")

async def battle_timeout_task(room_id: str, battle_id: str, duration: int = 45):
    await asyncio.sleep(duration)
    room = rooms.get(room_id)
    if not room or not room.get("battle") or room["battle"].get("id") != battle_id:
        return

    battle = room["battle"]
    board: chess.Board = room["board"]
    attacker = battle["attacker"]
    defender = battle["defender"]
    hp_attacker = battle["hp"][attacker]
    hp_defender = battle["hp"][defender]

    if hp_attacker > hp_defender:
        winner = attacker
        board.push(battle["pending_move"])
        result_msg = f"Waktu habis! Attacker ({winner.upper()}) menang dengan HP {hp_attacker} vs {hp_defender}."
    else:
        winner = defender
        board.push(chess.Move.null())
        result_msg = f"Waktu habis! Defender ({winner.upper()}) berhasil bertahan."

    room["battle"] = None
    next_turn = "white" if board.turn == chess.WHITE else "black"

    for pid, conn in room["connections"].items():
        await conn.send_json({
            "type": "BATTLE_END",
            "winner": winner,
            "message": result_msg,
            "fen": board.fen(),
            "turn": next_turn
        })

@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    room_id = room_id.upper()
    if room_id not in rooms or player_id not in rooms[room_id]["players"]:
        await websocket.close(code=4003)
        return

    await websocket.accept()
    room = rooms[room_id]
    room["connections"][player_id] = websocket
    board: chess.Board = room["board"]
    player_color = room["players"][player_id]

    await websocket.send_json({
        "type": "INIT_STATE",
        "fen": board.fen(),
        "color": player_color,
        "turn": "white" if board.turn == chess.WHITE else "black",
        "status": room["status"]
    })

    for pid, conn in room["connections"].items():
        if pid != player_id:
            await conn.send_json({
                "type": "PLAYER_JOINED",
                "color": player_color,
                "status": room["status"],
                "message": f"Pemain ({player_color.upper()}) telah bergabung ke arena."
            })

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "move":
                if room.get("battle"):
                    await websocket.send_json({"type": "ERROR", "message": "Duel FPS sedang berlangsung!"})
                    continue

                uci_move = data.get("move")
                current_turn = "white" if board.turn == chess.WHITE else "black"
                if current_turn != player_color:
                    await websocket.send_json({"type": "ERROR", "message": "Bukan giliran Anda!"})
                    continue

                # Dukung auto-promosi ke Queen jika pion mencapai petak akhir
                if len(uci_move) == 4:
                    from_sq = chess.parse_square(uci_move[:2])
                    piece = board.piece_at(from_sq)
                    if piece and piece.piece_type == chess.PAWN:
                        to_rank = uci_move[3]
                        if (piece.color == chess.WHITE and to_rank == '8') or (piece.color == chess.BLACK and to_rank == '1'):
                            uci_move += 'q'

                try:
                    move = chess.Move.from_uci(uci_move)
                except ValueError:
                    await websocket.send_json({"type": "ERROR", "message": "Langkah tidak dikenali."})
                    continue

                if move not in board.legal_moves:
                    await websocket.send_json({"type": "ERROR", "message": "Langkah tidak legal menurut aturan catur!"})
                    continue

                if board.is_capture(move):
                    defender = "black" if player_color == "white" else "white"
                    battle_id = str(uuid.uuid4())
                    room["battle"] = {
                        "id": battle_id,
                        "attacker": player_color,
                        "defender": defender,
                        "pending_move": move,
                        "hp": {"white": 100, "black": 100}
                    }

                    asyncio.create_task(battle_timeout_task(room_id, battle_id, 45))

                    for pid, conn in room["connections"].items():
                        await conn.send_json({
                            "type": "START_FPS_BATTLE",
                            "attacker": player_color,
                            "defender": defender,
                            "duration": 45
                        })
                else:
                    board.push(move)
                    next_turn = "white" if board.turn == chess.WHITE else "black"
                    for pid, conn in room["connections"].items():
                        await conn.send_json({
                            "type": "MOVE_MADE",
                            "fen": board.fen(),
                            "turn": next_turn,
                            "is_checkmate": board.is_checkmate(),
                            "is_stalemate": board.is_stalemate()
                        })

            elif action == "fps_pos":
                for pid, conn in room["connections"].items():
                    if pid != player_id:
                        await conn.send_json({
                            "type": "ENEMY_POS",
                            "pos": data.get("pos")
                        })

            elif action == "fps_shoot":
                for pid, conn in room["connections"].items():
                    if pid != player_id:
                        await conn.send_json({
                            "type": "ENEMY_SHOOT",
                            "origin": data.get("origin"),
                            "target": data.get("target")
                        })

            elif action == "fps_hit":
                battle = room.get("battle")
                if not battle:
                    continue

                target_color = "black" if player_color == "white" else "white"
                battle["hp"][target_color] = max(0, battle["hp"][target_color] - 25)

                for pid, conn in room["connections"].items():
                    await conn.send_json({
                        "type": "HP_UPDATE",
                        "hp": battle["hp"]
                    })

                if battle["hp"][target_color] <= 0:
                    winner = player_color
                    attacker = battle["attacker"]
                    pending_move = battle["pending_move"]

                    if winner == attacker:
                        board.push(pending_move)
                        result_msg = f"Attacker ({winner.upper()}) menang duel! Bidak lawan dimakan."
                    else:
                        board.push(chess.Move.null())
                        result_msg = f"Defender ({winner.upper()}) bertahan! Langkah capture dibatalkan."

                    room["battle"] = None
                    next_turn = "white" if board.turn == chess.WHITE else "black"

                    for pid, conn in room["connections"].items():
                        await conn.send_json({
                            "type": "BATTLE_END",
                            "winner": winner,
                            "message": result_msg,
                            "fen": board.fen(),
                            "turn": next_turn
                        })

    except WebSocketDisconnect:
        if player_id in room["connections"]:
            del room["connections"][player_id]

        # Jika lawan disconnect saat battle FPS berlangsung, batalkan battle dan selamatkan pemain yang tersisa
        if room.get("battle"):
            survivor_color = "black" if player_color == "white" else "white"
            board.push(chess.Move.null())
            room["battle"] = None
            next_turn = "white" if board.turn == chess.WHITE else "black"
            
            for pid, conn in room["connections"].items():
                await conn.send_json({
                    "type": "BATTLE_END",
                    "winner": survivor_color,
                    "message": f"Lawan ({player_color.upper()}) disconnect saat duel. Duel dibatalkan.",
                    "fen": board.fen(),
                    "turn": next_turn
                })

        for pid, conn in room["connections"].items():
            await conn.send_json({
                "type": "PLAYER_LEFT",
                "message": f"Pemain ({player_color.upper()}) telah keluar dari room."
            })