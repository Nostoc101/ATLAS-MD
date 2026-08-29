const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

/**
 * Starts a small HTTP server that serves pair.html and exposes
 * an endpoint to request a WhatsApp pairing code.
 *
 * @param {Object} options
 * @param {number} options.port - port to listen on
 * @param {Function} options.onRequestCode - async (phoneNumber) => pairingCodeString
 */
function startPairServer({ port = 3000, onRequestCode }) {
    const server = http.createServer(async (req, res) => {
        const parsed = url.parse(req.url, true);

        if (parsed.pathname === "/" || parsed.pathname === "/pair.html") {
            const filePath = path.join(__dirname, "..", "pair.html");
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Failed to load pair.html");
                    return;
                }
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(data);
            });
            return;
        }

        if (parsed.pathname === "/api/pair" && req.method === "POST") {
            let body = "";
            req.on("data", chunk => (body += chunk));
            req.on("end", async () => {
                try {
                    const { number } = JSON.parse(body || "{}");
                    if (!number) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Phone number is required" }));
                        return;
                    }

                    const code = await onRequestCode(number);

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ code }));
                } catch (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message || "Failed to generate pairing code" }));
                }
            });
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    });

    server.listen(port, () => {
        console.log(`✓ Pairing web server running on http://localhost:${port}`);
    });

    return server;
}

module.exports = { startPairServer };
