# Deploying Breach City on Vultr

One small server runs everything on one domain with HTTPS:

```
https://your-domain ──► Vultr server (Ubuntu 24.04)
                          └─ Caddy (automatic HTTPS)
                               ├─ /api/*, /auth/*   → checker (node server.js, localhost:8787)
                               └─ everything else   → files in /srv/breach-city (frontend, checker/checker.js)
```

The frontend and API share one origin, so there are no CORS or cookie issues. **In the frontend, set the API base to `""` (same origin) instead of `http://localhost:8787`.**

## Before you start (your accounts)

1. **Vultr:** deploy the smallest **Cloud Compute** server, Ubuntu 24.04, in a region near the event. Add your SSH key. Note its IP address. It's billed hourly, so delete it after the event.
2. **Domain** (GoDaddy Registry, via the MLH prize code): add an **A record** pointing to the server's IP. Wait until `ping your-domain` shows that IP.
3. **Google Cloud Console** → Google Auth Platform → **Clients** → the existing web client → add the authorized redirect URI `https://your-domain/auth/google/callback`. Keep the localhost one for local work. Under **Branding**, add your domain to authorized domains. Test users still apply.

## On the server (SSH in as root)

```bash
# 1. Firewall: SSH + web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# 2. Node 24 (Ubuntu's own Node is too old) and git
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs git

# 3. Caddy (official repository)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 4. The code, run by an unprivileged user
useradd --system --no-create-home breachcity
git clone https://github.com/askokane/somethingcity.git /srv/breach-city
cd /srv/breach-city/checker && npm ci --omit=dev
```

The repo must be cloneable from the server. If it's private, use a GitHub deploy key or a fine-grained token with read-only access to this repo.

## Secrets (from your laptop, never through git)

```bash
scp checker/.env root@SERVER_IP:/etc/breach-city.env
```

Then on the server:

```bash
chmod 600 /etc/breach-city.env
nano /etc/breach-city.env
```

In that file:
- **add** `PUBLIC_URL=https://your-domain`,
- **delete** the `FRONTEND_URL=…` line (it points at localhost; with it gone, sign-in returns to `PUBLIC_URL`).

The file lives in `/etc`, outside the served folder, and Caddy also refuses to serve any `.env`.

## Start it

```bash
cp /srv/breach-city/deploy/breach-city.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now breach-city
journalctl -u breach-city -n 20          # should say: public: https://your-domain, /dev off

sed 's/your-domain.com/YOUR.REAL.DOMAIN/' /srv/breach-city/deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy                    # gets the HTTPS certificate on the first request
```

Check from your laptop:

```bash
curl https://your-domain/api/news?limit=1     # JSON
curl -I https://your-domain/checker/.env      # must be 404
```

## Updating after a push to main

```bash
cd /srv/breach-city && git pull && cd checker && npm ci --omit=dev && systemctl restart breach-city
```

## What changes when it's public

- **`/dev` is off** once `PUBLIC_URL` is set. Set `DEV_PAGE=1` in the env file to turn it back on temporarily.
- **Cookies are `Secure`**, so HTTPS only.
- **Rate limit per visitor:** 10 code requests an hour.
- **Email codes need `RESEND_API_KEY` for real users.** Without it, codes only appear in `journalctl`, which works for you but not for judges. Google sign-in doesn't need it.
- **Google sign-in still only works for test users** (Testing mode): add the judges' Gmail addresses, or demo with the dummy account.
- **Tiger Data:** if the checker can't reach the database, check the service's IP allow list in the Tiger Data console and add the server's IP.

## After the event

Delete the Vultr server, remove the redirect URI and extra test users in Google Cloud, and reset the Tiger Data password.
