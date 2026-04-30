const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const PHOTOS_FILE = path.join(DATA_DIR, "photos.json");
const MAX_BODY_BYTES = 15 * 1024 * 1024;
let photosCache = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PHOTOS_FILE);
  } catch {
    await fs.writeFile(PHOTOS_FILE, "[]\n", "utf8");
  }
}

async function readPhotos() {
  if (photosCache) {
    return photosCache;
  }

  await ensureStore();
  const raw = await fs.readFile(PHOTOS_FILE, "utf8");
  photosCache = JSON.parse(raw || "[]");
  return photosCache;
}

async function writePhotos(photos) {
  await ensureStore();
  photosCache = photos;
  await fs.writeFile(PHOTOS_FILE, JSON.stringify(photos), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: "not found" });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("upload aint loading mane"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("it not working mane"));
      }
    });

    req.on("error", reject);
  });
}

function sanitizePhoto(input) {
  const name = String(input.name || "Untitled").trim().slice(0, 60) || "nothing";
  const uploadedBy = String(input.uploadedBy || "anon").trim().slice(0, 60) || "anon";
  const image = String(input.image || "");

  if (!image.startsWith("data:image/")) {
    throw new Error("iamge dont work man.");
  }

  return {
    id: crypto.randomUUID(),
    name,
    uploadedBy,
    image,
    wins: 0,
    losses: 0,
    createdAt: new Date().toISOString()
  };
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/photos") {
    const photos = await readPhotos();
    sendJson(res, 200, { photos });
    return;
  }

  if (req.method === "POST" && req.url === "/api/photos") {
    try {
      const body = await readJsonBody(req);
      const photo = sanitizePhoto(body);
      const photos = await readPhotos();
      photos.unshift(photo);
      await writePhotos(photos);
      sendJson(res, 201, { photo });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/vote") {
    try {
      const body = await readJsonBody(req);
      const winnerId = String(body.winnerId || "");
      const loserId = String(body.loserId || "");
      const photos = await readPhotos();
      const winner = photos.find((photo) => photo.id === winnerId);
      const loser = photos.find((photo) => photo.id === loserId);

      if (!winner || !loser || winner.id === loser.id) {
        throw new Error("need two different photos to vote mane");
      }

      winner.wins += 1;
      loser.losses += 1;
      await writePhotos(photos);
      sendJson(res, 200, { winner, loser });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  notFound(res);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, normalizedPath === "" ? "index.html" : normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    res.end(data);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "error" });
  }
});

ensureStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Photo Scrandle is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
