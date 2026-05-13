import http from "node:http";
import { config } from "./src/config.js";
import { createAuthorizationUrl, exchangeCodeForToken } from "./src/oauth.js";

const expected = createAuthorizationUrl();

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://localhost:${config.port}`);

  if (requestUrl.pathname === "/") {
    response.writeHead(302, { location: expected.url });
    response.end();
    return;
  }

  if (requestUrl.pathname !== "/oauth/callback") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end(`Monzo OAuth error: ${error}`);
    return;
  }

  if (!code || state !== expected.state) {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("Invalid OAuth callback.");
    return;
  }

  try {
    await exchangeCodeForToken(code);
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`
      <!doctype html>
      <html lang="en">
        <body>
          <h1>Monzo connected</h1>
          <p>You can close this tab and approve access in the Monzo app if prompted.</p>
        </body>
      </html>
    `);
    console.log(`Monzo token saved to ${config.tokenPath}`);
    server.close();
  } catch (exchangeError) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(exchangeError.message);
  }
});

server.listen(config.port, () => {
  console.log(`Monzo OAuth server listening on http://localhost:${config.port}`);
  console.log(`Open this URL to connect: ${expected.url}`);
});
