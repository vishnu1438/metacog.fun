# Speed Math (Brain Teasers) - metacog.fun

A lean brain-teasers site. First game: **Speed Math** - pick a duration, then
solve addition / subtraction / multiplication questions as fast as you can.
No Enter key: a correct answer is detected the instant you finish typing it and
the next question appears immediately.

Questions are generated locally by the Flask backend by default (instant and
free). Optionally the backend can ask the **Google Gemini API** instead
(`USE_GEMINI=true`); if Gemini fails it falls back to local generation.

## Project layout

```
speed-math-teasers/
├── backend/
│   ├── app.py                    # Flask API
│   ├── requirements.txt
│   ├── .env.example
│   └── deploy/
│       ├── nginx-speedmath.conf  # Nginx site config
│       ├── speedmath.service     # systemd unit (gunicorn)
│       └── update.sh             # redeploy script
├── frontend/
│   ├── home.html                 # game picker (site landing page)
│   ├── index.html                # Speed Math game
│   ├── style.css
│   └── script.js
└── README.md
```

## Local development

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then set ALLOWED_ORIGINS=* for local dev
python app.py                     # API on http://127.0.0.1:5000
```

In another terminal:

```bash
cd frontend
python -m http.server 8000        # open http://127.0.0.1:8000/home.html
```

`script.js` automatically talks to `http://127.0.0.1:5000` when the page is
opened from localhost, and to same-origin `/api` in production.

## Deploying to AWS Lightsail (about $5/month)

Architecture: `metacog.fun` -> Lightsail static IP -> Nginx (HTTPS, serves
`frontend/`, proxies `/api` to gunicorn on 127.0.0.1:8000) -> Flask.

1. Lightsail: Ubuntu 24.04, $5 plan, region Mumbai (ap-south-1), attach a static
   IP, open firewall ports 22, 80, 443.
2. Hostinger DNS: `A @` and `A www` -> the static IP.
3. On the server:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx python3-venv python3-pip git certbot python3-certbot-nginx

# 2 GB swap so 1 GB RAM never runs out
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Code
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/<you>/speed-math-teasers.git speedmath
sudo chown -R ubuntu:ubuntu /var/www/speedmath
sudo chmod -R o+rX /var/www/speedmath/frontend

# Backend
cd /var/www/speedmath/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env && nano .env

# systemd service
sudo cp deploy/speedmath.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now speedmath
curl http://127.0.0.1:8000/api/health

# Nginx
sudo cp deploy/nginx-speedmath.conf /etc/nginx/sites-available/speedmath
sudo ln -s /etc/nginx/sites-available/speedmath /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Free HTTPS (after DNS resolves to the server)
sudo certbot --nginx -d metacog.fun -d www.metacog.fun
```

### Updating later

```bash
bash /var/www/speedmath/backend/deploy/update.sh
```

If you change the Nginx or service file, re-copy it to `/etc/nginx/...` or
`/etc/systemd/system/` and reload (`sudo nginx -t && sudo systemctl reload nginx`,
or `sudo systemctl daemon-reload && sudo systemctl restart speedmath`).

### Logs

```bash
sudo journalctl -u speedmath -n 50
sudo tail -n 50 /var/log/nginx/error.log
```

## Notes

- The answer is sent to the browser (needed for instant checking), so a
  determined player can cheat via dev tools. Fine for a casual game; if you add
  a leaderboard later, validate answers on the server.
- Rate limits: Nginx allows about 5 requests/second per IP, and Flask enforces
  120/minute and 3000/day per IP.
- Set an AWS Budget alert (e.g. $10/month) so a surprise bill can't happen.

## Extending it

- Add more games as new `/api/...` routes and new tiles in `home.html`.
- Persist high scores with a small SQLite file and one `/api/score` route.