# Personal Finance App

A minimal React + Vite scaffold.

## Scripts

- `npm run dev` starts the local development server.
- `npm run build` creates a production build.
- `npm run preview` serves the production build locally.
- `npm run monzo:auth` connects the personal-use Monzo developer API integration.
- `npm run monzo:fetch` writes local Monzo JSON data.
- `npm run monzo:pfa` converts local Monzo JSON into an encrypted PFA vault.

## Data Model

`.pfa` is the canonical local finance file. Excel is supported as a human-readable import/export format, but the app reads and writes normalized finance data through the PFA vault layer.
