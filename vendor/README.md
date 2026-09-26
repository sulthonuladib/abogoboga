# Vendor

Third-party sources vendored into this repository via `git subtree`.

## mexc-websocket-proto

- Path: `vendor/mexc-websocket-proto`
- Source: https://github.com/mexcdevelop/websocket-proto
- Branch: `main`
- License: Apache-2.0 (retained verbatim as `LICENSE`)

Protobuf definitions for the MEXC V3 WebSocket API (public/private spot streams,
wrapped by `PushDataV3ApiWrapper.proto`).

### Updating

```sh
git subtree pull --prefix vendor/mexc-websocket-proto \
  https://github.com/mexcdevelop/websocket-proto main --squash
```

To add it to a fresh clone:

```sh
git subtree add --prefix vendor/mexc-websocket-proto \
  https://github.com/mexcdevelop/websocket-proto main --squash
```
