import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static("public"));

const rooms = {}; // { roomId: { players: [], assignments: [] } }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  // Crear sala
  socket.on("createRoom", (cb) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms[roomId] = { players: [], assignments: [] };
    cb(roomId);
  });

  // Unirse a sala
  socket.on("joinRoom", ({ roomId, playerName }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ error: "❌ Sala no existe" });

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    io.to(roomId).emit("updatePlayers", room.players.map(p => p.name));
    cb({ success: true });
  });

  // Iniciar juego
  socket.on("startGame", ({ roomId, champions }) => {
    const room = rooms[roomId];
    if (!room) return;

    let players = shuffle([...room.players]);
    let champs = shuffle([...champions]);

    // Elegir 1 campeón que será el mismo para todos los no impostores
    const chosenChampion = champs[0];

    // Asignar roles
    room.assignments = players.map((p) => ({
      ...p,
      champion: chosenChampion,
      impostor: false,
    }));

    // Elegir impostor
    const impostorIndex = Math.floor(Math.random() * room.assignments.length);
    room.assignments[impostorIndex].impostor = true;

    // Mandar rol privado a cada jugador
    room.assignments.forEach((a) => {
      if (a.impostor) {
        io.to(a.id).emit("yourRole", { impostor: true });
      } else {
        io.to(a.id).emit("yourRole", {
          champion: chosenChampion,
          impostor: false,
        });
      }
    });

    io.to(roomId).emit("gameStarted", { total: players.length });
  });

  // Desconexiones
  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      room.players = room.players.filter((p) => p.id !== socket.id);
      io.to(roomId).emit("updatePlayers", room.players.map(p => p.name));
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
