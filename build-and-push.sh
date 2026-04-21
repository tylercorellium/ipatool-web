#!/usr/bin/env bash
# Build both images for linux/amd64 on the local host and push to Docker Hub.
# The VPS then just runs `docker compose pull && docker compose up -d`.
#
# Usage:
#   ./build-and-push.sh            # builds & pushes both, tag :latest
#   ./build-and-push.sh backend    # only backend
#   ./build-and-push.sh frontend   # only frontend
#   TAG=v1.2.3 ./build-and-push.sh # custom tag (also pushes :latest)

set -euo pipefail

BACKEND_IMAGE="tylercorellium/ipatool-backend"
FRONTEND_IMAGE="tylercorellium/ipatool-web"
API_URL="${REACT_APP_API_URL:-https://apps.pwndarw.in/api}"
TAG="${TAG:-latest}"
PLATFORM="linux/amd64"
TARGET="${1:-all}"

# Ensure a buildx builder exists and is active.
if ! docker buildx inspect ipatool-builder >/dev/null 2>&1; then
  docker buildx create --name ipatool-builder --use
else
  docker buildx use ipatool-builder
fi

build_backend() {
  echo "==> Building backend ($BACKEND_IMAGE:$TAG) for $PLATFORM"
  local tags=(-t "$BACKEND_IMAGE:$TAG")
  [[ "$TAG" != "latest" ]] && tags+=(-t "$BACKEND_IMAGE:latest")
  docker buildx build \
    --platform "$PLATFORM" \
    "${tags[@]}" \
    --push \
    ./backend
}

build_frontend() {
  echo "==> Building frontend ($FRONTEND_IMAGE:$TAG) for $PLATFORM"
  echo "    REACT_APP_API_URL=$API_URL"
  local tags=(-t "$FRONTEND_IMAGE:$TAG")
  [[ "$TAG" != "latest" ]] && tags+=(-t "$FRONTEND_IMAGE:latest")
  docker buildx build \
    --platform "$PLATFORM" \
    --build-arg "REACT_APP_API_URL=$API_URL" \
    "${tags[@]}" \
    --push \
    ./ipatool-frontend
}

case "$TARGET" in
  backend)  build_backend ;;
  frontend) build_frontend ;;
  all)      build_backend; build_frontend ;;
  *)        echo "Unknown target: $TARGET (use backend|frontend|all)"; exit 1 ;;
esac

echo
echo "Done. On the VPS:"
echo "  cd ~/ipatool-web && git pull && docker compose pull && docker compose up -d"
