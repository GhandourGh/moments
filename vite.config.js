import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** First non-internal IPv4 — used for LAN HTTPS + HMR on phones. */
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

const lanIp = getLanIp();
const DEV_PORT = 5174;

function ensureLanCert(certDir, ip) {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, "cert.pem");
  const keyPath = path.join(certDir, "key.pem");
  const stampPath = path.join(certDir, "ip.txt");

  if (
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, "utf8").trim() === ip &&
    fs.existsSync(certPath) &&
    fs.existsSync(keyPath)
  ) {
    return {
      cert: fs.readFileSync(certPath, "utf8"),
      key: fs.readFileSync(keyPath, "utf8"),
    };
  }

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
      `-days 30 -nodes -subj "/CN=FaceGather Dev" ` +
      `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${ip}"`,
    { stdio: "pipe" }
  );
  fs.writeFileSync(stampPath, ip);
  return {
    cert: fs.readFileSync(certPath, "utf8"),
    key: fs.readFileSync(keyPath, "utf8"),
  };
}

const httpsCredentials = ensureLanCert(
  path.join("node_modules", ".vite", `lan-ssl-${lanIp.replace(/\./g, "-")}`),
  lanIp
);

/** Prints the phone URL every time the dev server starts. */
function printMobileUrl() {
  return {
    name: "print-mobile-url",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const port = server.config.server.port ?? DEV_PORT;
        console.log(
          `\n  📱 Phone (same Wi‑Fi): https://${lanIp}:${port}/\n` +
            `     Accept the certificate warning on first visit.\n`
        );
      });
    },
  };
}

// UI-only — no backend proxy. Photos are kept in component state for now.
export default defineConfig({
  plugins: [react(), printMobileUrl()],
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: true, // listen on LAN so phones can reach the dev server
    https: httpsCredentials, // camera needs a secure context on mobile (not http://IP)
    allowedHosts: true,
    hmr: {
      protocol: "wss",
      host: lanIp,
      port: DEV_PORT,
    },
  },
  preview: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
    https: httpsCredentials,
    allowedHosts: true,
  },
});
