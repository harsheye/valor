var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// start-app.js
var import_vite = require("vite");
var import_http = __toESM(require("http"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_child_process = require("child_process");
var import_node_sqlite = require("node:sqlite");
var import_meta = {};
process.on("uncaughtException", (err) => {
  console.error("[Server Uncaught Exception]", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server Unhandled Rejection]", reason);
});
var args = process.argv.slice(1).filter((arg) => {
  const lower = arg.toLowerCase();
  return !lower.endsWith("node.exe") && !lower.endsWith("node") && !lower.endsWith("start-app.js") && !lower.endsWith("start-app.exe") && !lower.endsWith("start-app-exe");
});
var playWithVlc = args.includes("--vlc");
var backendOnly = args.includes("--backend-only");
var frontendOnly = args.includes("--frontend-only");
var trayMode = args.includes("--tray");
var filePath = args.find((arg) => arg !== "--vlc" && !arg.startsWith("--"));
var resolvedFilePath = filePath ? import_path.default.resolve(filePath) : null;
if (playWithVlc && resolvedFilePath) {
  const vlcPaths = [
    "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
    "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
    "vlc"
  ];
  let selectedPath = "vlc";
  for (const p of vlcPaths) {
    if (p === "vlc" || import_fs.default.existsSync(p)) {
      selectedPath = p;
      if (p !== "vlc") break;
    }
  }
  console.log(`[VLC] Launching VLC to play: ${resolvedFilePath}`);
  const child = (0, import_child_process.spawn)(selectedPath, [resolvedFilePath], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  process.exit(0);
}
var execDir = import_path.default.dirname(process.execPath);
var appDir = import_meta.dirname || __dirname;
if (!import_fs.default.existsSync(import_path.default.join(appDir, "dist")) && import_fs.default.existsSync(import_path.default.join(execDir, "dist"))) {
  appDir = execDir;
}
var dataDir = import_path.default.join(appDir, ".valor_data");
if (!import_fs.default.existsSync(dataDir)) {
  import_fs.default.mkdirSync(dataDir, { recursive: true });
}
var dbPath = import_path.default.join(dataDir, "valor.db");
var db = new import_node_sqlite.DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    userId TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    password TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );
`);
try {
  db.exec(`ALTER TABLE profiles ADD COLUMN username TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE profiles ADD COLUMN password TEXT;`);
} catch (e) {
}
try {
  const existingProfilesWithPasswords = db.prepare("SELECT username, password FROM profiles WHERE username IS NOT NULL AND password IS NOT NULL").all();
  const insertAccount = db.prepare("INSERT OR IGNORE INTO accounts (username, password) VALUES (?, ?)");
  for (const p of existingProfilesWithPasswords) {
    insertAccount.run(p.username, p.password);
  }
} catch (e) {
  console.warn("Failed to migrate existing profiles to accounts table:", e.message);
}
try {
  db.exec(`DROP INDEX IF EXISTS idx_profiles_username;`);
  const indexList = db.prepare("PRAGMA index_list('profiles')").all();
  const hasUniqueIndex = indexList.some((idx) => idx.unique === 1 && idx.name.includes("username"));
  if (hasUniqueIndex) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles_temp (
        userId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT,
        password TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`INSERT OR REPLACE INTO profiles_temp SELECT userId, name, username, password, createdAt FROM profiles;`);
    db.exec(`DROP TABLE profiles;`);
    db.exec(`ALTER TABLE profiles_temp RENAME TO profiles;`);
    console.log("[SQLite Migration] Successfully removed UNIQUE constraint from profiles.username");
  }
} catch (e) {
  console.log("[SQLite Migration] Note: profiles table already migrated or no UNIQUE index found:", e.message);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    userId TEXT PRIMARY KEY,
    settingsJson TEXT NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    userId TEXT NOT NULL,
    videoId TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    type TEXT,
    fileName TEXT,
    duration REAL,
    currentTime REAL,
    lastPlayedDate TEXT,
    totalTimeWatched REAL,
    rating INTEGER,
    timeToFinish REAL,
    sessions TEXT,
    localFilePath TEXT,
    playedDates TEXT,
    format TEXT,
    streams TEXT,
    audioTracks TEXT,
    subtitleTracks TEXT,
    PRIMARY KEY (userId, videoId)
  );
`);
try {
  db.exec(`ALTER TABLE history ADD COLUMN url TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN type TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN fileName TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN format TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN streams TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN audioTracks TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE history ADD COLUMN subtitleTracks TEXT;`);
} catch (e) {
}
db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    userId TEXT NOT NULL,
    videoId TEXT NOT NULL,
    id TEXT NOT NULL,
    time REAL NOT NULL,
    endTime REAL,
    label TEXT NOT NULL,
    isIntro INTEGER DEFAULT 0,
    isOutro INTEGER DEFAULT 0,
    skipEnabled INTEGER DEFAULT 0,
    PRIMARY KEY (userId, videoId, id)
  );
`);
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN title TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN description TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN category TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN startTime REAL;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN thumbnail TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN favorite INTEGER DEFAULT 0;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN createdAt TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN updatedAt TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN episode INTEGER;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN season INTEGER;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN color TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN tmdbId INTEGER;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN userName TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN userTime TEXT;`);
} catch (e) {
}
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN mediaName TEXT;`);
} catch (e) {
}
db.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    lockedUntil TEXT
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    blockedUntil TEXT
  );
`);
var logFilePath = import_path.default.join(dataDir, "app.log");
var logStream = import_fs.default.createWriteStream(logFilePath, { flags: "a" });
var originalLog = console.log;
var originalError = console.error;
console.log = (...args2) => {
  const msg = args2.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  logStream.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] [INFO] ${msg}
