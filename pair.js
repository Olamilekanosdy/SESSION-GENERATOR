const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
  default: WasiSock,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');
const { makeid } = require('./id'); // Make sure this is your own function

const router = express.Router();

function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let number = req.query.number;
  if (!number) return res.status(400).json({ error: "Number is required" });

  number = number.replace(/\D/g, '');
  const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);

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

  let codeSent = false;

  sock.ev.on("connection.update", async ({ connection }) => {
    if (connection === "open" && !sock.authState.creds.registered && !codeSent) {
      codeSent = true;

      try {
        const code = await sock.requestPairingCode(number);
        console.log("Pairing Code:", code);

        if (!res.headersSent) {
          res.status(200).json({ code });
        }

        await delay(3000);
        await sock.ws.close();
        removeFile(`./temp/${id}`);
      } catch (err) {
        console.error("Pairing failed:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to generate code" });
        }
        removeFile(`./temp/${id}`);
      }
    }

    if (connection === "close" && !codeSent) {
      console.error("Connection closed before pairing");
      if (!res.headersSent) {
        res.status(428).json({ error: "Connection closed before pairing" });
      }
      removeFile(`./temp/${id}`);
    }
  });
});

module.exports = router;
