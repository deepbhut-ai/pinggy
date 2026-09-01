"""Pydantic schemas for tunnels."""
from pydantic import BaseModel


class TunnelCreate(BaseModel):
    """Not used directly — tunnels are created via SSH connection.
    Kept for API compatibility if needed."""
    local_port: int = 8080
    protocol: str = "http"


class TunnelOut(BaseModel):
    tunnel_id: str
    subdomain: str
    url: str
    custom_domain: str = ""
    custom_url: str = ""
    remote_port: int
    local_port: int
    protocol: str
    user_email: str
    ssh_peer: str
    status: str  # "active" or "disconnected"
    request_count: int
    bytes_transferred: int
    bytes_sent: int = 0      # responses out of the local service (v1.2.0)
    bytes_received: int = 0  # requests into the local service (v1.2.0)
    created_at: str