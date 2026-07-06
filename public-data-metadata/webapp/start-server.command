#!/usr/bin/env bash
# Double-click this file in Finder to launch the app - no terminal typing
# needed. Reads your credentials from local-config.sh (see
# local-config.example.sh) if you've set one up; otherwise runs with
# whatever's already free (flights/satellites/trains still work, cameras
# show their "add a token" message instead of erroring).
set -e
cd "$(dirname "$0")"

if [ -f local-config.sh ]; then
  source local-config.sh
fi

if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "First run - installing dependencies..."
  python3 -m pip install -r requirements.txt
fi

echo "Starting Live Sky, Rail & Roads..."
( sleep 2 && open "http://127.0.0.1:8420" ) &

python3 server.py

echo
echo "Server stopped. Press any key to close this window."
read -n 1 -s
