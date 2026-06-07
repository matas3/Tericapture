let playerId = localStorage.getItem("playerId");

if (!playerId) {
    playerId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("playerId", playerId);
}

let playerColor = null;

async function loadPlayer() {
    const res = await fetch("/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: playerId })
    });

    const data = await res.json();
    playerColor = data.color;
}

const ORIGIN_LAT = 54.5599;
const ORIGIN_LNG = 23.3541;

const map = L.map("map").setView([ORIGIN_LAT, ORIGIN_LNG], 15);

const roads = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
);

const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
);

satellite.addTo(map);
labels.addTo(map);

const TILE_SIZE = 37;
const METERS_PER_LAT = 111320;
const COS_LAT = Math.cos(ORIGIN_LAT * Math.PI / 180);

const rendered = new Map();

let playerMarker = null;


function metersToLatLng(x, y) {
    return [
        ORIGIN_LAT + (y / METERS_PER_LAT),
        ORIGIN_LNG + (x / (METERS_PER_LAT * COS_LAT))
    ];
}

function latLngToMeters(
    
    lat, lng) {
    return {
        x: (lng - ORIGIN_LNG) * METERS_PER_LAT * COS_LAT,
        y: (lat - ORIGIN_LAT) * METERS_PER_LAT
    };
}


function drawTile(tileX, tileY, color) {

    const key = `${tileX},${tileY}`;

    if (rendered.has(key)) {
        map.removeLayer(rendered.get(key));
    }

    const mx = tileX * TILE_SIZE;
    const my = tileY * TILE_SIZE;
    const half = TILE_SIZE / 2;

    const corners = [
        metersToLatLng(mx - half, my - half),
        metersToLatLng(mx + half, my - half),
        metersToLatLng(mx + half, my + half),
        metersToLatLng(mx - half, my + half)
    ];

    const poly = L.polygon(corners, {
        color,
        fillColor: color,
        fillOpacity: 0,
        weight: 0
    }).addTo(map);

    rendered.set(key, poly);

    // smooth fade-in
    let opacity = 0;

    const step = setInterval(() => {
        opacity += 0.1;

        if (opacity >= 0.5) {
            opacity = 0.6;
            clearInterval(step);
        }

        poly.setStyle({ fillOpacity: opacity });

    }, 30);
}


async function loadWorldFromDB() {
    try {
        const res = await fetch("/territory");
        const data = await res.json();

        for (const key in data) {
            const [x, y] = key.split(",").map(Number);
            drawTile(x, y, data[key].color);
        }

        console.log("World loaded from DB:", Object.keys(data).length, "tiles");

    } catch (err) {
        console.error("Failed to load world:", err);
    }
}
async function loadLeaderboard() {
    try {
        const res = await fetch("/leaderboard");
        const data = await res.json();

        renderLeaderboard(data);

    } catch (err) {
        console.error("Failed to load leaderboard:", err);
    }
}

function renderLeaderboard(data) {
    const box = document.getElementById("leaderboard");

    if (!box) return;

    box.innerHTML = `
        <div style="font-weight:bold;margin-bottom:8px;">
            Leaderboard
        </div>
    `;

    if (data.length === 0) {
        box.innerHTML += `<div>No territories claimed yet</div>`;
        return;
    }

    data.forEach((entry, index) => {
        box.innerHTML += `
            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:6px;
                "
            >
                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                    "
                >
                    <span>${index + 1}.</span>

                    <div
                        style="
                            width:16px;
                            height:16px;
                            background:${entry.color};
                            border-radius:4px;
                            border:1px solid white;
                        "
                    ></div>

                    <span>${entry.color}</span>
                </div>

                <span>${entry.tiles}</span>
            </div>
        `;
    });
}

(async () => {

    await loadPlayer();
    await loadWorldFromDB();
    await loadLeaderboard();

})();

function updatePlayer(lat, lng) {

    if (!playerMarker) {
        playerMarker = L.marker([lat, lng]).addTo(map);
    } else {
        playerMarker.setLatLng([lat, lng]);
    }

    const pos = latLngToMeters(lat, lng);

    const tileX = Math.floor(pos.x / TILE_SIZE);
    const tileY = Math.floor(pos.y / TILE_SIZE);

    drawTile(tileX, tileY, playerColor);

    fetch("/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            x: tileX,
            y: tileY,
            player: playerId,
            color: playerColor
        })
    });
}

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${wsProtocol}//${location.host}/ws`);

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "claim") {
        drawTile(data.x, data.y, data.color);

        loadLeaderboard();
    }
};


window.addEventListener("DOMContentLoaded", () => {

    const btn = document.getElementById("mapBtn");

    let mode = 0;

    btn.onclick = () => {

        map.removeLayer(roads);
        map.removeLayer(satellite);
        map.removeLayer(labels);

        mode = (mode + 1) % 3;

        if (mode === 0) {
            satellite.addTo(map);
            labels.addTo(map);
            btn.innerText = "Satellite + Labels";
        }

        if (mode === 1) {
            roads.addTo(map);
            btn.innerText = "Roads";
        }

        if (mode === 2) {
            satellite.addTo(map);
            btn.innerText = "Satellite";
        }
    };
});


navigator.geolocation.watchPosition(
    (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.setView([lat, lng], 16);

        updatePlayer(lat, lng);
    },
    () => alert("GPS permission required"),
    {
        enableHighAccuracy: true
    }
);

let isLeaderboardOpen = false

function showLeaderboard() {
    if (isLeaderboardOpen === false) {
        document.getElementById('leaderboard').classList.remove("hidden")
        isLeaderboardOpen = true
    } else {
        document.getElementById('leaderboard').classList.add("hidden")
        isLeaderboardOpen = false
    }
}