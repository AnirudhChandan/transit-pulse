import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const redisClient = createClient();
redisClient.on("error", (err) => console.error("[Redis Error]", err));

// Robust connection handling
(async () => {
  try {
    await redisClient.connect();
    console.log("[Redis] Connected successfully");
  } catch (e) {
    console.error("[Redis] Failed to connect immediately:", e);
  }
})();

const BROADCAST_INTERVAL_MS = 2000;

setInterval(async () => {
  try {
    if (!redisClient.isOpen) return;

    // Fetch the entire city's transit snapshot in O(1) time
    const allBusesRaw = await redisClient.hGetAll("delhi_buses_state");

    // Safety Check: If Redis is empty, don't crash
    if (!allBusesRaw || Object.keys(allBusesRaw).length === 0) return;

    // Hardened parsing pipeline: Discards corrupted records without crashing
    const busArray = Object.values(allBusesRaw).reduce((acc, busStr) => {
      try {
        const parsed = JSON.parse(busStr);
        // Basic validation: ensure coordinates exist
        if (parsed.latitude && parsed.longitude) {
          acc.push(parsed);
        }
      } catch (e) {
        // Silently drop corrupted JSON strings
      }
      return acc;
    }, []);

    if (busArray.length > 0) {
      io.emit("transit-update", busArray);
    }
  } catch (error) {
    console.error("[Socket.io] Broadcast loop error:", error.message);
  }
}, BROADCAST_INTERVAL_MS);

io.on("connection", (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`[Server] Socket.io distribution server running on port ${PORT}`);
});
