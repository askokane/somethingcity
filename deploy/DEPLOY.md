# Deploying Breach City on Vultr

This deploys the static Three.js frontend and optional Node checker on one Ubuntu server. Caddy serves the files, proxies `/api/*` and `/auth/*` to the checker, and obtains HTTPS certificates for your domain.

## 1. Create the server and point your domain

1. In Vultr, create a **Cloud Compute** instance with **Ubuntu 24.04 LTS**. Add your SSH public key, allow SSH, HTTP, and HTTPS (ports 22, 80, and 443), and note the public IPv4 address. This server is billed by Vultr.
2. At your DNS provider, create an **A record** for your domain (for example, `@`) pointing to that IP. If you also want `www`, create a `www` A record pointing to the same IP. Remove conflicting A/AAAA records. Wait for the records to resolve before continuing.
3. From PowerShell, connect as root: `ssh root@SERVER_IP`.

Use the domain you actually configured everywhere below. Caddy needs working DNS and reachable ports 80 and 443 to issue HTTPS certificates.

## 2. Install server packages

Run these commands in the SSH session on the Vultr server:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

apt update
apt install -y ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

## 3. Download the project and install the checker

The repository must be public or otherwise cloneable by the server. For a private repository, configure a read-only GitHub deploy key before cloning.

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin breachcity
git clone --branch justin/atharva-map https://github.com/askokane/somethingcity.git /srv/breach-city
cd /srv/breach-city/checker
npm ci --omit=dev
```

## 4. Configure optional credentials

The demo frontend works without credentials. To enable live email verification, Google sign-in, or database-backed timeline features, create `/etc/breach-city.env` on the server:

```bash
nano /etc/breach-city.env
```

Add only the settings for features you configured. For example:

```ini
PUBLIC_URL=https://example.com
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Breach City <you@example.com>
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
DATABASE_URL=your_database_connection_string
```

Replace `example.com` and the sample values. Omit any setting for an unused feature. Do not commit this file or put credentials in the repository. Save and close nano, then lock down the file:

```bash
chown root:root /etc/breach-city.env
chmod 600 /etc/breach-city.env
```

If you want Google sign-in, in Google Cloud Console add `https://YOUR_DOMAIN/auth/google/callback` as an authorized redirect URI and add `YOUR_DOMAIN` to authorized domains. Add user Gmail addresses as test users if the OAuth app is still in Testing mode. Keep any existing localhost redirect URI for local development. Set `PUBLIC_URL` even if you do not use optional credentials; it enables secure cookies and turns off the checker’s development page.

## 5. Start the checker service

```bash
cp /srv/breach-city/deploy/breach-city.service /etc/systemd/system/breach-city.service
systemctl daemon-reload
systemctl enable --now breach-city
systemctl status breach-city --no-pager
journalctl -u breach-city -n 30 --no-pager
```

The checker listens only on localhost port 8787. The systemd service reads secrets from `/etc/breach-city.env`; that file is outside the web root.

## 6. Configure Caddy and HTTPS

Open the Caddy config:

```bash
nano /etc/caddy/Caddyfile
```

Replace its contents with the following, changing `example.com` to your domain. Keep `www.example.com` only if you created its DNS record:

```caddyfile
example.com, www.example.com {
    encode gzip

    @hidden path /.git* /*/.env* /.env* /checker/node_modules/* /deploy/*
    respond @hidden 404

    @backend path /api/* /auth/*
    reverse_proxy @backend localhost:8787

    root * /srv/breach-city
    file_server
}
```

If you only configured the root domain, use just `example.com` on the first line. Validate and reload:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## 7. Check the live site

From your computer, open `https://YOUR_DOMAIN`. The demo works without signing in. Check the checker endpoint and confirm secrets are blocked:

```bash
curl -i https://YOUR_DOMAIN/api/status
curl -I https://YOUR_DOMAIN/checker/.env
```

The first request should return JSON. The second should return `404`. If HTTPS is not ready, verify DNS points to the Vultr IP, ports 80/443 are open in both Vultr firewall settings and UFW, and check `journalctl -u caddy -n 50 --no-pager`.

## Updating after a code push

SSH into the server and run:

```bash
cd /srv/breach-city
git pull --ff-only origin justin/atharva-map
cd checker
npm ci --omit=dev
systemctl restart breach-city
```

## Feature notes

- Demo accounts work offline. Live breach lookups need outbound internet from the server.
- Real email codes require `RESEND_API_KEY`; without it, codes are only logged on the server and users cannot receive them.
- Google sign-in requires the Google OAuth settings and callback URL above.
- The timeline and service breach database require `DATABASE_URL`. If it cannot connect, check the database provider’s network allow list for the Vultr server IP.
- When finished, remove the instance in Vultr to stop its hourly billing. Remove OAuth redirect entries and credentials you no longer need.
