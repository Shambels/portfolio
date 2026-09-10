# pinchs.be

Portfolio for a software developer. Static React site, no backend. The
visitor flies a character around a 3D world; each project is a landmark they
approach. Trilingual EN / FR / NL.

Plan, phases and open questions: [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md).
What is actually built: [`docs/STATUS.md`](docs/STATUS.md).

## Requirements

- Node 20.19+ or 22.12+ (Vite 8). Developed on 22.x.
- A browser with WebGL2. WebGPU is used when available and falls back on its own.

## Run it

```sh
npm install     # first time only
npm run dev     # http://localhost:5173
```

Other scripts:

```sh
npm run typecheck  # react-router typegen && tsc -b
npm run check      # the assert-based checks
npm run build      # typecheck, prerender every route  →  build/client/
npm run preview    # serve build/client/ on http://localhost:4173
npm run lint       # oxlint
```

## Test it by hand

There is no test framework — non-trivial logic leaves an assert-based check
behind instead. What is built is verified by flying it.

Run `npm run dev` and open `http://localhost:5173/en` — the world is behind the
home page and behind each case study, and there is nothing to click for focus:
the controls are read on `window`, except while a link or button has focus.


| | |
|---|---|
| `W` `A` `S` `D` or arrows | fly (damped velocity, banks into turns) |
| `Space` held | rise to the ceiling and hold there; release to sink back to hover |
| `Shift` held | speed boost; release and it eases back to normal |
| `E` or `Enter` | interact — wired through `useInput()`, no effect yet |
| alt-tab away mid-flight | input clears; the ship must not keep flying, climbing or boosting |

Check, in order:

1. **Renderer.** Add `?debug` — the HUD then reads `WebGPU` on Chrome and recent
   Safari, `WebGL2` elsewhere, followed by a frame rate. Both backends are
   correct; neither should read `detecting…` after a second. `?debug` also draws
   each proximity radius as a cyan ring, each blockout box as an amber
   wireframe, and each spawn waypoint as a pink dot.
2. **Altitude and boost.** Hold `Space`: the ship climbs smoothly, stops at its
   ceiling, and stays there for as long as the key is held; release and it eases
   back down to hover height. The camera rises with it. Hold `Shift` while
   moving: faster, with the same ramp in and out — no snap in either direction.
   Both survive being combined with a turn.
3. **Bounce.** Every change of speed or direction rocks the hull and settles:
   lean into a turn, nose up under acceleration, suspension give on a climb, and
   a mix of all three on a boosted diagonal that also rises. It must always come
   to rest — a wobble that never stops, or one that pins at its limit and stays
   there, is the spring mistuned (`SPRING`, `DAMP`, `LEAN`, `SQUASH` in
   `src/Ship.tsx`). Under `prefers-reduced-motion` it responds without
   oscillating.
4. **Proximity.** Fly into one of the three landmarks. Inside its radius it
   turns light blue, the URL becomes `/en/work/{slug}` and the panel opens with
   that project's card — no reload, and the scene does not restart. Fly out and
   both revert, with the history no deeper than it was. Radii and positions come
   from the English frontmatter; `src/world.ts` maps them.
5. **Landmarks.** Each one should be recognisable on approach, before the panel
   names it: a head-frame over a stepped rock face with an adit at its foot; an
   easel with a blank canvas; a Scrabble board with a played cluster and a tile
   rack. All three face the middle of the world. With the console open there
   should be no assertion — a landmark that outgrows the `size` box in its
   frontmatter says so, and so does a `waypoint` that has fallen outside its own
   `radius`.
6. **Traversal — the Track B exit test.** Getting from the mine to the easel to
   the board should be interesting, not a chore. This is a judgement call made
   by flying it, and it is the gate on detailing anything.
7. **Frame rate.** 60fps on a 2022 mid-tier laptop, or the effect gets cut.
   Browser devtools' FPS meter is enough at this stage.
8. **No page scroll.** Arrows and Space move the ship, they never scroll the
   document underneath the canvas — *unless* a link or button has focus, where
   they must do the normal thing and the ship must stay put.
