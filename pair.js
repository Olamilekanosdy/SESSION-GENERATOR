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

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
};

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Number is required" });

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

    if (!sock.authState.creds.registered) {
      num = num.replace(/[^0-9]/g, '');
      const code = await sock.requestPairingCode(num);
      if (!res.headersSent) {
        return res.json({ code });
      }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        await delay(3000);
        const data = fs.readFileSync(`./temp/${id}/creds.json`);
        const session = Buffer.from(data).toString('base64');
        const user = sock.user.id;

        const sessionMsg = await sock.sendMessage(user, { text: session });

        const msg = `
_Pair Code Connected by WASI TECH_

---

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
      }
    });

  } catch (err) {
    console.error("Pairing failed:", err);
    removeFile(`./temp/${id}`);
    if (!res.headersSent) {
      res.status(500).json({ error: "Pairing Failed" });
    }
  }
});

module.exports = router;
