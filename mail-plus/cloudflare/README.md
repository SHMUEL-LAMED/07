# Cloudflare deployment

The existing app is also hosted independently in the owner's Cloudflare account. The previous Sites deployment is unchanged.

1. Build application with the existing Sites build helper.
2. Run `node cloudflare/build.mjs` to bundle the server and hashed client assets in one Worker.
3. Upload outputs/cloudflare-worker.mjs as an ES module with nodejs_compat and the DB binding identified in deployment.json.
4. Keep the Worker-level Cloudflare Access application enabled, allow only the owner email, and disable preview URLs.

The entry wrapper rejects missing ctx.access and any other email, strips client-supplied Sites identity headers, then derives identity from verified Cloudflare Access context. It serves static assets without the separate assets router, preserving ctx.access availability. No password or API token is stored in source. Google provider/Gemini setup is still needed as described in app Settings.