9. **The two coherent experiences** — the Phase 3 exit test. Walk every route
   with the world on, then again with it off (`chrome://flags` → *WebGL* →
   Disabled, or just tab through it on a phone). Both have to read as finished:
   with the world, a card and a link; without it, the whole case study. From the
   card, *read the case study* goes to `?read`, which is the same URL with
   nothing running behind it and is what the flat index links to.
10. **Reachable without flying.** `Tab` from a cold load: the skip link is first
   and goes to `/en/work`, and every landmark is a link on the home panel. Press
   `Enter` on one — the ship is placed beside that landmark with its card open.

To check the WebGL2 path deliberately, disable WebGPU in the browser
(Chrome: `chrome://flags` → *Unsafe WebGPU Support* → Disabled) and reload; the
HUD under `?debug` should read `WebGL2` and everything else behave identically.
With WebGL2 itself unavailable, or on a touch device, the canvas never mounts at
all and what is left is the Phase 2 site.

Verify a production build the same way with `npm run build && npm run preview`.

## Layout

```
src/root.tsx    the HTML document; src/routes.ts the route table
src/routes/     one file per route — see CLAUDE.md for the map
src/content.ts  every MDX file, keyed by slug and locale
src/i18n/       locales.ts (routing) + index.ts (strings) + a check
deploy.sh       build + rsync to the server, with a routing smoke test
deploy/nginx.conf  the server block
src/WorldGate.tsx  mounts the canvas once, decides where it shows, owns the HUD
src/Scene.tsx   the <Canvas> and everything in it
src/Ship.tsx    the character: procedural hovering saucer + flight controller
src/Landmarks.tsx the three landmarks — primitives + TSL, no model files
src/Debug.tsx   ?debug — radii, blockout boxes, waypoints
src/useInput.ts the only place input is read (invariant 8)
src/world.ts    landmark layout + proximity, read from the content
```

## Deploy

Self-hosted on an Ubuntu box. The build is static files, so the server needs
nginx and nothing else — no Node, no runtime, no process to keep alive.
`deploy.sh` builds locally and rsyncs the result.

### First-time server setup

Everything below assumes you log in as `deploy`, a normal user with sudo — not as
root. That is why the web root gets handed to `deploy` in step 2: deploying is
then a plain `rsync` with no sudo and no password prompt, and `sudo` appears only
in this one-time setup.

The server's address is not written down in this repo — `deploy.sh` defaults to
the domain and takes an override from `DEPLOY_HOST`. Set it once for the
commands below; before DNS resolves, use the IP your host gave you:

```sh
export SERVER=deploy@pinchs.be     # or deploy@<your server's IPv4>, pre-DNS
```

Keeping it out of the repo is not because an IP is a secret — `dig pinchs.be`
returns it, and that is what an A record is for. It is so that a public README
is not also a checklist of *which* box, *which* user and *which* ports to try.
What actually protects the box is key-only SSH and an `AllowUsers` allowlist,
not the absence of an address.

**1. Key first**, so nothing later asks for a password:

```sh
ssh-copy-id "$SERVER"
```

**2. On the server** — nginx, and a web root owned by the user that will write to
it:

```sh
ssh "$SERVER"
sudo apt update && sudo apt install -y nginx rsync
sudo mkdir -p /var/www/pinchs.be
sudo chown -R "$USER:$USER" /var/www/pinchs.be
exit
```

**3. Install the server block.** `scp` cannot write to `/etc` as a non-root user
and cannot sudo, so pipe the file through `ssh` into `sudo tee` instead — from
your Mac, in the repo:

```sh
ssh "$SERVER" 'sudo tee /etc/nginx/sites-available/pinchs.be >/dev/null' < deploy/nginx.conf
```

**4. Enable it** and drop nginx's placeholder:

```sh
ssh "$SERVER"
sudo ln -sf /etc/nginx/sites-available/pinchs.be /etc/nginx/sites-enabled/pinchs.be
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` naming a file that does not exist means step 3 wrote it under a
different name — check with `ls /etc/nginx/sites-available/`, and note the
filename must match the symlink exactly, `.be` included.

