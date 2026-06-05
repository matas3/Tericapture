const fastify = require("fastify")({ logger: true });
const path = require("path");

const Database = require("better-sqlite3");
const db = new Database("data/game.db");

fastify.register(require("@fastify/websocket"));

const clients = new Set();

function broadcast(data) {
    const msg = JSON.stringify(data);

    for (const client of clients) {
        try {
            if (client && typeof client.send === "function") {
                client.send(msg);
            }
        } catch (err) {
            clients.delete(client);
        }
    }
}

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

db.exec(`
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    color TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
`);

fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
});

fastify.get("/ws", { websocket: true }, (connection) => {
    const socket = connection.socket;

    clients.add(socket);

    socket.on("close", () => {
        clients.delete(socket);
    });
});

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

fastify.post("/player", (req, reply) => {
    const { id } = req.body;

    let row = db.prepare(`
        SELECT color FROM players WHERE id = ?
    `).get(id);

    if (!row) {
        const color =
            '#' + Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, '0');

        db.prepare(`
            INSERT INTO players (id, color, updated_at)
            VALUES (?, ?, ?)
        `).run(id, color, Date.now());

        return reply.send({ color });
    }

    reply.send({ color: row.color });
});

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

fastify.get("/leaderboard", () => {
    return db.prepare(`
        SELECT
            color,
            COUNT(*) as tiles
        FROM territories
        GROUP BY color
        ORDER BY tiles DESC
    `).all();
});



fastify.listen({ port: 3000, host: "0.0.0.0" })
    .then(() => console.log("Server running on http://localhost:3000"))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });


