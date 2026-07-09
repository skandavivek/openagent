"""Seeds restaurant_booking.db — a mock of the "Elasticsearch restaurant index"
for the OpenAgent-style demo. Run with: python data/seed_db.py
"""
import sqlite3
import random
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "restaurant_booking.db"

RESTAURANTS = [
    ("Nonna's Table", "Italian", "West Village", "$$$", 4.7,
     "Cozy family-run trattoria known for handmade pasta and a deep Amaro list."),
    ("Sakura Robata", "Japanese", "Midtown East", "$$$$", 4.8,
     "Charcoal-grilled robata, nigiri, and an omakase sushi counter seating just 10 guests a night."),
    ("El Patio Verde", "Mexican", "Williamsburg", "$$", 4.5,
     "Rooftop taqueria with mezcal flights and a rotating salsa menu."),
    ("The Copper Whisk", "American", "Flatiron", "$$$", 4.6,
     "Seasonal New American small plates in a converted 1920s foundry."),
    ("Spice Route", "Indian", "East Village", "$$", 4.4,
     "Modern regional Indian tasting menus with a 200-bottle natural wine list."),
    ("Le Petit Bistro", "French", "Upper West Side", "$$$$", 4.9,
     "Classic French bistro fare, tableside preparations, jacket suggested."),
    ("Golden Dragon", "Chinese", "Chinatown", "$$", 4.3,
     "Cantonese banquet hall famous for weekend dim sum carts."),
    ("Basil & Vine", "Mediterranean", "SoHo", "$$$", 4.6,
     "Wood-fired Mediterranean sharing plates and a courtyard garden."),
]

# (hour, minute) dinner service slots
TIME_SLOTS = [
    (17, 0), (17, 30), (18, 0), (18, 30), (19, 0),
    (19, 30), (20, 0), (20, 30), (21, 0), (21, 30),
]

DAYS_AHEAD = 7


def build():
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cuisine TEXT NOT NULL,
            neighborhood TEXT NOT NULL,
            price_range TEXT NOT NULL,
            rating REAL NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE availability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            capacity INTEGER NOT NULL,
            booked INTEGER NOT NULL DEFAULT 0,
            UNIQUE(restaurant_id, date, time)
        );

        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            party_size INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT,
            status TEXT NOT NULL DEFAULT 'confirmed',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )

    cur.executemany(
        "INSERT INTO restaurants (name, cuisine, neighborhood, price_range, rating, description) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        RESTAURANTS,
    )

    rng = random.Random(42)  # deterministic seed data for a repeatable live demo
    today = date.today()
    rows = []
    for restaurant_id in range(1, len(RESTAURANTS) + 1):
        for day_offset in range(DAYS_AHEAD):
            the_date = (today + timedelta(days=day_offset)).isoformat()
            for hour, minute in TIME_SLOTS:
                # skip a random subset of slots so some times are simply "not offered"
                if rng.random() < 0.15:
                    continue
                capacity = rng.choice([2, 2, 4, 4, 4, 6, 8])
                # some slots start out partially or fully booked already
                booked = rng.choice([0, 0, 0, 1, 2]) if capacity > 2 else rng.choice([0, 0, 1])
                booked = min(booked, capacity)
                time_str = f"{hour:02d}:{minute:02d}"
                rows.append((restaurant_id, the_date, time_str, capacity, booked))

    cur.executemany(
        "INSERT INTO availability (restaurant_id, date, time, capacity, booked) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )

    conn.commit()
    conn.close()
    print(f"Seeded {DB_PATH} with {len(RESTAURANTS)} restaurants and {len(rows)} availability slots.")


if __name__ == "__main__":
    build()
