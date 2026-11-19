#!/usr/bin/env python3
import sys
import json
import time

try:
    import hid
except Exception as error:
    print(json.dumps({"event": "fatal", "error": str(error)}), flush=True)
    sys.exit(2)

VENDOR_ID = 0x3837
PRODUCT_ID = 0x600A
SKIP_LEVELS = (1, 2, 4)


def emit(obj):
    print(json.dumps(obj), flush=True)


def open_all():
    handles = []
    for device in hid.enumerate(VENDOR_ID, PRODUCT_ID):
        try:
            handle = hid.device()
            handle.open_path(device["path"])
            handle.set_nonblocking(True)
            handles.append(handle)
        except Exception:
            pass
    return handles


def run():
    emit({"event": "ready"})
    last_emitted = None
    last_enum_check = 0.0
    while True:
        handles = open_all()
        if not handles:
            if last_emitted != "disconnected":
                emit({"event": "status", "state": "disconnected"})
                last_emitted = "disconnected"
            time.sleep(2)
            continue
        if last_emitted is None or last_emitted == "disconnected":
            emit({"event": "status", "state": "connected"})
            last_emitted = "connected"
        while True:
            got_read = False
            for handle in handles:
                try:
                    handle.write([0x00, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00])
                except Exception:
                    pass
                try:
                    data = handle.read(64)
                except Exception:
                    continue
                if data:
                    got_read = True
                    if data[0] == 0x55:
                        level = data[2]
                        if level == 0:
                            if last_emitted != "off":
                                emit({"event": "status", "state": "off"})
                                last_emitted = "off"
                        elif level not in SKIP_LEVELS and 0 < level <= 100:
                            if last_emitted != level:
                                emit({"event": "battery", "capacity": level})
                                last_emitted = level
            now = time.time()
            if now - last_enum_check > 2:
                last_enum_check = now
                if not hid.enumerate(VENDOR_ID, PRODUCT_ID):
                    break
            time.sleep(0.4 if got_read else 0.15)
        for handle in handles:
            try:
                handle.close()
            except Exception:
                pass


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        pass