**5. Firewall**, still on the server:

```sh
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

That is enough to serve over HTTP. Two things are still open:

**DNS.** The domain is at GoDaddy. Two records, and that is the whole zone:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `@` | your server's IPv4 | 600 while testing, 1 hour after |
| `CNAME` | `www` | `@` | 1 hour |

Delete everything else pointing at the web: GoDaddy parks new domains on
`76.223.105.230` and `13.248.243.5`, and **those two A records come back if you
only delete them** — they are put there by *Domain Settings → Forwarding*, which
has to be turned off first. Leave the two `ns**.domaincontrol.com` NS records and
the SOA alone; a stray `_domainconnect` CNAME is harmless.

GoDaddy's own leftovers are fine where they are: the `SOA`, the
`_domainconnect` CNAME (an unused hook that lets third-party services write
records into the zone — deletable, no effect either way), and the default
`_dmarc` TXT.

Nothing else is needed. No `AAAA` unless you deliberately want IPv6 (the box has
one — an AAAA pointing anywhere else makes the site look dead to v6 clients), no
`MX`, no `CAA` — though if one already exists it must allow `letsencrypt.org` or
certbot in the next step will be refused.

The domain sends no mail, so the strongest correct mail config is to say so:
`TXT @` = `v=spf1 -all`, and `p=reject` instead of GoDaddy's `p=quarantine` in
`_dmarc`. Optional, unrelated to the site, and worth undoing the day you add a
contact form or an address on the domain.

Check before running certbot — **query a public resolver, not GoDaddy**, because
the old parked records are cached for up to an hour after you fix the zone. This
must print the server's address and nothing else:

```sh
dig +short pinchs.be www.pinchs.be @1.1.1.1
```

Until DNS resolves the site answers on the bare IP, and `canonical` and
`hreflang` still say `https://pinchs.be` — correct for production, wrong-looking
while you test on the IP. Expected; the one place to change it is `SITE_URL` in
`src/i18n/index.ts`.

**TLS.** After DNS resolves, on the server:

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pinchs.be -d www.pinchs.be
```

Certbot rewrites the server block in place, adds the port 443 listener and the
HTTP→HTTPS redirect, and installs its own renewal timer. **`deploy/nginx.conf` in
this repo is the pre-TLS version** — re-copying it over the server would strip
HTTPS off. After certbot has run once, pull the live file back down so the repo
matches what is serving:

```sh
ssh "$SERVER" 'sudo cat /etc/nginx/sites-available/pinchs.be' > deploy/nginx.conf
```

### Deploying a new version

```sh
./deploy.sh
```

It runs `npm run build` (which type-checks first, so a broken build never
reaches the server), `chmod -R a+rX build/client` (files in `public/` are mode
600 in the repo and `rsync -a` preserves that, which nginx serves as a 403),
rsyncs with `--delete` so stale hashed assets are removed, then curls five URLs
and fails loudly if the routing is wrong. No sudo: step 2 gave `deploy` ownership
of the web root. Overridable: `DEPLOY_HOST`, `DEPLOY_DIR`, `DEPLOY_URL`.

No `--chmod` and no `-z` on the rsync: recent macOS ships openrsync, which has
neither.

Nothing on the server is generated or stateful — `/var/www/pinchs.be` is exactly
the contents of `build/client/`, and a deploy is idempotent.

### What nginx is doing

`deploy/nginx.conf` does the two jobs Cloudflare's `_redirects` file did, plus
caching:

| | |
|---|---|
| `location = /` | 302 to `/en`. No `Accept-Language` negotiation — `hreflang` tells crawlers the rest |
| `try_files $uri $uri/index.html` | `/en/work/scrubble` serves that folder's `index.html`, with no trailing-slash redirect |
| `error_page 404 /404.html` | the prerendered English 404, served with a real 404 status |
| `/assets/` | `immutable`, one year — filenames are content-hashed |
| everything else | `no-cache`, so a deploy is visible on the next reload |

Conventions, invariants and budgets: [`CLAUDE.md`](CLAUDE.md).
