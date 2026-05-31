import makeWASocket from "@whiskeysockets/baileys";

async function test() {
  const sock = makeWASocket({
    auth: {
      creds: {} as any,
      keys: {} as any
    },
    logger: require("pino")({ level: "silent" })
  });
  console.log("Socket keys:", Object.keys(sock));
  console.log("sock.ws exists:", !!(sock as any).ws);
  if ((sock as any).ws) {
    console.log("sock.ws keys:", Object.keys((sock as any).ws));
  }
  process.exit(0);
}

test().catch(console.error);
