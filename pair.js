const express = require('express');
const fs = require('fs');
const pino = require('pino');
const { makeid } = require('./id');
const {
  default: WasiSock,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay
} = require("@whiskeysockets/baileys");

const router = express.Router();

function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Number is required" });

  num = num.replace(/\D/g, '');

  const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);

  try {
    const sock = WasiSock({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: [Browsers.macOS, 'Desktop', 'Safari']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        try {
          const code = await sock.requestPairingCode(num);
          console.log("Pairing Code:", code);
          if (!res.headersSent) res.json({ code });

          // Optional: Send session and welcome message after pairing
          await delay(3000);
          const data = fs.readFileSync(`./temp/${id}/creds.json`);
          const session = Buffer.from(data).toString('base64');

          const user = sock.user?.id;
          if (!user) return;

          const sessionMsg = await sock.sendMessage(user, { text: session });

          const msg = `
_Pair Code Connected by WASI TECH_

╔════◇
║ 『 WOW YOU'VE CHOSEN Hans Pair Code 』
║ You Have Completed the First Step to Deploy a WhatsApp Bot.
╚════════════════════════╝
╔═════◇
║❒ Ytube: youtube.com/@hanstech0
║❒ Owner: https://wa.me/237696900612
╚════════════════════════╝

Don't Forget To Give Star To My Repo`;

          await sock.sendMessage(user, { text: msg }, { quoted: sessionMsg });
          await delay(1000);
          await sock.ws.close();
          removeFile(`./temp/${id}`);
        } catch (err) {
          console.error("Pairing code request failed after connection opened:", err);
          removeFile(`./temp/${id}`);
          if (!res.headersSent) res.status(500).json({ error: "Pairing Failed" });
        }
      } else if (connection === "close") {
        console.log("Connection closed before pairing.");
        if (!res.headersSent) res.status(500).json({ error: "Connection Closed" });
        removeFile(`./temp/${id}`);
      }
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    removeFile(`./temp/${id}`);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
