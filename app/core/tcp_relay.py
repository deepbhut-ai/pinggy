"""TCP tunnel relay (v1.0.0) — public TCP listeners that pipe to SSH-forwarded ports.

Flow: token with tunnel_mode='tcp' + tcp_port=P connects via SSH; the SSH server
registers the reverse-forwarded port as usual; the TCP relay then opens a public
listener on P and every connection is piped to 127.0.0.1:<remote_port>.
"""
import asyncio
import logging

logger = logging.getLogger("tcp_relay")

# public_port -> {"remote_port": int, "server": asyncio.Server, "subdomain": str}
_relays: dict[int, dict] = {}
TCP_PORT_MIN = 10000
TCP_PORT_MAX = 19999


def allocated_ports() -> list[int]:
    return list(_relays.keys())


async def start_relay(public_port: int, remote_port: int, subdomain: str) -> bool:
    """Open a public TCP listener piping to remote_port. Idempotent per port."""
    if public_port in _relays:
        return True  # already relaying
    try:
        async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            try:
                upstream_reader, upstream_writer = await asyncio.open_connection(
                    "127.0.0.1", remote_port
                )
            except Exception as e:
                logger.debug("relay upstream connect failed: %s", e)
                writer.close()
                return
            async def _a2b():
                try:
                    while True:
                        data = await reader.read(65536)
                        if not data:
                            break
                        upstream_writer.write(data)
                        await upstream_writer.drain()
                except Exception:
                    pass
                finally:
                    try:
                        upstream_writer.close()
                    except Exception:
                        pass
            async def _b2a():
                try:
                    while True:
                        data = await upstream_reader.read(65536)
                        if not data:
                            break
                        writer.write(data)
                        await writer.drain()
                except Exception:
                    pass
                finally:
                    try:
                        writer.close()
                    except Exception:
                        pass
            await asyncio.gather(_a2b(), _b2a())

        server = await asyncio.start_server(_pipe, "0.0.0.0", public_port)
        _relays[public_port] = {"remote_port": remote_port, "server": server, "subdomain": subdomain}
        logger.info("TCP relay %s -> 127.0.0.1:%d listening on 0.0.0.0:%d",
                    subdomain, remote_port, public_port)
        return True
    except OSError as e:
        logger.warning("TCP relay port %d unavailable: %s", public_port, e)
        return False


async def stop_relay_for_subdomain(subdomain: str) -> None:
    """Close any relays belonging to a subdomain (tunnel disconnected)."""
    for port, info in list(_relays.items()):
        if info["subdomain"] == subdomain:
            try:
                info["server"].close()
                await info["server"].wait_closed()
            except Exception:
                pass
            _relays.pop(port, None)
            logger.info("TCP relay on %d closed (tunnel %s down)", port, subdomain)


async def allocate_free_port() -> int | None:
    """Find a free public port in the TCP range (for auto-assignment)."""
    for port in range(TCP_PORT_MIN, TCP_PORT_MAX):
        if port in _relays:
            continue
        try:
            srv = await asyncio.start_server(lambda r, w: None, "127.0.0.1", port)
            srv.close()
            await srv.wait_closed()
            return port
        except OSError:
            continue
    return None
