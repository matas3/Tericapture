const fastify = require("fastify")({ logger: true });
const path = require("path");

const Database = require("better-sqlite3");
const db = new Database("game.db");

// =========================
// WEBSOCKETS
// =========================
fastify.register(require("@fastify/websocket"));

const clients = new Set();

function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of clients) {
        client.send(msg);
    }
}

// =========================
// DATABASE
// =========================
db.exec(`
CREATE TABLE IF NOT EXISTS territories (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    player TEXT NOT NULL,
    color TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (x, y)
);
`);

// =========================
// STATIC FILES
// =========================
fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
});

// =========================
// WEBSOCKET ROUTE
// =========================
fastify.get("/ws", { websocket: true }, (connection) => {
    const socket = connection.socket;

    clients.add(socket);

    socket.on("close", () => {
        clients.delete(socket);
    });
});

// =========================
// INSTANT CLAIM (STEAL SYSTEM)
// =========================
fastify.post("/claim", (req, reply) => {
    const { x, y, player, color } = req.body;

    db.prepare(`
        INSERT INTO territories (x, y, player, color, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(x, y)
        DO UPDATE SET
            player = excluded.player,
            color = excluded.color,
            updated_at = excluded.updated_at
    `).run(x, y, player, color, Date.now());

    broadcast({
        type: "claim",
        x,
        y,
        player,
        color
    });

    reply.send({ ok: true });
});

// =========================
// LOAD WORLD
// =========================
fastify.get("/territory", () => {
    const rows = db.prepare(`
        SELECT x, y, player, color FROM territories
    `).all();

    const result = {};

    for (const r of rows) {
        result[`${r.x},${r.y}`] = {
            player: r.player,
            color: r.color
        };
    }

    return result;
});

// =========================
// START SERVER
// =========================
fastify.listen({ port: 3000, host: "0.0.0.0" })
    .then(() => console.log("Server running on http://localhost:3000"))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });