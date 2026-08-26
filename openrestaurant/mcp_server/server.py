"""MCP server exposing the restaurant booking data as tools.

In a real OpenAgent-style system this would sit in front of Elasticsearch
(for search/availability) and a transactional booking DB (for writes). Here
both are mocked by a single SQLite file so the demo has no external
dependencies, but the tool boundary is deliberately drawn the same way a
production system would draw it:

  READ tools  -> search_restaurants, get_availability   (safe, idempotent)
  WRITE tools -> create_booking, cancel_booking          (side-effecting)

That split matters for production reliability: read tools can be called
freely by the agent while it reasons, write tools are the ones you'd want
to gate behind confirmation, idempotency keys, audit logging, etc.

Run standalone for a smoke test:
    python mcp_server/server.py
"""
import sqlite3
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

DB_PATH = Path(__file__).parent.parent / "data" / "restaurant_booking.db"

mcp = FastMCP("openagent-mock")


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# READ tools
# ---------------------------------------------------------------------------

@mcp.tool()
def search_restaurants(
    query: Optional[str] = None,
    cuisine: Optional[str] = None,
    neighborhood: Optional[str] = None,
) -> list[dict]:
    """Search the restaurant index (mock Elasticsearch) by free-text query,
    cuisine, and/or neighborhood. All filters are optional and combine with AND.
    Returns up to 10 matching restaurants with their id, name, cuisine,
    neighborhood, price_range, rating, and description.
    """
    clauses, params = [], []
    if query:
        clauses.append("(name LIKE ? OR description LIKE ? OR cuisine LIKE ?)")
        like = f"%{query}%"
        params += [like, like, like]
    if cuisine:
        # multi-field match, like a real search index: a query for "sushi"
        # should surface a restaurant whose cuisine/description says so even
        # if "sushi" itself isn't the literal cuisine tag ("Japanese").
        clauses.append("(cuisine LIKE ? OR description LIKE ?)")
        like = f"%{cuisine}%"
        params += [like, like]
    if neighborhood:
        clauses.append("neighborhood LIKE ?")
        params.append(f"%{neighborhood}%")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM restaurants {where} ORDER BY rating DESC LIMIT 10"

    conn = _connect()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@mcp.tool()
def get_availability(restaurant_id: int, date: str, party_size: int = 2) -> list[dict]:
    """Get open reservation time slots for a restaurant on a given date
    (YYYY-MM-DD) that can seat at least party_size guests. Returns a list of
    {time, seats_remaining} for each open slot, soonest first.
    """
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT time, (capacity - booked) AS seats_remaining
            FROM availability
            WHERE restaurant_id = ? AND date = ? AND (capacity - booked) >= ?
            ORDER BY time ASC
            """,
            (restaurant_id, date, party_size),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# WRITE tools
# ---------------------------------------------------------------------------

@mcp.tool()
def create_booking(
    restaurant_id: int,
    date: str,
    time: str,
    party_size: int,
    customer_name: str,
    customer_phone: str = "",
) -> dict:
    """Book a table. Confirms the slot still has room, then reserves it and
    records the booking. date is YYYY-MM-DD, time is HH:MM (24h). Returns the
    booking confirmation with a booking_id on success, or an error message if
    the slot no longer has enough seats.
    """
    if party_size <= 0:
        return {"success": False, "error": "party_size must be a positive number of guests."}

    conn = _connect()
    try:
        slot = conn.execute(
            "SELECT id, capacity, booked FROM availability "
            "WHERE restaurant_id = ? AND date = ? AND time = ?",
            (restaurant_id, date, time),
        ).fetchone()

        if slot is None:
            return {"success": False, "error": "No such time slot is offered for this restaurant."}

        seats_remaining = slot["capacity"] - slot["booked"]
        if seats_remaining < party_size:
            return {
                "success": False,
                "error": f"Only {seats_remaining} seat(s) remaining at that time, "
                         f"requested {party_size}.",
            }

        conn.execute(
            "UPDATE availability SET booked = booked + ? WHERE id = ?",
            (party_size, slot["id"]),
        )
        cur = conn.execute(
            "INSERT INTO bookings (restaurant_id, date, time, party_size, customer_name, customer_phone) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (restaurant_id, date, time, party_size, customer_name, customer_phone),
        )
        conn.commit()
        return {
            "success": True,
            "booking_id": cur.lastrowid,
            "restaurant_id": restaurant_id,
            "date": date,
            "time": time,
            "party_size": party_size,
            "status": "confirmed",
        }
    finally:
        conn.close()


@mcp.tool()
def cancel_booking(booking_id: int) -> dict:
    """Cancel an existing booking by id and release its seats back to
    availability. Returns success status.
    """
    conn = _connect()
    try:
        booking = conn.execute(
            "SELECT * FROM bookings WHERE id = ?", (booking_id,)
        ).fetchone()
        if booking is None:
            return {"success": False, "error": "No booking found with that id."}
        if booking["status"] == "cancelled":
            return {"success": False, "error": "Booking is already cancelled."}

        conn.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ?", (booking_id,)
        )
        conn.execute(
            "UPDATE availability SET booked = booked - ? "
            "WHERE restaurant_id = ? AND date = ? AND time = ?",
            (booking["party_size"], booking["restaurant_id"], booking["date"], booking["time"]),
        )
        conn.commit()
        return {"success": True, "booking_id": booking_id, "status": "cancelled"}
    finally:
        conn.close()


if __name__ == "__main__":
    mcp.run(transport="stdio")
