let playerId = localStorage.getItem("playerId");

if (!playerId) {
    playerId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("playerId", playerId);
}

// =========================
// BACKEND PLAYER COLOR
// =========================

let playerColor = null;

async function loadPlayerColor() {
    const res = await fetch("/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: playerId })
    });

    const data = await res.json();
    playerColor = data.color;
}

// =========================
// MAP
// =========================

const ORIGIN_LAT = 54.5599;
const ORIGIN_LNG = 23.3541;

const map = L.map("map").setView([ORIGIN_LAT, ORIGIN_LNG], 15);

const roads = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}"
);

const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{x}/{y}"
);

satellite.addTo(map);
labels.addTo(map);

// =========================
// TILE SYSTEM
// =========================

const TILE_SIZE = 50;
const METERS_PER_LAT = 111320;
const COS_LAT = Math.cos(ORIGIN_LAT * Math.PI / 180);

const rendered = new Map();

let playerMarker = null;

// =========================
// CONVERSION
// =========================

function metersToLatLng(x, y) {
    return [
        ORIGIN_LAT + (y / METERS_PER_LAT),
        ORIGIN_LNG + (x / (METERS_PER_LAT * COS_LAT))
    ];
}

function latLngToMeters(lat, lng) {
    return {
        x: (lng - ORIGIN_LNG) * METERS_PER_LAT * COS_LAT,
        y: (lat - ORIGIN_LAT) * METERS_PER_LAT
    };
}

// =========================
// DRAW TILE
// =========================

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

    // fade in
    let opacity = 0;

    const step = setInterval(() => {
        opacity += 0.1;

        if (opacity >= 0.4) {
            opacity = 0.4;
            clearInterval(step);
        }

        poly.setStyle({ fillOpacity: opacity });

    }, 30);
}

// =========================
// LOAD WORLD FROM DB
// =========================

async function loadWorldFromDB() {
    const res = await fetch("/territory");
    const data = await res.json();

    for (const key in data) {
        const [x, y] = key.split(",").map(Number);
        drawTile(x, y, data[key].color);
    }

    console.log("World loaded:", Object.keys(data).length);
}

// =========================
// PLAYER UPDATE
// =========================

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

// =========================
// WEBSOCKET
// =========================

const socket = new WebSocket(`ws://${location.host}/ws`);

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "claim") {
        drawTile(data.x, data.y, data.color);
    }
};

// =========================
// MAP SWITCH
// =========================

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

// =========================
// START GAME (IMPORTANT)
// =========================

(async () => {

    await loadPlayerColor();
    await loadWorldFromDB();

    navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            map.setView([lat, lng], 16);

            updatePlayer(lat, lng);
        },
        () => alert("GPS permission required"),
        { enableHighAccuracy: true }
    );

})();