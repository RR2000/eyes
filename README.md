# Eyes

A small multiplayer toy written in TypeScript. Every visitor is an eye that follows their mouse or finger,
and everyone sees everyone else in real time over a WebSocket. A ball bounces around the field: whoever it
touches turns red for a moment.

Demo: https://eyes.raoulrondinella.dev

Players are anonymous: the server gives each connection a random id and a colour, keeps positions in memory
only, and logs nothing about who connects.

## How it works

- `src/server`: one Node HTTP server. It serves the page and its scripts, `/healthz`, and the game WebSocket
  on `/ws`, all on the same port. It moves the ball, checks collisions and sends the state to everyone
  20 times per second.
- `src/client`: the browser code, plain ES modules compiled by `tsc` (no bundler). It works out the WebSocket
  address from the page (`wss://` on https) and reconnects on its own with a backoff.
- `src/shared`: game rules and message types used by both sides. Coordinates are relative to the square
  field (0..1), so every screen size sees the same game.
- `public`: `index.html`, `style.css` and the icon.

Protocol: the browser sends `{"x":0.42,"y":0.17}`; the server sends `{"t":"hello","id":...}` once, then
`{"t":"state","ball":{x,y},"players":[{id,x,y,hue,hit,size}]}` on every tick.

Limits for a public server, per connection unless noted:

| what | default |
|---|---|
| message size | 256 bytes, larger ones close the connection (1009) |
| messages per second | 60; extra ones are dropped, more than 180 close the connection (1008) |
| positions | numbers between 0 and 1, anything else is ignored |
| connections | 100 in total and 10 per address (1013 "server full") |
| dead clients | ping every 30 s, dropped when the pong does not come back |
| slow clients | frames are skipped while more than 256 KB are waiting to be sent |

## Run it

Node 24 or later.

```bash
npm ci
npm run dev          # build, then http://localhost:8080
npm test             # build, then unit tests and tests with real WebSockets
```

With Docker:

```bash
docker build -t simple-game .
docker run --rm -p 8080:8080 simple-game
```

Environment variables:

| variable | default | meaning |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket port |
| `HOST` | all interfaces | address to listen on |
| `MAX_CLIENTS` | `100` | connections in total |
| `MAX_CLIENTS_PER_IP` | `10` | connections from one address |
| `TRUST_PROXY` | off | `1` behind a reverse proxy: the address comes from `X-Real-IP` / `X-Forwarded-For` |

Behind a reverse proxy, `/ws` needs the `Upgrade` and `Connection` headers passed through. The server pings
every 30 seconds, so a proxy read timeout of a minute or more is enough.

## Releases

CI (`.github/workflows/ci.yml`) runs the tests on every pull request and builds the image. On `main` it pushes
`ghcr.io/rr2000/simple-game:main` and `:sha-<commit>`.
