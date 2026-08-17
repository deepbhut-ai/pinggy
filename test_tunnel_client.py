"""Test SSH tunnel client — connects to the pinggy SSH server with -R reverse forwarding."""
import asyncio
import logging

import asyncssh

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


async def main():
    print("Connecting to SSH tunnel server on localhost:2222...")
    try:
        async with asyncssh.connect(
            "localhost",
            port=2222,
            known_hosts=None,
            username="testuser",
        ) as conn:
            print("SSH connected!")

            # Request reverse port forward: server listens on random port,
            # forwards to localhost:9090 on the client side.
            # Equivalent to: ssh -R0:localhost:9090 localhost -p 2222
            listener = await conn.forward_remote_port(
                "", 0,           # listen on random port on server
                "localhost", 9090,  # forward to localhost:9090 on client
            )
            if listener:
                remote_port = listener.get_port()
                print(f"Reverse tunnel established! Server listening on port {remote_port}")
                print(f"Requests to localhost:{remote_port} → localhost:9090")
                print("Keeping tunnel alive for 120 seconds... Press Ctrl+C to stop.")
                await asyncio.sleep(120)
            else:
                print("Failed to establish reverse tunnel")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())