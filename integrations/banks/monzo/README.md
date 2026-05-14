# Monzo Developer API

This folder contains a small Node integration for the Monzo Developer API. It can authenticate with OAuth, refresh stored access tokens, and fetch account info, balances, pots, and transactions.

Monzo's developer API is intended for your own account or a small allowlisted set of users, not public apps. After authentication, Monzo may require approval in the mobile app before the token can access account data.

## Setup

1. Create an OAuth client at https://developers.monzo.com/.
2. Set the redirect URL to:

   ```text
   http://localhost:4545/oauth/callback
   ```

3. Copy `integrations/banks/monzo/.env.example` to `integrations/banks/monzo/.env` and fill in:

   ```text
   MONZO_CLIENT_ID=...
   MONZO_CLIENT_SECRET=...
   ```

## Authenticate

From the repo root:

```sh
npm run monzo:auth
```

Open the URL printed in the terminal, complete Monzo login, then approve the access request in the Monzo app if prompted. The token is saved to `integrations/banks/monzo/data/monzo-token.json`, which is ignored by git.

## Fetch data

```sh
npm run monzo:fetch
```

The output is written to `integrations/banks/monzo/data/monzo-data.json`.

Optional filters:

```sh
npm run monzo:fetch -- --since 2026-01-01T00:00:00Z --before 2026-02-01T00:00:00Z
npm run monzo:fetch -- --limit 50
npm run monzo:fetch -- --account-type uk_retail
npm run monzo:fetch -- --no-expand-merchant
```

Monzo documents a Strong Customer Authentication window for transactions: fetch full history soon after authentication if you need it. Later syncs may be limited to recent transaction history.

## Create a PFA vault

For personal/local use, convert the saved Monzo JSON into an encrypted `.pfa` vault:

```sh
PFA_PASSWORD="choose-a-strong-password" npm run monzo:pfa
```

Optional paths:

```sh
PFA_PASSWORD="choose-a-strong-password" npm run monzo:pfa -- --input integrations/banks/monzo/data/monzo-data.json --output integrations/banks/monzo/data/monzo-data.pfa
```

The password is not stored. If it is lost, the `.pfa` vault cannot be recovered.

## Code layout

- `auth-server.js` starts a local OAuth callback server.
- `fetch-data.js` fetches all supported data into JSON.
- `src/client.js` wraps Monzo API requests.
- `src/oauth.js` handles OAuth token exchange and refresh.
- `src/fetchData.js` composes account, balance, pot, and transaction data.
- `src/tokenStore.js` reads/writes the local token file.