`);
  originalLog(...args2);
};
console.error = (...args2) => {
  const msg = args2.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  logStream.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] [ERROR] ${msg}
`);
  originalError(...args2);
};
var PORT_SERVICE = 5e4;
var PORT_BACKEND = 50001;
var getJsonBody = (req) => new Promise((resolve) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      resolve(JSON.parse(body));
    } catch {
      resolve({});
    }
  });
});
var lastHeartbeat = Date.now();
var hasReceivedFirstHeartbeat = false;
var activeConnections = 0;
var pendingPlayFile = null;
var backendServer = import_http.default.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const parsedUrl = new URL(req.url, `http://localhost:${PORT_BACKEND}`);
  const pathname = parsedUrl.pathname;
  const ip = req.socket.remoteAddress || req.headers["x-forwarded-for"] || "";
  try {
    const checkIp = db.prepare("SELECT blockedUntil FROM blocked_ips WHERE ip = ?").get(ip);
    if (checkIp && checkIp.blockedUntil && new Date(checkIp.blockedUntil) > /* @__PURE__ */ new Date()) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "IP blocked", blockedUntil: checkIp.blockedUntil }));
      return;
    }
  } catch (e) {
    console.error("[IP check error]", e.message);
  }
  if (pathname === "/api/heartbeat") {
    lastHeartbeat = Date.now();
    hasReceivedFirstHeartbeat = true;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    const responseData = { status: "ok" };
    if (pendingPlayFile) {
      responseData.playFile = pendingPlayFile;
      pendingPlayFile = null;
    }
    res.end(JSON.stringify(responseData));
    return;
  }
  if (pathname === "/api/play") {
    const file = parsedUrl.searchParams.get("file");
    const hasActiveTab = hasReceivedFirstHeartbeat && Date.now() - lastHeartbeat < 6e3;
    if (hasActiveTab && file) {
      console.log(`[Server] Active tab detected. Queueing file for playback: ${file}`);
      pendingPlayFile = file;
    } else {
      const openUrl = file ? `http://127.0.0.1:${PORT_SERVICE}/?file=${encodeURIComponent(file)}` : `http://127.0.0.1:${PORT_SERVICE}/`;
      console.log(`[Server] No active tab. Opening browser: ${openUrl}`);
      if (process.platform === "win32") {
        (0, import_child_process.spawn)("cmd", ["/c", "start", "", openUrl], { detached: true }).unref();
      } else if (process.platform === "darwin") {
        (0, import_child_process.spawn)("open", [openUrl], { detached: true }).unref();
      } else {
        (0, import_child_process.spawn)("xdg-open", [openUrl], { detached: true }).unref();
      }
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, tabReused: hasActiveTab }));
    return;
  }
  if (pathname === "/api/vlr/live") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    fetch("https://www.vlr.gg/matches", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml"
      }
    }).then((r) => r.text()).then(async (html) => {
      const matches = [];
      const linkBlocks = html.split(/<a\s+/gi);
      const rawLiveMatches = [];
      for (let i = 1; i < linkBlocks.length; i++) {
        const block = linkBlocks[i];
        const hrefMatch = block.match(/href="(\/(\d+)\/([^"]+))"/i);
        if (!hrefMatch) continue;
        const matchPath = hrefMatch[1];
        const matchId = hrefMatch[2];
        const isLive = block.includes("mod-live") || block.includes("LIVE") || block.includes("ml mod-live");
        if (!isLive) continue;
        rawLiveMatches.push({ matchPath, matchId, block });
      }
      for (const item of rawLiveMatches) {
        const { matchPath, matchId, block } = item;
        let rawEvent = "VCT Match";
        const eventMatch = block.match(/<div\s+class="match-item-event[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (eventMatch) {
          rawEvent = eventMatch[1].replace(/<[^>]+>/g, " ").replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        }
        const fullBlockText = block.replace(/<[^>]+>/g, " ").replace(/&ndash;/g, "-").replace(/\s+/g, " ").trim();
        const isVctMatch = /vct|valorant champions|masters|china stage|americas stage|emea stage|pacific stage/i.test(fullBlockText) || /vct|champions|masters/i.test(matchPath);
        if (!isVctMatch) continue;
        let eventName = rawEvent;
        const vctMatch = fullBlockText.match(/VCT[^\n\r<]{3,40}/i);
        if (vctMatch) {
          eventName = vctMatch[0].trim();
        }
        const teamNames = [];
        const teamMatches = block.matchAll(/<div\s+class="match-item-vs-team-name"[^>]*>([\s\S]*?)<\/div>/gi);
        for (const tm of teamMatches) {
          const cleanName = tm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
          if (cleanName) teamNames.push(cleanName);
        }
        const scores = [];
        const scoreMatches = block.matchAll(/<div\s+class="match-item-vs-team-score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
        for (const sm of scoreMatches) {
          const cleanScore = sm[1].replace(/<[^>]+>/g, "").trim();
          if (cleanScore !== void 0 && cleanScore !== "") scores.push(cleanScore);
        }
        const teamA = teamNames[0] || "Team A";
        const teamB = teamNames[1] || "Team B";
        const scoreA = parseInt(scores[0] || "0", 10);
        const scoreB = parseInt(scores[1] || "0", 10);
        const fullMatchUrl = `https://www.vlr.gg${matchPath}`;
        let liveMapName = "Live Map";
        let roundScoreA = 0;
        let roundScoreB = 0;
        const mapsList = [];
        try {
          const detailRes = await fetch(fullMatchUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
          });
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const gameParts = detailHtml.split(/<div\s+class="vm-stats-game\s+/gi);
            for (let i = 1; i < gameParts.length; i++) {
              const part = gameParts[i];
              const gameIdMatch = part.match(/data-game-id="(\d+)"/i);
              if (!gameIdMatch) continue;
              const gameId = gameIdMatch[1];
              const mapNameMatch = part.match(/<div\s+class="map"[^>]*>([\s\S]*?)<\/div>/i);
              let mName = "Map";
              if (mapNameMatch) {
                mName = mapNameMatch[1].replace(/<[^>]+>/g, "").replace(/PICK|DECIDER/gi, "").replace(/\s+/g, " ").trim();
              }
              let sA = 0;
              let sB = 0;
              const headerPos = part.indexOf("vm-stats-game-header");
              if (headerPos !== -1) {
                const headerSnippet = part.substring(headerPos, headerPos + 1500);
                const scores2 = [...headerSnippet.matchAll(/<div\s+class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi)];
                if (scores2.length >= 2) {
                  sA = parseInt(scores2[0][1], 10);
                  sB = parseInt(scores2[1][1], 10);
                }
              }
              const isCompleted = sA >= 13 || sB >= 13;
              const isMapActive = (part.startsWith("mod-active") || part.includes("mod-active")) && !isCompleted;
              mapsList.push({
                mapIndex: mapsList.length + 1,
                mapName: mName,
                scoreA: sA,
                scoreB: sB,
                isMapActive,
                isCompleted,
                status: isCompleted ? "completed" : isMapActive ? "live" : "upcoming"
              });
            }
            let liveMapObj = mapsList.find((m) => m.isMapActive);
            if (!liveMapObj) liveMapObj = mapsList.find((m) => !m.isCompleted);
            if (!liveMapObj && mapsList.length > 0) liveMapObj = mapsList[mapsList.length - 1];
            if (liveMapObj) {
              liveMapName = liveMapObj.mapName;
              roundScoreA = liveMapObj.scoreA;
              roundScoreB = liveMapObj.scoreB;
            }
          }
        } catch (e) {
        }
        matches.push({
          id: `vct-${matchId}`,
          game: "valorant",
          eventName,
          status: "ongoing",
          bestOf: "BO3",
          teamA: {
            name: teamA,
            tag: teamA.substring(0, 4).toUpperCase(),
            score: isNaN(scoreA) ? 0 : scoreA,
            color: "#e50914"
          },
          teamB: {
            name: teamB,
            tag: teamB.substring(0, 4).toUpperCase(),
            score: isNaN(scoreB) ? 0 : scoreB,
            color: "#3b82f6"
          },
          currentMapName: liveMapName,
          currentMapRoundScore: {
            teamA: roundScoreA,
            teamB: roundScoreB
          },
          vlrUrl: fullMatchUrl,
          maps: mapsList
        });
      }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(matches));
      return;
    }).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    });
    return;
  }
  if (pathname === "/api/vlr/detail") {
    const targetUrl = parsedUrl.searchParams.get("url") || "https://www.vlr.gg/701052/jdg-esports-vs-trace-esports-vct-2026-china-stage-2-w3";
    fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml"
      }
    }).then((r) => r.text()).then((html) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end(html);
      return;
    }).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    });
    return;
  }
  if (pathname === "/api/log") {
    getJsonBody(req).then((data) => {
      const type = data.type || "INFO";
      const msg = data.message || "";
      console.log(`[Browser ${type}] ${msg}`);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  if (pathname === "/api/profiles" && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    try {
      const query = db.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles");
      const rows = query.all();
      res.end(JSON.stringify(rows));
    } catch (e) {
      console.error("[SQLite profiles GET error]", e.message);
      res.end(JSON.stringify([]));
    }
    return;
  }
  if (pathname === "/api/profiles" && req.method === "POST") {
    getJsonBody(req).then((data) => {
      const name = data.name || "Unnamed Profile";
      const username = data.username;
      const password = data.password;
      const userId = data.userId || `u_${Math.random().toString(36).substring(2, 11)}`;
      if (username) {
        try {
          const existing = db.prepare("SELECT userId FROM profiles WHERE username = ?").get(username);
          if (existing) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Username already taken" }));
            return;
          }
        } catch (e) {
        }
      }
      try {
        const insert = db.prepare("INSERT OR REPLACE INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)");
        insert.run(userId, name, username || null, password || null);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true, userId, name }));
      } catch (e) {
        console.error("[SQLite profiles POST error]", e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (pathname === "/api/profile/delete" && req.method === "POST") {
    getJsonBody(req).then((data) => {
      const { userId } = data;
      if (!userId || userId === "local") {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid userId" }));
        return;
      }
      try {
        db.prepare("DELETE FROM profiles WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM settings WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM history WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM bookmarks WHERE userId = ?").run(userId);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error("[SQLite profile delete error]", e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (pathname === "/api/profile/login" && req.method === "POST") {
    getJsonBody(req).then((data) => {
      const { userId, username, password } = data;
      let profile;
      let account;
      try {
        if (userId) {
          profile = db.prepare("SELECT * FROM profiles WHERE userId = ?").get(userId);
          if (!profile) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Profile not found" }));
            return;
          }
          if (profile.password && profile.password !== password) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Incorrect profile password" }));
            return;
          }
        } else if (username) {
          account = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
          if (!account) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Account not found" }));
            return;
          }
          if (account.password !== password) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Incorrect username or password" }));
            return;
          }
          profile = db.prepare("SELECT * FROM profiles WHERE username = ? ORDER BY createdAt ASC").get(username);
          if (!profile) {
            const fallbackId = `u_${Math.random().toString(36).substring(2, 11)}`;
            db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)").run(fallbackId, username, username);
            profile = { userId: fallbackId, name: username };
          }
        }
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Database error" }));
        return;
      }
      const activeUsername = username || profile.username || profile.name;
      try {
        const checkLock = db.prepare("SELECT lockedUntil FROM login_attempts WHERE username = ?").get(activeUsername);
        if (checkLock && checkLock.lockedUntil && new Date(checkLock.lockedUntil) > /* @__PURE__ */ new Date()) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Account locked", lockedUntil: checkLock.lockedUntil }));
          return;
        }
      } catch (e) {
      }
      if (true) {
        try {
          db.prepare("INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, 0, NULL)").run(activeUsername);
        } catch (e) {
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true, userId: profile.userId, name: profile.name }));
      } else {
        let attempts = 1;
        try {
          const row = db.prepare("SELECT attempts FROM login_attempts WHERE username = ?").get(activeUsername);
          if (row) {
            attempts = (row.attempts || 0) + 1;
          }
          if (attempts >= 5) {
            const lockedUntil = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
            const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
            db.prepare("INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, ?, ?)").run(activeUsername, attempts, lockedUntil);
            db.prepare("INSERT OR REPLACE INTO blocked_ips (ip, blockedUntil) VALUES (?, ?)").run(ip, blockedUntil);
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              error: "Account locked for 1 hour. IP blocked for 1 day.",
              lockedUntil,
              blockedUntil
            }));
          } else {
            db.prepare("INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, ?, NULL)").run(activeUsername, attempts);
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Incorrect password", attempts }));
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Database update error" }));
        }
      }
    });
    return;
  }
  if (pathname === "/api/trakt/exchange" && req.method === "POST") {
    getJsonBody(req).then(async (body) => {
      const { code, redirect_uri, client_secret } = body;
      if (!code) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing authorization code" }));
        return;
      }
      try {
        const payload = {
          code,
          client_id: "f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289",
          client_secret: client_secret || "",
          redirect_uri: redirect_uri || "http://localhost:50000",
          grant_type: "authorization_code"
        };
        const traktRes = await fetch("https://api.trakt.tv/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const data = await traktRes.json();
        if (traktRes.ok && data.access_token) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        } else {
          res.statusCode = traktRes.status || 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        }
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err.message || "Failed to exchange Trakt token" }));
      }
    });
    return;
  }
  if (pathname === "/api/graphql" && req.method === "POST") {
    getJsonBody(req).then((body) => {
      const query = body.query || "";
      const variables = body.variables || {};
      if (query.includes("profiles") || query.includes("GetProfiles")) {
        try {
          const usernameVal = variables.username;
          let rows;
          if (usernameVal) {
            rows = db.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles WHERE username = ?").all(usernameVal);
          } else {
            rows = db.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles").all();
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: { profiles: rows } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      if (query.includes("profile") || query.includes("GetProfileData")) {
        let userId = variables.userId;
        if (!userId) {
          const match = query.match(/profile\s*\(\s*userId\s*:\s*"([^"]+)"\)/);
          if (match) userId = match[1];
        }
        if (!userId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: "Missing userId variable or argument" }] }));
          return;
        }
        try {
          const settingsQuery = db.prepare("SELECT settingsJson FROM settings WHERE userId = ?");
          const settingsRow = settingsQuery.get(userId);
          const settings = settingsRow ? JSON.parse(settingsRow.settingsJson) : {};
          const historyQuery = db.prepare("SELECT * FROM history WHERE userId = ?");
          const historyRows = historyQuery.all(userId);
          const bookmarksQuery = db.prepare("SELECT * FROM bookmarks");
          const bookmarksRows = bookmarksQuery.all();
          const videos = historyRows.map((row) => {
            const videoBookmarks = bookmarksRows.filter((bm) => bm.videoId === row.videoId).map((bm) => ({
              id: bm.id,
              time: bm.time,
              endTime: bm.endTime !== null ? bm.endTime : void 0,
              label: bm.label,
              isIntro: bm.isIntro === 1,
              isOutro: bm.isOutro === 1,
              skipEnabled: bm.skipEnabled === 1,
              title: bm.title,
              description: bm.description,
              category: bm.category,
              thumbnail: bm.thumbnail,
              favorite: bm.favorite === 1,
              createdAt: bm.createdAt,
              updatedAt: bm.updatedAt,
              userName: bm.userName,
              userTime: bm.userTime,
              mediaName: bm.mediaName,
              tmdbId: bm.tmdbId,
              episode: bm.episode,
              season: bm.season,
              color: bm.color,
              userId: bm.userId,
              createdBy: bm.createdBy || "manual"
            }));
            return {
              id: row.videoId,
              title: row.title,
              url: row.url || "",
              type: row.type || "local",
              fileName: row.fileName || "",
              duration: row.duration,
              currentTime: row.currentTime,
              lastPlayedDate: row.lastPlayedDate,
              totalTimeWatched: row.totalTimeWatched,
              rating: row.rating,
              timeToFinish: row.timeToFinish,
              sessions: row.sessions ? JSON.parse(row.sessions) : [],
              localFilePath: row.localFilePath,
              playedDates: row.playedDates ? JSON.parse(row.playedDates) : [],
              format: row.format || null,
              streams: row.streams ? JSON.parse(row.streams) : [],
              audioTracks: row.audioTracks ? JSON.parse(row.audioTracks) : [],
              subtitleTracks: row.subtitleTracks ? JSON.parse(row.subtitleTracks) : [],
              bookmarks: videoBookmarks
            };
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: { profile: { settings, history: videos } } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      if (query.includes("SaveSettings") || query.includes("saveSettings")) {
        const userId = variables.userId;
        const settingsData = variables.settings;
        if (userId && userId !== "local" && !userId.startsWith("local_")) {
          try {
            const insert = db.prepare("INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)");
            insert.run(userId, JSON.stringify(settingsData));
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data: { saveSettings: { success: true } } }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ errors: [{ message: e.message }] }));
          }
        } else {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: { saveSettings: { success: true } } }));
        }
        return;
      }
      if (query.includes("SaveHistory") || query.includes("saveHistory")) {
        const userId = variables.userId;
        const historyData = variables.history;
        if (userId && userId !== "local" && !userId.startsWith("local_")) {
          try {
            const deleteHistory = db.prepare("DELETE FROM history WHERE userId = ?");
            deleteHistory.run(userId);
            const deleteBookmarks = db.prepare("DELETE FROM bookmarks WHERE userId = ?");
            deleteBookmarks.run(userId);
            const insertHistory = db.prepare(`
              INSERT OR REPLACE INTO history 
              (userId, videoId, title, url, type, fileName, duration, currentTime, lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions, localFilePath, playedDates, format, streams, audioTracks, subtitleTracks)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertBookmark = db.prepare(`
              INSERT OR REPLACE INTO bookmarks
              (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, thumbnail, favorite, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            if (Array.isArray(historyData)) {
              for (const video of historyData) {
                insertHistory.run(
                  userId,
                  video.id,
                  video.title || "Untitled Video",
                  video.url || "",
                  video.type || "local",
                  video.fileName || "",
                  video.duration || null,
                  video.currentTime || null,
                  video.lastPlayedDate || null,
                  video.totalTimeWatched || null,
                  video.rating || null,
                  video.timeToFinish || null,
                  video.sessions ? JSON.stringify(video.sessions) : null,
                  video.localFilePath || null,
                  video.playedDates ? JSON.stringify(video.playedDates) : null,
                  video.format || null,
                  video.streams ? JSON.stringify(video.streams) : null,
                  video.audioTracks ? JSON.stringify(video.audioTracks) : null,
                  video.subtitleTracks ? JSON.stringify(video.subtitleTracks) : null
                );
                if (video.bookmarks && Array.isArray(video.bookmarks)) {
                  for (const bm of video.bookmarks) {
                    insertBookmark.run(
                      userId,
                      video.id,
                      bm.id,
                      bm.time,
                      bm.endTime !== void 0 ? bm.endTime : null,
                      bm.label || "",
                      bm.isIntro ? 1 : 0,
                      bm.isOutro ? 1 : 0,
                      bm.skipEnabled ? 1 : 0,
                      bm.title || "",
                      bm.description || "",
                      bm.category || "Custom",
                      bm.thumbnail || "",
                      bm.favorite ? 1 : 0,
                      bm.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
                      bm.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
                    );
                  }
                }
              }
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data: { saveHistory: { success: true } } }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ errors: [{ message: e.message }] }));
          }
        } else {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: { saveHistory: { success: true } } }));
        }
        return;
      }
      if (query.includes("videoBookmarks") || query.includes("GetVideoBookmarks") || query.includes("bookmarks(") || query.includes("GetBookmarks")) {
        const tmdbId = variables.tmdbId;
        const season = variables.season || null;
        const episode = variables.episode || null;
        if (!tmdbId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: "Missing tmdbId variable" }] }));
          return;
        }
        try {
          let stmt;
          let rows;
          if (season !== null && episode !== null && season !== 0) {
            stmt = db.prepare("SELECT * FROM bookmarks WHERE tmdbId = ? AND season = ? AND episode = ?");
            rows = stmt.all(tmdbId, season, episode);
          } else {
            stmt = db.prepare('SELECT * FROM bookmarks WHERE tmdbId = ? AND (season IS NULL OR season = 0 OR season = "")');
            rows = stmt.all(tmdbId);
          }
          const mapped = rows.map((bm) => ({
            id: bm.id,
            time: bm.time,
            endTime: bm.endTime !== null ? bm.endTime : void 0,
            label: bm.label,
            isIntro: bm.isIntro === 1,
            isOutro: bm.isOutro === 1,
            skipEnabled: bm.skipEnabled === 1,
            title: bm.title,
            description: bm.description,
            category: bm.category,
            thumbnail: bm.thumbnail,
            favorite: bm.favorite === 1,
            createdAt: bm.createdAt,
            updatedAt: bm.updatedAt,
            userName: bm.userName,
            userTime: bm.userTime,
            mediaName: bm.mediaName,
            tmdbId: bm.tmdbId,
            episode: bm.episode,
            season: bm.season,
            color: bm.color,
            userId: bm.userId,
            createdBy: bm.createdBy || "manual"
          }));
          const responseData = query.includes("videoBookmarks") || query.includes("GetVideoBookmarks") ? { videoBookmarks: mapped } : { bookmarks: mapped };
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: responseData }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      if (query.includes("SaveBookmarks") || query.includes("saveBookmarks")) {
        const userId = variables.userId;
        const videoId = variables.videoId;
        const tmdbId = variables.tmdbId;
        const season = variables.season || null;
        const episode = variables.episode || null;
        const bookmarksData = variables.bookmarks;
        if (!userId || !videoId || !tmdbId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: "Missing userId, videoId, or tmdbId" }] }));
          return;
        }
        try {
          let deleteBookmarks;
          if (season !== null && episode !== null) {
            deleteBookmarks = db.prepare("DELETE FROM bookmarks WHERE userId = ? AND tmdbId = ? AND season = ? AND episode = ?");
            deleteBookmarks.run(userId, tmdbId, season, episode);
          } else {
            deleteBookmarks = db.prepare('DELETE FROM bookmarks WHERE userId = ? AND tmdbId = ? AND (season IS NULL OR season = 0 OR season = "")');
            deleteBookmarks.run(userId, tmdbId);
          }
          if (Array.isArray(bookmarksData) && bookmarksData.length > 0) {
            const insertBookmark = db.prepare(`
              INSERT OR REPLACE INTO bookmarks
              (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, createdAt, updatedAt, episode, season, color, userName, userTime, mediaName, tmdbId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const bm of bookmarksData) {
              insertBookmark.run(
                userId,
                videoId,
                bm.id,
                bm.time,
                bm.endTime !== void 0 && bm.endTime !== null ? bm.endTime : null,
                bm.label || "",
                bm.isIntro ? 1 : 0,
                bm.isOutro ? 1 : 0,
                bm.skipEnabled ? 1 : 0,
                bm.title || null,
                bm.description || null,
                bm.category || null,
                bm.startTime || null,
                bm.thumbnail || null,
                bm.favorite ? 1 : 0,
                episode,
                season,
                bm.color || null,
                bm.userName || null,
                bm.userTime || null,
                bm.mediaName || null,
                tmdbId
              );
            }
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: { saveBookmarks: { success: true, count: (bookmarksData || []).length } } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ errors: [{ message: "Unsupported GraphQL operation" }] }));
    });
    return;
  }
  if (pathname === "/api/profile/data" && req.method === "GET") {
    const userId = parsedUrl.searchParams.get("userId");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (!userId) {
      res.end(JSON.stringify({ error: "Missing userId" }));
      return;
    }
    try {
      const settingsQuery = db.prepare("SELECT settingsJson FROM settings WHERE userId = ?");
      const settingsRow = settingsQuery.get(userId);
      const settings = settingsRow ? JSON.parse(settingsRow.settingsJson) : {};
      const historyQuery = db.prepare("SELECT * FROM history WHERE userId = ?");
      const historyRows = historyQuery.all(userId);
      const bookmarksQuery = db.prepare("SELECT * FROM bookmarks");
      const bookmarksRows = bookmarksQuery.all();
      const videos = historyRows.map((row) => {
        const videoBookmarks = bookmarksRows.filter((bm) => bm.videoId === row.videoId).map((bm) => ({
          id: bm.id,
          time: bm.time,
          endTime: bm.endTime !== null ? bm.endTime : void 0,
          label: bm.label,
          isIntro: bm.isIntro === 1,
          isOutro: bm.isOutro === 1,
          skipEnabled: bm.skipEnabled === 1,
          title: bm.title,
          description: bm.description,
          category: bm.category,
          thumbnail: bm.thumbnail,
          favorite: bm.favorite === 1,
          createdAt: bm.createdAt,
          updatedAt: bm.updatedAt,
          userName: bm.userName,
          userTime: bm.userTime,
          mediaName: bm.mediaName,
          tmdbId: bm.tmdbId,
          episode: bm.episode,
          season: bm.season,
          color: bm.color,
          userId: bm.userId,
          createdBy: bm.createdBy || "manual"
        }));
        return {
          id: row.videoId,
          title: row.title,
          url: row.url || "",
          type: row.type || "local",
          fileName: row.fileName || "",
          duration: row.duration,
          currentTime: row.currentTime,
          lastPlayedDate: row.lastPlayedDate,
          totalTimeWatched: row.totalTimeWatched,
          rating: row.rating,
          timeToFinish: row.timeToFinish,
          sessions: row.sessions ? JSON.parse(row.sessions) : [],
          localFilePath: row.localFilePath,
          playedDates: row.playedDates ? JSON.parse(row.playedDates) : [],
          format: row.format || null,
          streams: row.streams ? JSON.parse(row.streams) : [],
          audioTracks: row.audioTracks ? JSON.parse(row.audioTracks) : [],
          subtitleTracks: row.subtitleTracks ? JSON.parse(row.subtitleTracks) : [],
          bookmarks: videoBookmarks
        };
      });
      res.end(JSON.stringify({ settings, history: videos }));
    } catch (e) {
      console.error("[SQLite profile data GET error]", e.message);
      res.end(JSON.stringify({ settings: {}, history: [] }));
    }
    return;
  }
  if (pathname === "/api/profile/migrate" && req.method === "POST") {
    getJsonBody(req).then((data) => {
      const name = data.name || "Migrated Profile";
      const username = data.username;
      const password = data.password;
      const userId = `u_${Math.random().toString(36).substring(2, 11)}`;
      let settings = data.settings || {};
      let historyList = data.history || [];
      console.log("[SQLite Migrate] Received settings keys:", Object.keys(settings), "history size:", historyList.length);
      if (username && data.isSignUp) {
        try {
          const existing = db.prepare("SELECT username FROM accounts WHERE username = ?").get(username);
          if (existing) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Username already taken" }));
            return;
          }
        } catch (e) {
        }
      }
      const legacySettingsFile = import_path.default.join(dataDir, "settings.json");
      if (import_fs.default.existsSync(legacySettingsFile)) {
        try {
          const fileSettings = JSON.parse(import_fs.default.readFileSync(legacySettingsFile, "utf8"));
          settings = { ...fileSettings, ...settings };
        } catch (e) {
          console.warn("Failed to migrate legacy settings file on disk:", e.message);
        }
      }
      const legacyHistoryFile = import_path.default.join(dataDir, "history.json");
      if (import_fs.default.existsSync(legacyHistoryFile) && historyList.length === 0) {
        try {
          const fileHistory = JSON.parse(import_fs.default.readFileSync(legacyHistoryFile, "utf8"));
          if (Array.isArray(fileHistory)) {
            historyList = fileHistory;
          }
        } catch (e) {
          console.warn("Failed to migrate legacy history file on disk:", e.message);
        }
      }
      try {
        if (username) {
          const existingAccount = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
          if (data.isSignUp) {
            if (existingAccount) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Username already taken" }));
              return;
            }
            db.prepare("INSERT INTO accounts (username, password) VALUES (?, ?)").run(username, password);
            db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)").run(userId, name, username);
          } else if (data.isLoginAndSync) {
            if (!existingAccount) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Account not found" }));
              return;
            }
            if (existingAccount.password !== password) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Incorrect account password" }));
              return;
            }
            db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)").run(userId, name, username);
          } else if (data.isLoggedIn) {
            if (!existingAccount) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Account not found" }));
              return;
            }
            db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)").run(userId, name, username, password || null);
          } else {
            if (!existingAccount) {
              db.prepare("INSERT INTO accounts (username, password) VALUES (?, ?)").run(username, password || "");
            }
            db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)").run(userId, name, username, password || null);
          }
        } else {
          db.prepare("INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, null, null)").run(userId, name);
        }
        const insertSettings = db.prepare("INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)");
        insertSettings.run(userId, JSON.stringify(settings));
        const insertHistory = db.prepare(`
          INSERT OR REPLACE INTO history 
          (userId, videoId, title, url, type, fileName, duration, currentTime, lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions, localFilePath, playedDates, format, streams, audioTracks, subtitleTracks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertBookmark = db.prepare(`
          INSERT OR REPLACE INTO bookmarks
          (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const video of historyList) {
          insertHistory.run(
            userId,
            video.id,
            video.title || "Untitled Video",
            video.url || "",
            video.type || "local",
            video.fileName || "",
            video.duration || null,
            video.currentTime || null,
            video.lastPlayedDate || null,
            video.totalTimeWatched || null,
            video.rating || null,
            video.timeToFinish || null,
            video.sessions ? JSON.stringify(video.sessions) : null,
            video.localFilePath || null,
            video.playedDates ? JSON.stringify(video.playedDates) : null,
            video.format || null,
            video.streams ? JSON.stringify(video.streams) : null,
            video.audioTracks ? JSON.stringify(video.audioTracks) : null,
            video.subtitleTracks ? JSON.stringify(video.subtitleTracks) : null
          );
          if (video.bookmarks && Array.isArray(video.bookmarks)) {
            for (const bm of video.bookmarks) {
              insertBookmark.run(
                userId,
                video.id,
                bm.id,
                bm.time,
                bm.endTime !== void 0 ? bm.endTime : null,
                bm.label || "",
                bm.isIntro ? 1 : 0,
                bm.isOutro ? 1 : 0,
                bm.skipEnabled ? 1 : 0
              );
            }
          }
        }
        console.log("[SQLite Migrate] Successfully inserted profile, settings and history for userId:", userId);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true, userId, name }));
      } catch (e) {
        console.error("[SQLite migrate POST error]", e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (pathname === "/api/settings") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    const userId = parsedUrl.searchParams.get("userId");
    if (req.method === "POST") {
      getJsonBody(req).then((data) => {
        if (userId && userId !== "local") {
          try {
            const insert = db.prepare("INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)");
            insert.run(userId, JSON.stringify(data));
          } catch (e) {
            console.error("[SQLite settings POST error]", e.message);
          }
        } else {
          const settingsFile = import_path.default.join(dataDir, "settings.json");
          import_fs.default.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
        }
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (userId && userId !== "local") {
        try {
          const query = db.prepare("SELECT settingsJson FROM settings WHERE userId = ?");
          const row = query.get(userId);
          res.end(row ? row.settingsJson : JSON.stringify({}));
        } catch (e) {
          console.error("[SQLite settings GET error]", e.message);
          res.end(JSON.stringify({}));
        }
      } else {
        const settingsFile = import_path.default.join(dataDir, "settings.json");
        if (import_fs.default.existsSync(settingsFile)) {
          res.end(import_fs.default.readFileSync(settingsFile));
        } else {
          res.end(JSON.stringify({}));
        }
      }
    }
    return;
  }
  if (pathname === "/api/history") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    const userId = parsedUrl.searchParams.get("userId");
    if (req.method === "POST") {
      getJsonBody(req).then((data) => {
        if (userId && userId !== "local") {
          try {
            const deleteHistory = db.prepare("DELETE FROM history WHERE userId = ?");
            deleteHistory.run(userId);
            const deleteBookmarks = db.prepare("DELETE FROM bookmarks WHERE userId = ?");
            deleteBookmarks.run(userId);
            const insertHistory = db.prepare(`
              INSERT OR REPLACE INTO history 
              (userId, videoId, title, url, type, fileName, duration, currentTime, lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions, localFilePath, playedDates, format, streams, audioTracks, subtitleTracks)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertBookmark = db.prepare(`
              INSERT OR REPLACE INTO bookmarks
              (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, createdAt, updatedAt, episode, season, color)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
            `);
            if (Array.isArray(data)) {
              for (const video of data) {
                insertHistory.run(
                  userId,
                  video.id,
                  video.title || "Untitled Video",
                  video.url || "",
                  video.type || "local",
                  video.fileName || "",
                  video.duration || null,
                  video.currentTime || null,
                  video.lastPlayedDate || null,
                  video.totalTimeWatched || null,
                  video.rating || null,
                  video.timeToFinish || null,
                  video.sessions ? JSON.stringify(video.sessions) : null,
                  video.localFilePath || null,
                  video.playedDates ? JSON.stringify(video.playedDates) : null,
                  video.format || null,
                  video.streams ? JSON.stringify(video.streams) : null,
                  video.audioTracks ? JSON.stringify(video.audioTracks) : null,
                  video.subtitleTracks ? JSON.stringify(video.subtitleTracks) : null
                );
                if (video.bookmarks && Array.isArray(video.bookmarks)) {
                  for (const bm of video.bookmarks) {
                    insertBookmark.run(
                      userId,
                      video.id,
                      bm.id,
                      bm.time,
                      bm.endTime !== void 0 ? bm.endTime : null,
                      bm.label || "",
                      bm.isIntro ? 1 : 0,
                      bm.isOutro ? 1 : 0,
                      bm.skipEnabled ? 1 : 0,
                      bm.title || null,
                      bm.description || null,
                      bm.category || null,
                      bm.startTime || null,
                      bm.thumbnail || null,
                      bm.favorite ? 1 : 0,
                      bm.episode || null,
                      bm.season || null,
                      bm.color || null
                    );
                  }
                }
              }
            }
          } catch (e) {
            console.error("[SQLite history POST error]", e.message);
          }
        } else {
          const historyFile = import_path.default.join(dataDir, "history.json");
          import_fs.default.writeFileSync(historyFile, JSON.stringify(data, null, 2));
        }
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (userId && userId !== "local") {
        try {
          const historyQuery = db.prepare("SELECT * FROM history WHERE userId = ?");
          const historyRows = historyQuery.all(userId);
          const bookmarksQuery = db.prepare("SELECT * FROM bookmarks WHERE userId = ?");
          const bookmarksRows = bookmarksQuery.all(userId);
          const videos = historyRows.map((row) => {
            const videoBookmarks = bookmarksRows.filter((bm) => bm.videoId === row.videoId).map((bm) => ({
              id: bm.id,
              time: bm.time,
              endTime: bm.endTime !== null ? bm.endTime : void 0,
              label: bm.label,
              isIntro: bm.isIntro === 1,
              isOutro: bm.isOutro === 1,
              skipEnabled: bm.skipEnabled === 1,
              title: bm.title,
              description: bm.description,
              category: bm.category,
              startTime: bm.startTime,
              thumbnail: bm.thumbnail,
              favorite: bm.favorite === 1,
              createdAt: bm.createdAt,
              updatedAt: bm.updatedAt,
              episode: bm.episode,
              season: bm.season,
              color: bm.color
            }));
            return {
              id: row.videoId,
              title: row.title,
              url: row.url || "",
              type: row.type || "local",
              fileName: row.fileName || "",
              duration: row.duration,
              currentTime: row.currentTime,
              lastPlayedDate: row.lastPlayedDate,
              totalTimeWatched: row.totalTimeWatched,
              rating: row.rating,
              timeToFinish: row.timeToFinish,
              sessions: row.sessions ? JSON.parse(row.sessions) : [],
              localFilePath: row.localFilePath,
              playedDates: row.playedDates ? JSON.parse(row.playedDates) : [],
              format: row.format || null,
              streams: row.streams ? JSON.parse(row.streams) : [],
              audioTracks: row.audioTracks ? JSON.parse(row.audioTracks) : [],
              subtitleTracks: row.subtitleTracks ? JSON.parse(row.subtitleTracks) : [],
              bookmarks: videoBookmarks
            };
          });
          res.end(JSON.stringify(videos));
        } catch (e) {
          console.error("[SQLite history GET error]", e.message);
          res.end(JSON.stringify([]));
        }
      } else {
        const historyFile = import_path.default.join(dataDir, "history.json");
        if (import_fs.default.existsSync(historyFile)) {
          res.end(import_fs.default.readFileSync(historyFile));
        } else {
          res.end(JSON.stringify([]));
        }
      }
    }
    return;
  }
  if (pathname.startsWith("/api/bookmark")) {
    if (req.method === "GET" && pathname.match(/^\/api\/bookmark\/media\/([^/]+)$/)) {
      try {
        const mediaIdMatch = pathname.match(/^\/api\/bookmark\/media\/([^/]+)$/);
        const mediaId = mediaIdMatch[1];
        const tmdbIdParam = parsedUrl.searchParams.get("tmdbId");
        const seasonParam = parsedUrl.searchParams.get("season");
        const episodeParam = parsedUrl.searchParams.get("episode");
        let rows;
        if (tmdbIdParam) {
          const tmdbId = parseInt(tmdbIdParam, 10);
          const season = seasonParam ? parseInt(seasonParam, 10) : null;
          const episode = episodeParam ? parseInt(episodeParam, 10) : null;
          if (season !== null && episode !== null && season !== 0) {
            rows = db.prepare("SELECT * FROM bookmarks WHERE tmdbId = ? AND season = ? AND episode = ?").all(tmdbId, season, episode);
          } else {
            rows = db.prepare('SELECT * FROM bookmarks WHERE tmdbId = ? AND (season IS NULL OR season = 0 OR season = "")').all(tmdbId);
          }
        } else {
          rows = db.prepare("SELECT * FROM bookmarks WHERE videoId = ?").all(mediaId);
        }
        const mapped = rows.map((bm) => ({
          id: bm.id,
          time: bm.time,
          endTime: bm.endTime,
          label: bm.label,
          isIntro: bm.isIntro === 1,
          isOutro: bm.isOutro === 1,
          skipEnabled: bm.skipEnabled === 1,
          title: bm.title,
          description: bm.description,
          category: bm.category,
          startTime: bm.startTime,
          thumbnail: bm.thumbnail,
          favorite: bm.favorite === 1,
          createdAt: bm.createdAt,
          updatedAt: bm.updatedAt,
          episode: bm.episode,
          season: bm.season,
          color: bm.color,
          userName: bm.userName,
          userTime: bm.userTime,
          mediaName: bm.mediaName,
          tmdbId: bm.tmdbId
        }));
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(mapped));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    let body = "";
    req.on("data", (chunk) => body += chunk.toString());
    req.on("end", () => {
      try {
        if (req.method === "POST" && pathname === "/api/bookmark") {
          const data = JSON.parse(body);
          const { userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, episode, season, color, userName, userTime, mediaName, tmdbId } = data;
          const insertBookmark = db.prepare(`
            INSERT OR REPLACE INTO bookmarks
            (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, createdAt, updatedAt, episode, season, color, userName, userTime, mediaName, tmdbId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?)
          `);
          insertBookmark.run(userId, videoId, id, time, endTime, label || "", isIntro ? 1 : 0, isOutro ? 1 : 0, skipEnabled ? 1 : 0, title || null, description || null, category || null, startTime || null, thumbnail || null, favorite ? 1 : 0, episode || null, season || null, color || null, userName || null, userTime || null, mediaName || null, tmdbId || null);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        } else if (req.method === "PUT" && pathname.match(/^\/api\/bookmark\/([^/]+)$/)) {
          const idMatch = pathname.match(/^\/api\/bookmark\/([^/]+)$/);
          const bmId = idMatch[1];
          const data = JSON.parse(body);
          const { userId, videoId, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, episode, season, color, userName, userTime, mediaName, tmdbId } = data;
          const updateBookmark = db.prepare(`
            UPDATE bookmarks SET time = ?, endTime = ?, label = ?, isIntro = ?, isOutro = ?, skipEnabled = ?, title = ?, description = ?, category = ?, startTime = ?, thumbnail = ?, favorite = ?, updatedAt = datetime('now'), episode = ?, season = ?, color = ?, userName = ?, userTime = ?, mediaName = ?, tmdbId = ?
            WHERE userId = ? AND videoId = ? AND id = ?
          `);
          updateBookmark.run(time, endTime, label || "", isIntro ? 1 : 0, isOutro ? 1 : 0, skipEnabled ? 1 : 0, title || null, description || null, category || null, startTime || null, thumbnail || null, favorite ? 1 : 0, episode || null, season || null, color || null, userName || null, userTime || null, mediaName || null, tmdbId || null, userId, videoId, bmId);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        } else if (req.method === "DELETE" && pathname.match(/^\/api\/bookmark\/([^/]+)$/)) {
          const idMatch = pathname.match(/^\/api\/bookmark\/([^/]+)$/);
          const bmId = idMatch[1];
          const data = JSON.parse(body);
          const { userId, videoId } = data;
          const deleteBookmark = db.prepare("DELETE FROM bookmarks WHERE userId = ? AND videoId = ? AND id = ?");
          deleteBookmark.run(userId, videoId, bmId);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        } else {
          res.statusCode = 404;
          res.end("Not Found");
        }
      } catch (err) {
        console.error("[Bookmark API Error]", err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/local-video-stream") {
    const videoPath = parsedUrl.searchParams.get("path");
    if (!videoPath || !import_fs.default.existsSync(videoPath)) {
      res.statusCode = 404;
      res.end("File not found");
      return;
    }
    let connectionTracked = false;
    let fileStream = null;
    const trackStart = () => {
      if (!connectionTracked) {
        activeConnections++;
        connectionTracked = true;
        console.log(`[Server] Active video stream connection started. Total active: ${activeConnections}`);
      }
    };
    const trackEnd = () => {
      if (connectionTracked) {
        activeConnections = Math.max(0, activeConnections - 1);
        connectionTracked = false;
        console.log(`[Server] Active video stream connection ended. Total active: ${activeConnections}`);
      }
    };
    const cleanUp = () => {
      trackEnd();
      if (fileStream) {
        fileStream.destroy();
        fileStream = null;
      }
    };
    req.on("close", cleanUp);
    res.on("close", cleanUp);
    res.on("finish", cleanUp);
    req.on("error", (err) => {
      console.error("[Server Request Error]", err.message);
    });
    trackStart();
    const stat = import_fs.default.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Length": fileSize });
      res.end();
      return;
    }
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start2 = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start2 + 1;
      fileStream = import_fs.default.createReadStream(videoPath, { start: start2, end });
      fileStream.on("error", (err) => {
        console.error("[Server Stream Error]", err.message);
      });
      res.on("error", (err) => {
        console.error("[Server Response Error]", err.message);
      });
      const head = {
        "Content-Range": `bytes ${start2}-${end}/${fileSize}`,
        "Content-Length": chunksize
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      res.writeHead(200, { "Content-Length": fileSize });
      fileStream = import_fs.default.createReadStream(videoPath);
      fileStream.on("error", (err) => {
        console.error("[Server Stream Error]", err.message);
      });
      fileStream.pipe(res);
    }
    return;
  }
  res.statusCode = 404;
  res.end("Not found");
});
var startShutdownChecker = (viteServer) => {
  if (trayMode) {
    console.log("[Server] Running in tray mode. Auto-shutdown checker disabled.");
    return;
  }
  setInterval(() => {
    if (activeConnections > 0) {
      lastHeartbeat = Date.now();
    }
    const limit = 6e4;
    if (Date.now() - lastHeartbeat > limit) {
      console.log("[Server] No active tabs detected. Shutting down...");
      viteServer.close();
      backendServer.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1e3);
    }
  }, 2e3);
};
async function start() {
  let success = false;
  let viteServer;
  if (!backendOnly) {
    try {
      viteServer = await (0, import_vite.createServer)({
        server: {
          port: PORT_SERVICE,
          host: "127.0.0.1",
          open: false
        }
      });
      await viteServer.listen();
      success = true;
      console.log(`[Server] Valor service server (Vite dev) is running on http://127.0.0.1:${PORT_SERVICE}`);
    } catch (err) {
      console.error(`[Server] Failed to bind service server to port ${PORT_SERVICE}:`, err);
      process.exit(1);
    }
  }
  if (!frontendOnly) {
    backendServer.listen({ port: PORT_BACKEND, host: "127.0.0.1" }, () => {
      console.log(`[Server] Valor backend server (Dev mode) is running on http://127.0.0.1:${PORT_BACKEND}`);
      if (!backendOnly) {
        try {
          const activePortFile = import_path.default.join(dataDir, "active_port.txt");
          import_fs.default.writeFileSync(activePortFile, String(PORT_SERVICE));
        } catch (e) {
          console.error("[Server] Failed to write active_port.txt:", e);
        }
        const openUrl = resolvedFilePath ? `http://127.0.0.1:${PORT_SERVICE}/?file=${encodeURIComponent(resolvedFilePath)}` : `http://127.0.0.1:${PORT_SERVICE}/`;
        console.log(`[Server] Opening browser: ${openUrl}`);
        if (process.platform === "win32") {
          (0, import_child_process.spawn)("cmd", ["/c", "start", "", openUrl], { detached: true }).unref();
        } else if (process.platform === "darwin") {
          (0, import_child_process.spawn)("open", [openUrl], { detached: true }).unref();
        } else {
          (0, import_child_process.spawn)("xdg-open", [openUrl], { detached: true }).unref();
        }
      }
      startShutdownChecker(viteServer);
    });
  }
}
start().catch((err) => {
  console.error("[Server] Failed to start server:", err);
  process.exit(1);
});
