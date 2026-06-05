const SERVER = "http://localhost:3000";

const BOT_COUNT = 10;

const bots = Array.from({ length: BOT_COUNT }).map(() => ({
    id: Math.random().toString(36).slice(2),
    color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0"),
}));

function randomTile() {
    return {
        x: Math.floor(Math.random() * 50 - 25),
        y: Math.floor(Math.random() * 50 - 25),
    };
}

async function claim(bot) {
    const { x, y } = randomTile();

    try {
        const res = await fetch(`${SERVER}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                x,
                y,
                player: bot.id,
                color: bot.color,
            }),
        });

        if (!res.ok) {
            console.log("Server rejected claim:", await res.text());
        }
    } catch (err) {
        console.error("Bot request failed:", err.message);
    }
}

// start simulation
setInterval(() => {
    const bot = bots[Math.floor(Math.random() * bots.length)];
    claim(bot);
}, 200);