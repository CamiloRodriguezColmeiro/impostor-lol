import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Servir los archivos estáticos (public/index.html)
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

  socket.on("createRoom", (cb) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase(); // código corto tipo ABC123
    rooms[roomId] = { players: [], assignments: [] };
    cb(roomId);
  });

  socket.on("joinRoom", ({ roomId, playerName }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ error: "❌ Sala no existe" });

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    io.to(roomId).emit("updatePlayers", room.players.map(p => p.name));
    cb({ success: true });
  });

  socket.on("startGame", ({ roomId, champions }) => {
    const room = rooms[roomId];
    if (!room) return;

    let players = shuffle([...room.players]);
    let champs = shuffle([...champions]);

    // Asignar campeones
    room.assignments = players.map((p, i) => ({
      ...p,
      champion: champs[i % champs.length],
      impostor: false,
    }));

    // Elegir impostor al azar (mínimo 1 asegurado)
    const impostorIndex = Math.floor(Math.random() * room.assignments.length);
    room.assignments[impostorIndex].impostor = true;

    // Mandar rol privado a cada jugador
    room.assignments.forEach((a) => {
      io.to(a.id).emit("yourRole", {
        champion: a.champion,
        impostor: a.impostor,
      });
    });

    // Avisar que el juego empezó
    io.to(roomId).emit("gameStarted");
  });

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