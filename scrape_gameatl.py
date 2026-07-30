#!/usr/bin/env python3

"""
This script was written as part of a demo for the 2026 SFGE convention. It is not intended to function long-term, and may break if the GameATL site changes its layout or structure.

This script downloads and exports the SFGE (GameATL) convention event schedule.

This script fetches the schedule table from the GameATL site, cleans and
normalizes event data, and writes the result to JSON (and optionally CSV).

Output fields include:
- event details (ID, Name, Game System, Host, Event Type)
- time details (Day, Start Time, Duration)
- seat details (Available Seats, Seat Limit, Filled Seats)
- location details (Room, Area)

The default behavior is to include all event types.

Usage examples:
    python scrape_gameatl.py
    python scrape_gameatl.py --event-type "RPG" --json rpg_only_events.json
    python scrape_gameatl.py --url https://tabletop.gameatl.com/account/convention-events.php
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from io import StringIO
from pathlib import Path

import pandas as pd
import requests


DEFAULT_URL = (
    "https://tabletop.gameatl.com/account/convention-events.php"
)

EXPECTED_COLUMNS = {
    "ID",
    "Name",
    "Host",
    "Event Type",
    "Starts",
    "Duration",
    "Available",
    "Room",
}

KNOWN_ROOMS = [
    "Habersham Ballroom",
    "Grand Ballroom II",
    "Hall B",
]


def download_page(url: str) -> str:
    headers_candidates = [
        {
            # Identify the scraper rather than pretending to be a browser.
            "User-Agent": (
                "ConventionScheduleExporter/1.0 "
                "(personal schedule display)"
            )
        },
        {
            # Some hosts return stripped-down HTML to unknown clients.
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    ]

    attempts: list[str] = []
    for headers in headers_candidates:
        for attempt in range(1, 4):
            try:
                response = requests.get(
                    url,
                    headers=headers,
                    timeout=30,
                )
                response.raise_for_status()
                return response.text
            except requests.RequestException as exc:
                attempts.append(
                    f"{headers.get('User-Agent', 'unknown UA')[:48]}... "
                    f"attempt {attempt}: {exc}"
                )
                # Small backoff reduces failures from temporary throttling.
                time.sleep(1.5 * attempt)

    raise RuntimeError(
        "Could not download schedule page after retries. "
        f"Details: {' | '.join(attempts)}"
    )


def find_schedule_table(html: str) -> pd.DataFrame:
    try:
        tables = pd.read_html(StringIO(html))
    except ValueError as exc:
        raise RuntimeError(
            "No HTML tables were detected in the downloaded page. "
            "The source may be temporarily unavailable or returning "
            "an alternate layout."
        ) from exc

    for table in tables:
        # Flatten column names in case pandas creates a MultiIndex.
        if isinstance(table.columns, pd.MultiIndex):
            table.columns = [
                " ".join(
                    str(value)
                    for value in column
                    if str(value) != "nan"
                ).strip()
                for column in table.columns
            ]

        table.columns = [
            str(column).strip()
            for column in table.columns
        ]

        if EXPECTED_COLUMNS.issubset(table.columns):
            return table

    available_tables = [
        list(table.columns)
        for table in tables
    ]

    raise RuntimeError(
        "Could not find the event schedule table. "
        f"Tables found: {available_tables}"
    )


def clean_schedule(
    schedule: pd.DataFrame,
    event_type: str | None,
) -> pd.DataFrame:
    schedule = schedule.copy()

    # Remove columns such as the login/add button.
    schedule = schedule[
        [
            column
            for column in schedule.columns
            if column in EXPECTED_COLUMNS
        ]
    ]

    for column in schedule.columns:
        schedule[column] = (
            schedule[column]
            .astype(str)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
        )

    # The page may include a small information-icon label at the end
    # of the event name. Remove it if pandas captures it as text.
    schedule["Name"] = schedule["Name"].str.replace(
        r"\s+i$",
        "",
        regex=True,
    )

    schedule["Game System"] = "NA"

    rpg_mask = (
        schedule["Event Type"].str.casefold()
        == "rpg"
    )
    rpg_name_split = schedule.loc[
        rpg_mask,
        "Name",
    ].str.rsplit(
        ":",
        n=1,
        expand=True,
    )

    schedule.loc[rpg_mask, "Name"] = (
        rpg_name_split[0].str.strip()
    )
    schedule.loc[rpg_mask, "Game System"] = (
        rpg_name_split[1].fillna("").str.strip()
    )

    if event_type:
        schedule = schedule[
            schedule["Event Type"].str.casefold()
            == event_type.casefold()
        ].copy()

    capacity = schedule["Available"].str.extract(
        r"^\s*(?P<available_seats>\d+)"
        r"\s*/\s*"
        r"(?P<seat_limit>\d+)\s*$"
    )

    schedule["Available Seats"] = pd.to_numeric(
            capacity["available_seats"],
            errors="coerce",
        )

    schedule["Seat Limit"] = pd.to_numeric(
            capacity["seat_limit"],
            errors="coerce",
        )

    schedule["Filled Seats"] = (
            schedule["Seat Limit"]
            - schedule["Available Seats"]
        )

    # schedule["% Full"] = (
    #         schedule["Filled Seats"]
    #         .div(schedule["Seat Limit"])
    #         .mul(100)
    #         .round()
    #         .astype("Int64")
    #     )

    def split_room_and_area(raw_value: object) -> tuple[str, str]:
        text = str(raw_value or "").strip()
        if not text:
            return "TBD", "TBD"

        folded_text = text.casefold()
        for known_room in KNOWN_ROOMS:
            folded_room = known_room.casefold()

            if folded_text == folded_room:
                return known_room, "TBD"

            room_prefix = f"{known_room} "
            if folded_text.startswith(room_prefix.casefold()):
                area = text[len(room_prefix):].strip()
                return known_room, (area or "TBD")

        return text, "TBD"

    parsed_room_area = schedule["Room"].apply(split_room_and_area)
    schedule["Room"] = parsed_room_area.apply(lambda pair: pair[0])
    schedule["Area"] = parsed_room_area.apply(lambda pair: pair[1])

    starts_split = schedule["Starts"].str.extract(
        r"^\s*(?P<day>\S+)\s+(?P<start_time>.+?)\s*$"
    )

    schedule["Day"] = starts_split["day"]
    schedule["Start Time"] = (
        starts_split["start_time"]
        .fillna(schedule["Starts"])
        .str.replace(r"^@\s*", "", regex=True)
        .str.strip()
    )

    output_columns = [
        "ID",
        "Name",
        "Game System",
        "Host",
        "Event Type",
        "Day",
        "Start Time",
        "Duration",
        "Available Seats",
        "Seat Limit",
        "Filled Seats",
        # "% Full",
        "Room",
        "Area",
    ]

    return schedule[output_columns].reset_index(drop=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download the GameATL convention schedule."
    )

    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Schedule webpage URL.",
    )

    parser.add_argument(
        "--event-type",
        default="",
        help=(
            "Only include this event type. "
            "Use an empty string to include all events."
        ),
    )

    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("rpg_schedule.csv"),
        help="CSV output path.",
    )

    parser.add_argument(
        "--write-csv",
        action="store_true",
        help="Also write CSV output. Disabled by default.",
    )

    parser.add_argument(
        "--json",
        type=Path,
        default=Path("public/schedule.json"),
        help="JSON output path.",
    )

    args = parser.parse_args()

    try:
        html = download_page(args.url)
        table = find_schedule_table(html)
        schedule = clean_schedule(
            table,
            args.event_type or None,
        )
    except Exception as exc:
        print(
            f"Error downloading schedule: {exc}",
            file=sys.stderr,
        )
        return 1

    if args.write_csv:
        schedule.to_csv(
            args.csv,
            index=False,
        )

    args.json.write_text(
        json.dumps(
            schedule.to_dict(orient="records"),
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )

    print(f"Downloaded {len(schedule)} events.")
    if args.write_csv:
        print(f"CSV:  {args.csv.resolve()}")
    print(f"JSON: {args.json.resolve()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
