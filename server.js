require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const skladRoutes = require("./routes");

const app = express();
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
let connectPromise = null;

function createNoopIo() {
  return {
    to() {
      return this;
    },
    emit() {
      return this;
    },
  };
}

async function ensureDbConnection() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI topilmadi");
  }

  if (!connectPromise) {
    connectPromise = mongoose.connect(process.env.MONGO_URI).catch((error) => {
      connectPromise = null;
      throw error;
    });
  }

  return connectPromise;
}

/* ======================
   CORS
====================== */
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : true;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const io = createNoopIo();
app.set("io", io);

if (!isVercel) {
  const server = http.createServer(app);
  const realIo = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  app.set("io", realIo);

  realIo.on("connection", (socket) => {
    socket.join("cashiers");
    console.log("SOCKET CONNECTED:", socket.id);

    socket.emit("socket:ready", { ok: true });

    socket.on("disconnect", (reason) => {
      console.log("SOCKET DISCONNECT:", socket.id, reason);
    });
  });

  app.locals.server = server;
}

app.use(async (req, res, next) => {
  try {
    await ensureDbConnection();
    req.io = req.app.get("io");
    next();
  } catch (error) {
    console.error("MongoDB error:", error);
    res.status(500).json({
      ok: false,
      message: "Database ulanishida xatolik",
    });
  }
});

/* ======================
   ROUTES
====================== */
app.use("/api", skladRoutes);

async function startServer() {
  await ensureDbConnection();
  console.log("MongoDB connected");

  const server = app.locals.server;
  const PORT = process.env.PORT || 8071;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (!isVercel && require.main === module) {
  startServer().catch((error) => {
    console.error("Startup error:", error);
    process.exit(1);
  });
}

module.exports = app;
